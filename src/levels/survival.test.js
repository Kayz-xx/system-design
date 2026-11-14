// Run with: npm test. The survival map must agree with Submit, put the tests on it, and rest on the
// simulator being monotone: a design that survives the worst corner survives every cell.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from './levels.js';
import { grade } from './grade.js';
import { candidates } from './best.js';
import { survivalMap, scenarioAt, paramsOf } from './survival.js';
import { ruleWords } from './survival-words.js';

const srv = (id, capacity, copies = 1, queueLimit = 500) => ({ id, type: 'server', name: id, capacity, copies, queueLimit });
const lb = { id: 'lb', type: 'loadBalancer', name: 'lb' };
const db = (o = {}) => ({ id: 'db1', type: 'database', name: 'db', readCapacity: 300, writeCapacity: 100, replicas: 0, queueLimit: 2000, ...o });
const cache = { id: 'c', type: 'cache', name: 'c', size: 'medium' };
const queue = (queueLimit) => ({ id: 'q', type: 'queue', name: 'q', workers: 2, workerRate: 50, queueLimit });
const l4 = (queueLimit) => ({ blocks: [srv('s', 300), db({ readCapacity: 100, queueLimit: 200 }), queue(queueLimit)], wires: [['traffic', 's'], ['s', 'q'], ['q', 'db1']] });

const GOOD = {
  l1: { blocks: [srv('s1', 250, 1, 5000)], wires: [['traffic', 's1']] },
  l2: { blocks: [lb, srv('s', 100, 4)], wires: [['traffic', 'lb'], ['lb', 's']] },
  l3: { blocks: [srv('s', 1200, 1, 2000), cache, db({ replicas: 3 })], wires: [['traffic', 's'], ['s', 'c'], ['c', 'db1'], ['s', 'db1']] },
  l4: l4(10000)
};

test('an accepted design survives the whole map, and the map agrees with Submit on the worst corner', () => {
  for (const lv of LEVELS) {
    for (const w of ['cafe', 'software']) {
      const m = survivalMap(GOOD[lv.id], lv.id, w);
      assert.equal(m.survived, m.total, `${lv.id} ${w}`);
      assert.equal(m.rule, null);
      assert.equal(m.mildest, null);
      assert.ok(grade(GOOD[lv.id], lv.id, w).accepted);
    }
  }
});

test('the worst corner of each map is one of the hidden tests', () => {
  for (const lv of LEVELS) {
    const sc = scenarioAt(lv, 'software', { [lv.map.x.dim]: lv.map.x.to, [lv.map.y.dim]: lv.map.y.to });
    const worst = paramsOf(sc);
    const hit = lv.tests.some((t) => {
      const m = survivalMap(GOOD[lv.id], lv.id, 'software').tests.find((x) => x.id === t.id);
      return m.x === lv.map.x.to && m.y === lv.map.y.to;
    });
    assert.ok(hit, `${lv.id}: a hidden test sits at ${JSON.stringify(worst)}`);
  }
});

test('monotone: any design that survives the worst corner survives every cell', () => {
  for (const lv of LEVELS) {
    const w = 'software', budget = lv.scenes[w].scenario.targets.cost;
    const pool = candidates(lv, w).filter((c) => c.cost <= budget + 1e-9);
    const step = Math.max(1, Math.floor(pool.length / 60));
    for (let i = 0; i < pool.length; i += step) {
      const m = survivalMap(pool[i].design, lv.id, w);
      if (m.worst.passed) assert.equal(m.survived, m.total, `${lv.id} candidate ${i}`);
    }
  }
});

test('L4: a ticket rail that is too small breaks only on long, big promos, and the rule says so', () => {
  const m = survivalMap(l4(5000), 'l4', 'cafe');
  assert.ok(m.survived < m.total && m.survived > m.total / 2);
  assert.equal(m.worst.passed, false);
  assert.deepEqual(m.rule.conds.map((c) => c.dim).sort(), ['spikeDur', 'spikeLoad']);
  assert.match(ruleWords(m.rule, 'cafe', 'l4'), /app orders a minute or more and the rush lasts \d+ minutes or more|the rush lasts \d+ minutes or more and the rush brings/);
  const worstTest = m.tests.find((t) => t.id === 'worst');
  assert.equal(worstTest.passed, false);
  assert.ok(!m.mildest.passed);
});

test('tests that sit on the map land on cells with the same verdict', () => {
  for (const lv of LEVELS) {
    const m = survivalMap({ blocks: [srv('s1', 200, 1, 5000)], wires: [['traffic', 's1']] }, lv.id, 'cafe');
    for (const t of m.tests.filter((x) => x.x !== null)) {
      const cell = m.cells.find((c) => c.x === t.x && c.y === t.y);
      assert.equal(cell.passed, t.passed, `${lv.id} test ${t.id}`);
    }
  }
});
