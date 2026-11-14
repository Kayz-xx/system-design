// Shared UI state, lookups and formatting. Every UI module imports from here.
// Cross-module renders go through R (a registry filled by main.js) to avoid import cycles.
import { LEVELS } from '../levels/levels.js';
import { WORLDS } from './worlds.js';

export const R = {}; // R.all, R.tabs, R.palette, R.board, R.overlay, R.run, R.runBody, R.side, R.toast

export const clone = (o) => JSON.parse(JSON.stringify(o));
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmtN = (n) => (isFinite(n) ? Math.round(n).toLocaleString('en-US') : '∞');
export const fmt1 = (n) => {
  if (!isFinite(n)) return '∞';
  if (Math.abs(n) >= 10) return fmtN(n);
  return String(Math.round(n * 10) / 10);
};
export const fmtPct = (x) => { const p = x * 100; return (p > 0 && p < 10 ? p.toFixed(1) : Math.round(p)) + '%'; };
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// A frame's timestamp can precede performance.now() sampled by its event handler.
export const playbackTick = (now, start, speed, length) =>
  Math.max(0, Math.min(length - 1, Math.floor(((now - start) / 1000) * speed)));

// What the board starts with: only the pieces the learner is given.
export const starterOf = (l) => l.starter || l.design;

export const S = {
  level: 'l1',
  scene: Object.fromEntries(LEVELS.map((l) => [l.id, 'cafe'])),
  designs: Object.fromEntries(LEVELS.map((l) => [l.id, { cafe: clone(starterOf(l)), software: clone(starterOf(l)) }])),
  pred: {},      // key -> { block, value }
  runs: {},      // key -> { log, t, done, stale }
  attempts: {},  // key -> [{ guessBlock, actualBlock, blockRight, guess, actual, err, passed }]
  hint: {},      // key -> hint step shown
  submits: {},   // key -> { results, accepted, failed, passedCount, total, guess, stale }
  accepted: {},  // key -> true once a submission passed every test
  subGuess: {},  // key -> how many tests the learner expects to pass
  problems: {},  // key -> validation problems
  history: {},   // key -> { undo, redo, group }; only design edits, never scores
  sel: null,     // { kind: 'block', id } | { kind: 'wire', i }
  wiring: null,  // wire being drawn
  hoverT: null,  // tick under the chart crosshair
  banner: null,  // level id whose transform card is showing
  toast: null,
  seq: 1
};

export const L = () => LEVELS.find((l) => l.id === S.level);
export const world = () => S.scene[S.level];
export const W = () => WORLDS[world()];
export const key = () => S.level + ':' + world();
export const scene = () => L().scenes[world()];
export const design = () => S.designs[S.level][world()];
export const run = () => S.runs[key()];
export const attempts = () => (S.attempts[key()] = S.attempts[key()] || []);
export const typeOf = (d, id) => (id === 'traffic' ? 'traffic' : (d.blocks.find((b) => b.id === id) || {}).type);
export const nameOf = (d, id) => (id === 'traffic' ? W().trafficName : ((d.blocks.find((b) => b.id === id) || {}).names || {})[world()] || id);
// The simulator reads one `name` per block; the UI stores one per world.
export const simDesign = (d) => ({ ...d, blocks: d.blocks.map((b) => ({ ...b, name: b.names[world()] })) });
export const tickAt = (r) => (r ? r.log.ticks[Math.min(r.t, r.log.ticks.length - 1)] : null);
// A run may replay a hidden test, whose scenario differs from the scene's sample.
export const runScenario = () => (run() && run().scenario) || scene().scenario;
export const submission = () => S.submits[key()];

const editHistory = () => (S.history[key()] ||= { undo: [], redo: [], group: null });
const HISTORY_LIMIT = 50;

// Store before mutating. Repeated input events in one focused field form one edit.
export function rememberDesign(group = null) {
  const h = editHistory();
  if (group !== null && h.group === group) return;
  h.undo.push(clone(design()));
  if (h.undo.length > HISTORY_LIMIT) h.undo.shift();
  h.redo = [];
  h.group = group;
}

export function endDesignEdit() { editHistory().group = null; }

export function historyStatus() {
  const h = editHistory();
  return { undo: h.undo.length > 0, redo: h.redo.length > 0 };
}

export function restoreDesign(direction) {
  if (direction !== 'undo' && direction !== 'redo') return false;
  const h = editHistory(), from = h[direction];
  if (!from.length) return false;
  h[direction === 'undo' ? 'redo' : 'undo'].push(clone(design()));
  S.designs[S.level][world()] = from.pop();
  h.group = null;
  return true;
}

export function resetDesign() {
  if (JSON.stringify(design()) === JSON.stringify(starterOf(L()))) return false;
  rememberDesign();
  S.designs[S.level][world()] = clone(starterOf(L()));
  return true;
}

// Stars per level: coffee shop accepted, software accepted, first software guess within 15%.
// Accepted means a submission passed the sample and every hidden test.
export function stars(levelId) {
  const first = (S.attempts[levelId + ':software'] || [])[0];
  return [!!S.accepted[levelId + ':cafe'], !!S.accepted[levelId + ':software'], !!first && Number.isFinite(first.err) && first.err <= 0.15];
}
