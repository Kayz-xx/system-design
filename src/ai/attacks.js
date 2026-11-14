// Chaos attacks: pure helpers shared by the chaos endpoint, the browser loop and the tests.
// An attack is a set of shocks ({ spike, serverFail, cacheFlush }) merged into a scenario.
// Nothing here trusts an attack until simulate() has confirmed that it breaks the design.
// No DOM, no network, no randomness.
import { simulate } from '../sim/sim.js';
import { rejectReason, words } from './facts.js';

export const DEFAULT_BUDGET = { shocks: 2, maxSpikeMultiplier: 3 };
const SHOCKS = ['spike', 'serverFail', 'cacheFlush'];
const MAX_FAIL = 60, MAX_WARM = 60, MAX_SPIKE_DUR = 40;

const int = (v) => (Number.isFinite(v) ? Math.round(v) : NaN);

// Which shocks make sense for this design.
export function possibleShocks(design) {
  const has = (type) => design.blocks.some((b) => b.type === type);
  return SHOCKS.filter((s) => s === 'spike' || (s === 'serverFail' && has('server')) || (s === 'cacheFlush' && has('cache')));
}

// Clean an untrusted attack against the budget. Returns the attack or null.
export function cleanAttack(input, scenario, design, budget = DEFAULT_BUDGET) {
  if (!input || typeof input !== 'object') return null;
  const allowed = possibleShocks(design), out = {};
  const latest = scenario.duration - 20; // leave time to see the effect
  for (const k of SHOCKS) {
    const v = input[k];
    if (v === undefined || v === null) continue;
    if (!allowed.includes(k) || typeof v !== 'object') return null;
    if (k === 'spike') {
      const s = { t: int(v.t), dur: int(v.dur), reads: int(v.reads), writes: int(v.writes ?? 0) };
      const cap = (x) => Math.round(x * budget.maxSpikeMultiplier);
      if (!(s.t >= 5 && s.t <= latest && s.dur >= 5 && s.dur <= MAX_SPIKE_DUR)) return null;
      if (!(s.reads >= scenario.base.reads && s.reads <= cap(scenario.base.reads))) return null;
      if (!(s.writes >= scenario.base.writes && s.writes <= cap(scenario.base.writes))) return null;
      if (s.reads + s.writes <= scenario.base.reads + scenario.base.writes) return null;
      out.spike = s;
    }
    if (k === 'serverFail') {
      const s = { t: int(v.t), dur: int(v.dur) };
      if (!(s.t >= 5 && s.t <= latest && s.dur >= 5 && s.dur <= MAX_FAIL)) return null;
      out.serverFail = s;
    }
    if (k === 'cacheFlush') {
      const s = { t: int(v.t), warm: int(v.warm) };
      if (!(s.t >= 5 && s.t <= latest && s.warm >= 5 && s.warm <= MAX_WARM)) return null;
      out.cacheFlush = s;
    }
  }
  const n = Object.keys(out).length;
  return n >= 1 && n <= budget.shocks ? out : null;
}

// The attack's shocks replace the scenario's shocks of the same kind.
export const applyAttack = (scenario, attack) => ({ ...JSON.parse(JSON.stringify(scenario)), ...attack });

// How hard an attack hits, roughly 0..1 per shock. Milder attacks read as more realistic.
export function severity(attack, scenario, budget = DEFAULT_BUDGET) {
  let s = 0;
  const base = scenario.base.reads + scenario.base.writes;
  if (attack.spike) {
    const m = (attack.spike.reads + attack.spike.writes) / Math.max(1, base);
    s += ((m - 1) / Math.max(0.01, budget.maxSpikeMultiplier - 1)) * 0.7 + (attack.spike.dur / MAX_SPIKE_DUR) * 0.3;
  }
  if (attack.serverFail) s += 0.4 + 0.6 * (attack.serverFail.dur / MAX_FAIL);
  if (attack.cacheFlush) s += 0.4 + 0.6 * (attack.cacheFlush.warm / MAX_WARM);
  return Math.round(s * 1000) / 1000;
}

// Run an attack. `broke` is true only when the simulator says customers are lost or kept waiting
// (the error or slow check fails). Cost is not counted: an incident does not change the bill.
export function tryAttack(design, scenario, attack) {
  const log = simulate(design, applyAttack(scenario, attack));
  return { attack, broke: !log.result.checks.errors || !log.result.checks.slow, log };
}

// Deterministic search over shock combinations within the budget. Returns every attack that
// breaks the design, mildest first. This backs the agent: it picks from these and tells the story.
export function searchAttacks(design, scenario, budget = DEFAULT_BUDGET, { limit = 8 } = {}) {
  const allowed = possibleShocks(design), base = scenario.base, latest = scenario.duration - 20;
  const t0 = Math.min(30, latest);
  const options = { spike: [], serverFail: [], cacheFlush: [] };
  for (const m of [1.5, 2, 2.5, 3].filter((x) => x <= budget.maxSpikeMultiplier)) {
    for (const dur of [10, 20, 30]) {
      options.spike.push({ spike: { t: t0, dur, reads: Math.round(base.reads * m), writes: Math.round(base.writes * m) } });
    }
  }
  for (const dur of [20, 40, 60]) options.serverFail.push({ serverFail: { t: t0 + 10, dur } });
  for (const warm of [20, 40, 60]) options.cacheFlush.push({ cacheFlush: { t: t0 + 10, warm } });

  const singles = allowed.flatMap((k) => options[k]);
  const combos = [...singles];
  if (budget.shocks >= 2) {
    for (let i = 0; i < allowed.length; i++) {
      for (let j = i + 1; j < allowed.length; j++) {
        for (const a of options[allowed[i]]) for (const b of options[allowed[j]]) combos.push({ ...a, ...b });
      }
    }
  }
  const found = [];
  for (const attack of combos) {
    if (!cleanAttack(attack, scenario, design, budget)) continue;
    const r = tryAttack(design, scenario, attack);
    if (r.broke) found.push({ attack, severity: severity(attack, scenario, budget), result: r.log.result });
  }
  found.sort((a, b) => a.severity - b.severity || JSON.stringify(a.attack).localeCompare(JSON.stringify(b.attack)));
  return found.slice(0, limit);
}

// Plain facts about an attack, from its numbers. Shown next to any story, so the numbers are always right.
export function describeAttack(attack, scenario, design, world) {
  const w = words(world), parts = [];
  const nameOf = (type) => (design.blocks.find((b) => b.type === type) || {}).name;
  if (attack.spike) {
    const v = attack.spike.reads + attack.spike.writes;
    parts.push(w.cafe
      ? `From ${w.clock(attack.spike.t)}, ${w.rate(v)} arrive for ${w.dur(attack.spike.dur)}.`
      : `From ${w.clock(attack.spike.t)}, traffic is ${w.rate(v)} for ${w.dur(attack.spike.dur)}.`);
  }
  if (attack.serverFail) {
    const s = design.blocks.find((x) => x.type === 'server') || {}, n = s.name || (w.cafe ? 'Baristas' : 'the server');
    const at = w.clock(attack.serverFail.t), dur = w.dur(attack.serverFail.dur);
    if (s.copies === 1) parts.push(w.cafe ? `At ${at}, ${n} is out for ${dur}, and nobody covers.` : `At ${at}, ${n} crashes for ${dur}. It is the only copy.`);
    else parts.push(w.cafe ? `At ${at}, one of the ${n} is out for ${dur}.` : `At ${at}, one copy of ${n} crashes for ${dur}.`);
  }
  if (attack.cacheFlush) {
    parts.push(w.cafe
      ? `At ${w.clock(attack.cacheFlush.t)}, ${nameOf('cache') || 'the fridge'} empties and takes ${w.dur(attack.cacheFlush.warm)} to restock.`
      : `At ${w.clock(attack.cacheFlush.t)}, ${nameOf('cache') || 'the cache'} restarts empty and takes ${w.dur(attack.cacheFlush.warm)} to warm up.`);
  }
  return parts.join(' ');
}

// A template story, used when the AI is off or its story fails the check.
export function templateStory(attack, world) {
  const cafe = world === 'cafe', bits = [];
  if (attack.spike) bits.push(cafe ? 'A tour bus pulls up outside.' : 'A newsletter with a million readers links to the site.');
  if (attack.serverFail) bits.push(cafe ? 'Then a barista burns their hand and has to go home.' : 'Then one copy runs out of memory and crashes.');
  if (attack.cacheFlush) bits.push(cafe ? 'The morning delivery is late, so the fridge runs empty.' : 'A bad deploy restarts the cache, and it comes back empty.');
  if (!attack.spike && bits.length) bits[0] = bits[0].replace(/^Then (\w)/, (_, c) => c.toUpperCase());
  return bits.join(' ');
}

// Check on an AI-written story. Returns a reason when it must not be shown.
export function storyReason(story, world) {
  if (typeof story !== 'string') return 'no story';
  const s = story.trim();
  if (s.length < 20 || s.length > 320) return 'wrong length';
  if (/\d/.test(s)) return 'has numbers'; // the numbers come from describeAttack, never from the model
  return rejectReason(s, { names: { allowed: [], other: [] }, world });
}
