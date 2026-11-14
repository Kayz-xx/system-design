// Run with: npm test. Each level's hidden tests must accept the intended fix, reject a fix that only
// survives the sample, and give the same verdict in the coffee shop and in software.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from './levels.js';
import { grade, suite } from './grade.js';

const level = (id) => LEVELS.find((l) => l.id === id);
const named = (d, world) => ({ ...d, blocks: d.blocks.map((b) => ({ ...b, name: b.names ? b.names[world] : b.id })) });
const srv = (id, capacity, copies = 1, queueLimit = 500) => ({ id, type: 'server', capacity, copies, queueLimit });
const lb = { id: 'lb', type: 'loadBalancer' };
const db = (o = {}) => ({ id: 'db1', type: 'database', readCapacity: 300, writeCapacity: 100, replicas: 0, queueLimit: 2000, ...o });
const cache = { id: 'c', type: 'cache', size: 'medium' };
const queue = { id: 'q', type: 'queue', workers: 2, workerRate: 50, queueLimit: 5000 };

// [intended fix, a fix that passes only the sample]
const CASES = {
  l1: [{ blocks: [srv('s1', 250, 1, 5000)], wires: [['traffic', 's1']] }, { blocks: [srv('s1', 200, 1, 5000)], wires: [['traffic', 's1']] }],
  l2: [{ blocks: [lb, srv('s', 100, 4)], wires: [['traffic', 'lb'], ['lb', 's']] }, { blocks: [lb, srv('s', 130, 3)], wires: [['traffic', 'lb'], ['lb', 's']] }],
  l3: [
    { blocks: [srv('s', 1200, 1, 2000), cache, db({ replicas: 2 })], wires: [['traffic', 's'], ['s', 'c'], ['c', 'db1'], ['s', 'db1']] },
    { blocks: [srv('s', 1000, 1, 2000), cache, db({ replicas: 2 })], wires: [['traffic', 's'], ['s', 'c'], ['c', 'db1'], ['s', 'db1']] }
  ],
  l4: [
    { blocks: [srv('s', 300), db({ readCapacity: 100, queueLimit: 200 }), queue], wires: [['traffic', 's'], ['s', 'q'], ['q', 'db1']] },
    { blocks: [srv('s', 250), db({ readCapacity: 100, queueLimit: 200 }), queue], wires: [['traffic', 's'], ['s', 'q'], ['q', 'db1']] }
  ]
};

for (const lv of LEVELS) {
  test(`${lv.id}: hidden tests accept the intended fix and catch a sample-only fix, in both scenes`, () => {
    const [good, sampleOnly] = CASES[lv.id];
    const verdicts = {};
    for (const world of ['cafe', 'software']) {
      const g = grade(named(good, world), lv.id, world);
      assert.equal(g.accepted, true, `${world}: ${g.failed && g.failed.name}`);
      const s = grade(named(sampleOnly, world), lv.id, world);
      assert.equal(s.results[0].passed, true, `${world}: the sample-only fix passes the sample`);
      assert.equal(s.accepted, false, `${world}: a hidden test catches it`);
      assert.equal(s.failed.hidden, true);
      verdicts[world] = s.results.map((r) => r.passed);
    }
    assert.deepEqual(verdicts.cafe, verdicts.software, 'same verdict per test in both scenes');
  });

  test(`${lv.id}: a starting board is given, and each test is named and changes the sample`, () => {
    for (const world of ['cafe', 'software']) {
      const tests = suite(lv, world);
      assert.equal(tests.length, 4);
      for (const t of tests.slice(1)) {
        assert.ok(t.name && t.story);
        assert.notDeepEqual(t.scenario, lv.scenes[world].scenario);
      }
      assert.ok(lv.scenes[world].constraints.length >= 3);
    }
    assert.ok(['Easy', 'Medium', 'Hard'].includes(lv.difficulty));
  });
}

test('an empty or broken starting board is not accepted', () => {
  const g = grade({ blocks: [], wires: [] }, 'l2', 'cafe');
  assert.equal(g.accepted, false);
  assert.equal(g.failed.id, 'sample');
});
