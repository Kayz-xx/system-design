// Run with: npm test. The audit must be repeatable, stay inside each level's constraints,
// tell the intended fixes apart from sample-only fixes, and match the stored monkey scores.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from './levels.js';
import { audit, findRule, mornings, monkeyDesigns, percentile, rng, survivalOf } from './audit.js';
import { MONKEY_SCORES } from './monkey-scores.js';

const srv = (id, capacity, copies = 1, queueLimit = 500) => ({ id, type: 'server', name: id, capacity, copies, queueLimit });
const lb = { id: 'lb', type: 'loadBalancer', name: 'lb' };
const db = (o = {}) => ({ id: 'db1', type: 'database', name: 'db', readCapacity: 300, writeCapacity: 100, replicas: 0, queueLimit: 2000, ...o });
const cache = { id: 'c', type: 'cache', name: 'c', size: 'medium' };
const queue = { id: 'q', type: 'queue', name: 'q', workers: 2, workerRate: 50, queueLimit: 5000 };
const l1 = (cap) => ({ blocks: [srv('s1', cap, 1, 5000)], wires: [['traffic', 's1']] });
const l3 = (replicas) => ({ blocks: [srv('s', 1200, 1, 2000), cache, db({ replicas })], wires: [['traffic', 's'], ['s', 'c'], ['c', 'db1'], ['s', 'db1']] });

test('the random number generator repeats for a seed', () => {
  const a = rng(7), b = rng(7);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
  assert.notEqual(rng(7)(), rng(8)());
});

test('mornings are the same every time and stay inside the constraints', () => {
  for (const lv of LEVELS) {
    const list = mornings(lv.id, 'software', 300);
    assert.deepEqual(list.map((m) => m.params), mornings(lv.id, 'software', 300, 20261115).map((m) => m.params));
    const sp = lv.audit;
    for (const { params: p, scenario: sc } of list) {
      assert.ok(p.base >= sp.base[0] && p.base <= sp.base[1]);
      assert.equal(sc.base.reads + sc.base.writes, p.base);
      if (sc.spike) assert.ok(sc.spike.t <= sp.spike.t[1] && sc.spike.dur <= sp.spike.dur[1] && sc.spike.reads + sc.spike.writes <= sp.spike.load[1]);
      if (sc.serverFail) assert.ok(sc.serverFail.t >= sp.serverFail.t[0] && sc.serverFail.dur <= sp.serverFail.dur[1]);
      if (sc.cacheFlush) assert.ok(sc.cacheFlush.t <= sp.cacheFlush.t[1]);
      assert.equal(sc.duration, lv.scenes.software.scenario.duration);
      assert.equal(sc.latencyTargetMs, lv.scenes.software.scenario.latencyTargetMs);
    }
  }
});

test('L1: the intended fix survives every morning; a sample-only fix is found out, with the reason', () => {
  const good = audit(l1(250), 'l1', 'cafe', MONKEY_SCORES.l1.cafe);
  assert.equal(good.survived, 1000);
  assert.equal(good.rule, null);
  assert.equal(good.verdict, 'skill');
  const lucky = audit(l1(200), 'l1', 'cafe', MONKEY_SCORES.l1.cafe);
  assert.ok(lucky.survived < 1000);
  assert.equal(lucky.verdict, 'lucky', 'most monkeys at this budget do as well');
  assert.ok(lucky.rule.clear, 'one simple rule explains the failures');
  assert.ok(lucky.rule.conds.some((c) => c.dim.startsWith('spike')), 'the rule is about the rush');
  assert.equal(lucky.mildest.passed, false);
});

test('L3: the audit finds the busy morning plus a sellout that the hidden tests miss', () => {
  const a = audit(l3(2), 'l3', 'software', MONKEY_SCORES.l3.software);
  assert.ok(a.survived < 950);
  const dims = a.rule.conds.map((c) => c.dim).sort();
  assert.deepEqual(dims, ['base', 'flush']);
  assert.equal(a.rule.fn, 0, 'every failure fits the rule');
  // Within budget, enough read replicas to carry a busy morning without the cache does survive.
  const robust = { blocks: [srv('s', 1100), db({ replicas: 3 })], wires: [['traffic', 's'], ['s', 'db1']] };
  assert.equal(audit(robust, 'l3', 'software').survived, 1000);
});

test('a rule needs both halves when one alone explains little', () => {
  const items = [];
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) items.push({ params: { spikeLoad: a, spikeDur: b }, passed: !(a >= 8 && b >= 8) });
  const r = findRule(items);
  assert.equal(r.conds.length, 2);
  assert.equal(r.tp, 4); assert.equal(r.fp, 0);
});

test('percentile counts the monkeys beaten or tied', () => {
  assert.equal(percentile(500, [100, 500, 900, 1000]), 0.5);
  assert.equal(percentile(0, []), null);
});

test('stored monkey scores match a fresh run of the first monkeys', () => {
  for (const [id, w] of [['l1', 'cafe'], ['l4', 'software']]) {
    const stored = MONKEY_SCORES[id][w];
    assert.equal(stored.length, 100);
    const list = mornings(id, w);
    monkeyDesigns(id, w).slice(0, 5).forEach((d, i) => assert.equal(survivalOf(d, list), stored[i], `${id} ${w} monkey ${i}`));
  }
  for (const lv of LEVELS) for (const w of ['cafe', 'software']) {
    const budget = lv.scenes[w].scenario.targets.cost;
    assert.ok(MONKEY_SCORES[lv.id][w].every((s) => s >= 0 && s <= 1000));
    assert.ok(budget > 0);
  }
});
