// "A way to fix it", for a design that fails. Nothing here is written by a model, and the simulator decides:
//  1. The cheapest single change to the learner's own design that passes every test (one setting on one block).
//  2. If no single change is enough, what the cheapest passing design does differently, offered only after the
//     stored best design (best-designs.js) is graded again, so a stale answer is never shown as a fix.
// Rows are { type, yours, best } in the scene's words: yours is null when the learner has no such part, best is
// null when the fix does not need it.
import { designCost } from '../sim/sim.js';
import { BEST } from './best-designs.js';
import { describe } from './best.js';
import { grade } from './grade.js';
import { LIMITS, SCALE } from './levels.js';

const KNOWN = ['server', 'loadBalancer', 'cache', 'database', 'queue'];
const range = (from, to, step) => { const out = []; for (let v = from; v <= to + 1e-9; v += step) out.push(v); return out; };

// One { type, text } per part of describe(), in the same order. describe() joins its parts with ', ', and
// suggest.test.js checks that splitting it back gives the same parts.
export function partsOf(design, world) {
  const types = design.blocks.map((b) => b.type).filter((t) => KNOWN.includes(t));
  const texts = describe(design, world, SCALE).split(', ');
  return types.map((type, i) => ({ type, text: texts[i] || '' }));
}

// The settings a learner can change, and the values each can take.
function knobs(design) {
  const hasBalancer = design.blocks.some((b) => b.type === 'loadBalancer');
  const out = [];
  for (const b of design.blocks) {
    if (b.type === 'server') {
      out.push([b, 'capacity', range(50, LIMITS.server.capacity, 50)]);
      if (hasBalancer) out.push([b, 'copies', range(1, 8, 1)]);
    }
    if (b.type === 'cache') out.push([b, 'size', ['small', 'medium', 'large']]);
    if (b.type === 'database') {
      out.push([b, 'replicas', range(0, 9, 1)], [b, 'readCapacity', range(50, LIMITS.database.readCapacity, 50)], [b, 'writeCapacity', range(50, LIMITS.database.writeCapacity, 50)]);
    }
    if (b.type === 'queue') out.push([b, 'workers', range(1, 4, 1)], [b, 'workerRate', range(25, 150, 25)]);
  }
  return out;
}

const partFor = (design, world, type) => partsOf(design, world).find((p) => p.type === type)?.text ?? null;
const clone = (o) => JSON.parse(JSON.stringify(o));
const withName = (d, world) => ({ ...d, blocks: d.blocks.map((b) => ({ ...b, name: b.name || (b.names && b.names[world]) || b.type })) });

// The cheapest single change that makes the design pass every test, or null.
export function cheapestTweak(design, levelId, world) {
  const base = withName(design, world);
  let best = null;
  for (const [block, field, values] of knobs(base)) {
    for (const v of values) {
      if (v === block[field]) continue;
      const trial = clone(base);
      trial.blocks.find((b) => b.id === block.id)[field] = v;
      const before = partFor(base, world, block.type), after = partFor(trial, world, block.type);
      if (before === after) continue; // a change the words cannot show is not one to suggest
      const cost = designCost(trial), size = typeof v === 'number' ? Math.abs(v - block[field]) : 0;
      if (best && (cost > best.cost + 1e-9 || (Math.abs(cost - best.cost) <= 1e-9 && size >= best.size))) continue;
      if (!grade(trial, levelId, world).accepted) continue;
      best = { cost, size, rows: [{ type: block.type, yours: before, best: after }] };
    }
  }
  return best && { kind: 'tweak', rows: best.rows, cost: Math.round(best.cost * 1000) / 1000 };
}

const passes = new Map();
function bestPasses(levelId, world, best) {
  if (best !== BEST[levelId]?.[world]) return grade(best.design, levelId, world).accepted;
  const k = `${levelId}:${world}`;
  if (!passes.has(k)) passes.set(k, grade(best.design, levelId, world).accepted);
  return passes.get(k);
}

// What the cheapest passing design does differently, or null without a verified answer.
export function redesign(design, levelId, world, best = BEST[levelId]?.[world]) {
  if (!best || !bestPasses(levelId, world, best)) return null;
  const mine = partsOf(design, world), want = partsOf(best.design, world);
  const rows = [];
  for (const type of KNOWN) {
    const yours = mine.find((p) => p.type === type)?.text ?? null, theirs = want.find((p) => p.type === type)?.text ?? null;
    if (yours !== theirs) rows.push({ type, yours, best: theirs });
  }
  return rows.length ? { kind: 'redesign', rows, cost: best.cost } : null;
}

// The card re-renders when the auditor's note arrives, so answers are kept per design (positions and names
// do not change the answer).
const memo = new Map();
export const suggestKey = (design, levelId, world) => `${levelId}:${world}:${JSON.stringify(design.blocks.map(({ x, y, names, name, ...rest }) => rest))}`;
export function suggestChange(design, levelId, world) {
  const k = suggestKey(design, levelId, world);
  if (!memo.has(k)) memo.set(k, cheapestTweak(design, levelId, world) || redesign(design, levelId, world));
  return memo.get(k);
}
