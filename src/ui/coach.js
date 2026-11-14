// The coach column: scene steps, brief, inspector, prediction, result and tutor.
// Hints come from the OpenAI tutor (src/ai/tutor.js) when it answers, and from the level's template hints otherwise.
// Either way the tutor reads only the run log.
import { CACHE_SIZES, blockCost } from '../sim/sim.js';
import { askTutor, tutorRequest } from '../ai/tutor.js';
import { SCALE, LEVELS } from '../levels/levels.js';
import { S, L, W, world, key, scene, design, run, attempts, nameOf, stars, esc, fmtN, fmt1, fmtPct } from './state.js';
import { FIELDS } from './worlds.js';

export const predScale = () => scene().predict.scale || 1;
export const predError = (g, a) => (a === 0 ? (g === 0 ? 0 : 1) : Math.min(1, Math.abs(g - a) / Math.abs(a)));

function fmtPred(v) {
  if (v === null || v === undefined || !isFinite(v)) return '–';
  const u = scene().predict.unit;
  return u === '%' ? (Math.round(v * 10) / 10) + '%' : fmt1(v) + ' ' + u;
}

// Plain-language lines for each event in the run log, in the current world's words.
export function narrate(log, d, sc) {
  const cafe = world() === 'cafe', Wd = W(), out = [];
  const nm = (id) => esc(nameOf(d, id));
  const base = sc.base.reads + sc.base.writes;
  log.events.forEach((e) => {
    let s = '';
    if (e.type === 'shock') {
      if (e.shock === 'spike') {
        const v = sc.spike.reads + sc.spike.writes;
        s = cafe ? `The rush starts: customers jump from ${Wd.rateWord(base)} to ${Wd.rateWord(v)}.` : `Traffic jumps from ${Wd.rate(base)} to ${Wd.rate(v)}.`;
      }
      if (e.shock === 'spikeEnd') s = cafe ? 'The rush is over.' : 'The spike ends.';
      if (e.shock === 'serverFail' && e.block) {
        const b = d.blocks.find((x) => x.id === e.block);
        s = cafe ? `One of ${b.copies} goes home sick at ${nm(e.block)}.` : `One copy of ${nm(e.block)} crashes, leaving ${b.copies - 1} of ${b.copies}.`;
      }
      if (e.shock === 'serverBack' && e.block) s = cafe ? 'A replacement barista arrives.' : 'The crashed copy comes back.';
      if (e.shock === 'cacheFlush') {
        s = cafe ? `${e.block ? nm(e.block) : 'The fridge'} sells out. Restocking takes ${sc.cacheFlush.warm} minutes.`
          : `${e.block ? nm(e.block) : 'The cache'} restarts empty and warms up over ${sc.cacheFlush.warm} s.`;
      }
    }
    if (e.type === 'down') s = cafe ? `${nm(e.block)} is empty. Nobody is left to make drinks.` : `${nm(e.block)} goes down. It was the only copy.`;
    if (e.type === 'saturated') {
      s = cafe ? `${nm(e.block)} gets ${Wd.rateWord(e.load)} but makes ${Wd.rateWord(e.capacity)}. The other ${Wd.rateWord(e.load - e.capacity)} join the line.`
        : `${nm(e.block)} gets ${Wd.rate(e.load)} but serves ${Wd.rate(e.capacity)}. The extra ${Wd.rate(e.load - e.capacity)} queue.`;
    }
    if (e.type === 'dropping') {
      s = cafe ? `The line at ${nm(e.block)} reaches ${fmtN(e.limit / SCALE)} people. New customers walk out.`
        : `${nm(e.block)}’s queue hits its limit of ${fmtN(e.limit)}. New requests are dropped.`;
    }
    if (e.type === 'backlog') {
      s = cafe ? `Orders arrive faster than the baristas pull tickets. Tickets start to pile up on ${nm(e.block)}, but nobody is turned away.`
        : `${nm(e.block)} accepts every write and builds a backlog. Its workers keep draining it at ${Wd.rate(e.capacity)}.`;
    }
    if (e.type === 'drained') s = cafe ? `The last ticket comes off ${nm(e.block)}.` : `${nm(e.block)}’s backlog is empty.`;
    if (e.type === 'recovered') s = cafe ? `The line at ${nm(e.block)} is gone.` : `${nm(e.block)}’s queue is empty.`;
    if (s) out.push({ t: e.t, s });
  });
  return out.slice(0, 7);
}

// Tutor replies per run and hint step: key -> { loading } or { text, source }. A new run gets fresh hints.
const tutorCache = {};
const tutorKey = (step) => `${key()}#${attempts().length}#${step}`;

function hintFor(step, log, d, sc, last) {
  const k = tutorKey(step), have = tutorCache[k];
  if (have) return have;
  const fallback = scene().hints[step - 1];
  tutorCache[k] = { loading: true, text: fallback };
  const body = tutorRequest({
    world: world(), level: S.level, design: d, scenario: sc, log, hintStep: step,
    prediction: last ? { block: last.guessBlock, value: last.guess, actual: last.actual } : null
  });
  askTutor(body, { fallback }).then((out) => {
    tutorCache[k] = out;
    // Redraw only if the learner is still on this run, and not while they are typing in the column.
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#side input, #side select');
    if (tutorKey(step) === k && !typing) renderSide();
  });
  return tutorCache[k];
}

function inspectorHtml() {
  const d = design(), w = world(), Wd = W();
  if (!S.sel) return `<p class="muted">Select a block to change it. Select a connection to remove it.</p>`;
  if (S.sel.kind === 'wire') {
    const wi = d.wires[S.sel.i]; if (!wi) return '';
    return `<p>${esc(nameOf(d, wi[0]))} → ${esc(nameOf(d, wi[1]))}</p><div class="btn-row"><button class="btn small" id="del-wire">Remove connection</button></div>`;
  }
  const b = d.blocks.find((x) => x.id === S.sel.id); if (!b) return '';
  let f = `<div class="field"><label for="f-name">Name</label><input id="f-name" data-field="name" value="${esc(b.names[w])}"></div>`;
  const sc = scene().scenario, writes = sc.base.writes > 0 || !!(sc.spike && sc.spike.writes > 0);
  const fields = (FIELDS[b.type] || []).filter((x) => x[w] && (!x.writesOnly || writes));
  if (fields.length) {
    f += `<div class="field-row">` + fields.map((x) => {
      const s = x.scaled ? Wd.scale : 1;
      return `<div class="field"><label for="f-${x.key}">${esc(x[w])}</label><input id="f-${x.key}" data-field="${x.key}" type="number" step="${x.step / s}" min="${x.min / s}" value="${+(b[x.key] / s).toFixed(2)}"></div>`;
    }).join('') + `</div>`;
  }
  if (b.type === 'cache') {
    f += `<div class="field"><label for="f-size">${w === 'cafe' ? 'Fridge size' : 'Size'}</label><select id="f-size" data-field="size">${Object.keys(CACHE_SIZES)
      .map((k) => `<option value="${k}" ${b.size === k ? 'selected' : ''}>${esc(Wd.cacheLabel[k])} · ${Wd.cost(CACHE_SIZES[k].cost)}</option>`).join('')}</select></div>`;
  }
  if (b.type === 'queue') {
    f += `<p class="muted">${w === 'cafe' ? 'Orders go on the rail at once. Baristas take tickets to the espresso machine at their own pace.' : 'Writes are accepted at once. Workers send them to the database at a steady rate.'}</p>`;
  }
  if (b.type === 'loadBalancer') {
    f += `<p class="muted">${w === 'cafe' ? 'One line for everyone. Each customer goes to the next free barista.' : 'Spreads requests across the servers behind it, in proportion to their capacity.'}</p>`;
  }
  return `${f}<div class="btn-row"><span class="muted mono" id="block-cost">${Wd.cost(blockCost(b))}</span><button class="btn small" id="del-block">Remove</button></div>`;
}

export function renderSide() {
  const lv = L(), w = world(), sn = scene(), sc = sn.scenario, Wd = W(), d = design();
  const r = run(), p = S.pred[key()] || {}, atts = attempts(), last = atts[atts.length - 1];
  const done = r && r.done && !r.stale;
  const st = stars(lv.id);
  let html = `<section class="panel">
      <div class="steps">
        <button class="step" data-scene="cafe" ${w === 'cafe' ? 'aria-current="step"' : ''}><small>Step 1 ${st[0] ? '<span class="ok">✓</span>' : ''}</small><b>Coffee shop</b></button>
        <span class="muted">→</span>
        <button class="step" data-scene="software" ${w === 'software' ? 'aria-current="step"' : ''}><small>Step 2 ${st[1] ? '<span class="ok">✓</span>' : ''}</small><b>Software</b></button>
      </div>
      <div class="label">Level ${lv.n} · ${esc(lv.concept)}</div>
      <h2>${esc(sn.title)}</h2>
      <p>${esc(sn.brief)}</p>
      <p><b>${esc(sn.goal)}</b></p>
      <dl class="targets">
        <dt>${Wd.checks.errors}</dt><dd>≤ ${fmtPct(sc.targets.errorRate)}</dd>
        <dt>${w === 'cafe' ? 'Long waits' : 'Slow requests'}</dt><dd>≤ ${fmtPct(sc.targets.slowShare)} over ${Wd.latTarget(sc.latencyTargetMs)}</dd>
        <dt>Cost</dt><dd>≤ ${Wd.cost(sc.targets.cost)}</dd>
      </dl>
      ${w === 'software' ? `<p class="muted">Reading: <a href="${lv.reading.url}" target="_blank" rel="noopener">${esc(lv.reading.label)}</a>${lv.reading.extra ? `, <a href="${lv.reading.extra.url}" target="_blank" rel="noopener">${esc(lv.reading.extra.label)}</a>` : ''} · System Design Primer</p>` : ''}
    </section>`;
  if (w === 'software') {
    html += `<section class="panel"><div class="label">You already know this</div><dl class="pairs">${lv.translate.map(([a, b]) => `<dt class="from">${esc(a)}</dt><span class="arrow">→</span><dd class="to">${esc(b)}</dd>`).join('')}</dl></section>`;
  }
  html += `<section class="panel"><div class="label">Selected</div>${inspectorHtml()}</section>`;

  const opts = d.blocks.map((b) => `<option value="${b.id}" ${p.block === b.id ? 'selected' : ''}>${esc(b.names[w])}</option>`).join('');
  const ready = p.block && p.value !== undefined && p.value !== '';
  const playing = r && !r.done;
  html += `<section class="panel" aria-label="Prediction">
      <div class="label">Predict${atts.length ? ` · try ${atts.length + 1}` : ''}</div>
      <div class="field"><label for="p-block">${w === 'cafe' ? 'Where does it go wrong first?' : 'Which block fails first?'}</label>
        <select id="p-block"><option value="">Choose one</option>${opts}<option value="none" ${p.block === 'none' ? 'selected' : ''}>${w === 'cafe' ? 'Nowhere, it’s fine' : 'Nothing fails'}</option></select></div>
      <div class="field"><label for="p-val">${esc(sn.predict.question)}</label>
        <div class="unit-in"><input id="p-val" type="number" min="0" step="any" inputmode="decimal" value="${p.value ?? ''}"><span>${esc(sn.predict.unit)}</span></div></div>
      ${(S.problems[key()] || []).length ? `<ul class="problems">${S.problems[key()].map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="btn-row"><button class="btn primary" id="run-btn" ${ready && !playing ? '' : 'disabled'}>${playing ? (w === 'cafe' ? 'Open…' : 'Running…') : (w === 'cafe' ? 'Open the doors' : 'Run simulation')}</button>
      <span class="muted" id="ready-note">${ready ? '' : 'Commit to a guess first.'}</span></div>
    </section>`;

  if (done && last) {
    const log = r.log;
    const nb = (id) => (id === 'none' ? (w === 'cafe' ? 'nowhere' : 'nothing') : nameOf(d, id));
    let next = '';
    if (log.result.passed && w === 'cafe') next = `<button class="btn primary" id="to-software">See it as software →</button>`;
    else if (log.result.passed && lv.n < LEVELS.length) next = `<button class="btn primary" data-level="l${lv.n + 1}">Next: Level ${lv.n + 1}</button>`;
    else if (log.result.passed) next = `<span class="muted">All ${LEVELS.length} levels done.</span>`;
    const carry = w === 'software' && atts.length === 1 ? (last.err <= 0.15 ? ' · ★ the coffee shop carried over' : ' · the coffee shop had the same answer') : '';
    html += `<section class="panel" aria-label="Result">
        <div class="verdict"><span class="badge ${log.result.passed ? 'pass' : 'fail'}">${log.result.passed ? (w === 'cafe' ? 'The shop held up' : 'Passed') : (w === 'cafe' ? 'The shop broke' : 'Failed')}</span><span class="muted">try ${atts.length}</span></div>
        <div class="compare">
          <span class="k">Went wrong first: you said <b>${esc(nb(last.guessBlock))}</b></span>
          <span class="v ${last.blockRight ? 'right' : 'wrong'}">${last.blockRight ? '✓' : '✗ ' + esc(nb(last.actualBlock))}</span>
          <span class="k">Your guess</span><span class="v">${fmtPred(last.guess)}</span>
          <span class="k">What happened</span><span class="v">${fmtPred(last.actual)}</span>
        </div>
        <div><span class="gap-big ${last.err <= 0.15 ? 'right' : 'wrong'}">${Math.round(last.err * 100)}%</span> <span class="muted">off${carry}</span></div>
        ${next ? `<div class="btn-row">${next}</div>` : ''}
      </section>`;
    const step = S.hint[key()] || 0, labels = ['Question', 'Idea', 'Where to look'];
    html += `<section class="panel" aria-label="Tutor">
        <div class="label">What happened · from the run log</div>
        <ol class="log">${narrate(log, d, sc).map((l) => `<li><time>${Wd.clock(l.t)}</time><span>${l.s}</span></li>`).join('')}</ol>
        ${!log.result.passed ? `${sn.hints.slice(0, step).map((h, i) => {
          const t = hintFor(i + 1, log, d, sc, last);
          if (t.loading) return `<div class="hint" aria-busy="true"><b>${labels[i]}</b><span class="muted">${w === 'cafe' ? 'The tutor is reading the morning…' : 'The tutor is reading the run log…'}</span></div>`;
          return `<div class="hint"><b>${labels[i]}${t.source === 'ai' ? ' · tutor' : ''}</b>${esc(t.text)}</div>`;
        }).join('')}
          <div class="btn-row">${step < 3 ? `<button class="btn small" id="hint-btn">${step ? 'Next hint' : 'Give me a hint'} (${step + 1} of 3)</button>` : '<span class="muted">No more hints. The tutor never hands over the answer.</span>'}</div>` : ''}
        <p class="muted" style="font-size:12px">The tutor sees only this run's log, and never gives the finished design.</p>
      </section>`;
  }
  document.getElementById('side').innerHTML = html;
}
