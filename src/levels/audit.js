// The audit: does an accepted design really hold up, or did it get lucky on four tests?
// 1. Draw many random mornings from inside the level's Constraints (`level.audit`).
// 2. Run the design on every one, and find the simplest rule that says which mornings break it.
// 3. Compare with 100 "monkeys": random designs built from the same palette for the same budget,
//    run on the same mornings (scores stored in monkey-scores.js; make-monkeys.js regenerates them).
// The randomness lives here, from a fixed seed, so the simulator stays pure and the same design
// always gets the same audit. Every pass and fail still comes from simulate().
import { designCost, simulate } from '../sim/sim.js';
import { LEVELS } from './levels.js';
import { candidates } from './best.js';

export const MORNINGS = 1000;
export const MONKEYS = 100;
export const SEED = 20261115;
export const SKILL_PERCENTILE = 0.9;
export const SKILL_SURVIVAL = 0.95;

// mulberry32: small, fast and the same on every machine.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (r, [lo, hi], step = 1) => lo + Math.floor(r() * (Math.floor((hi - lo) / step) + 1)) * step;
// Split a total load the way the sample splits reads and writes.
const split = (total, like) => {
  const sum = like.reads + like.writes;
  const reads = sum ? Math.round((total * like.reads) / sum) : total;
  return { reads, writes: total - reads };
};

// One random morning: its parameters (for the rule finder) and its scenario (for the simulator).
function drawMorning(r, space, sample) {
  const params = {}, sc = JSON.parse(JSON.stringify(sample));
  delete sc.spike; delete sc.serverFail; delete sc.cacheFlush;
  params.base = between(r, space.base, 10);
  sc.base = split(params.base, sample.base);
  if (space.spike) {
    params.spike = r() < space.spike.p ? 1 : 0;
    if (params.spike) {
      params.spikeT = between(r, space.spike.t);
      params.spikeDur = between(r, space.spike.dur);
      params.spikeLoad = between(r, space.spike.load, 10);
      sc.spike = { t: params.spikeT, dur: params.spikeDur, ...split(params.spikeLoad, sample.spike || sample.base) };
    }
  }
  if (space.serverFail) {
    params.fail = r() < space.serverFail.p ? 1 : 0;
    if (params.fail) {
      params.failT = between(r, space.serverFail.t);
      params.failDur = between(r, space.serverFail.dur);
      sc.serverFail = { t: params.failT, dur: params.failDur };
    }
  }
  if (space.cacheFlush) {
    params.flush = r() < space.cacheFlush.p ? 1 : 0;
    if (params.flush) {
      params.flushT = between(r, space.cacheFlush.t);
      sc.cacheFlush = { t: params.flushT, warm: space.cacheFlush.warm };
    }
  }
  return { params, scenario: sc };
}

// The same mornings for everyone who plays this scene: same seed, same list.
const morningCache = {};
export function mornings(levelId, world, n = MORNINGS, seed = SEED) {
  const k = `${levelId}:${world}:${n}:${seed}`;
  if (morningCache[k]) return morningCache[k];
  const level = LEVELS.find((l) => l.id === levelId);
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ i, ...drawMorning(r, level.audit, level.scenes[world].scenario) });
  return (morningCache[k] = out);
}

// Which dimensions a level's mornings vary, and in which direction they get harder.
export const DIMS = {
  base: { harder: '>=' }, spikeLoad: { harder: '>=' }, spikeDur: { harder: '>=' }, spikeT: { harder: '>=' },
  spike: { flag: true }, failT: { harder: '<=' }, failDur: { harder: '>=' }, fail: { flag: true },
  flush: { flag: true }, flushT: { harder: '<=' }
};

const holds = (c, p) => {
  const v = p[c.dim];
  if (v === undefined) return false;
  return c.op === '>=' ? v >= c.value : v <= c.value;
};

function score(conds, items) {
  let tp = 0, fp = 0, fn = 0;
  for (const m of items) {
    const hit = conds.every((c) => holds(c, m.params));
    if (hit && !m.passed) tp++; else if (hit) fp++; else if (!m.passed) fn++;
  }
  return { tp, fp, fn, f1: tp ? (2 * tp) / (2 * tp + fp + fn) : 0 };
}

function bestCondition(items, base) {
  let best = null;
  const dims = [...new Set(items.flatMap((m) => Object.keys(m.params)))];
  for (const dim of dims) {
    const values = [...new Set(items.map((m) => m.params[dim]).filter((v) => v !== undefined))].sort((a, b) => a - b);
    const ops = DIMS[dim] && DIMS[dim].flag ? ['>='] : ['>=', '<='];
    const tries = DIMS[dim] && DIMS[dim].flag ? [1] : values;
    for (const op of ops) {
      for (const value of tries) {
        const conds = [...base, { dim, op, value }];
        const s = score(conds, items);
        if (!best || s.f1 > best.s.f1 + 1e-9) best = { cond: { dim, op, value }, s };
      }
    }
  }
  return best;
}

// The simplest rule (one or two conditions) that picks out the mornings this design fails.
export function findRule(items) {
  const failures = items.filter((m) => !m.passed).length;
  if (!failures) return null;
  // Greedy: the best single condition, then the best second one inside it. A weak first condition can
  // still lead to a sharp pair ("a long rush" and "a big rush"), so the pair is always tried.
  const first = bestCondition(items, []);
  if (!first) return { conds: [], ...score([], items), failures, clear: false };
  let conds = [first.cond], s = first.s;
  const second = bestCondition(items, conds);
  if (second && second.cond.dim !== first.cond.dim && second.s.f1 > s.f1 + 0.03) { conds = [...conds, second.cond]; s = second.s; }
  if (s.f1 < 0.3) return { conds: [], ...score([], items), failures, clear: false };
  return { conds, ...s, failures, clear: s.f1 >= 0.6 };
}

// The failing morning closest to the rule's edges: the mildest morning that still breaks the design.
function mildest(items, rule) {
  const fails = items.filter((m) => !m.passed);
  if (!fails.length) return null;
  const inRule = rule && rule.conds.length ? fails.filter((m) => rule.conds.every((c) => holds(c, m.params))) : fails;
  const pool = inRule.length ? inRule : fails;
  const dist = (m) => (rule && rule.conds.length ? rule.conds.reduce((a, c) => a + Math.abs(m.params[c.dim] - c.value), 0) : 0);
  return pool.reduce((a, m) => (dist(m) < dist(a) ? m : a), pool[0]);
}

export function survivalOf(design, list) {
  let n = 0;
  for (const m of list) if (simulate(design, m.scenario).result.passed) n++;
  return n;
}

// Monkeys: random palette designs within the scene's budget, picked with the same seed.
export function monkeyDesigns(levelId, world, n = MONKEYS, seed = SEED) {
  const level = LEVELS.find((l) => l.id === levelId);
  const budget = level.scenes[world].scenario.targets.cost;
  const pool = candidates(level, world).filter((c) => c.cost <= budget + 1e-9);
  const r = rng(seed ^ 0x9e3779b9);
  return Array.from({ length: n }, () => pool[Math.floor(r() * pool.length)].design);
}

// Where a survival count sits among the monkeys: the share it beats or ties.
export function percentile(survived, monkeyScores) {
  if (!monkeyScores || !monkeyScores.length) return null;
  return monkeyScores.filter((s) => s <= survived).length / monkeyScores.length;
}

// `design` has one `name` per block (see simDesign). `monkeyScores` are the stored monkey survival counts.
export function audit(design, levelId, world, monkeyScores = null, { n = MORNINGS, seed = SEED } = {}) {
  const list = mornings(levelId, world, n, seed);
  const items = list.map((m) => {
    const log = simulate(design, m.scenario);
    return { i: m.i, params: m.params, scenario: m.scenario, passed: log.result.passed, checks: log.result.checks };
  });
  const survived = items.filter((m) => m.passed).length;
  const rule = findRule(items);
  const pct = percentile(survived, monkeyScores);
  return {
    n, survived, passed: items.map((m) => m.passed), items, rule,
    mildest: mildest(items, rule),
    cost: designCost(design),
    monkeys: monkeyScores ? { scores: monkeyScores, percentile: pct, mean: monkeyScores.reduce((a, b) => a + b, 0) / monkeyScores.length } : null,
    // Skill: it holds up on nearly every morning and does better than nine in ten monkeys. Otherwise
    // the four tests went its way: lucky.
    verdict: pct == null ? null : pct >= SKILL_PERCENTILE && survived >= SKILL_SURVIVAL * n ? 'skill' : 'lucky'
  };
}
