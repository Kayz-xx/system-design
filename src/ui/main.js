// Entry point: header, palette, actions and input handling. Wires the render registry R.
import { simulate, validate, canWire, blockCost, REFUSAL } from '../sim/sim.js';
import { LEVELS, TRACKS, UPCOMING } from '../levels/levels.js';
import { grade } from '../levels/grade.js';
import { S, R, L, W, world, key, scene, design, run, attempts, typeOf, simDesign, stars, chapterDone, nameOf, clone, esc, reducedMotion, rememberDesign, endDesignEdit, historyStatus, restoreDesign, resetDesign, advancePlayback, starterOf, submission } from './state.js';
import { WORLDS, FIELDS, DEFAULTS, CAFE_REFUSAL, cafeWords, icon } from './worlds.js';
import { renderBoard as drawBoard, renderOverlay, NODE_W, NODE_H } from './board.js';
import { fx, SPEED, startFx, sizeCanvas, resetFx, invalidateColors } from './fx.js';
import { renderRun, renderRunBody, tickFromPointer } from './run-panel.js';
import { renderSide, predScale, predError } from './coach.js';
import { drawMap, mapMorning, cellLabel } from './survival-panel.js';
import { rememberSuggest } from './best-panel.js';
import { askReview } from '../ai/tutor.js';
import { connectionGuide, applyConnectionPlan } from './build-guide.js';

/* ---------- Header and palette ---------- */
function renderTabs() {
  document.getElementById('day-label').textContent = `${world() === 'cafe' ? 'Day' : 'Lab'} ${L().n} · ${L().firstScene === 'software' && world() === 'software' ? scene().title : L().name}`;
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
  brand.innerHTML = `<img class="brand-logo" src="assets/brand/acumen-pixel.png" width="56" height="56" alt=""><b>Acumen <em>${cafe ? 'Café' : 'Lab'}</em></b>`;
  brand.setAttribute('aria-label', `Acumen ${cafe ? 'Café' : 'Lab'} home`);
  document.title = cafe ? 'Acumen Café' : 'Acumen Lab';
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
// The first screen. Chapters are listed by track straight from the level data, so a new chapter only
// needs a `track`, a `hook` and a `topic` in levels.js. The panel beside the list shows the chosen one.
const PRINCIPLE_NAME = { scaling: 'Scaling', redundancy: 'Redundancy', caching: 'Caching', async: 'Queues' };

function progressOf(l) {
  const st = stars(l.id), done = chapterDone(l);
  const label = done ? 'Done' : st.some(Boolean) ? 'In progress' : l.capstone && !LEVELS.filter((x) => x.track === 'foundations').every(chapterDone) ? 'Best after Foundations' : 'Not started';
  return { st, done, label };
}

// A chapter we have not built yet: what it will teach and which foundations it combines, with no Start.
function soonDetailHtml(u) {
  const ready = u.principles.map((x) => LEVELS.find((l) => l.track === 'foundations' && l.principles?.length === 1 && l.principles[0] === x));
  return `<div class="topic-detail-head"><span class="topic-kicker">${esc(TRACKS.find((x) => x.id === u.track).name)}</span><span class="topic-status soon">Coming soon</span></div>
    <h2 id="topic-detail-title">${esc(u.name)}</h2>
    <p class="topic-idea">${esc(u.idea)}</p>
    <dl class="topic-facts"><dt>Uses</dt><dd class="chips">${u.principles.map((x, i) => `<span>${esc(PRINCIPLE_NAME[x])}${ready[i] && chapterDone(ready[i]) ? ' ✓' : ''}</span>`).join('')}</dd><dt>Opens in</dt><dd>Software lab</dd></dl>
    <button class="btn primary" disabled>Coming soon</button>`;
}

function topicDetailHtml(l) {
  if (!l.scenes) return soonDetailHtml(l);
  const t = l.topic, p = progressOf(l), sw = l.firstScene === 'software';
  const opensIn = sw ? 'Software lab' : 'Coffee shop, then software';
  const pairs = l.capstone
    ? `<dl class="topic-facts"><dt>Uses</dt><dd class="chips">${l.principles.map((x) => `<span>${esc(PRINCIPLE_NAME[x])}</span>`).join('')}</dd><dt>Opens in</dt><dd>${opensIn}</dd><dt>Trade-off</dt><dd>${esc(t.tradeoff.software)}</dd></dl>`
    : `<dl class="topic-facts"><dt>In the café</dt><dd>${esc(t.tool.cafe)}</dd><dt>In software</dt><dd>${esc(t.tool.software)}</dd><dt>Trade-off</dt><dd>${esc(t.tradeoff.software)}</dd></dl>`;
  return `<div class="topic-detail-head"><span class="topic-kicker">${esc(TRACKS.find((x) => x.id === l.track).name)} · ${String(l.n).padStart(2, '0')}</span><span class="topic-status${p.done ? ' done' : ''}">${esc(p.label)} · ${p.st.filter(Boolean).length}/3 ★</span></div>
    <h2 id="topic-detail-title">${esc(t.name)}</h2>
    <p class="topic-idea">${esc(t.idea.software)}</p>
    ${pairs}
    <button class="btn primary" data-topic="${l.id}">${p.done ? 'Play again' : p.st.some(Boolean) ? 'Continue' : 'Start'}: ${esc(sw ? l.scenes.software.title : l.name)} →</button>`;
}

export function topicCardsHtml(sel) {
  return TRACKS.map((tr) => {
    const items = LEVELS.filter((l) => l.track === tr.id);
    if (!items.length) return '';
    const done = items.filter(chapterDone).length;
    const rows = items.map((l) => {
      const p = progressOf(l);
      return `<li><button class="topic-row${l.id === sel ? ' sel' : ''}${p.done ? ' done' : ''}" data-topic-pick="${l.id}" aria-pressed="${l.id === sel}">
          <span class="topic-num">${p.done ? '✓' : String(l.n).padStart(2, '0')}</span>
          <span class="topic-text"><b>${esc(l.topic.name)}</b><small>${esc(l.hook)}</small></span>
          <span class="topic-stars" aria-label="${p.st.filter(Boolean).length} of 3 stars">${p.st.map((x) => (x ? '★' : '☆')).join('')}</span>
        </button></li>`;
    }).join('') + UPCOMING.filter((u) => u.track === tr.id).map((u) => `<li><button class="topic-row soon${u.id === sel ? ' sel' : ''}" data-topic-pick="${u.id}" aria-pressed="${u.id === sel}">
          <span class="topic-num" aria-hidden="true">·</span>
          <span class="topic-text"><b>${esc(u.name)}</b><small>${esc(u.hook)}</small></span>
          <span class="topic-tag">Soon</span>
        </button></li>`).join('');
    return `<section class="track" aria-labelledby="track-${tr.id}"><div class="track-head"><h2 id="track-${tr.id}">${esc(tr.name)}</h2><span>${done} of ${items.length} done</span></div><p class="track-blurb">${esc(tr.blurb)}</p><ol class="topic-list">${rows}</ol></section>`;
  }).join('');
}

function renderTopics() {
  const el = document.getElementById('topics');
  el.hidden = !S.topicsOpen;
  document.getElementById('app').inert = S.topicsOpen;
  // Home always wears the café look, whatever chapter was open last; a chapter brings its own look back.
  const look = S.topicsOpen ? 'cafe' : world();
  if (document.documentElement.getAttribute('data-world') !== look) {
    document.documentElement.setAttribute('data-world', look);
    invalidateColors(); // the dots canvas caches the theme's colours
  }
  if (!S.topicsOpen) return;
  const sel = [...LEVELS, ...UPCOMING].find((l) => l.id === S.topicSel) || LEVELS.find((l) => !chapterDone(l)) || LEVELS[0];
  el.innerHTML = `<section class="topics-panel" role="dialog" aria-modal="true" aria-labelledby="topics-title">
      <header class="topics-head">
        <div class="topics-brand"><img class="topics-logo" src="assets/brand/acumen-pixel.png" width="96" height="96" alt=""><div><p class="eyebrow">Acumen</p><h1 id="topics-title">What do you want to learn?</h1></div></div>
        ${S.picked ? '<button class="icon-btn close" id="topics-close" aria-label="Back to the chapter">×</button>' : ''}
      </header>
      <div class="topics-body">
        <nav class="topics-nav" aria-label="Chapters">${topicCardsHtml(sel.id)}</nav>
        <article class="topic-detail" aria-live="polite" aria-labelledby="topic-detail-title">${topicDetailHtml(sel)}</article>
      </div>
    </section>`;
}

function closeTopics() {
  S.topicsOpen = false;
  renderTopics();
  document.getElementById('topics-open').focus({ preventScroll: true });
}

// The board is a 900 x 400 box, but blocks may be dragged anywhere in the visible frame around it. The
// stage space grows by the overhang on both sides, so the layout stays centred and blocks outside the box
// are still drawn, scrollable and inside Fit view.
function syncExtent() {
  const d = design(), items = [d.traffic, ...d.blocks].filter(Boolean);
  const e = Math.ceil(Math.max(0, ...items.map((b) => -b.x), ...items.map((b) => b.x + NODE_W - 900)));
  if (e === fx.extra) return;
  fx.extra = e;
  document.getElementById('stage-space').style.setProperty('--extra', e + 'px');
  sizeCanvas();
}

// Where a block may go across. The café floor is drawn as the 900px room, so blocks stay inside it. The
// software grid fills the whole frame, so there a block may go anywhere in it (less a small margin), and
// never less than the box or what the board already holds.
function xBounds() {
  if (world() === 'cafe') return [0, 900 - NODE_W];
  const view = document.querySelector('.board-scroll'), st = document.getElementById('stage');
  const a = view.getBoundingClientRect(), b = st.getBoundingClientRect(), z = b.width / 900 || 1;
  const lo = Math.min(0, -fx.extra, (a.left - b.left) / z + 8);
  const hi = Math.max(900, 900 + fx.extra, (a.left + view.clientWidth - b.left) / z - 8);
  return [lo, hi - NODE_W];
}

let cameraReady = false;
function fitFloor(force = false) {
  const view = document.getElementById('board-scroll') || document.querySelector('.board-scroll');
  if (!view) return;
  syncExtent();
  const fitted = Math.min(1.1, view.clientWidth / (900 + 2 * fx.extra), Math.max(180, view.clientHeight) / 400);
  S.zoom = force ? fitted : Math.max(view.clientWidth < 700 ? .68 : .8, fitted);
  document.getElementById('stage-space').style.setProperty('--zoom', S.zoom);
  cameraReady = true;
}

function setTask(phase) {
  S.labPhase[key()] = phase; S.sel = null; S.banner = null;
  if (phase === 'predict') S.explore[key()] = false;
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
    && String(p.value ?? '0').trim() !== '' && Number.isFinite(Number(p.value ?? 0)) && Number(p.value ?? 0) >= 0
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
  syncExtent(); // after every drop, undo and level switch; not while dragging, so the stage never shifts mid-drag
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
  S.guidanceDismissed[key()] = false; S.explore[key()] = false;
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
  if (isPlaying()) return;
  const d = design();
  document.getElementById('equipment-menu').open = false;
  const n = d.blocks.filter((b) => b.type === type).length;
  const names = {};
  Object.keys(WORLDS).forEach((x) => { names[x] = WORLDS[x].defaultName[type] + (n ? ' ' + (n + 1) : ''); });
  const id = type.slice(0, 2) + (S.seq++) + 'x';
  const k = d.blocks.length;
  const width = Math.max(NODE_W, 150 / S.zoom), height = 78 + 85 / Math.min(1, S.zoom);
  const positions = [650, 210, 430].flatMap((x) => [20, 210].map((y) => ({ x, y })));
  const position = positions.find(({ x, y }) => ![d.traffic, ...d.blocks].some((b) =>
    Math.abs((x + NODE_W / 2) - (b.x + NODE_W / 2)) < width + 12 && Math.abs(y - b.y) < height + 12))
    || { x: 230 + (k * 80) % 480, y: 30 + (k * 100) % 260 };
  rememberDesign();
  d.blocks.push(Object.assign({ id, type, names, ...position }, clone(DEFAULTS[type])));
  S.sel = null; S.buildFocus[key()] = id;
  designChanged(); renderBoard(); renderRun(); renderSide(); updateWorkbench();
  const placed = document.querySelector(`[data-node="${id}"]`);
  placed?.focus({ preventScroll: true });
  placed?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function inspectEquipment(id) {
  S.sel = null; S.buildFocus[key()] = id; S.guidanceDismissed[key()] = false;
  S.labPhase[key()] = 'build';
  renderBoard(); renderSide(); updateWorkbench();
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
  const guess = parseFloat(p.value ?? '0');
  const actualBlock = log.result.firstFailure ? log.result.firstFailure.block : 'none';
  attempts().push({ guessBlock: p.block, actualBlock, blockRight: p.block === actualBlock, guess, actual, err: predError(guess, actual), passed: log.result.passed });
  S.pred[key()] = {}; S.hint[key()] = 0; S.sel = null; S.buildFocus[key()] = null; S.labPhase[key()] = 'review';
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

// The interview step: send the learner's explanation of a passing design to be checked against the simulator.
// The result is kept on the submission, so a new Submit starts a fresh one.
function sendExplanation() {
  const sub = submission();
  if (!sub || !sub.accepted) return;
  const text = ((document.getElementById('explain-text') || {}).value || '').trim();
  if (text.length < 20) {
    const note = document.getElementById('explain-note');
    if (note) note.textContent = 'A couple of sentences, please.';
    return;
  }
  sub.explain = { status: 'loading', text };
  renderSide();
  const d = design();
  askReview({ world: world(), level: S.level, design: { blocks: d.blocks, wires: d.wires }, explanation: text }).then((out) => {
    if (submission() !== sub) return;
    sub.explain = out.ok ? { status: 'done', text, review: out } : { status: 'error', text };
    renderSide();
  });
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
    S.banner = null;
    S.labPhase[key()] = 'build'; S.buildFocus[key()] = null;
    S.explore[key()] = name === 'software';
    renderAll();
    document.getElementById('main').focus({ preventScroll: true });
    requestAnimationFrame(() => app.classList.remove('morph'));
  };
  if (animate && !reducedMotion()) { app.classList.add('morph'); sceneTransitionTimer = setTimeout(go, 300); }
  else go();
}

/* ---------- Input ---------- */
document.addEventListener('click', (e) => {
  const action = e.target.closest('button');
  if (action && action.disabled) return;
  const pick = e.target.closest('[data-topic-pick]');
  if (pick) {
    S.topicSel = pick.dataset.topicPick; renderTopics();
    document.querySelector(`[data-topic-pick="${S.topicSel}"]`)?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 700px)').matches) document.querySelector('.topic-detail')?.scrollIntoView({ block: 'nearest' });
    return;
  }
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
  if (action?.id === 'topics-open' || action?.hasAttribute('data-open-topics')) { if (!isPlaying()) { S.topicsOpen = true; renderTopics(); document.querySelector('.topic-row.sel')?.focus(); } return; }
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
  if (id === 'guide-connect') {
    if (isPlaying()) return;
    const guide = connectionGuide(simDesign(design()), S.buildFocus[key()]);
    const plan = guide?.plans[Number(document.getElementById('guide-choice')?.value || 0)];
    const next = applyConnectionPlan(simDesign(design()), plan);
    if (!next) { renderSide(); return; }
    rememberDesign(); design().wires = next.wires;
    S.sel = null;
    designChanged(); renderBoard(); renderRun(); renderSide(); updateWorkbench();
    document.getElementById('guide-connect')?.focus({ preventScroll: true });
    return;
  }
  if (id === 'guide-dismiss') {
    S.guidanceDismissed[key()] = true; S.buildFocus[key()] = null;
    renderBoard(); renderSide(); updateWorkbench();
    document.getElementById('main').focus({ preventScroll: true }); return;
  }
  if (id === 'connections-open') {
    document.getElementById('connection-tools').open = true;
    document.getElementById('wire-from').focus(); return;
  }
  if (id === 'translation-open') {
    S.banner = S.level; renderOverlay();
    document.getElementById('banner-ok')?.focus({ preventScroll: true }); return;
  }
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
  if (id === 'explain-send') { sendExplanation(); return; }
  if (id === 'explain-skip') { const sub = submission(); if (sub) { sub.explain = { status: 'skipped' }; renderSide(); } return; }
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
  if (id === 'banner-ok') { S.banner = null; setTask('build'); document.getElementById('main').focus({ preventScroll: true }); return; }
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
  if (t.id === 'explain-text') { const sub = submission(); if (sub) sub.explain = { status: 'ask', text: t.value }; return; }
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
      v = Math.min(def.max ?? Infinity, Math.max(def.min, v * s)); if (def.int) v = Math.round(v);
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
  // The café's door is part of the room drawing, so it stays put; in the lab, Requests moves like any node.
  const obj = id === 'traffic' ? (world() === 'cafe' ? null : d.traffic) : d.blocks.find((b) => b.id === id);
  if (!obj) return;
  drag = { kind: 'node', id, obj, ox: pos.x - obj.x, oy: pos.y - obj.y, rect, moved: false, startX: obj.x, startY: obj.y };
  e.preventDefault();
});

document.addEventListener('pointermove', (e) => {
  if (drag) {
    const pos = point(e, drag.rect);
    if (drag.kind === 'wire') { S.wiring.x2 = pos.x; S.wiring.y2 = pos.y; renderBoard(); return; }
    const [x0, x1] = drag.xb || (drag.xb = xBounds());
    const nx = Math.max(x0, Math.min(x1, pos.x - drag.ox));
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
  } else if (drag.id !== 'traffic') inspectEquipment(drag.id);
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
    const nid = node.dataset.node;
    const b = nid === 'traffic' ? (world() === 'cafe' ? null : design().traffic) : design().blocks.find((item) => item.id === nid);
    if (!b) return;
    const [dx, dy] = directions[e.key], step = e.shiftKey ? 50 : 10;
    const [x0, x1] = xBounds();
    const x = Math.max(x0, Math.min(x1, b.x + dx * step));
    const y = Math.max(0, Math.min(400 - NODE_H - 40, b.y + dy * step));
    if (x === b.x && y === b.y) return;
    rememberDesign(`move:${nid}`); b.x = x; b.y = y;
    renderBoard(); renderEditTools();
    document.querySelector(`[data-node="${nid}"]`).focus({ preventScroll: true });
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.node[data-node]') && e.target.dataset.node !== 'traffic') {
    if (e.target !== e.target.closest('.node')) return;
    const id = e.target.dataset.node;
    inspectEquipment(id);
    document.getElementById('guide-connect')?.focus({ preventScroll: true }); e.preventDefault();
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key.startsWith('Arrow')) endDesignEdit();
});

document.addEventListener('toggle', (e) => {
  if (e.target.classList && e.target.classList.contains('suggest')) {
    rememberSuggest(e.target.open);
    if (e.target.open) e.target.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
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
