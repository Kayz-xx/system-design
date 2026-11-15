// Run with: npm test. "Why it worked" explains an accepted design with numbers from its run on the hardest
// test, one fact per principle the level teaches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from './levels.js';
import { whyItWorked, hardestTest } from './why.js';

const srv = (id, capacity, copies = 1, queueLimit = 500) => ({ id, type: 'server', name: id, capacity, copies, queueLimit });
const lb = { id: 'lb', type: 'loadBalancer', name: 'lb' };
const db = (o = {}) => ({ id: 'db1', type: 'database', name: 'db', readCapacity: 300, writeCapacity: 100, replicas: 0, queueLimit: 2000, ...o });
const cache = { id: 'c', type: 'cache', name: 'c', size: 'medium' };
const queue = { id: 'q', type: 'queue', name: 'q', workers: 2, workerRate: 50, queueLimit: 10000 };
const GOOD = {
  l1: { blocks: [srv('s1', 250, 1, 5000)], wires: [['traffic', 's1']] },
  l2: { blocks: [lb, srv('s', 100, 4)], wires: [['traffic', 'lb'], ['lb', 's']] },
  l3: { blocks: [srv('s', 1200, 1, 2000), cache, db({ replicas: 3 })], wires: [['traffic', 's'], ['s', 'c'], ['c', 'db1'], ['s', 'db1']] },
  l4: { blocks: [srv('s', 300), db({ readCapacity: 100, queueLimit: 200 }), queue], wires: [['traffic', 's'], ['s', 'q'], ['q', 'db1']] },
  l5: { blocks: [lb, srv('s', 300, 5, 5000), cache, db(), queue], wires: [['traffic', 'lb'], ['lb', 's'], ['s', 'c'], ['c', 'db1'], ['s', 'db1'], ['s', 'q'], ['q', 'db1']] }
};

test('every level names a topic, and the hardest test is its worst case', () => {
  for (const lv of LEVELS) {
    assert.ok(lv.topic && lv.topic.name && lv.principles.length, lv.id);
    for (const w of ['cafe', 'software']) {
      assert.ok(lv.topic.idea[w] && lv.topic.tool[w] && lv.topic.tradeoff[w]);
      assert.equal(hardestTest(lv, w).id, 'worst');
    }
  }
  assert.deepEqual(LEVELS.find((l) => l.capstone).principles.sort(), ['async', 'caching', 'redundancy', 'scaling']);
});

test('an accepted design gets one fact per principle, from the worst run', () => {
  for (const lv of LEVELS) {
    for (const w of ['cafe', 'software']) {
      const out = whyItWorked(GOOD[lv.id], lv.id, w);
      assert.equal(out.passed, true, `${lv.id} ${w}`);
      assert.deepEqual(out.facts.map((f) => f.principle), lv.principles, `${lv.id} ${w}`);
    }
  }
});

test('the facts carry the numbers that make each principle work', () => {
  const [l1] = whyItWorked(GOOD.l1, 'l1', 'software').facts;
  assert.equal(l1.capacity, 250); assert.equal(l1.peak, 240); assert.equal(l1.headroom, 10); assert.equal(l1.line, 0);
  const [l2] = whyItWorked(GOOD.l2, 'l2', 'software').facts;
  assert.equal(l2.copies, 4); assert.equal(l2.left, 300); assert.equal(l2.loadDuring, 280);
  const [l3] = whyItWorked(GOOD.l3, 'l3', 'software').facts;
  assert.equal(l3.cache, true); assert.ok(Math.abs(l3.dbWarm - 110) < 1e-6, String(l3.dbWarm)); assert.equal(l3.readCap, 1200);
  const [l4] = whyItWorked(GOOD.l4, 'l4', 'software').facts;
  assert.equal(l4.queue, true); assert.equal(l4.drainRate, 100); assert.equal(l4.backlog, 6000);
  // Level 4 has no drain rule, so the biggest promo is still on the rail when the run ends.
  assert.equal(l4.drainedT, null); assert.ok(l4.leftAtClose > 0);
  const l5 = whyItWorked(GOOD.l5, 'l5', 'software').facts.find((f) => f.principle === 'async');
  assert.ok(l5.drainedT !== null); assert.equal(l5.leftAtClose, 0);
  const noCache = whyItWorked({ blocks: [srv('s', 1100, 1, 2000), db({ replicas: 3 })], wires: [['traffic', 's'], ['s', 'db1']] }, 'l3', 'software');
  assert.equal(noCache.passed, true);
  assert.equal(noCache.facts[0].cache, false);
});
