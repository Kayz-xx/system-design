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

export const S = {
  level: 'l1',
  scene: Object.fromEntries(LEVELS.map((l) => [l.id, 'cafe'])),
  designs: Object.fromEntries(LEVELS.map((l) => [l.id, { cafe: clone(l.design), software: clone(l.design) }])),
  pred: {},      // key -> { block, value }
  runs: {},      // key -> { log, t, done, stale }
  attempts: {},  // key -> [{ guessBlock, actualBlock, blockRight, guess, actual, err, passed }]
  hint: {},      // key -> hint step shown
  problems: {},  // key -> validation problems
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

// Stars per level: coffee shop passed, software passed, first software guess within 15%.
export function stars(levelId) {
  const a = (k) => S.attempts[levelId + ':' + k] || [];
  const first = a('software')[0];
  return [a('cafe').some((x) => x.passed), a('software').some((x) => x.passed), !!first && first.err <= 0.15];
}
