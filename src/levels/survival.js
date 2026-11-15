// The survival map: every morning on a grid of the two knobs that matter, green where a design survives
// and red where it breaks, with the level's tests marked on it. Pure, like the simulator.
//
// The simulator is monotone: more traffic, a bigger rush or a longer outage never makes a line shorter.
// So a design that survives the worst corner of the map survives every cell, and each level's hidden
// tests include that corner. The map explains the verdict; it does not change it.
import { simulate } from '../sim/sim.js';
import { LEVELS } from './levels.js';
import { suite, testScenario } from './grade.js';

// Time knobs shift a morning along without making it harder, so tests that differ only in timing
// still sit on the map at their size and length.
const TIME_DIMS = new Set(['spikeT', 'failT', 'flushT']);
const values = ({ from, to, step }) => { const out = []; for (let v = from; v <= to + 1e-9; v += step) out.push(v); return out; };

// Split a total load the way the sample splits reads and writes.
const split = (total, like) => {
  const sum = like.reads + like.writes;
  const reads = sum ? Math.round((total * like.reads) / sum) : total;
  return { reads, writes: total - reads };
};

// A morning's knobs, read back from a scenario.
export function paramsOf(sc) {
  const p = { base: sc.base.reads + sc.base.writes };
  if (sc.spike) Object.assign(p, { spike: 1, spikeT: sc.spike.t, spikeDur: sc.spike.dur, spikeLoad: sc.spike.reads + sc.spike.writes });
  if (sc.serverFail) Object.assign(p, { fail: 1, failT: sc.serverFail.t, failDur: sc.serverFail.dur });
  p.flush = sc.cacheFlush ? 1 : 0;
  if (sc.cacheFlush) p.flushT = sc.cacheFlush.t;
  return p;
}

// The morning every cell starts from: the sample, or the test the map names in `from`.
function startOf(level, world) {
  const sample = level.scenes[world].scenario;
  const t = level.map.from && level.tests.find((x) => x.id === level.map.from);
  return t ? testScenario(sample, t.change) : sample;
}

// The knobs every cell shares: the starting morning's, with the map's fixed values on top.
const referenceOf = (level, world) => ({ ...paramsOf(startOf(level, world)), ...level.map.fixed });

// The scenario for one cell: the starting morning with the map's knobs set.
export function scenarioAt(level, world, knobs) {
  const sample = startOf(level, world);
  const p = { ...paramsOf(sample), ...level.map.fixed, ...knobs };
  const sc = JSON.parse(JSON.stringify(sample));
  // With `reads`, a load knob moves only the reads and keeps the writes as they are.
  const load = (total, like) => (level.map.reads ? { reads: total - like.writes, writes: like.writes } : split(total, like));
  sc.base = load(p.base, sample.base);
  if (p.spikeLoad !== undefined) sc.spike = { t: p.spikeT ?? 30, dur: p.spikeDur, ...load(p.spikeLoad, sample.spike || sample.base) };
  if (p.failDur !== undefined) sc.serverFail = { t: p.failT ?? 10, dur: p.failDur };
  if (sample.cacheFlush || level.map.y.dim === 'flush' || level.map.x.dim === 'flush') {
    if (p.flush) sc.cacheFlush = { t: p.flushT ?? sample.cacheFlush.t, warm: sample.cacheFlush.warm };
    else delete sc.cacheFlush;
  }
  return sc;
}

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

function bestCondition(items, base, dims) {
  let best = null;
  for (const dim of dims) {
    const vals = [...new Set(items.map((m) => m.params[dim]).filter((v) => v !== undefined))].sort((a, b) => a - b);
    for (const op of dim === 'flush' ? ['>='] : ['>=', '<=']) {
      for (const value of dim === 'flush' ? [1] : vals) {
        const s = score([...base, { dim, op, value }], items);
        if (!best || s.f1 > best.s.f1 + 1e-9) best = { cond: { dim, op, value }, s };
      }
    }
  }
  return best;
}

// The simplest rule (one or two conditions on the map's knobs) that picks out the cells that break.
export function findRule(items, dims) {
  const failures = items.filter((m) => !m.passed).length;
  if (!failures) return null;
  const first = bestCondition(items, [], dims);
  let conds = [first.cond], s = first.s;
  const second = bestCondition(items, conds, dims.filter((d) => d !== first.cond.dim));
  if (second && second.s.f1 > s.f1 + 0.03) { conds = [...conds, second.cond]; s = second.s; }
  if (s.f1 < 0.3) return { conds: [], ...score([], items), failures, clear: false };
  return { conds, ...s, failures, clear: s.f1 >= 0.6 };
}

// The failing cell closest to the edge of the green: the mildest morning that still breaks the design.
function mildest(cells, xs, ys) {
  const fails = cells.filter((c) => !c.passed);
  if (!fails.length) return null;
  const norm = (v, list) => (list.length > 1 ? (v - list[0]) / (list[list.length - 1] - list[0]) : 0);
  return fails.reduce((a, c) => (norm(c.x, xs) + norm(c.y, ys) < norm(a.x, xs) + norm(a.y, ys) ? c : a), fails[0]);
}

// `design` has one `name` per block (see simDesign).
export function survivalMap(design, levelId, world) {
  const level = LEVELS.find((l) => l.id === levelId);
  const { x, y } = level.map;
  const xs = values(x), ys = values(y);
  const cells = [];
  for (const yv of ys) {
    for (const xv of xs) {
      const scenario = scenarioAt(level, world, { [x.dim]: xv, [y.dim]: yv });
      const r = simulate(design, scenario).result;
      cells.push({ x: xv, y: yv, scenario, params: paramsOf(scenario), passed: r.passed, checks: r.checks });
    }
  }
  const at = (xv, yv) => cells.find((c) => c.x === xv && c.y === yv);
  // Tests sit on the map when every knob that is not on an axis matches the cells' (timing aside).
  const ref = referenceOf(level, world);
  const tests = suite(level, world).map((t) => {
    const p = paramsOf(t.scenario);
    const same = (k) => k === x.dim || k === y.dim || TIME_DIMS.has(k) || p[k] === ref[k];
    const onMap = p[x.dim] !== undefined && p[y.dim] !== undefined && xs.includes(p[x.dim]) && ys.includes(p[y.dim])
      && Object.keys({ ...ref, ...p }).every(same);
    return { id: t.id, n: t.n, name: t.name, hidden: t.hidden, x: onMap ? p[x.dim] : null, y: onMap ? p[y.dim] : null, passed: simulate(design, t.scenario).result.passed };
  });
  const worst = at(xs[xs.length - 1], ys[ys.length - 1]);
  const survived = cells.filter((c) => c.passed).length;
  return {
    x: { ...x, values: xs }, y: { ...y, values: ys }, cells, tests, survived, total: cells.length,
    worst, rule: findRule(cells, [x.dim, y.dim]), mildest: mildest(cells, xs, ys)
  };
}
