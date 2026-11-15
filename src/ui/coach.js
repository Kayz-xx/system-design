// The coach column: scene steps, brief, inspector, prediction, result and tutor.
// Hints come from the AI tutor (Gemini, via src/ai/tutor.js) when it answers, and from the level's template hints otherwise.
// Either way the tutor reads only the run log.
import { CACHE_SIZES, blockCost } from '../sim/sim.js';
import { askTutor, tutorRequest } from '../ai/tutor.js';
import { SCALE, LEVELS } from '../levels/levels.js';
import { S, L, W, world, key, scene, design, run, attempts, nameOf, stars, esc, fmtN, fmt1, fmtPct, runScenario, submission } from './state.js';
import { FIELDS } from './worlds.js';
import { bestHtml } from './best-panel.js';
import { mapHtml } from './survival-panel.js';
import { whyHtml } from './why-panel.js';

export const predScale = () => scene().predict.scale || 1;
export const predError = (g, a) => {
  if (!Number.isFinite(g) || !Number.isFinite(a)) return null;
  return a === 0 ? (g === 0 ? 0 : 1) : Math.min(1, Math.abs(g - a) / Math.abs(a));
};

function fmtPred(v) {
  if (v === Infinity) return 'Not cleared during this run';
  if (!Number.isFinite(v)) return 'Not observed';
  const u = scene().predict.unit;
  return u === '%' ? (Math.round(v * 10) / 10) + '%' : fmt1(v) + ' ' + u;
}

function starSummary(lv) {
  const st = stars(lv.id), first = (S.attempts[lv.id + ':software'] || [])[0];
  const descriptions = [
    st[0] ? 'Your coffee shop passed every test.' : 'Submit a coffee shop that passes every test.',
    st[1] ? 'Your software system passed every test.' : 'Submit a software design that passes every test.',
    st[2] ? 'Your first software guess was within 15%.' : !first
      ? 'Get your first software guess within 15%.' : Number.isFinite(first.err)
        ? `Your first software guess was ${Math.round(first.err * 100)}% off. This star is decided on the first try.`
        : 'No exact recovery time was observed on your first software run. This star was not awarded.'
  ];
  return `<section class="panel" aria-label="Chapter stars">
    <div class="label">Your stamp card · Chapter ${lv.n}</div>
    <h2>${st.filter(Boolean).length} of 3 stars</h2>
    <ol class="log">${descriptions.map((text, i) => `<li><span class="${st[i] ? 'right' : 'muted'}" aria-label="${st[i] ? 'Earned' : 'Not earned'}">${st[i] ? '★' : '☆'}</span><span>${esc(text)}</span></li>`).join('')}</ol>
  </section>`;
}

function nextChapter() {
  return LEVELS.find((lv) => { const st = stars(lv.id); return !st[0] || !st[1]; });
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
  const sc = scene().scenario, writes = sc.base.writes > 0 || !!(sc.spike && sc.spike.writes > 0);
  const fields = (FIELDS[b.type] || []).filter((x) => x[w] && (!x.writesOnly || writes));
  const field = (x) => {
    const scale = x.scaled ? Wd.scale : 1;
    return `<div class="field"><label for="f-${x.key}">${esc(x[w])}</label><div class="stepper"><button data-adjust="f-${x.key}" data-delta="-1" aria-label="Decrease ${esc(x[w])}">−</button><input id="f-${x.key}" data-field="${x.key}" type="number" step="${x.step / scale}" min="${x.min / scale}" value="${+(b[x.key] / scale).toFixed(2)}"><button data-adjust="f-${x.key}" data-delta="1" aria-label="Increase ${esc(x[w])}">＋</button></div></div>`;
  };
  let f = `<p class="settings-help">${fields.length ? 'Use − or +, or type a number.' : b.type === 'cache' ? 'Choose a size below.' : 'Connect this to the equipment it serves.'} Changes apply straight away.</p><div class="field-row">${fields.filter((x) => x.key !== 'queueLimit').map(field).join('')}</div>`;
  f += `<details><summary>Fine tuning</summary><div class="field"><label for="f-name">Name</label><input id="f-name" data-field="name" value="${esc(b.names[w])}"></div>${fields.filter((x) => x.key === 'queueLimit').map(field).join('')}</details>`;
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
  return `${f}<div class="btn-row settings-cost"><span>Cost per hour <b id="block-cost">${Wd.cost(blockCost(b))}</b></span><button class="text-btn" id="del-block">Remove</button></div>`;
}

// The idea this chapter teaches, at the top of the brief, in the scene's words.
export function topicHtml(lv, w) {
  const t = lv.topic;
  if (!t) return '';
  const name = lv.capstone && w === 'cafe' ? lv.scenes.cafe.title : t.name;
  return `<div class="topic-box"><div class="label">${lv.capstone ? 'Capstone' : 'Topic'} · ${esc(name)}</div><p>${esc(t.idea[w])}</p><p class="muted"><b>${esc(w === 'cafe' ? 'You will try' : 'The tool')}:</b> ${esc(t.tool[w])}. <b>Trade-off:</b> ${esc(t.tradeoff[w])}</p></div>`;
}

// One task surface. Nothing else competes with the floor until the learner asks.
const closeTask = '<button class="icon-btn close" id="close-task" aria-label="Back to the floor">×</button>';
const shell = (label, title, body, id = '', extra = '') => `<section class="sheet ${extra}" ${id ? `id="${id}"` : ''} aria-label="${label}" tabindex="-1">${closeTask}<h2>${title}</h2>${body}</section>`;

export function renderSide() {
  const lv = L(), w = world(), sn = scene(), d = design(), r = run(), p = S.pred[key()] || {};
  const atts = attempts(), last = atts[atts.length - 1], phase = S.labPhase?.[key()] || 'build';
  const done = r && r.done && !r.stale, playing = r && !r.done, sub = submission();
  const cafe = w === 'cafe';
  let html;
  if (playing) {
    html = `<section class="task" aria-label="Running experiment"><div class="task-copy"><div class="eyebrow">${r.paused ? 'Playback paused' : 'Watch the flow'}</div><h2>${r.paused ? 'Take it at your own pace.' : cafe ? 'The doors are open.' : 'Your system is running.'}</h2><p>${r.paused ? 'Play the flow, or step through the important moments.' : cafe ? 'Watch customers arrive, wait, and leave with their coffee.' : 'Follow requests as they arrive, queue, and complete.'}</p></div><div class="task-actions"><button class="btn small" id="toggle-playback">${r.paused ? cafe ? '▶ Play customers' : '▶ Play requests' : 'Ⅱ Pause'}</button>${r.paused ? '<button class="text-btn" id="step-flow">Next moment →</button>' : ''}<button class="text-btn" id="skip-run">Results →</button></div></section>`;
  } else if (phase === 'brief') {
    html = shell('Brief', esc(sn.title), `${topicHtml(lv, w)}<p>${esc(sn.brief)}</p><p><b>${esc(sn.goal)}</b></p><details><summary>Limits &amp; targets</summary><ul class="constraints">${(sn.constraints || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul><dl class="targets"><dt>${W().checks.errors}</dt><dd>≤ ${fmtPct(sn.scenario.targets.errorRate)}</dd><dt>Long waits</dt><dd>≤ ${fmtPct(sn.scenario.targets.slowShare)} over ${W().latTarget(sn.scenario.latencyTargetMs)}</dd><dt>Budget</dt><dd>${W().cost(sn.scenario.targets.cost)}</dd></dl></details>${w === 'software' ? `<details><summary>From café to software</summary><dl class="pairs">${lv.translate.map(([a,b]) => `<dt class="from">${esc(a)}</dt><span class="arrow">→</span><dd class="to">${esc(b)}</dd>`).join('')}</dl><a href="${lv.reading.url}" target="_blank" rel="noopener">Read more in the System Design Primer ↗</a></details>` : ''}<div class="btn-row"><button class="btn primary" id="return-build">${cafe ? 'Start on the floor →' : 'Start building →'}</button></div>`);
  } else if (S.sel) {
    const title = S.sel.kind === 'block' ? esc(nameOf(d, S.sel.id)) : 'A connection';
    html = shell('Equipment settings', S.sel.kind === 'block' ? `Adjust ${title}` : title, inspectorHtml() + '<button class="btn primary" id="done-edit">Done →</button>', '', `inspector-sheet ${S.sel.kind === 'block' && d.blocks.find((b) => b.id === S.sel.id)?.x > 500 ? 'inspector-left' : ''}`);
  } else if (phase === 'predict') {
    const opts = d.blocks.map((b) => `<option value="${b.id}" ${p.block === b.id ? 'selected' : ''}>${esc(b.names[w])}</option>`).join('');
    html = shell('Prediction', cafe ? 'First, a little prediction.' : 'Predict the outcome.', `<div class="field"><label for="p-block">${cafe ? 'Where will it go wrong first?' : 'Which block fails first?'}</label><select id="p-block"><option value="">Choose one</option>${opts}<option value="none" ${p.block === 'none' ? 'selected' : ''}>${cafe ? 'Nowhere — it will be fine' : 'Nothing fails'}</option></select></div><div class="field"><label for="p-val">${esc(sn.predict.question)}</label><div class="unit-in"><input id="p-val" type="number" min="0" step="any" inputmode="decimal" value="${esc(p.value ?? '')}"><span>${esc(sn.predict.unit)}</span></div></div>${(S.problems[key()] || []).length ? `<ul class="problems">${S.problems[key()].map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<div class="btn-row"><button class="btn primary" id="run-btn" disabled>${cafe ? 'Open the doors →' : 'Run the system →'}</button><span class="ready-note" id="ready-note"></span></div>`, 'prediction');
  } else if (phase === 'submit') {
    html = submitHtml(lv, w, false);
  } else if (phase === 'map' && sub && !sub.stale) {
    html = `<section class="sheet map-sheet" aria-label="Survival map" tabindex="-1">${closeTask}<h2>${cafe ? 'Where does your shop hold up?' : 'Where does your design hold up?'}</h2>
      <p>${cafe ? 'Every square is one morning from the brief, from quiet to the worst case. The numbers are your tests.' : 'Every square is one scenario from the constraints, from easy to the worst case. The numbers are your tests.'}</p>
      ${mapHtml(lv.id, w)}
      <div class="btn-row"><button class="btn" id="submission-open">← Back to results</button></div></section>`;
  } else if (phase === 'submission' && sub && !sub.stale) {
    html = submissionHtml(lv, w, sub);
  } else if (phase === 'review' && done && last) {
    const log = r.log, passed = log.result.passed;
    const actual = fmtPred(last.actual);
    const headline = sn.predict.key === 'recoverySeconds'
      ? last.actual === Infinity ? cafe ? 'Still waiting at closing time.' : 'The queue did not clear during this run.' : last.actual === 0 ? cafe ? 'No line left behind.' : 'No queue left behind.' : cafe ? `The line took ${actual} to clear.` : `The queue took ${actual} to clear.`
      : passed ? cafe ? 'A little shop that holds up.' : 'The system met its targets.' : 'There is a bottleneck to find.';
    const events = narrate(log, d, runScenario()), step = S.hint[key()] || 0;
    const hint = step ? hintFor(step, log, d, runScenario(), last) : null;
    html = `<section class="task" aria-label="Result"><div class="task-copy"><span class="badge ${passed ? 'pass' : 'fail'}">${passed ? cafe ? 'Morning held up' : 'Sample passed' : 'Room to improve'}</span><h2>${headline}</h2><p>You predicted ${fmtPred(last.guess)}.${sn.predict.key !== 'recoverySeconds' ? ` The result was ${actual}.` : ''} ${passed ? cafe ? 'Ready to try a few different mornings?' : 'Ready to test different traffic conditions?' : cafe ? 'Try a change on the floor, then open again.' : 'Change the design, then try again.'}</p><details class="result-notes"><summary>What happened?</summary><ol class="log">${events.map((e) => `<li><time>${W().clock(e.t)}</time><span>${e.s}</span></li>`).join('')}</ol></details>${hint ? `<p class="hint" ${hint.loading ? 'aria-busy="true"' : ''}>${hint.loading ? 'Finding a little nudge…' : esc(hint.text)}</p>` : ''}</div><div class="task-actions"><button class="btn primary" id="${passed ? 'submit-open' : 'return-build'}">${passed ? cafe ? 'Try a full week →' : 'Test all scenarios →' : 'Make a change →'}</button>${!passed && step < 3 ? `<button class="text-btn" id="hint-btn">${cafe ? 'A little nudge' : 'Get a hint'}</button>` : ''}</div></section>`;
  } else {
    const empty = !d.blocks.some((b) => b.type === 'server');
    html = `<section class="task" aria-label="Build experiment"><div class="task-copy"><div class="eyebrow">${atts.length ? 'Try something different' : 'Your move'}</div><h2>${empty ? cafe ? 'Every café needs a barista.' : 'Start with a server.' : cafe ? 'Make the morning work.' : 'Make the system work.'}</h2><p>${empty ? cafe ? 'Place one on the floor, then connect it to the door.' : 'Add a server and connect it to incoming requests.' : 'Tap Adjust settings on an item to change how it works.'}</p></div><div class="task-actions"><button class="btn primary" id="${empty ? 'equipment-open' : 'predict-open'}">${empty ? cafe ? 'Choose equipment →' : 'Add a component →' : cafe ? 'Predict & try →' : 'Predict & run →'}</button>${atts.length ? `<button class="text-btn" id="submit-open">${cafe ? 'Try a full week' : 'Test all scenarios'}</button>` : ''}${done ? '<button class="text-btn" id="review-open">Last run</button>' : ''}</div></section>`;
  }
  document.getElementById('side').innerHTML = html;
}

const checkWords = (w) => (w === 'cafe'
  ? { errors: 'customers walked out', slow: 'waits ran too long', cost: 'over budget', drained: 'tickets were left on the rail at closing' }
  : { errors: 'too many errors', slow: 'too many slow requests', cost: 'over budget', drained: 'writes were still queued at the end' });

function submitHtml(lv, w, playing) {
  const n = 1 + (lv.tests || []).length, g = S.subGuess[key()] ?? '';
  const ready = design().blocks.length > 0 && g !== '';
  return `<section class="sheet" aria-label="Submit">${closeTask}
      <h2>${w === 'cafe' ? 'A shop for every morning.' : 'Test the full scenario suite.'}</h2><p>${w === 'cafe' ? 'Your design will face the sample and the hidden mornings, within the limits in the brief.' : 'Test the sample and variations in traffic, within the limits in the brief.'}</p>
      <div class="field"><label for="p-tests">${w === 'cafe' ? `Before you submit: how many of the ${n} mornings will your shop survive?` : `Before you submit: how many of the ${n} tests will pass?`}</label>
        <select id="p-tests"><option value="">Choose</option>${Array.from({ length: n + 1 }, (_, i) => `<option value="${i}" ${String(g) === String(i) ? 'selected' : ''}>${i} of ${n}</option>`).join('')}</select></div>
      <div class="btn-row"><button class="btn primary" id="submit-btn" ${ready && !playing ? '' : 'disabled'}>${w === 'cafe' ? 'Try the full week →' : 'Run all tests →'}</button>
      <span class="muted" id="submit-note">${ready ? '' : 'Guess how many tests it will pass.'}</span></div>
    </section>`;
}

// Why a test failed, from its run log: the timeline, where trouble started, and the numbers against the targets.
// Shows the test last watched from the notebook, or the first failure.
function whyFailedHtml(sub, w) {
  const r = run(), d = design(), Wd = W(), cafe = w === 'cafe';
  const t = (r && r.kind === 'test' && sub.results.find((x) => r.label === `Test ${x.n} · ${x.name}`)) || sub.failed;
  const res = t.log.result, sc = t.scenario;
  const first = res.firstFailure;
  const nums = [
    `${cafe ? 'Walked out' : 'Errors'}: <b class="${res.checks.errors ? '' : 'wrong'}">${fmtPct(res.errorRate)}</b> <span class="muted">(target ≤ ${fmtPct(sc.targets.errorRate)})</span>`,
    `${cafe ? 'Waited over' : 'Slower than'} ${Wd.latTarget(sc.latencyTargetMs)}: <b class="${res.checks.slow ? '' : 'wrong'}">${fmtPct(res.slowShare)}</b> <span class="muted">(target ≤ ${fmtPct(sc.targets.slowShare)})</span>`
  ];
  return `<details class="result-notes why-failed" open><summary>${cafe ? 'Why did this morning break?' : 'Why did this test fail?'} <span class="muted">· Test ${t.n}</span></summary>
      ${first ? `<p>${cafe ? 'Trouble started with' : 'First to fail:'} <b>${esc(nameOf(d, first.block))}</b> at ${Wd.clock(first.t)}.</p>` : ''}
      <ol class="log">${narrate(t.log, d, sc).map((l) => `<li><time>${Wd.clock(l.t)}</time><span>${l.s}</span></li>`).join('')}</ol>
      <p class="why-nums">${nums.join('<br>')}</p>
    </details>`;
}

function submissionHtml(lv, w, sub) {
  const words = checkWords(w);
  const why = (t) => { const s = Object.entries(t.checks).filter(([, ok]) => !ok).map(([k]) => words[k]).join(', '); return s.charAt(0).toUpperCase() + s.slice(1); };
  let next = '';
  if (sub.accepted && w === 'cafe') next = `<button class="btn primary" id="to-software">See it as software →</button>`;
  else if (sub.accepted) {
    const unfinished = nextChapter();
    next = !unfinished ? `<span class="right">All ${LEVELS.length} chapters complete. You have practised ${esc(LEVELS.filter((l) => l.topic && !l.capstone).map((l) => l.topic.name.toLowerCase()).join(', '))}, and put them together.</span>`
      : unfinished.id === lv.id ? '<button class="btn primary" data-scene="cafe">Finish the coffee shop →</button>'
        : `<button class="btn primary" data-level="${unfinished.id}">Continue: ${esc(unfinished.name)} →</button>`;
  }
  const guessed = Number.isFinite(sub.guess) ? `You guessed ${sub.guess} of ${sub.total}${sub.guess === sub.passedCount ? ' · ✓ spot on' : ''}.` : '';
  return `<section class="sheet submission" aria-label="Submission">${closeTask}
      <span class="badge ${sub.accepted ? 'pass' : 'fail'}">${sub.accepted ? 'Accepted' : `Failed on test ${sub.failed.n}`}</span>
      <h2>${sub.accepted ? w === 'cafe' ? 'A café for every morning.' : 'A system that holds up.' : w === 'cafe' ? 'One morning needs another look.' : 'One scenario needs another look.'}</h2>
      <p>${sub.passedCount} of ${sub.total} passed. ${guessed}</p>
      ${sub.failed ? `<p><b>${esc(sub.failed.name)}.</b> ${esc(sub.failed.story)} <span class="wrong">${esc(why(sub.failed))}.</span></p>` : ''}
      ${sub.failed ? whyFailedHtml(sub, w) : ''}
      ${sub.accepted ? whyHtml(lv, w) : ''}
      ${sub.accepted ? bestHtml(lv.id, w, sub.results[0].log.result.costPerHour) : ''}
      <div class="btn-row">${next || `<button class="btn primary" id="return-build">${w === 'cafe' ? 'Back to the floor →' : 'Edit the system →'}</button>`}<button class="text-btn" id="map-open">Where does it hold? →</button>${sub.accepted && w === 'software' ? '<button class="text-btn" data-open-topics>All topics</button>' : ''}${sub.failed ? `<button class="text-btn" data-watch="${esc(sub.failed.id)}">${w === 'cafe' ? 'Watch this morning' : 'Watch this scenario'}</button>` : ''}</div>
      <details><summary>${w === 'cafe' ? 'Open your notebook' : 'Review test results'}</summary><ol class="tests">${sub.results.map((t) => `<li class="${t.passed ? 'ok' : 'bad'}">
          <span class="mark" aria-label="${t.passed ? 'Passed' : 'Failed'}">${t.passed ? '✓' : '✗'}</span>
          <span><b>Test ${t.n}</b> · ${esc(t.name)}${t.hidden ? '' : ` <span class="muted">(sample)</span>`}${t.passed ? '' : `<small>${esc(why(t))}</small>`}</span>
          <button class="btn small" data-watch="${esc(t.id)}">Watch</button>
        </li>`).join('')}</ol>${starSummary(lv)}</details>
    </section>`;
}
