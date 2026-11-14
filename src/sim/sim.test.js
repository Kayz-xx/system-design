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
