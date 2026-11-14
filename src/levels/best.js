// The cheapest design that passes every test of a scene, found by searching the designs a learner can build
// from the palette (same blocks, same setting steps). Pure and deterministic. The results are stored in
// best-designs.js so the browser never has to search; best.test.js checks the stored answers are still right.
import { designCost, simulate } from '../sim/sim.js';
import { suite } from './grade.js';
import { LEVELS } from './levels.js';

const range = (from, to, step) => { const out = []; for (let v = from; v <= to + 1e-9; v += step) out.push(v); return out; };

// Every candidate design for a scene, in software units, each with its cost.
export function candidates(level, world) {
  const tests = suite(level, world);
  const starterDb = ((level.starter || level.design).blocks || []).find((b) => b.type === 'database');
  const peak = (k) => Math.max(...tests.map((t) => Math.max(t.scenario.base[k], t.scenario.spike ? t.scenario.spike[k] : 0)));
  const reads = peak('reads') > 0, writes = peak('writes') > 0;
  const maxCap = Math.ceil((peak('reads') + peak('writes')) * 1.5 / 50) * 50;

  const servers = [];
  for (const capacity of range(50, maxCap, 50)) {
    for (const copies of [1, 2, 3, 4, 5]) {
      for (const queueLimit of [500, 5000]) servers.push({ id: 's1', type: 'server', name: 'Server', capacity, copies, queueLimit });
    }
  }
  const caches = starterDb && reads ? [null, 'small', 'medium', 'large'].map((size) => size && { id: 'c1', type: 'cache', name: 'Cache', size }) : [null];
  const queues = [null];
  if (starterDb && writes) {
    for (const workers of [1, 2, 3, 4]) for (const workerRate of range(25, 150, 25)) queues.push({ id: 'q1', type: 'queue', name: 'Queue', workers, workerRate, queueLimit: 5000 });
  }
  const dbs = [null];
  if (starterDb) {
    dbs.length = 0;
    for (const replicas of reads ? [0, 1, 2, 3, 4] : [0]) {
      for (const writeCapacity of writes ? range(50, 300, 50) : [starterDb.writeCapacity]) {
        for (const queueLimit of [starterDb.queueLimit, 5000]) dbs.push({ ...starterDb, name: 'Database', replicas, writeCapacity, queueLimit });
      }
    }
  }

  const out = [];
  for (const s of servers) for (const c of caches) for (const q of queues) for (const db of dbs) {
    const blocks = [], wires = [];
    if (s.copies > 1) { blocks.push({ id: 'lb1', type: 'loadBalancer', name: 'Load balancer' }); wires.push(['traffic', 'lb1'], ['lb1', 's1']); }
    else wires.push(['traffic', 's1']);
    blocks.push(s);
    if (db) {
      blocks.push(db); wires.push(['s1', db.id]);
      if (c) { blocks.push(c); wires.push(['s1', 'c1'], ['c1', db.id]); }
      if (q) { blocks.push(q); wires.push(['s1', 'q1'], ['q1', db.id]); }
    }
    const d = { blocks, wires };
    out.push({ design: d, cost: Math.round(designCost(d) * 1000) / 1000 });
  }
  return out;
}

// Stops at the first failing test, which keeps the search fast.
function passesAll(design, tests) {
  for (const t of tests) if (!simulate(design, t.scenario).result.passed) return false;
  return true;
}

// The cheapest passing candidate. Ties keep the simpler design (fewer blocks, then generation order).
export function findBest(levelId, world) {
  const level = LEVELS.find((l) => l.id === levelId);
  const tests = suite(level, world);
  const all = candidates(level, world)
    .map((c, i) => ({ ...c, i }))
    .sort((a, b) => a.cost - b.cost || a.design.blocks.length - b.design.blocks.length || a.i - b.i);
  for (const c of all) if (passesAll(c.design, tests)) return { cost: c.cost, design: c.design, searched: all.length };
  return null;
}

// A plain description of a design in the scene's words, for the result panel.
export function describe(design, world, scale) {
  const cafe = world === 'cafe', parts = [];
  const per = (v) => (cafe ? `${Math.round((v / scale) * 10) / 10} a minute` : `${v}/s`);
  for (const b of design.blocks) {
    if (b.type === 'server') parts.push(cafe ? `${b.copies} barista${b.copies > 1 ? 's' : ''} making ${per(b.capacity)}${b.copies > 1 ? ' each' : ''}` : `${b.copies} server cop${b.copies > 1 ? 'ies' : 'y'} at ${per(b.capacity)}${b.copies > 1 ? ' each' : ''}`);
    if (b.type === 'loadBalancer') parts.push(cafe ? 'a shared line' : 'a load balancer');
    if (b.type === 'cache') parts.push(cafe ? `a ${{ small: 'small', medium: 'regular', large: 'big' }[b.size]} fridge` : `a ${b.size} cache`);
    if (b.type === 'database') {
      const extra = b.replicas ? (cafe ? ` plus ${b.replicas} extra machine${b.replicas > 1 ? 's' : ''}` : ` with ${b.replicas} read replica${b.replicas > 1 ? 's' : ''}`) : '';
      parts.push(cafe ? `the espresso machine${extra}` : `the database${extra}`);
    }
    if (b.type === 'queue') parts.push(cafe ? `a ticket rail with ${b.workers} barista${b.workers > 1 ? 's' : ''} pulling ${per(b.workerRate)} each` : `a queue with ${b.workers} worker${b.workers > 1 ? 's' : ''} at ${per(b.workerRate)} each`);
  }
  return parts.join(', ');
}
