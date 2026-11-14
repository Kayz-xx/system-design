// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from './sim.js';
import { LEVELS } from '../levels/levels.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const level = (id) => LEVELS.find((l) => l.id === id);
const withNames = (d, world) => ({ ...d, blocks: d.blocks.map((b) => ({ ...b, name: b.names[world] })) });
const run = (L, scene, edit) => {
  const d = withNames(clone(L.design), scene);
  if (edit) edit(d);
  return Sim.simulate(d, L.scenes[scene].scenario);
};

for (const scene of ['cafe', 'software']) {
  test(`${scene} L1: the queue takes 50 ticks to clear; 200 capacity passes`, () => {
    const L = level('l1');
    const a = run(L, scene);
    assert.equal(a.metrics.recoverySeconds, 50);
    assert.equal(a.result.firstFailure.block, 's1');
    assert.equal(a.result.passed, false);
    const b = run(L, scene, (d) => { d.blocks[0].capacity = 200; });
    assert.equal(b.result.passed, true, JSON.stringify(b.result));
  });

  test(`${scene} L2: peak loss 16.7% with 3; 4 copies pass`, () => {
    const L = level('l2');
    const a = run(L, scene);
    assert.ok(Math.abs(a.metrics.peakErrorRate - 100 * 40 / 240) < 0.01);
    assert.equal(a.result.passed, false);
    const b = run(L, scene, (d) => { d.blocks[1].copies = 4; });
    assert.equal(b.result.passed, true, JSON.stringify(b.result));
  });

  test(`${scene} L3: 1,000 reads/s hit the database after the flush; 2 replicas pass`, () => {
    const L = level('l3');
    const a = run(L, scene);
    assert.ok(Math.abs(a.metrics.dbReadLoadAfterFlush - 1000) < 1e-6);
    assert.equal(a.result.firstFailure.block, 'db1');
    assert.equal(a.result.passed, false);
    const b = run(L, scene, (d) => { d.blocks[2].replicas = 2; });
    assert.equal(b.result.passed, true, JSON.stringify(b.result));
  });
}

test('software L3: one replica is not enough', () => {
  assert.equal(run(level('l3'), 'software', (d) => { d.blocks[2].replicas = 1; }).result.passed, false);
});

test('deterministic: same input, same log', () => {
  assert.deepEqual(run(level('l3'), 'software'), run(level('l3'), 'software'));
});

test('wiring rules', () => {
  const d = withNames(clone(level('l3').design), 'software');
  assert.equal(Sim.canWire(d, 'db1', 's1').ok, false);
  assert.equal(Sim.canWire(d, 'c1', 's1').ok, false);
  assert.equal(Sim.canWire(d, 'traffic', 'c1').ok, false);
  assert.equal(Sim.canWire(d, 's1', 'c1').ok, false);
  const d2 = withNames(clone(level('l1').design), 'software'); d2.blocks[0].copies = 3;
  assert.ok(Sim.validate(d2).some((p) => p.includes('load balancer')));
});

test('queue block: absorbs a write burst, drains at the workers’ rate, and overflows when too slow', () => {
  const sc = { duration: 150, base: { reads: 0, writes: 60 }, spike: { t: 30, dur: 20, reads: 0, writes: 250 }, latencyTargetMs: 300, targets: { errorRate: 0.01, slowShare: 0.05, cost: 0.6 } };
  const s = { id: 's1', type: 'server', name: 'App', capacity: 300, copies: 1, queueLimit: 2000 };
  const db = { id: 'db1', type: 'database', name: 'DB', readCapacity: 100, writeCapacity: 100, replicas: 0, queueLimit: 200 };
  const q = { id: 'q1', type: 'queue', name: 'Q', workers: 2, workerRate: 50, queueLimit: 5000 };
  const wires = [['traffic', 's1'], ['s1', 'db1'], ['s1', 'q1'], ['q1', 'db1']];
  const a = Sim.simulate({ blocks: [s, db, q], wires }, sc);
  assert.equal(a.result.passed, true, JSON.stringify(a.result));
  assert.equal(a.metrics.peakBacklog, 3000);
  assert.equal(a.result.firstFailure, null);
  assert.ok(a.events.some((e) => e.type === 'backlog' && e.block === 'q1' && e.t === 30));
  assert.ok(a.events.some((e) => e.type === 'drained' && e.block === 'q1' && e.t === 124));
  assert.ok(a.ticks.every((r) => r.blocks.db1.writeLoad <= 100 + 1e-9), 'workers never push the database past its write capacity');
  const slow = Sim.simulate({ blocks: [s, db, { ...q, workers: 1 }], wires }, sc);
  assert.equal(slow.result.checks.errors, false);
  assert.equal(slow.result.firstFailure.block, 'q1');
  const fast = Sim.simulate({ blocks: [s, db, { ...q, workers: 4 }], wires }, sc);
  assert.equal(fast.result.firstFailure.block, 'db1');
  assert.ok(fast.metrics.peakErrorRate <= 100);
  assert.equal(Sim.blockCost(q), 0.1);
});

test('queue wiring: server to queue to database only', () => {
  const d = { blocks: [{ id: 's1', type: 'server', name: 'S' }, { id: 'q1', type: 'queue', name: 'Q' }, { id: 'db1', type: 'database', name: 'D' }, { id: 'c1', type: 'cache', name: 'C', size: 'small' }], wires: [] };
  assert.equal(Sim.canWire(d, 's1', 'q1').ok, true);
  assert.equal(Sim.canWire(d, 'q1', 'db1').ok, true);
  assert.equal(Sim.canWire(d, 'traffic', 'q1').ok, false);
  assert.equal(Sim.canWire(d, 'q1', 'c1').ok, false);
  assert.equal(Sim.canWire(d, 'c1', 'q1').ok, false);
  d.wires.push(['traffic', 's1'], ['s1', 'q1']);
  assert.ok(Sim.validate(d).some((p) => /Q needs a database/.test(p)));
});
