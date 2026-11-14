// Entry point: header, palette, actions and input handling. Wires the render registry R.
import { simulate, validate, canWire, blockCost, REFUSAL } from '../sim/sim.js';
import { LEVELS } from '../levels/levels.js';
import { S, R, L, W, world, key, scene, design, run, attempts, typeOf, simDesign, stars, nameOf, clone, esc, reducedMotion, rememberDesign, endDesignEdit, historyStatus, restoreDesign, resetDesign, playbackTick } from './state.js';
import { WORLDS, FIELDS, DEFAULTS, CAFE_REFUSAL, cafeWords, icon } from './worlds.js';
import { renderBoard as drawBoard, renderOverlay, NODE_W, NODE_H } from './board.js';
import { fx, SPEED, startFx, sizeCanvas, resetFx, invalidateColors } from './fx.js';
import { renderRun, renderRunBody, tickFromPointer } from './run-panel.js';
import { renderSide, predScale, predError } from './coach.js';

/* ---------- Header and palette ---------- */
function renderTabs() {
  document.getElementById('tabs').innerHTML = LEVELS.map((l) => {
    const st = stars(l.id);
    return `<button class="tab" ${S.level === l.id ? 'aria-current="page"' : ''} data-level="${l.id}"><span class="chapter-number">${String(l.n).padStart(2, '0')}</span><span class="chapter-copy"><b>${esc(l.name)}</b><small>${esc(l.concept)}</small></span><span class="stars" aria-label="${st.filter(Boolean).length} of 3 stars">${st.map((s) => `<span class="${s ? '' : 'off'}">★</span>`).join('')}</span></button>`;
  }).join('');
  const earned = LEVELS.flatMap((l) => stars(l.id)).filter(Boolean).length;
  document.getElementById('progress').textContent = `★ ${earned} / ${LEVELS.length * 3} stars`;
}

function renderPalette() {
  const w = world(), Wd = W();
  const costOf = (type) => Wd.cost(blockCost(Object.assign({ type, copies: 1 }, DEFAULTS[type])));
  const row = (type) => `<button class="pal-btn" data-add="${type}">${icon(w, type)}<span class="t">${esc(Wd.palette[type])}<small>${costOf(type)}</small></span></button>`;
  document.getElementById('pal').innerHTML = `<div class="label">${w === 'cafe' ? 'Hire and buy' : 'Blocks'}</div>
    ${row('server')}${row('loadBalancer')}${row('cache')}${row('database')}
    <button class="pal-btn" disabled title="Level 4, on the roadmap">${icon(w, 'loadBalancer')}<span class="t">${esc(Wd.palette.queue)}<small>Level 4</small></span></button>
    <p class="pal-note" id="board-help">Choose equipment to add it. Drag its right dot to connect, or use the connection menu below. On focused equipment: Enter opens settings; arrow keys move it.</p>`;
}

// Keep keyboard focus on the same equipment while board markup is refreshed.
function renderBoard() {
  const active = document.activeElement;
  const nodeId = active?.matches('.node[data-node]') ? active.dataset.node : null;
  const portId = active?.dataset.port;
  drawBoard();
  document.querySelectorAll('.node[data-node]:not(.traffic)').forEach((node) => {
    node.setAttribute('role', 'group');
    node.setAttribute('aria-describedby', 'board-help');
    node.setAttribute('aria-keyshortcuts', 'Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight');
  });
  document.querySelectorAll('[data-port]').forEach((port) => { port.disabled = isPlaying(); });
  if (portId) document.querySelector(`[data-port="${portId}"]`)?.focus({ preventScroll: true });
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

function renderEditTools() {
  const h = historyStatus(), playing = isPlaying();
  document.getElementById('undo-design').disabled = playing || !h.undo;
  document.getElementById('redo-design').disabled = playing || !h.redo;
  document.getElementById('reset-design').disabled = playing || JSON.stringify(design()) === JSON.stringify(L().design);
  document.getElementById('reset-design').textContent = world() === 'cafe' ? 'Reset shop' : 'Reset design';
}

function updateRunReadiness() {
  const ready = predictionReady(), playing = isPlaying();
  const btn = document.getElementById('run-btn'); if (btn) btn.disabled = playing || !ready;
  const note = document.getElementById('ready-note');
  if (note) note.textContent = ready ? '' : 'Finish your settings and commit to a guess first.';
}

function updateWorkbench() {
  renderConnections(); renderEditTools();
  const playing = isPlaying();
  document.querySelectorAll('[data-add], #connection-body button, #connection-body select, [data-field], #del-block, #del-wire').forEach((el) => {
    el.disabled = playing || (el.id === 'connect-btn' && !design().blocks.length);
  });
  updateRunReadiness();
  document.querySelector('.board-key span').innerHTML = `<i class="key-dot"></i> ${world() === 'cafe' ? 'Customers' : 'Requests'} follow the connections`;
}

function renderAll() {
  const focusedId = document.activeElement?.id;
  document.documentElement.setAttribute('data-world', world());
  fx.playing = isPlaying();
  invalidateColors();
  renderTabs(); renderPalette(); renderBoard(); renderOverlay(); renderRun(); renderSide(); updateWorkbench();
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
  S.problems[key()] = [];
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
  toast(action === 'reset' ? 'Starting design restored. Undo brings your changes back.' : action === 'undo' ? 'Design edit undone.' : 'Design edit restored.');
  const focus = document.getElementById(action === 'reset' ? 'undo-design' : `${action}-design`);
  if (focus && !focus.disabled) focus.focus({ preventScroll: true });
  else document.getElementById(action === 'redo' ? 'undo-design' : 'redo-design')?.focus({ preventScroll: true });
}

function addBlock(type) {
  const d = design();
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
  S.pred[key()] = {}; S.hint[key()] = 0; S.sel = null;
  play(key(), log);
}

function play(k, log, stale = false) {
  const r = { log, t: 0, done: false, stale };
  S.runs[k] = r; S.hoverT = null;
  resetFx();
  const N = log.ticks.length;
  renderBoard(); renderRun(); renderSide(); updateWorkbench();
  if (reducedMotion()) { r.t = N - 1; r.done = true; renderAll(); return; }
  fx.playing = true;
  const start = performance.now();
  function step(now) {
    if (S.runs[k] !== r) return;
    r.t = playbackTick(now, start, SPEED, N);
    if (key() === k) { renderBoard(); renderRunBody(); }
    if (r.t < N - 1) requestAnimationFrame(step);
    else { r.done = true; if (key() === k) renderAll(); else renderTabs(); }
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
  const lvBtn = e.target.closest('[data-level]');
  if (lvBtn) {
    cancelSceneTransition(); cancelDrag(); endDesignEdit();
    S.level = lvBtn.dataset.level; S.sel = null; S.hoverT = null; S.banner = null; resetFx(); renderAll();
    document.querySelector(`.tab[data-level="${S.level}"]`).focus({ preventScroll: true }); return;
  }
  const sb = e.target.closest('[data-scene]');
  if (sb) { switchScene(sb.dataset.scene, sb.dataset.scene === 'software'); return; }
  const add = e.target.closest('[data-add]');
  if (add) { addBlock(add.dataset.add); return; }
  const id = action?.id || e.target.id;
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
  if (id === 'to-software') { switchScene('software', true); return; }
  if (id === 'banner-ok') { S.banner = null; renderOverlay(); const pv = document.getElementById('p-val'); if (pv) pv.focus(); return; }
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
  if (id === 'replay') { play(key(), run().log, !!run().stale); return; }
  const hit = e.target.closest('[data-wire]');
  if (hit) { S.sel = { kind: 'wire', i: +hit.dataset.wire }; renderBoard(); renderSide(); updateWorkbench(); }
});

document.addEventListener('input', (e) => {
  const t = e.target;
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
  const stage = document.getElementById('stage');
  if (!stage.contains(e.target) || isPlaying()) return;
  endDesignEdit();
  const d = design(), rect = stage.getBoundingClientRect();
  const port = e.target.closest('[data-port]');
  if (port) {
    const from = port.dataset.port;
    const src = from === 'traffic' ? d.traffic : d.blocks.find((b) => b.id === from);
    S.wiring = { from, x1: src.x + NODE_W, y1: src.y + 41, x2: e.clientX - rect.left, y2: e.clientY - rect.top };
    drag = { kind: 'wire', rect }; e.preventDefault(); return;
  }
  const node = e.target.closest('[data-node]');
  if (!node) { if (!e.target.closest('[data-wire]')) { S.sel = null; renderBoard(); renderSide(); } return; }
  const id = node.dataset.node;
  const obj = id === 'traffic' ? null : d.blocks.find((b) => b.id === id);
  if (!obj) return;
  drag = { kind: 'node', id, obj, ox: e.clientX - rect.left - obj.x, oy: e.clientY - rect.top - obj.y, rect, moved: false, startX: obj.x, startY: obj.y };
  e.preventDefault();
});

document.addEventListener('pointermove', (e) => {
  if (drag) {
    if (drag.kind === 'wire') { S.wiring.x2 = e.clientX - drag.rect.left; S.wiring.y2 = e.clientY - drag.rect.top; renderBoard(); return; }
    const nx = Math.max(0, Math.min(900 - NODE_W, e.clientX - drag.rect.left - drag.ox));
    const ny = Math.max(0, Math.min(400 - NODE_H - 40, e.clientY - drag.rect.top - drag.oy));
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
  if (e.key === 'Escape') { cancelDrag(); return; }
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
    document.getElementById('f-name')?.focus(); e.preventDefault();
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key.startsWith('Arrow')) endDesignEdit();
});

let rz = null;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { sizeCanvas(); renderRunBody(); }, 120); });

startFx(document.getElementById('fx'));
renderAll();
