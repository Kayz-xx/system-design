// "How close to the best design?" shown under an accepted submission.
// The best cost comes from src/levels/best-designs.js, found by searching every design the palette can build.
import { BEST } from '../levels/best-designs.js';
import { describe } from '../levels/best.js';
import { SCALE } from '../levels/levels.js';
import { W, esc } from './state.js';

export function bestScore(levelId, world, cost) {
  const best = BEST[levelId] && BEST[levelId][world];
  if (!best) return null;
  const over = best.cost > 0 ? (cost - best.cost) / best.cost : 0;
  return { best, over, optimal: cost <= best.cost + 1e-9, close: over <= 0.1 + 1e-9 };
}

export function bestHtml(levelId, world, cost) {
  const s = bestScore(levelId, world, cost);
  if (!s) return '';
  const Wd = W(), cafe = world === 'cafe';
  const pct = Math.round(s.over * 100);
  const width = (v) => Math.max(4, Math.min(100, (v / Math.max(cost, s.best.cost)) * 100));
  const verdict = s.optimal
    ? (cafe ? 'Nobody can run this shop for less. ★ Best possible cost.' : 'This is the cheapest design that passes. ★ Best possible cost.')
    : s.close ? `Within ${pct}% of the best. Nearly there.` : `${pct}% more than the best. There is a cheaper way.`;
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  return `<div class="best${s.optimal ? ' optimal' : ''}" aria-label="Cost compared with the best design">
      <div class="label">${cafe ? 'Running cost against the best shop' : 'Cost against the best design'}</div>
      <div class="best-bars">
        <span>Yours</span><span class="bar"><i class="you" style="width:${width(cost)}%"></i></span><b class="mono">${Wd.cost(cost)}</b>
        <span>Best</span><span class="bar"><i class="opt" style="width:${width(s.best.cost)}%"></i></span><b class="mono">${Wd.cost(s.best.cost)}</b>
      </div>
      <p class="${s.optimal ? 'right' : 'muted'}">${esc(verdict)}</p>
      ${s.optimal ? '' : `<details><summary>${cafe ? 'Show the cheapest shop' : 'Show the cheapest design'}</summary><p>${esc(cap(describe(s.best.design, world, SCALE)))}.</p></details>`}
    </div>`;
}
