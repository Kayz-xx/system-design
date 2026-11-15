// The board: blocks, wires, bottleneck callout, transform card and toast.
import { CACHE_SIZES, designCost } from '../sim/sim.js';
import { S, L, W, world, scene, design, run, tickAt, esc, fmtN, fmt1, runScenario } from './state.js';
import { icon, artifact } from './worlds.js';

export const NODE_W = 150, NODE_H = 118;

function nodeState(b, r) {
  if (!r) return { cls: '', chip: '' };
  const cafe = world() === 'cafe';
  if (b.type === 'server' && r.alive === 0) return { cls: 's-down', chip: `<span class="chip crit">${cafe ? 'Nobody' : 'Down'}</span>` };
  if (r.dropped > 0) return { cls: 's-crit', chip: `<span class="chip crit">${cafe ? 'Walk-outs' : 'Dropping'}</span>` };
  if (b.type === 'queue') return r.queue > 0.5 ? { cls: 's-warm', chip: `<span class="chip warn">${cafe ? 'Tickets' : 'Backlog'}</span>` } : { cls: '', chip: '<span class="chip ok">OK</span>' };
  if (r.queue > 0.5) return { cls: 's-hot', chip: `<span class="chip crit">${cafe ? 'Line' : 'Queueing'}</span>` };
  if (b.type === 'cache' && r.hitRate < 0.5) return { cls: 's-warm', chip: `<span class="chip warn">${cafe ? 'Empty' : 'Cold'}</span>` };
  if (r.ratio >= 0.8) return { cls: 's-warm', chip: '<span class="chip warn">Busy</span>' };
  return { cls: '', chip: '<span class="chip ok">OK</span>' };
}

function nodeSub(b, r) {
  const cafe = world() === 'cafe', Wd = W(), sc = (v) => v / Wd.scale;
  switch (b.type) {
    case 'server':
      if (r) return cafe ? `${fmt1(sc(r.load))}/min in · ${fmtN(sc(r.queue))} waiting` : `${fmtN(r.load)}/s in · ${fmtN(r.queue)} queued`;
      return cafe ? `${fmt1(sc(b.capacity))} drinks/min × ${b.copies}` : `${fmtN(b.capacity)} req/s × ${b.copies}`;
    case 'loadBalancer':
      if (r) return Wd.rate(r.load) + ' in';
      return cafe ? 'Next free barista' : 'Splits across servers';
    case 'cache':
      if (r) return cafe ? `${Math.round(r.hitRate * 100)}% grab one` : `hit rate ${Math.round(r.hitRate * 100)}%`;
      return Wd.cacheLabel[b.size] || CACHE_SIZES[b.size].label;
    case 'database': {
      const writes = writesHere();
      if (r) {
        if (cafe) return `${fmt1(sc(writes ? r.load : r.readLoad))}/min in · ${fmtN(sc(r.queue))} waiting`;
        return writes && r.readLoad < 0.5 ? `${fmtN(r.writeLoad)} writes/s · q ${fmtN(r.queue)}` : `${fmtN(r.readLoad)} reads/s · q ${fmtN(r.queue)}`;
      }
      if (cafe) return writes ? `${fmt1(sc(b.writeCapacity))} order drinks/min` : `${fmt1(sc(b.readCapacity))} drinks/min${b.replicas ? ` × ${1 + b.replicas}` : ''}`;
      return `R ${fmtN(b.readCapacity)}${b.replicas ? '×' + (1 + b.replicas) : ''} · W ${fmtN(b.writeCapacity)}`;
    }
    case 'queue':
      if (r) return cafe ? `${fmtN(sc(r.queue))} tickets · ${fmt1(sc(r.drained))}/min out` : `backlog ${fmtN(r.queue)} · ${fmtN(r.drained)}/s out`;
      return cafe ? `${b.workers} × ${fmt1(sc(b.workerRate))} drinks/min` : `${b.workers} workers × ${fmtN(b.workerRate)}/s`;
    default: return '';
  }
}

// Whether this scene sends writes (orders), so the espresso machine shows its order rate.
function writesHere() {
  const sc = scene().scenario;
  return sc.base.writes > 0 || !!(sc.spike && sc.spike.writes > 0);
}

function meterPct(b, r) {
  if (!r || b.type === 'loadBalancer') return 0;
  if (b.type === 'queue') return b.queueLimit > 0 ? Math.min(100, (r.queue / b.queueLimit) * 100) : 0;
  if (b.type === 'cache') return r.hitRate * 100;
  if (r.queue > 0.5) return 100;
  return Math.min(100, (isFinite(r.ratio) ? r.ratio : 1) * 100);
}

// Cubic bezier control points for a wire, from the right edge of `a` to the left edge of `b`.
export function geom(d, a, b) {
  const pa = a === 'traffic' ? d.traffic : d.blocks.find((x) => x.id === a);
  const pb = d.blocks.find((x) => x.id === b);
  if (!pa || !pb) return null;
  const x1 = pa.x + NODE_W, y1 = pa.y + 41, x2 = pb.x, y2 = pb.y + 41;
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return [x1, y1, x1 + dx, y1, x2 - dx, y2, x2, y2];
}
const pathOf = (g) => `M${g[0]},${g[1]} C${g[2]},${g[3]} ${g[4]},${g[5]} ${g[6]},${g[7]}`;

export function renderBoard() {
  const d = design(), Wd = W(), w = world();
  const r = run();
  const sc = r && !r.stale ? runScenario() : scene().scenario;
  const tick = r && !r.stale ? tickAt(r) : null;
  const wires = d.wires.map(([a, b], i) => {
    const g = geom(d, a, b); if (!g) return '';
    const sel = S.sel && S.sel.kind === 'wire' && S.sel.i === i;
    return `<path class="wire${sel ? ' sel' : ''}" d="${pathOf(g)}"/><path class="wire-hit hit" data-wire="${i}" d="${pathOf(g)}"/>`;
  }).join('');
  const temp = S.wiring ? `<path class="wire-temp" d="M${S.wiring.x1},${S.wiring.y1} L${S.wiring.x2},${S.wiring.y2}"/>` : '';
  const arrow = w === 'software' ? '<defs><marker id="flow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L8 4L0 8" fill="var(--chalk)"/></marker></defs>' : '';
  document.getElementById('wires').innerHTML = arrow + wires + temp;

  const tr = tick ? tick.traffic : sc.base;
  const spiking = tick && tr.reads + tr.writes > sc.base.reads + sc.base.writes;
  let html = `<div class="node traffic" style="left:${d.traffic.x}px;top:${d.traffic.y}px" data-node="traffic">
      ${artifact(w, 'traffic')}<div class="node-top"><span class="node-type">${icon(w, 'traffic')}${Wd.type.traffic}</span>${spiking ? `<span class="chip warn">${w === 'cafe' ? 'Rush' : 'Spike'}</span>` : ''}</div>
      <div class="node-name">${Wd.trafficName}</div>
      <div class="node-sub">${Wd.rate(tr.reads + tr.writes)}</div>
      <button class="port" data-port="traffic" aria-label="Connect from ${Wd.trafficName}"></button>
    </div>`;
  if (spiking && w === 'cafe' && L().id === 'l1') html += `<div class="train-arrival" aria-hidden="true"><svg viewBox="0 0 160 60"><rect class="art-body" x="8" y="8" width="143" height="34" rx="10"/><path class="art-accent" d="M9 31h141v7H9z"/><path class="art-glass" d="M20 16h20v10H20zm30 0h20v10H50zm30 0h20v10H80zm30 0h20v10h-20z"/><circle class="art-hair" cx="35" cy="44" r="6"/><circle class="art-hair" cx="124" cy="44" r="6"/></svg><span>The ${Wd.clock(sc.spike.t)} train</span></div>`;
  d.blocks.forEach((b) => {
    const rb = tick ? tick.blocks[b.id] : null;
    const st = nodeState(b, rb);
    const sel = S.sel && S.sel.kind === 'block' && S.sel.id === b.id;
    html += `<div class="node ${st.cls}${sel ? ' sel' : ''}" style="left:${b.x}px;top:${b.y}px" data-node="${b.id}" data-type="${b.type}" tabindex="0" aria-label="${esc(b.names[w])}">
      ${artifact(w, b.type, rb && Number.isFinite(rb.alive) ? rb.alive : b.copies || 1)}<span class="port-in"></span>
      <div class="node-top"><span class="node-type">${icon(w, b.type)}${esc(Wd.type[b.type])}</span>${st.chip}</div>
      <button class="node-controls" data-edit-node="${b.id}" aria-label="Adjust ${esc(b.names[w])} settings" aria-expanded="${!!sel}" ${r && !r.done ? 'disabled' : ''}>
        <span class="node-name">${esc(b.names[w])}</span>
        <span class="node-sub">${nodeSub(b, rb)}</span>
        <span class="node-edit-hint">Adjust settings <span aria-hidden="true">↗</span></span>
      </button>
      ${b.type === 'loadBalancer' ? '' : `<div class="meter"><i style="width:${meterPct(b, rb)}%"></i></div>`}
      ${b.type === 'database' ? '' : `<button class="port" data-port="${b.id}" aria-label="Connect from ${esc(b.names[w])}"></button>`}
    </div>`;
  });
  if (r && r.done && !r.stale && r.log.result.firstFailure) {
    const ff = r.log.result.firstFailure, b = d.blocks.find((x) => x.id === ff.block);
    if (b) html += `<div class="callout" style="left:${b.x + NODE_W / 2}px;top:${b.y - 8}px">${Wd.callout(ff.t)}</div>`;
  }
  if (!d.blocks.some((b) => b.type === 'server') && !(r && !r.done)) html += `<button class="ghost-placement" data-add="server" style="left:250px;top:150px">＋ Place ${w === 'cafe' ? 'a barista' : 'a server'}</button>`;
  document.getElementById('nodes').innerHTML = html;

  const cost = designCost(d);
  const c = document.getElementById('cost');
  c.textContent = Wd.cost(cost);
  c.classList.toggle('over', cost > sc.targets.cost + 1e-9);
  document.getElementById('budget').textContent = `/ ${Wd.cost(sc.targets.cost)} budget`;
  document.getElementById('world-name').textContent = w === 'cafe' ? 'Your little café' : 'System topology';
}

export function renderOverlay() {
  let html = '';
  if (S.banner === S.level && world() === 'software') {
    html += `<div class="banner" role="dialog" aria-label="Translation">
      <h3>Same diagram. Same numbers. New names.</h3>
      <dl class="pairs">${L().translate.map(([a, b]) => `<dt class="from">${esc(a)}</dt><span class="arrow">→</span><dd class="to">${esc(b)}</dd>`).join('')}</dl>
      <div class="btn-row" style="margin-top:12px"><button class="btn primary small" id="banner-ok">Predict the software version</button></div>
    </div>`;
  }
  if (S.toast) html += `<div class="toast" role="status">${esc(S.toast)}</div>`;
  document.getElementById('overlay').innerHTML = html;
}
