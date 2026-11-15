// Entry point: header, palette, actions and input handling. Wires the render registry R.
import { simulate, validate, canWire, blockCost, REFUSAL } from '../sim/sim.js';
import { LEVELS } from '../levels/levels.js';
import { grade } from '../levels/grade.js';
import { S, R, L, W, world, key, scene, design, run, attempts, typeOf, simDesign, stars, nameOf, clone, esc, reducedMotion, rememberDesign, endDesignEdit, historyStatus, restoreDesign, resetDesign, advancePlayback, starterOf, submission } from './state.js';
import { WORLDS, FIELDS, DEFAULTS, CAFE_REFUSAL, cafeWords, icon } from './worlds.js';
import { renderBoard as drawBoard, renderOverlay, NODE_W, NODE_H } from './board.js';
import { fx, SPEED, startFx, sizeCanvas, resetFx, invalidateColors } from './fx.js';
import { renderRun, renderRunBody, tickFromPointer } from './run-panel.js';
import { renderSide, predScale, predError } from './coach.js';
import { drawMap, mapMorning, cellLabel } from './survival-panel.js';

/* ---------- Header and palette ---------- */
function renderTabs() {
  document.getElementById('day-label').textContent = `${world() === 'cafe' ? 'Day' : 'Lab'} ${L().n} · ${L().name}`;
  document.getElementById('tabs').innerHTML = LEVELS.map((l) => {
    const st = stars(l.id);
    return `<button class="tab" ${S.level === l.id ? 'aria-current="page"' : ''} data-level="${l.id}"><span class="chapter-number">${String(l.n).padStart(2, '0')}</span><span class="chapter-copy"><b>${esc(l.name)}</b><small>${esc(l.concept)}</small></span><span class="stars" aria-label="${st.filter(Boolean).length} of 3 stars">${st.map((x) => x ? '★' : '☆').join('')}</span></button>`;
  }).join('');
  const earned = LEVELS.flatMap((l) => stars(l.id)).filter(Boolean).length;
  document.getElementById('progress').textContent = `☆ ${earned}`;
  document.getElementById('progress').setAttribute('aria-label', `${earned} of ${LEVELS.length * 3} stars`);
  renderMission();
}

function renderMission() {
  const sc = scene().scenario, cafe = world() === 'cafe';
  const brand = document.querySelector('.brand');
  brand.innerHTML = `<span aria-hidden="true">${cafe ? '☕' : icon('software', 'server')}</span><b>Little Systems <em>${cafe ? 'Café' : 'Lab'}</em></b>`;
  brand.setAttribute('aria-label', `Little Systems ${cafe ? 'Café' : 'Lab'} home`);
  document.title = cafe ? 'Little Systems Café' : 'Little Systems Lab';
  document.querySelector('.skip-link').textContent = cafe ? 'Skip to the café floor' : 'Skip to the system';
  document.getElementById('main').setAttribute('aria-label', cafe ? 'Interactive café floor' : 'Interactive system topology');
  document.querySelector('.board-scroll').setAttribute('aria-label', cafe ? 'Café floor. Scroll to explore, or use Fit floor.' : 'System topology. Scroll to explore, or use Fit view.');
  document.querySelector('#equipment-menu > summary').textContent = cafe ? '＋ Equipment' : '＋ Components';
  document.getElementById('fit-floor').textContent = cafe ? 'Fit floor' : 'Fit view';
  document.getElementById('zoom-floor').setAttribute('aria-label', cafe ? 'Zoom in on the floor' : 'Zoom in on the system');
  document.getElementById('board-help').textContent = cafe ? 'Tap Adjust settings to make a change · Drag equipment to arrange · Pull a dot to connect' : 'Adjust settings to configure · Drag components to arrange · Pull a port to connect';
  const unit = cafe ? 'customers/min' : 'requests/s', scale = W().scale;
  const base = (sc.base.reads + sc.base.writes) / scale;
  const shock = sc.spike ? ` → ${(sc.spike.reads + sc.spike.writes) / scale} at ${W().clock(sc.spike.t)}`
    : sc.serverFail ? ` · one ${cafe ? 'barista leaves' : 'server fails'} at ${W().clock(sc.serverFail.t)}`
      : sc.cacheFlush ? ` · ${cafe ? 'fridge empties' : 'cache restarts'} at ${W().clock(sc.cacheFlush.t)}` : '';
  document.getElementById('chapter-marker').textContent = cafe ? `A small experiment · Day ${L().n}` : `Software lab ${L().n} · ${L().concept}`;
  document.getElementById('mission-title').textContent = scene().title;
  document.getElementById('mission-sub').textContent = `${base} ${unit}${shock}. ${cafe ? 'Make the morning work.' : 'Build a system that holds up.'}`;
}

/* ---------- Topic picker ---------- */
// The first screen: choose the idea to learn, then play its chapter. The capstone combines all four.
export function topicCardsHtml() {
  const topics = LEVELS.filter((l) => !l.capstone), cap = LEVELS.find((l) => l.capstone);
  const done = (l) => { const st = stars(l.id); return st[0] && st[1]; };
  const starsOf = (l) => { const st = stars(l.id); return `<span class="stars" aria-label="${st.filter(Boolean).length} of 3 stars">${st.map((x) => (x ? '★' : '☆')).join('')}</span>`; };
  const card = (l) => `<button class="topic-card${done(l) ? ' done' : ''}" data-topic="${l.id}">
      <span class="topic-top"><span class="chapter-number">${String(l.n).padStart(2, '0')}</span>${starsOf(l)}</span>
      <b class="topic-name">${esc(l.topic.name)}</b>
      <span class="topic-idea">${esc(l.topic.idea.software)}</span>
      <span class="topic-pair"><span><i>In the café</i>${esc(l.topic.tool.cafe)}</span><span><i>In software</i>${esc(l.topic.tool.software)}</span></span>
      <span class="topic-trade"><i>Trade-off</i> ${esc(l.topic.tradeoff.software)}</span>
      <span class="topic-go">${done(l) ? 'Play again' : stars(l.id).some(Boolean) ? 'Continue' : 'Start'} · ${esc(l.name)} →</span>
    </button>`;
  const finished = topics.filter(done).length;
  const capCard = cap ? `<button class="topic-card capstone${finished === topics.length ? '' : ' early'}" data-topic="${cap.id}">
      <span class="topic-top"><span class="eyebrow">Capstone · all four topics</span>${starsOf(cap)}</span>
      <b class="topic-name">${esc(cap.topic.name)}</b>
      <span class="topic-idea">${esc(cap.topic.idea.software)}</span>
      <span class="topic-tool">${cap.principles.map((p) => `<span>${esc(topics.find((t) => t.topic.id === p).topic.name)}</span>`).join('<span aria-hidden="true">+</span>')}</span>
      <span class="topic-go">${finished === topics.length ? 'Ready when you are' : `Best after the four topics · ${finished} of ${topics.length} done`} · ${esc(cap.name)} →</span>
    </button>` : '';
  return `<div class="topic-grid">${topics.map(card).join('')}</div>${capCard}`;
}

function renderTopics() {
  const el = document.getElementById('topics');
  el.hidden = !S.topicsOpen;
  document.getElementById('app').inert = S.topicsOpen;
  if (!S.topicsOpen) return;
  el.innerHTML = `<section class="topics-panel" role="dialog" aria-modal="true" aria-labelledby="topics-title">
      ${S.picked ? '<button class="icon-btn close" id="topics-close" aria-label="Back to the chapter">×</button>' : ''}
      <p class="eyebrow">Little Systems Café</p>
      <h1 id="topics-title">What do you want to learn?</h1>
      <p class="topics-lead">Each topic is one idea from system design. You make it work in a coffee shop first, then build the same thing as software, and see why it held.</p>
      ${topicCardsHtml()}
    </section>`;
}

function closeTopics() {
  S.topicsOpen = false;
  renderTopics();
  document.getElementById('topics-open').focus({ preventScroll: true });
}

let cameraReady = false;
function fitFloor(force = false) {
  const view = document.getElementById('board-scroll') || document.querySelector('.board-scroll');
  if (!view) return;
  const fitted = Math.min(1.1, view.clientWidth / 900, Math.max(180, view.clientHeight) / 400);
  S.zoom = force ? fitted : Math.max(view.clientWidth < 700 ? .68 : .8, fitted);
  document.getElementById('stage-space').style.setProperty('--zoom', S.zoom);
  cameraReady = true;
}

function setTask(phase) {
  S.labPhase[key()] = phase; S.sel = null; S.banner = null;
  document.getElementById('equipment-menu').open = false;
  document.getElementById('connection-tools').open = false;
  document.querySelector('.chapter-menu').open = false;
  renderBoard(); renderSide(); renderOverlay(); updateWorkbench();
  if (phase === 'predict') document.getElementById('p-block')?.focus();
  if (phase === 'submit') document.getElementById('p-tests')?.focus();
  if (phase === 'build') document.querySelector('#side .btn.primary')?.focus({ preventScroll: true });
}

function renderPalette() {
  const w = world(), Wd = W();
  const costOf = (type) => Wd.cost(blockCost(Object.assign({ type, copies: 1 }, DEFAULTS[type])));
  const row = (type) => `<button class="pal-btn" data-add="${type}">${icon(w, type)}<span class="t">${esc(Wd.palette[type])}<small>${costOf(type)}</small></span></button>`;
  document.getElementById('pal').innerHTML = ['server', 'loadBalancer', 'cache', 'database', 'queue'].map(row).join('');
}

// Keep keyboard focus on the same equipment while board markup is refreshed.
function renderBoard() {
  const active = document.activeElement;
  const nodeId = active?.matches('.node[data-node]') ? active.dataset.node : null;
  const portId = active?.dataset.port;
  const editId = active?.dataset.editNode;
  drawBoard();
  const legend = document.getElementById('flow-legend');
  if (legend) {
    legend.hidden = !run() || !!run().stale;
    const words = world() === 'cafe' ? ['Arriving', 'Waiting', 'Coffee in hand'] : ['Requests', 'Queued', 'Completed'];
    legend.querySelectorAll('span').forEach((el, i) => { el.textContent = words[i]; });
  }
  document.querySelectorAll('.node[data-node]:not(.traffic)').forEach((node) => {
    node.setAttribute('role', 'group');
    node.setAttribute('aria-describedby', 'board-help');
    node.setAttribute('aria-keyshortcuts', 'Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight');
  });
  document.querySelectorAll('[data-port]').forEach((port) => { port.disabled = isPlaying(); });
  if (portId) document.querySelector(`[data-port="${portId}"]`)?.focus({ preventScroll: true });
  else if (editId) document.querySelector(`[data-edit-node="${editId}"]`)?.focus({ preventScroll: true });
  else if (nodeId) document.querySelector(`[data-node="${nodeId}"]`)?.focus({ preventScroll: true });
}

// A native-control alternative to dragging, usable with keyboard and touch.
function renderConnections() {
  const d = design();
  const previous = ['wire-from', 'wire-to', 'wire-remove'].map((id) => [id, document.getElementById(id)?.value]);
  const opts = (ids) => ids.map((id) => `<option value="${esc(id)}">${esc(nameOf(d, id))}</option>`).join('');
  const sources = ['traffic', ...d.blocks.filter((b) => b.type !== 'database').map((b) => b.id)];
  document.getElementById('connection-body').innerHTML = `
    <div class="connection-row">
      <div class="field"><label for="wire-from">From</label><select id="wire-from">${opts(sources)}</select></div>
      <div class="field"><label for="wire-to">To</label><select id="wire-to">${opts(d.blocks.map((b) => b.id))}</select></div>
      <button class="btn small" id="connect-btn" ${d.blocks.length ? '' : 'disabled'}>Connect →</button>
    </div>
    ${d.wires.length ? `<div class="connection-row">
      <div class="field"><label for="wire-remove">Existing connection</label><select id="wire-remove">${d.wires.map(([a, b], i) => `<option value="${i}">${esc(nameOf(d, a))} → ${esc(nameOf(d, b))}</option>`).join('')}</select></div>
      <button class="btn small" id="remove-connection">Remove connection</button>
    </div>` : '<p class="muted">No connections yet. Start at the door and connect your equipment.</p>'}
    <p id="connection-status" role="status" class="muted"></p>`;
  previous.forEach(([id, value]) => {
    const select = document.getElementById(id);
    if (select && Array.from(select.options).some((o) => o.value === value)) select.value = value;
  });
}

function connectionMessage(text) {
  document.getElementById('connection-status').textContent = text;
}

function predictionReady() {
  const p = S.pred[key()] || {};
  return (p.block === 'none' || design().blocks.some((b) => b.id === p.block))
    && String(p.value ?? '').trim() !== '' && Number.isFinite(Number(p.value)) && Number(p.value) >= 0
    && Array.from(document.querySelectorAll('[data-field][type="number"]')).every((input) =>
      input.value !== '' && Number.isFinite(input.valueAsNumber) && input.validity.valid);
}

function isPlaying() { return !!run() && !run().done; }

function fieldsValid() {
  return Array.from(document.querySelectorAll('[data-field][type="number"]')).every((input) =>
    input.value !== '' && Number.isFinite(input.valueAsNumber) && input.validity.valid);
}

// Submit needs a design and a guess at how many tests it will pass.
function submitReady() {
  const g = S.subGuess[key()];
  return design().blocks.length > 0 && g !== undefined && g !== '' && fieldsValid();
}

function renderEditTools() {
  const h = historyStatus(), playing = isPlaying();
  document.getElementById('undo-design').disabled = playing || !h.undo;
  document.getElementById('redo-design').disabled = playing || !h.redo;
  document.getElementById('reset-design').disabled = playing || JSON.stringify(design()) === JSON.stringify(starterOf(L()));
  document.getElementById('reset-design').textContent = world() === 'cafe' ? 'Reset shop' : 'Reset design';
}

function updateRunReadiness() {
  const ready = predictionReady(), playing = isPlaying();
  const btn = document.getElementById('run-btn'); if (btn) btn.disabled = playing || !ready;
  const note = document.getElementById('ready-note');
  if (note) note.textContent = ready ? '' : 'Choose a block and a number.';
  const sub = document.getElementById('submit-btn'); if (sub) sub.disabled = playing || !submitReady();
  const subNote = document.getElementById('submit-note');
  if (subNote) subNote.textContent = submitReady() ? '' : design().blocks.length ? 'Guess how many tests it will pass.' : 'Build something first.';
}

function updateWorkbench() {
  renderConnections(); renderEditTools();
  const playing = isPlaying();
  document.getElementById('app').dataset.playing = String(playing && !run().paused);
  document.querySelectorAll('[data-add], [data-edit-node], #connection-body button, #connection-body select, [data-field], #del-block, #del-wire, #p-tests, [data-watch], [data-cell], #map-open').forEach((el) => {
    el.disabled = playing || (el.id === 'connect-btn' && !design().blocks.length);
  });
  updateRunReadiness();

}

function renderAll() {
  const focusedId = document.activeElement?.id;
  document.documentElement.setAttribute('data-world', world());
  fx.playing = isPlaying() && !run().paused;
  invalidateColors();
  renderTabs(); renderPalette(); renderBoard(); renderOverlay(); renderRun(); renderSide(); updateWorkbench(); renderTopics();
  requestAnimationFrame(() => { if (!cameraReady) fitFloor(); });
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
}

Object.assign(R, { all: renderAll, tabs: renderTabs, palette: renderPalette, board: renderBoard, overlay: renderOverlay, run: renderRun, runBody: renderRunBody, side: renderSide });

/* ---------- Actions ---------- */
let toastTimer = null;
function toast(msg) {
  S.toast = msg; renderOverlay();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { S.toast = null; renderOverlay(); }, 3400);
}
R.toast = toast;

function designChanged() {
  const r = run(); if (r) r.stale = true;
  const sub = submission(); if (sub) sub.stale = true;
  document.querySelector('#side [aria-label="Submission"]')?.remove();
  S.problems[key()] = []; S.labPhase[key()] = 'build';
  document.querySelector('#side [aria-label="Result"]')?.remove();
  document.querySelector('#side [aria-label="Tutor"]')?.remove();
  const p = S.pred[key()];
  if (p?.block && p.block !== 'none' && !design().blocks.some((b) => b.id === p.block)) delete p.block;
  renderEditTools();
}

function historyAction(action) {
  if (isPlaying()) return;
  cancelDrag(); endDesignEdit();
  const changed = action === 'reset' ? resetDesign() : restoreDesign(action);
  if (!changed) return;
  S.sel = null; S.banner = null; S.hoverT = null; resetFx();
  designChanged(); renderAll();
  if (action === 'reset') toast('Starting layout restored. Undo brings it back.');
  const focus = document.getElementById(action === 'reset' ? 'undo-design' : `${action}-design`);
  if (focus && !focus.disabled) focus.focus({ preventScroll: true });
  else document.getElementById(action === 'redo' ? 'undo-design' : 'redo-design')?.focus({ preventScroll: true });
}

function addBlock(type) {
  const d = design();
  document.getElementById('equipment-menu').open = false;
  const n = d.blocks.filter((b) => b.type === type).length;
  const names = {};
  Object.keys(WORLDS).forEach((x) => { names[x] = WORLDS[x].defaultName[type] + (n ? ' ' + (n + 1) : ''); });
  const id = type.slice(0, 2) + (S.seq++) + 'x';
  const k = d.blocks.length;
  rememberDesign();
  d.blocks.push(Object.assign({ id, type, names, x: 230 + (k * 80) % 480, y: 30 + (k * 100) % 260 }, clone(DEFAULTS[type])));
  S.sel = { kind: 'block', id };
  designChanged(); renderBoard(); renderRun(); renderSide(); updateWorkbench();
}

function startRun() {
  if (isPlaying() || !predictionReady()) return;
  cancelSceneTransition();
  cancelDrag(); endDesignEdit();
  const sn = scene(), sd = simDesign(design());
  let problems = validate(sd);
  if (world() === 'cafe') problems = problems.map(cafeWords);
  S.problems[key()] = problems;
  if (problems.length) { renderSide(); updateWorkbench(); return; }
  const p = S.pred[key()];
  const log = simulate(sd, sn.scenario);
  const metric = log.metrics[sn.predict.key];
  const actual = sn.predict.key === 'recoverySeconds' && log.metrics.recoveryNeverEnded
    ? Infinity : metric == null ? null : metric / predScale();
  const guess = parseFloat(p.value);
  const actualBlock = log.result.firstFailure ? log.result.firstFailure.block : 'none';
  attempts().push({ guessBlock: p.block, actualBlock, blockRight: p.block === actualBlock, guess, actual, err: predError(guess, actual), passed: log.result.passed });
  S.pred[key()] = {}; S.hint[key()] = 0; S.sel = null; S.labPhase[key()] = 'review';
  play(key(), log);
}

// Submit: the sample plus every hidden test. A failure replays on the board so the learner can watch it.
function startSubmit() {
  if (isPlaying() || !submitReady()) return;
  cancelSceneTransition(); cancelDrag(); endDesignEdit();
  const sd = simDesign(design());
  let problems = validate(sd);
  if (world() === 'cafe') problems = problems.map(cafeWords);
  S.problems[key()] = problems;
  if (problems.length) { renderSide(); updateWorkbench(); return; }
  const g = grade(sd, S.level, world());
  S.labPhase[key()] = 'submission';
  S.submits[key()] = { ...g, guess: Number(S.subGuess[key()]), stale: false };
  if (g.accepted) S.accepted[key()] = true;
  delete S.subGuess[key()];
  S.sel = null;
  if (g.failed) watchTest(g.failed);
  else renderAll();
}

function watchTest(t) {
  S.sel = null; S.labPhase[key()] = 'submission';
  play(key(), t.log, false, { scenario: t.scenario, kind: 'test', label: `Test ${t.n} · ${t.name}` });
}

function play(k, log, stale = false, meta = {}) {
  const r = { log, t: 0, done: false, stale, paused: reducedMotion(), elapsedMs: 0, lastFrame: performance.now(), ...meta };
  clearTimeout(toastTimer); S.toast = null; renderOverlay();
  S.runs[k] = r; S.hoverT = null;
  resetFx();
  const N = log.ticks.length;
  renderBoard(); renderRun(); renderSide(); updateWorkbench();
  fx.playing = !r.paused;
  function step(now) {
    if (S.runs[k] !== r || r.done) return;
    const nextTick = advancePlayback(r, now, SPEED, N);
    if (nextTick !== r.t) {
      r.t = nextTick;
      if (key() === k) { renderBoard(); renderRunBody(); }
    }
    if (r.t < N - 1) requestAnimationFrame(step);
    else { r.done = true; r.paused = false; if (key() === k) { renderAll(); document.querySelector('#side .btn.primary')?.focus({ preventScroll: true }); } else renderTabs(); }
  }
  requestAnimationFrame(step);
}

let sceneTransitionTimer = null;
function cancelSceneTransition() {
  clearTimeout(sceneTransitionTimer); sceneTransitionTimer = null;
  document.getElementById('app').classList.remove('morph');
}

function switchScene(name, animate) {
  cancelSceneTransition();
  if (world() === name) return;
  cancelDrag(); endDesignEdit();
  const app = document.getElementById('app');
  const level = S.level;
  const go = () => {
    sceneTransitionTimer = null;
    if (S.level !== level) { app.classList.remove('morph'); return; }
    // The first time software opens, it starts from the learner's own coffee shop: same diagram, new names.
    const lv = LEVELS.find((l) => l.id === level), pristine = JSON.stringify(starterOf(lv));
    if (name === 'software' && JSON.stringify(S.designs[level].software) === pristine && JSON.stringify(S.designs[level].cafe) !== pristine) {
      S.designs[level].software = clone(S.designs[level].cafe);
    }
    S.scene[level] = name; S.sel = null; S.hoverT = null; resetFx();
    S.banner = name === 'software' && animate ? S.level : null;
    renderAll();
    if (S.banner) document.getElementById('banner-ok')?.focus({ preventScroll: true });
    else document.querySelector(`[data-scene="${name}"]`)?.focus({ preventScroll: true });
    requestAnimationFrame(() => app.classList.remove('morph'));
  };
  if (animate && !reducedMotion()) { app.classList.add('morph'); sceneTransitionTimer = setTimeout(go, 300); }
  else go();
}

/* ---------- Input ---------- */
document.addEventListener('click', (e) => {
  const action = e.target.closest('button');
  if (action && action.disabled) return;
  const topic = e.target.closest('[data-topic]');
  if (topic) {
    cancelSceneTransition(); cancelDrag(); endDesignEdit();
    S.level = topic.dataset.topic; S.sel = null; S.hoverT = null; S.banner = null; S.topicsOpen = false; S.picked = true;
    // A fresh chapter opens on its brief, which leads with the idea being learned.
    if (!S.labPhase[key()] || S.labPhase[key()] === 'build') S.labPhase[key()] = attempts().length ? 'build' : 'brief';
    resetFx(); renderAll();
    document.querySelector('#side .sheet, #side .btn.primary')?.focus({ preventScroll: true });
    return;
  }
  if (action?.id === 'topics-open' || action?.hasAttribute('data-open-topics')) { if (!isPlaying()) { S.topicsOpen = true; renderTopics(); document.querySelector('.topic-card')?.focus(); } return; }
  if (action?.id === 'topics-close') { closeTopics(); return; }
  const lvBtn = e.target.closest('[data-level]');
  if (lvBtn) {
    cancelSceneTransition(); cancelDrag(); endDesignEdit();
    document.querySelector('.chapter-menu').open = false;
    S.level = lvBtn.dataset.level; S.sel = null; S.hoverT = null; S.banner = null; resetFx(); renderAll();
    document.getElementById('day-label').focus({ preventScroll: true }); return;
  }
  const sb = e.target.closest('[data-scene]');
  if (sb) { switchScene(sb.dataset.scene, sb.dataset.scene === 'software'); return; }
  const add = e.target.closest('[data-add]');
  if (add) { addBlock(add.dataset.add); return; }
  const id = action?.id || e.target.id;
  if (action?.dataset.editNode) {
    if (isPlaying()) return;
    endDesignEdit();
    S.sel = { kind: 'block', id: action.dataset.editNode };
    S.labPhase[key()] = 'build';
    renderBoard(); renderSide(); updateWorkbench();
    document.querySelector('.inspector-sheet input, .inspector-sheet select, #done-edit')?.focus({ preventScroll: true });
    return;
  }
  const phases = { 'predict-open': 'predict', 'submit-open': 'submit', 'review-open': 'review', 'brief-open': 'brief', 'return-build': 'build', 'submission-open': 'submission', 'close-task': 'build', 'done-edit': 'build' };
  if (phases[id]) { setTask(phases[id]); return; }
  if (id === 'equipment-open') { document.getElementById('equipment-menu').open = true; document.querySelector('[data-add]')?.focus(); return; }
  if (id === 'fit-floor') { fitFloor(true); return; }
  if (id === 'zoom-floor') { S.zoom = Math.min(1.5, S.zoom + .2); document.getElementById('stage-space').style.setProperty('--zoom', S.zoom); return; }
  if (id === 'toggle-playback' && isPlaying()) {
    const r = run(); r.paused = !r.paused; r.lastFrame = performance.now(); fx.playing = !r.paused;
    renderSide(); updateWorkbench(); document.getElementById('toggle-playback')?.focus({ preventScroll: true }); return;
  }
  if (id === 'step-flow' && isPlaying()) {
    const r = run(); r.paused = true; fx.playing = false;
    r.t = r.log.events.find((event) => event.t > r.t)?.t ?? r.log.ticks.length - 1;
    r.elapsedMs = r.t * 1000 / SPEED; r.lastFrame = performance.now();
    if (r.t >= r.log.ticks.length - 1) { r.done = true; r.paused = false; renderAll(); }
    else { renderBoard(); renderRunBody(); renderSide(); updateWorkbench(); document.getElementById('step-flow')?.focus({ preventScroll: true }); }
    return;
  }
  if (id === 'skip-run') { const r = run(); if (r) { r.t = r.log.ticks.length - 1; r.done = true; r.paused = false; fx.playing = false; renderAll(); } return; }
  if (action?.dataset.adjust) {
    const field = document.getElementById(action.dataset.adjust);
    field.stepUp(Number(action.dataset.delta)); field.dispatchEvent(new Event('input', { bubbles: true })); return;
  }
  if (id === 'undo-design' || id === 'redo-design' || id === 'reset-design') { historyAction(id.split('-')[0]); return; }
  if (id === 'connect-btn') {
    if (isPlaying()) return;
    const from = document.getElementById('wire-from').value, to = document.getElementById('wire-to').value;
    const result = canWire(simDesign(design()), from, to);
    if (!result.ok) {
      const reason = world() === 'cafe' ? (Object.values(REFUSAL).includes(result.reason) ? CAFE_REFUSAL[typeOf(design(), from)] : cafeWords(result.reason)) : result.reason;
      connectionMessage(reason); return;
    }
    const message = `${nameOf(design(), from)} → ${nameOf(design(), to)} connected.`;
    rememberDesign(); design().wires.push([from, to]);
    designChanged(); renderBoard(); renderRun(); renderSide(); updateWorkbench();
    connectionMessage(message); document.getElementById('connect-btn').focus(); return;
  }
  if (id === 'remove-connection') {
    if (isPlaying()) return;
    rememberDesign(); design().wires.splice(Number(document.getElementById('wire-remove').value), 1);
    S.sel = null; designChanged(); renderBoard(); renderRun(); renderSide(); updateWorkbench();
    connectionMessage('Connection removed.'); document.getElementById('wire-from').focus(); return;
  }
  const port = e.target.closest('[data-port]');
  if (port && e.detail === 0) {
    document.getElementById('connection-tools').open = true;
    document.getElementById('wire-from').value = port.dataset.port;
    document.getElementById('wire-to').focus(); return;
  }
  if (id === 'run-btn') { S.banner = null; renderOverlay(); startRun(); return; }
  if (id === 'submit-btn') { S.banner = null; renderOverlay(); startSubmit(); return; }
  const watch = e.target.closest('[data-watch]');
  if (watch) {
    const t = submission()?.results.find((x) => x.id === watch.dataset.watch);
    if (t && !isPlaying()) watchTest(t);
    return;
  }
  if (id === 'map-open') { if (!isPlaying()) { drawMap(); setTask('map'); } return; }
  const cell = e.target.closest('[data-cell]');
  if (cell) {
    const m = mapMorning(cell.dataset.cell);
    if (m && !isPlaying()) play(key(), simulate(simDesign(design()), m.scenario), false, { scenario: m.scenario, kind: 'test', label: cellLabel(m, world(), S.level) });
    return;
  }
  if (id === 'to-software') { switchScene('software', true); return; }
  if (id === 'banner-ok') { S.banner = null; setTask('predict'); return; }
  if (id === 'hint-btn') { S.hint[key()] = (S.hint[key()] || 0) + 1; renderSide(); updateWorkbench(); return; }
  if (id === 'del-block') {
    if (isPlaying()) return;
    const d = design(), bid = S.sel.id;
    rememberDesign();
    d.blocks = d.blocks.filter((b) => b.id !== bid);
    d.wires = d.wires.filter(([a, b]) => a !== bid && b !== bid);
    S.sel = null; designChanged(); renderBoard(); renderRun(); renderSide(); updateWorkbench(); return;
  }
  if (id === 'del-wire') { rememberDesign(); design().wires.splice(S.sel.i, 1); S.sel = null; designChanged(); renderBoard(); renderRun(); renderSide(); updateWorkbench(); return; }
  if (id === 'replay') { const r = run(); play(key(), r.log, !!r.stale, { scenario: r.scenario, kind: r.kind, label: r.label }); return; }
  const hit = e.target.closest('[data-wire]');
  if (hit) { S.sel = { kind: 'wire', i: +hit.dataset.wire }; renderBoard(); renderSide(); updateWorkbench(); }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'p-tests') { S.subGuess[key()] = t.value; updateRunReadiness(); return; }
  if (t.id === 'p-block' || t.id === 'p-val') {
    const p = S.pred[key()] = S.pred[key()] || {};
    if (t.id === 'p-block') p.block = t.value; else p.value = t.value;
    updateRunReadiness();
    return;
  }
  if (t.id === 'scrub') { run().t = +t.value; renderBoard(); renderRunBody(); return; }
  if (isPlaying() && t.dataset.field) return;
  if (t.dataset.field && S.sel && S.sel.kind === 'block') {
    const b = design().blocks.find((x) => x.id === S.sel.id);
    const k = t.dataset.field;
    if (k === 'name') {
      if (b.names[world()] === t.value) return;
      rememberDesign(`${b.id}:${k}`); b.names[world()] = t.value;
    } else if (k === 'size') {
      if (b.size === t.value) return;
      rememberDesign(`${b.id}:${k}`); b.size = t.value;
    }
    else {
      const def = (FIELDS[b.type] || []).find((x) => x.key === k);
      const s = def.scaled ? W().scale : 1;
      let v = parseFloat(t.value); if (!isFinite(v)) { updateRunReadiness(); return; }
      v = Math.max(def.min, v * s); if (def.int) v = Math.round(v);
      if (b[k] === v) { updateRunReadiness(); return; }
      rememberDesign(`${b.id}:${k}`); b[k] = v;
    }
    designChanged(); renderBoard(); renderRun(); renderConnections(); updateRunReadiness();
    const c = document.getElementById('block-cost'); if (c) c.textContent = W().cost(blockCost(b));
  }
});

document.addEventListener('focusout', (e) => {
  const t = e.target;
  if (!t.matches('[data-field]')) return;
  // A cleared or out-of-range numeric field must not disagree with the design.
  if (t.type === 'number' && S.sel?.kind === 'block') {
    const b = design().blocks.find((x) => x.id === S.sel.id);
    const def = (FIELDS[b?.type] || []).find((x) => x.key === t.dataset.field);
    if (b && def) t.value = +(b[def.key] / (def.scaled ? W().scale : 1)).toFixed(2);
  }
  endDesignEdit(); updateRunReadiness();
});

const point = (e, rect) => ({ x: (e.clientX - rect.left) * 900 / rect.width, y: (e.clientY - rect.top) * 400 / rect.height });

let drag = null;
function cancelDrag() {
  if (!drag && !S.wiring) return;
  if (drag?.kind === 'node' && drag.moved) {
    // Escape cancels just the active gesture and preserves earlier edit history.
    drag.obj.x = drag.startX; drag.obj.y = drag.startY;
  }
  drag = null; S.wiring = null; renderBoard();
}

document.addEventListener('pointercancel', cancelDrag);
window.addEventListener('blur', cancelDrag);
document.addEventListener('pointerdown', (e) => {
  document.querySelectorAll('.chapter-menu[open], #equipment-menu[open], #connection-tools[open]').forEach((menu) => {
    if (!menu.contains(e.target)) menu.open = false;
  });
  const stage = document.getElementById('stage');
  if (!stage.contains(e.target) || isPlaying()) return;
  if (e.target.closest('[data-add], [data-edit-node]')) return;
  endDesignEdit();
  const d = design(), rect = stage.getBoundingClientRect(), pos = point(e, rect);
  const port = e.target.closest('[data-port]');
  if (port) {
    const from = port.dataset.port;
    const src = from === 'traffic' ? d.traffic : d.blocks.find((b) => b.id === from);
    S.wiring = { from, x1: src.x + NODE_W, y1: src.y + 41, x2: pos.x, y2: pos.y };
    drag = { kind: 'wire', rect }; e.preventDefault(); return;
  }
  const node = e.target.closest('[data-node]');
  if (!node) { if (!e.target.closest('[data-wire]')) { S.sel = null; renderBoard(); renderSide(); } return; }
  const id = node.dataset.node;
  const obj = id === 'traffic' ? null : d.blocks.find((b) => b.id === id);
  if (!obj) return;
  drag = { kind: 'node', id, obj, ox: pos.x - obj.x, oy: pos.y - obj.y, rect, moved: false, startX: obj.x, startY: obj.y };
  e.preventDefault();
});

document.addEventListener('pointermove', (e) => {
  if (drag) {
    const pos = point(e, drag.rect);
    if (drag.kind === 'wire') { S.wiring.x2 = pos.x; S.wiring.y2 = pos.y; renderBoard(); return; }
    const nx = Math.max(0, Math.min(900 - NODE_W, pos.x - drag.ox));
    const ny = Math.max(0, Math.min(400 - NODE_H - 40, pos.y - drag.oy));
    if (Math.abs(nx - drag.obj.x) + Math.abs(ny - drag.obj.y) > 3) drag.moved = true;
    if (drag.moved) { drag.obj.x = Math.round(nx / 10) * 10; drag.obj.y = Math.round(ny / 10) * 10; renderBoard(); }
    return;
  }
  const svg = e.target.closest && e.target.closest('.chart svg');
  const r = run();
  if (!svg) { if (S.hoverT !== null) { S.hoverT = null; if (r && r.done) renderRunBody(); } return; }
  if (!r || !r.done) return;
  const t = tickFromPointer(svg, e.clientX);
  if (t !== S.hoverT) { S.hoverT = t; renderRunBody(); }
});

document.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = design();
  if (drag.kind === 'wire') {
    const from = S.wiring.from; S.wiring = null;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const node = under && under.closest('[data-node]');
    if (node && node.dataset.node !== from) {
      const res = canWire(simDesign(d), from, node.dataset.node);
      if (res.ok) { rememberDesign(); d.wires.push([from, node.dataset.node]); designChanged(); renderBoard(); renderRun(); renderSide(); updateWorkbench(); }
      else {
        renderBoard();
        const ft = typeOf(d, from);
        toast(world() === 'cafe' ? (Object.values(REFUSAL).includes(res.reason) ? CAFE_REFUSAL[ft] : cafeWords(res.reason)) : res.reason);
      }
    } else renderBoard();
  } else if (drag.moved) {
    const { obj, startX, startY } = drag, x = obj.x, y = obj.y;
    if (x !== startX || y !== startY) {
      obj.x = startX; obj.y = startY; rememberDesign(); obj.x = x; obj.y = y;
      renderEditTools();
    }
  } else { S.sel = { kind: 'block', id: drag.id }; renderBoard(); renderSide(); updateWorkbench(); }
  drag = null;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.topicsOpen) { if (S.picked) closeTopics(); return; }
  if (e.key === 'Escape') { cancelDrag(); if (S.sel || S.labPhase[key()] !== 'build') setTask('build'); return; }
  const editing = e.target.closest('input, select, textarea, [contenteditable="true"]');
  if (!editing && (e.ctrlKey || e.metaKey) && !e.altKey) {
    const key = e.key.toLowerCase();
    if (key === 'z' || key === 'y') {
      e.preventDefault(); historyAction(key === 'y' || e.shiftKey ? 'redo' : 'undo'); return;
    }
  }
  const node = e.target.matches?.('.node[data-node]') && e.target;
  const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (node && directions[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    if (isPlaying()) return;
    const b = design().blocks.find((item) => item.id === node.dataset.node);
    if (!b) return;
    const [dx, dy] = directions[e.key], step = e.shiftKey ? 50 : 10;
    const x = Math.max(0, Math.min(900 - NODE_W, b.x + dx * step));
    const y = Math.max(0, Math.min(400 - NODE_H - 40, b.y + dy * step));
    if (x === b.x && y === b.y) return;
    rememberDesign(`move:${b.id}`); b.x = x; b.y = y;
    renderBoard(); renderEditTools();
    document.querySelector(`[data-node="${b.id}"]`).focus({ preventScroll: true });
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.node[data-node]') && e.target.dataset.node !== 'traffic') {
    if (e.target !== e.target.closest('.node')) return;
    S.sel = { kind: 'block', id: e.target.dataset.node }; renderBoard(); renderSide(); updateWorkbench();
    document.querySelector('#side .field-row [data-field]')?.focus(); e.preventDefault();
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key.startsWith('Arrow')) endDesignEdit();
});

document.addEventListener('toggle', (e) => {
  if (e.target.id === 'analysis-drawer' && e.target.open) renderRunBody();
  if (e.target.matches('.chapter-menu, #equipment-menu, #connection-tools') && e.target.open) {
    document.querySelectorAll('.chapter-menu, #equipment-menu, #connection-tools').forEach((menu) => { if (menu !== e.target) menu.open = false; });
  }
}, true);

let rz = null, cameraWidth = window.innerWidth;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { sizeCanvas(); if (window.innerWidth !== cameraWidth) { cameraWidth = window.innerWidth; fitFloor(); } renderRunBody(); }, 120); });

document.addEventListener('visibilitychange', () => {
  if (document.hidden && isPlaying()) {
    run().paused = true; run().lastFrame = performance.now(); fx.playing = false;
    renderSide(); updateWorkbench();
  }
});

startFx(document.getElementById('fx'));
renderAll();
