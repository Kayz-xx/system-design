// The cheapest design that passes every test of a scene, found by searching the designs a learner can build
// from the palette (same blocks, same setting steps). Pure and deterministic. The results are stored in
// best-designs.js so the browser never has to search; best.test.js checks the stored answers are still right.
import { blockCost, designCost, simulate } from '../sim/sim.js';
import { suite } from './grade.js';
import { LEVELS, LIMITS } from './levels.js';

const range = (from, to, step) => { const out = []; for (let v = from; v <= to + 1e-9; v += step) out.push(v); return out; };

// The designs a learner can build for a scene, grouped into shapes: everything fixed except the database's
// total read capacity, which findBest searches separately. Databases never fail in the simulator and the
// simulator only uses read capacity times machines, which is also what it costs, so each total is built the
// cheapest-looking way: as few machines as the per-machine limit allows (LIMITS in levels.js).
function shapes(level, world) {
  const tests = suite(level, world);
  const starterDb = ((level.starter || level.design).blocks || []).find((b) => b.type === 'database');
  const peak = (k) => Math.max(...tests.map((t) => Math.max(t.scenario.base[k], t.scenario.spike ? t.scenario.spike[k] : 0)));
  const reads = peak('reads') > 0, writes = peak('writes') > 0;
  const maxCap = Math.ceil((peak('reads') + peak('writes')) * 1.5 / 50) * 50;
  // Total read capacities a learner can build (per-machine speed in 50 req/s steps up to the limit, times
  // 1 + replicas), each as { readCapacity, replicas }. A level without reads keeps the starter's.
  const readCaps = [];
  if (starterDb && reads) {
    const seen = new Map();
    for (let replicas = 0; replicas <= 9; replicas++) {
      for (const rc of range(50, LIMITS.database.readCapacity, 50)) {
        const total = rc * (1 + replicas);
        if (total <= maxCap && !seen.has(total)) seen.set(total, { readCapacity: rc, replicas });
      }
    }
    readCaps.push(...[...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v));
  } else readCaps.push({ readCapacity: starterDb ? starterDb.readCapacity : 0, replicas: 0 });

  const servers = [];
  for (const capacity of range(50, Math.min(maxCap, LIMITS.server.capacity), 50)) {
    for (const copies of [1, 2, 3, 4, 5, 6, 7, 8]) {
      if (capacity * (copies - 1) > maxCap) continue;
      for (const queueLimit of [500, 5000]) servers.push({ id: 's1', type: 'server', name: 'Server', capacity, copies, queueLimit });
    }
  }
  const caches = starterDb && reads ? [null, 'small', 'medium', 'large'].map((size) => size && { id: 'c1', type: 'cache', name: 'Cache', size }) : [null];
  const queues = [null];
  if (starterDb && writes) {
    for (const workers of [1, 2, 3, 4]) for (const workerRate of range(25, 150, 25)) for (const queueLimit of [5000, 10000]) queues.push({ id: 'q1', type: 'queue', name: 'Queue', workers, workerRate, queueLimit });
  }
  const dbs = [null];
  if (starterDb) {
    dbs.length = 0;
    for (const writeCapacity of writes ? range(50, LIMITS.database.writeCapacity, 50) : [starterDb.writeCapacity]) {
      for (const queueLimit of [starterDb.queueLimit, 5000]) dbs.push({ ...starterDb, name: 'Database', replicas: 0, writeCapacity, queueLimit });
    }
  }

  // Nothing over budget can be accepted, so a shape is skipped when even its slowest database is too dear.
  const budget = level.scenes[world].scenario.targets.cost + 1e-9;
  const price = (b) => (b ? blockCost(b) : 0);
  const out = [];
  for (const s of servers) for (const c of caches) for (const q of queues) for (const db of dbs) {
    const make = ({ readCapacity, replicas }) => {
      const blocks = [], wires = [];
      if (s.copies > 1) { blocks.push({ id: 'lb1', type: 'loadBalancer', name: 'Load balancer' }); wires.push(['traffic', 'lb1'], ['lb1', 's1']); }
      else wires.push(['traffic', 's1']);
      blocks.push(s);
      if (db) {
        blocks.push({ ...db, readCapacity, replicas }); wires.push(['s1', db.id]);
        if (c) { blocks.push(c); wires.push(['s1', 'c1'], ['c1', db.id]); }
        if (q) { blocks.push(q); wires.push(['s1', 'q1'], ['q1', db.id]); }
      }
      return { blocks, wires };
    };
    const costAt = (rc) => Math.round(designCost(make(rc)) * 1000) / 1000;
    const caps = db ? readCaps.filter((rc) => costAt(rc) <= budget) : [readCaps[0]];
    if (!caps.length) continue;
    out.push({ make, costAt, caps, floor: Math.min(...caps.map(costAt)), blocks: make(caps[0]).blocks.length });
  }
  return out;
}

// Candidate designs within budget, in software units, each with its cost. Every shape is listed at read
// capacities `readStep` apart (300 is one machine's worth), which keeps the list small enough to sample.
export function candidates(level, world, readStep = 300) {
  const out = [];
  for (const sh of shapes(level, world)) {
    const total = (v) => v.readCapacity * (1 + v.replicas);
    for (const rc of sh.caps.filter((v, i) => i === 0 || (total(v) - total(sh.caps[0])) % readStep === 0)) out.push({ design: sh.make(rc), cost: sh.costAt(rc) });
  }
  return out;
}

// Stops at the first failing test, which keeps the search fast.
function passesAll(design, tests) {
  for (const t of tests) if (!simulate(design, t.scenario).result.passed) return false;
  return true;
}

// The cheapest passing design. Shapes are tried cheapest-first by their cheapest database; for each, the
// lowest passing read capacity is found by bisection (more read capacity never makes a run worse), and the
// search stops once no remaining shape can beat the best found. Ties keep the simpler design: fewer blocks,
// then fewer machines (server copies plus database replicas), then generation order.
export function findBest(levelId, world) {
  const level = LEVELS.find((l) => l.id === levelId);
  const tests = suite(level, world);
  const all = shapes(level, world)
    .map((sh, i) => ({ ...sh, i }))
    .sort((a, b) => a.floor - b.floor || a.blocks - b.blocks || a.i - b.i);
  let best = null;
  for (const sh of all) {
    if (best && sh.floor > best.cost + 1e-9) break;
    const { caps } = sh;
    if (!passesAll(sh.make(caps[caps.length - 1]), tests)) continue;
    let lo = 0, hi = caps.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (passesAll(sh.make(caps[mid]), tests)) hi = mid; else lo = mid + 1; }
    // Every total from there up passes too, but cost is not monotone in the total (7 machines at 100 cost more
    // than 3 at 250, because each machine has a fixed cost), so take the cheapest of them.
    let pick = caps[lo];
    for (let i = lo + 1; i < caps.length; i++) if (sh.costAt(caps[i]) < sh.costAt(pick) - 1e-9) pick = caps[i];
    const cost = sh.costAt(pick), design = sh.make(pick);
    const machines = design.blocks.reduce((n, b) => n + (b.copies || 0) + (b.type === 'database' ? 1 + b.replicas : 0), 0);
    const tie = best && Math.abs(cost - best.cost) <= 1e-9;
    if (!best || cost < best.cost - 1e-9 || (tie && (sh.blocks < best.blocks || (sh.blocks === best.blocks && machines < best.machines)))) {
      best = { cost, design, blocks: sh.blocks, machines };
    }
  }
  return best && { cost: best.cost, design: best.design, searched: all.length };
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
      // Name the speed that matters: reads when something reads, writes when a queue feeds it.
      const has = (t) => design.blocks.some((x) => x.type === t);
      const speeds = [];
      if (has('cache') || !has('queue')) speeds.push(cafe ? `${per(b.readCapacity)}` : `${b.readCapacity} reads/s`);
      if (has('queue')) speeds.push(cafe ? `${per(b.writeCapacity)} for app orders` : `${b.writeCapacity} writes/s`);
      const speed = cafe ? ` making ${speeds.join(' and ')}` : ` at ${speeds.join(' and ')}`;
      parts.push(cafe ? `the espresso machine${speed}${extra}` : `the database${speed}${extra}`);
    }
    if (b.type === 'queue') parts.push(cafe ? `a ticket rail with ${b.workers} barista${b.workers > 1 ? 's' : ''} pulling ${per(b.workerRate)} each` : `a queue with ${b.workers} worker${b.workers > 1 ? 's' : ''} at ${per(b.workerRate)} each`);
  }
  return parts.join(', ');
}
