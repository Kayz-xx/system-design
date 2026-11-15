// "How close to the best design?" shown under an accepted submission.
// The best cost comes from src/levels/best-designs.js, found by searching every design the palette can build.
import { BEST } from '../levels/best-designs.js';
import { describe } from '../levels/best.js';
import { suggestChange, suggestKey } from '../levels/suggest.js';
import { SCALE } from '../levels/levels.js';
import { S, W, design, world, esc } from './state.js';

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

// Which design's suggestion the learner opened, so the card can re-render (the auditor's note arrives late)
// without closing it. A new design starts closed again.
let openKey = null;
export function rememberSuggest(open) { openKey = open ? suggestKey(design(), S.level, world()) : null; }

// "Show a way to fix it", under a failed submission. Closed until the learner asks. The change comes from the
// simulator (src/levels/suggest.js), never from the auditor.
export function suggestHtml(levelId, world, design) {
  const s = suggestChange(design, levelId, world);
  if (!s) return '';
  const cafe = world === 'cafe', Wd = W();
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const lead = s.kind === 'tweak'
    ? (cafe ? 'Change this one thing and your shop survives every morning in the tests:' : 'Change this one thing and your design passes every test:')
    : (cafe ? 'No single change is enough. The cheapest shop that survives every test is built differently:' : 'No single change is enough. The cheapest design that passes every test is built differently:');
  const rows = s.rows.map((r) => (r.yours && r.best
    ? `<li><span class="from">${esc(cap(r.yours))}</span><span class="arrow" aria-hidden="true">↓</span><b class="to">${esc(cap(r.best))}</b></li>`
    : r.best ? `<li><b class="to">Add: ${esc(r.best)}</b></li>` : `<li><span class="from">Not needed: ${esc(r.yours)}</span></li>`)).join('');
  return `<details class="suggest"${openKey === suggestKey(design, levelId, world) ? ' open' : ''}><summary>Show a way to fix it</summary><p>${lead}</p><ul>${rows}</ul><p class="muted">${cafe ? 'Running cost' : 'Cost'} ${Wd.cost(s.cost)}. Checked against every test.</p></details>`;
}
