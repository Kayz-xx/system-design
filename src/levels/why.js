// Why an accepted design works: for each principle the level teaches, the numbers from the design's run on
// the hardest test that show that principle doing its job. Pure, like the simulator; the words live in
// src/ui/why-panel.js. Every number here is read from simulate(), never estimated.
import { simulate, CACHE_SIZES } from '../sim/sim.js';
import { LEVELS } from './levels.js';
import { suite } from './grade.js';

const max = (xs) => xs.reduce((a, b) => Math.max(a, b), 0);

// The hardest test: the one marked `worst`, which the survival map shows is the corner every easier
// morning sits inside. Levels without one fall back to the last test.
export function hardestTest(level, world) {
  const tests = suite(level, world);
  return tests.find((t) => t.id === 'worst') || tests[tests.length - 1];
}

function scaling(d, log) {
  const servers = d.blocks.filter((b) => b.type === 'server');
  if (!servers.length) return null;
  const capacity = servers.reduce((s, b) => s + b.capacity * b.copies, 0);
  const peak = max(log.ticks.map((r) => r.traffic.reads + r.traffic.writes));
  const line = max(log.ticks.map((r) => servers.reduce((s, b) => s + r.blocks[b.id].queue, 0)));
  const wait = max(log.ticks.map((r) => max(servers.map((b) => (r.blocks[b.id].queue > 0.5 ? r.blocks[b.id].latencyMs : 0)))));
  return { principle: 'scaling', capacity, peak, headroom: capacity - peak, line, waitMs: wait };
}

function redundancy(d, log, sc) {
  if (!sc.serverFail) return null;
  const ev = log.events.find((e) => e.type === 'shock' && e.shock === 'serverFail');
  const b = ev && d.blocks.find((x) => x.id === ev.block);
  if (!b) return null;
  const during = log.ticks.slice(sc.serverFail.t, sc.serverFail.t + sc.serverFail.dur);
  const loadDuring = max(during.map((r) => r.traffic.reads + r.traffic.writes));
  return {
    principle: 'redundancy', block: b.id, copies: b.copies, perCopy: b.capacity, left: (b.copies - 1) * b.capacity,
    loadDuring, failT: sc.serverFail.t, failDur: sc.serverFail.dur, spareCost: 0.1 * (b.capacity / 100), balanced: d.blocks.some((x) => x.type === 'loadBalancer')
  };
}

function caching(d, log, sc) {
  const db = d.blocks.find((b) => b.type === 'database');
  if (!db) return null;
  const readCap = db.readCapacity * (1 + db.replicas);
  const flushAt = sc.cacheFlush ? sc.cacheFlush.t : sc.duration;
  const warm = log.ticks.slice(0, flushAt);
  const reads = max(log.ticks.map((r) => r.traffic.reads));
  const cache = d.blocks.find((b) => b.type === 'cache');
  const dbWarm = max(warm.map((r) => r.blocks[db.id].readLoad));
  const out = { principle: 'caching', reads, readCap, replicas: db.replicas, dbWarm, cache: !!cache };
  if (cache) Object.assign(out, { hit: CACHE_SIZES[cache.size].hit, size: cache.size });
  if (sc.cacheFlush) {
    const after = log.ticks.slice(flushAt);
    Object.assign(out, {
      flushT: flushAt, warmFor: sc.cacheFlush.warm, dbAtFlush: log.metrics.dbReadLoadAfterFlush,
      dbQueue: max(after.map((r) => r.blocks[db.id].queueR))
    });
  }
  return out;
}

function async(d, log) {
  const db = d.blocks.find((b) => b.type === 'database');
  const writes = max(log.ticks.map((r) => r.traffic.writes));
  if (!db || !writes) return null;
  const q = d.blocks.find((b) => b.type === 'queue');
  const out = { principle: 'async', writes, writeCap: db.writeCapacity, queue: !!q };
  if (q) {
    const drained = log.events.filter((e) => e.type === 'drained' && e.block === q.id).pop();
    Object.assign(out, { drainRate: q.workers * q.workerRate, limit: q.queueLimit, backlog: log.metrics.peakBacklog, drainedT: drained ? drained.t : null, leftAtClose: log.result.backlogAtClose });
  }
  return out;
}

const FACTS = { scaling, redundancy, caching, async };

// `design` has one `name` per block (see simDesign). Returns the hardest test and one fact per principle.
export function whyItWorked(design, levelId, world) {
  const level = LEVELS.find((l) => l.id === levelId);
  const t = hardestTest(level, world);
  const log = simulate(design, t.scenario);
  const facts = (level.principles || []).map((p) => FACTS[p](design, log, t.scenario)).filter(Boolean);
  return { test: { id: t.id, n: t.n, name: t.name }, passed: log.result.passed, scenario: t.scenario, facts };
}
