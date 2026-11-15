// Moving customers and packets, drawn on a canvas under the blocks.
// Purely visual: it reads the current tick of the run and never feeds back into the simulator.
import { SCALE } from '../levels/levels.js';
import { S, world, design, run, tickAt, typeOf, fmtN, runScenario } from './state.js';
import { geom, NODE_W, NODE_H } from './board.js';

export const SPEED = 12; // ticks per second of playback
// `extra`: how far the board reaches past its 900-wide box on each side (blocks placed outside it), in board px.
export const fx = { parts: [], drops: [], exits: [], acc: {}, last: 0, colors: null, playing: false, extra: 0 };

let canvas, ctx;

export function resetFx() { fx.parts = []; fx.drops = []; fx.exits = []; fx.acc = {}; }
export function invalidateColors() { fx.colors = null; }

export function sizeCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = (900 + 2 * fx.extra) * dpr; canvas.height = 400 * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, fx.extra * dpr, 0);
}

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  fx.colors = { p: cs.getPropertyValue('--particle').trim(), q: cs.getPropertyValue('--queue').trim(), c: cs.getPropertyValue('--crit').trim(), skin: cs.getPropertyValue('--skin').trim(), hair: cs.getPropertyValue('--hair').trim(), shirt: cs.getPropertyValue('--customer-shirt').trim(), served: cs.getPropertyValue('--customer-served').trim(), shadow: cs.getPropertyValue('--shadow').trim() };
}

function bez(g, t) {
  const u = 1 - t;
  return [
    u * u * u * g[0] + 3 * u * u * t * g[2] + 3 * u * t * t * g[4] + t * t * t * g[6],
    u * u * u * g[1] + 3 * u * u * t * g[3] + 3 * u * t * t * g[5] + t * t * t * g[7]
  ];
}

// Requests per tick travelling along the wire a -> b.
function wireFlow(d, tick, a, b) {
  const rb = tick.blocks[b];
  if (!rb) return 0;
  if (a === 'traffic') return tick.traffic.reads + tick.traffic.writes;
  if (typeOf(d, b) === 'database') {
    if (typeOf(d, a) === 'cache') return tick.blocks[a].misses;
    if (typeOf(d, a) === 'queue') return tick.blocks[a].drained;
    const into = (type, key) => d.wires.filter(([x, y]) => y === b && typeOf(d, x) === type).reduce((s, [x]) => s + tick.blocks[x][key], 0);
    return Math.max(0, rb.load - into('cache', 'misses') - into('queue', 'drained'));
  }
  return rb.load;
}

// Screen-readable customers, including at the phone's overview zoom.
function dot(x, y, color, r, alpha, stride = 0, coffee = false) {
  ctx.globalAlpha = alpha;
  if (world() !== 'cafe') { ctx.fillStyle = color; ctx.fillRect(x - r, y - r, r * 2, r * 2); return; }
  const scale = Math.max(1, .95 / S.zoom);
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  const C = fx.colors;
  ctx.fillStyle = C.shadow; ctx.beginPath(); ctx.ellipse(0, 11, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.hair; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-2, 6); ctx.lineTo(-3 - stride, 10); ctx.moveTo(2, 6); ctx.lineTo(3 + stride, 10); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(-4, -1, 8, 9, 3); ctx.fill();
  ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(0, -5, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.hair; ctx.beginPath(); ctx.arc(0, -6, 4, Math.PI, Math.PI * 2); ctx.fill();
  if (coffee) { ctx.fillStyle = C.skin; ctx.fillRect(3, 1, 5, 2); ctx.fillStyle = C.shirt; ctx.fillRect(6, -3, 4, 5); }
  ctx.restore();
}

function frame(now) {
  const dt = Math.min(0.05, (now - (fx.last || now)) / 1000);
  fx.last = now;
  ctx.clearRect(-fx.extra, 0, 900 + 2 * fx.extra, 400);
  const r = run(), d = design(), sc = runScenario();
  const tick = r && !r.stale ? tickAt(r) : null;
  if (!fx.colors) readColors();
  const C = fx.colors;

  const motionDt = r?.paused ? 0 : dt;

  if (tick && fx.playing) {
    const per = (sc.base.reads + sc.base.writes) * 2.5; // requests per drawn particle
    d.wires.forEach(([a, b]) => {
      const k = a + '>' + b;
      fx.acc[k] = (fx.acc[k] || 0) + (wireFlow(d, tick, a, b) / per) * dt * SPEED;
      while (fx.acc[k] >= 1 && fx.parts.length < 120) { fx.acc[k] -= 1; fx.parts.push({ a, b, p: 0, j: (Math.random() - 0.5) * 12 }); }
    });
    d.blocks.forEach((b) => {
      const rb = tick.blocks[b.id];
      if (rb && rb.served > 0 && !d.wires.some(([from]) => from === b.id)) {
        const servedKey = 'served>' + b.id;
        fx.acc[servedKey] = (fx.acc[servedKey] || 0) + Math.min(8, rb.served / per) * dt * SPEED;
        while (fx.acc[servedKey] >= 1 && fx.exits.length < 48) {
          fx.acc[servedKey] -= 1;
          fx.exits.push({ block: b.id, p: 0 });
        }
      }
      if (!rb || !rb.dropped) return;
      const k = 'drop>' + b.id;
      fx.acc[k] = (fx.acc[k] || 0) + Math.min(3, rb.dropped / SCALE) * dt * SPEED * 0.25;
      while (fx.acc[k] >= 1 && fx.drops.length < 200) {
        fx.acc[k] -= 1;
        fx.drops.push({ x: b.x + NODE_W * 0.7, y: b.y + NODE_H, vx: 20 + Math.random() * 40, vy: 30 + Math.random() * 30, life: 1 });
      }
    });
  }

  fx.parts = fx.parts.filter((pt) => {
    pt.p += motionDt / 1.8;
    if (pt.p >= 1) return false;
    const g = geom(d, pt.a, pt.b); if (!g) return false;
    const [x, y] = bez(g, pt.p);
    dot(x, y + pt.j, world() === 'cafe' ? C.shirt : C.p, 4.2, .98, r?.paused ? 0 : Math.sin(now / 100 + pt.j) * 1.5);
    return true;
  });
  fx.drops = fx.drops.filter((p) => {
    p.life -= motionDt / 1.8; p.x += p.vx * motionDt; p.y += p.vy * motionDt;
    if (p.life <= 0) return false;
    dot(p.x, p.y, C.c, 4.2, Math.max(0, p.life), r?.paused ? 0 : Math.sin(now / 100) * 1.5);
    return true;
  });

  fx.exits = fx.exits.filter((actor) => {
    actor.p += motionDt / 2.2;
    if (actor.p >= 1) return false;
    const b = d.blocks.find((item) => item.id === actor.block);
    if (!b) return false;
    const x = Math.min(860, b.x + NODE_W + 14 + actor.p * 130);
    const y = b.y + 45 + actor.p * 55;
    dot(x, y, C.served, 4.2, Math.min(1, (1 - actor.p) * 4), r?.paused ? 0 : Math.sin(now / 100) * 1.5, true);
    return true;
  });

  // Stepped/reduced-motion playback still shows where customers are arriving.
  if (tick && r.paused && !fx.parts.length) {
    d.wires.forEach(([a, b]) => {
      const g = geom(d, a, b);
      if (g && wireFlow(d, tick, a, b) > 0) {
        const [x, y] = bez(g, .45);
        dot(x, y, world() === 'cafe' ? C.shirt : C.p, 4.2, .95);
      }
    });
  }

  // The line: one dot per customer (50 requests in software).
  if (tick) {
    d.blocks.forEach((b) => {
      const rb = tick.blocks[b.id];
      if (!rb || !rb.queue) return;
      const n = Math.min(16, Math.round(rb.queue / SCALE));
      for (let i = 0; i < n; i++) dot(b.x + NODE_W - 10 - (i % 8) * 18, b.y + NODE_H + 22 + Math.floor(i / 8) * 25, C.q, 4.2, .98);
      if (rb.queue / SCALE > 16) {
        ctx.globalAlpha = 0.9; ctx.fillStyle = C.q; ctx.font = '12px system-ui, sans-serif';
        ctx.fillText(`+${fmtN(rb.queue / SCALE - 16)}`, b.x + NODE_W + 6, b.y + NODE_H + 28);
      }
    });
  }
  ctx.globalAlpha = 1;
  requestAnimationFrame(frame);
}

export function startFx(el) {
  canvas = el; ctx = canvas.getContext('2d');
  sizeCanvas();
  requestAnimationFrame(frame);
}
