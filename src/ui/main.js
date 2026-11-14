// Entry point: header, palette, actions and input handling. Wires the render registry R.
import { simulate, validate, canWire, blockCost, REFUSAL } from '../sim/sim.js';
import { LEVELS } from '../levels/levels.js';
import { S, R, L, W, world, key, scene, design, run, attempts, typeOf, simDesign, stars, clone, esc, reducedMotion } from './state.js';
import { WORLDS, FIELDS, DEFAULTS, CAFE_REFUSAL, cafeWords, icon } from './worlds.js';
import { renderBoard, renderOverlay, NODE_W, NODE_H } from './board.js';
import { fx, SPEED, startFx, sizeCanvas, resetFx, invalidateColors } from './fx.js';
import { renderRun, renderRunBody, tickFromPointer } from './run-panel.js';
import { renderSide, predScale, predError } from './coach.js';

/* ---------- Header and palette ---------- */
function renderTabs() {
  document.getElementById('tabs').innerHTML = LEVELS.map((l) => {
    const st = stars(l.id);
    return `<button class="tab" role="tab" aria-selected="${S.level === l.id}" data-level="${l.id}"><small>L${l.n}</small>${esc(l.name)}<span class="stars" aria-label="${st.filter(Boolean).length} of 3 stars">${st.map((s) => `<span class="${s ? '' : 'off'}">★</span>`).join('')}</span></button>`;
  }).join('');
}

function renderPalette() {
  const w = world(), Wd = W();
  const costOf = (type) => Wd.cost(blockCost(Object.assign({ type, copies: 1 }, DEFAULTS[type])));
  const row = (type) => `<button class="pal-btn" data-add="${type}">${icon(w, type)}<span class="t">${esc(Wd.palette[type])}<small>${costOf(type)}</small></span></button>`;
  document.getElementById('pal').innerHTML = `<div class="label">${w === 'cafe' ? 'Hire and buy' : 'Blocks'}</div>
    ${row('server')}${row('loadBalancer')}${row('cache')}${row('database')}${row('queue')}
    <p class="pal-note">Click to add. Drag from a block’s right dot to connect it. Only connections that make sense will snap.</p>`;
}

function renderAll() {
  document.documentElement.setAttribute('data-world', world());
  invalidateColors();
  renderTabs(); renderPalette(); renderBoard(); renderOverlay(); renderRun(); renderSide();
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

function designChanged() { const r = run(); if (r && r.done) r.stale = true; S.problems[key()] = []; }

function addBlock(type) {
  const d = design();
  const n = d.blocks.filter((b) => b.type === type).length;
  const names = {};
  Object.keys(WORLDS).forEach((x) => { names[x] = WORLDS[x].defaultName[type] + (n ? ' ' + (n + 1) : ''); });
  const id = type.slice(0, 2) + (S.seq++) + 'x';
  const k = d.blocks.length;
  d.blocks.push(Object.assign({ id, type, names, x: 230 + (k * 80) % 480, y: 30 + (k * 100) % 260 }, clone(DEFAULTS[type])));
  S.sel = { kind: 'block', id };
  designChanged(); renderBoard(); renderSide();
}

function startRun() {
  const sn = scene(), sd = simDesign(design());
  let problems = validate(sd);
  if (world() === 'cafe') problems = problems.map(cafeWords);
  S.problems[key()] = problems;
  if (problems.length) { renderSide(); return; }
  const p = S.pred[key()];
  const log = simulate(sd, sn.scenario);
  const actual = log.metrics[sn.predict.key] / predScale();
  const guess = parseFloat(p.value);
  const actualBlock = log.result.firstFailure ? log.result.firstFailure.block : 'none';
  attempts().push({ guessBlock: p.block, actualBlock, blockRight: p.block === actualBlock, guess, actual, err: predError(guess, actual), passed: log.result.passed });
  S.pred[key()] = {}; S.hint[key()] = 0; S.sel = null;
  play(key(), log);
}

function play(k, log) {
  const r = { log, t: 0, done: false };
  S.runs[k] = r; S.hoverT = null;
  resetFx();
  const N = log.ticks.length;
  renderBoard(); renderRun(); renderSide();
  if (reducedMotion()) { r.t = N - 1; r.done = true; renderAll(); return; }
  fx.playing = true;
  const start = performance.now();
  function step(now) {
    if (S.runs[k] !== r) return;
    r.t = Math.min(N - 1, Math.floor(((now - start) / 1000) * SPEED));
    if (key() === k) { renderBoard(); renderRunBody(); }
    if (r.t < N - 1) requestAnimationFrame(step);
    else { r.done = true; fx.playing = false; if (key() === k) renderAll(); else renderTabs(); }
  }
  requestAnimationFrame(step);
}

function switchScene(name, animate) {
  if (world() === name) return;
  const app = document.getElementById('app');
  const go = () => {
    S.scene[S.level] = name; S.sel = null; S.hoverT = null; resetFx(); fx.playing = false;
    if (name === 'software' && animate) S.banner = S.level;
    renderAll();
    requestAnimationFrame(() => app.classList.remove('morph'));
  };
  if (animate && !reducedMotion()) { app.classList.add('morph'); setTimeout(go, 300); }
  else go();
}

/* ---------- Input ---------- */
document.addEventListener('click', (e) => {
  const lvBtn = e.target.closest('[data-level]');
  if (lvBtn) { S.level = lvBtn.dataset.level; S.sel = null; S.hoverT = null; S.banner = null; resetFx(); renderAll(); return; }
  const sb = e.target.closest('[data-scene]');
  if (sb) { switchScene(sb.dataset.scene, sb.dataset.scene === 'software'); return; }
  const add = e.target.closest('[data-add]');
  if (add) { addBlock(add.dataset.add); return; }
  const id = e.target.id;
  if (id === 'run-btn') { S.banner = null; renderOverlay(); startRun(); return; }
  if (id === 'to-software') { switchScene('software', true); return; }
  if (id === 'banner-ok') { S.banner = null; renderOverlay(); const pv = document.getElementById('p-val'); if (pv) pv.focus(); return; }
  if (id === 'hint-btn') { S.hint[key()] = (S.hint[key()] || 0) + 1; renderSide(); return; }
  if (id === 'del-block') {
    const d = design(), bid = S.sel.id;
    d.blocks = d.blocks.filter((b) => b.id !== bid);
    d.wires = d.wires.filter(([a, b]) => a !== bid && b !== bid);
    S.sel = null; designChanged(); renderBoard(); renderRun(); renderSide(); return;
  }
  if (id === 'del-wire') { design().wires.splice(S.sel.i, 1); S.sel = null; designChanged(); renderBoard(); renderRun(); renderSide(); return; }
  if (id === 'replay') { play(key(), run().log); return; }
  const hit = e.target.closest('[data-wire]');
  if (hit) { S.sel = { kind: 'wire', i: +hit.dataset.wire }; renderBoard(); renderSide(); }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'p-block' || t.id === 'p-val') {
    const p = S.pred[key()] = S.pred[key()] || {};
    if (t.id === 'p-block') p.block = t.value; else p.value = t.value;
    const ready = p.block && p.value !== undefined && p.value !== '';
    const btn = document.getElementById('run-btn'); if (btn) btn.disabled = !ready;
    const note = document.getElementById('ready-note'); if (note) note.textContent = ready ? '' : 'Commit to a guess first.';
    return;
  }
  if (t.id === 'scrub') { run().t = +t.value; renderBoard(); renderRunBody(); return; }
  if (t.dataset.field && S.sel && S.sel.kind === 'block') {
    const b = design().blocks.find((x) => x.id === S.sel.id);
    const k = t.dataset.field;
    if (k === 'name') b.names[world()] = t.value;
    else if (k === 'size') b.size = t.value;
    else {
      const def = (FIELDS[b.type] || []).find((x) => x.key === k);
      const s = def.scaled ? W().scale : 1;
      let v = parseFloat(t.value); if (!isFinite(v)) return;
      v = Math.max(def.min, v * s); if (def.int) v = Math.round(v);
      b[k] = v;
    }
    designChanged(); renderBoard(); renderRun();
    const c = document.getElementById('block-cost'); if (c) c.textContent = W().cost(blockCost(b));
  }
});

let drag = null;
document.addEventListener('pointerdown', (e) => {
  const stage = document.getElementById('stage');
  if (!stage.contains(e.target)) return;
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
  drag = { kind: 'node', id, obj, ox: e.clientX - rect.left - obj.x, oy: e.clientY - rect.top - obj.y, rect, moved: false };
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
      if (res.ok) { d.wires.push([from, node.dataset.node]); designChanged(); renderBoard(); renderRun(); renderSide(); }
      else {
        renderBoard();
        const ft = typeOf(d, from);
        toast(world() === 'cafe' ? (Object.values(REFUSAL).includes(res.reason) ? CAFE_REFUSAL[ft] : cafeWords(res.reason)) : res.reason);
      }
    } else renderBoard();
  } else if (!drag.moved) { S.sel = { kind: 'block', id: drag.id }; renderBoard(); renderSide(); }
  drag = null;
});

document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.node[data-node]') && e.target.dataset.node !== 'traffic') {
    S.sel = { kind: 'block', id: e.target.dataset.node }; renderBoard(); renderSide(); e.preventDefault();
  }
});

let rz = null;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { sizeCanvas(); renderRunBody(); }, 120); });

startFx(document.getElementById('fx'));
renderAll();
