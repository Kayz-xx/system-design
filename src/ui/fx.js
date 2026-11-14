// Moving customers and packets, drawn on a canvas under the blocks.
// Purely visual: it reads the current tick of the run and never feeds back into the simulator.
import { SCALE } from '../levels/levels.js';
import { world, scene, design, run, tickAt, typeOf, fmtN } from './state.js';
import { geom, NODE_W, NODE_H } from './board.js';

export const SPEED = 42; // ticks per second of playback
export const fx = { parts: [], drops: [], acc: {}, last: 0, colors: null, playing: false };

let canvas, ctx;

export function resetFx() { fx.parts = []; fx.drops = []; fx.acc = {}; }
export function invalidateColors() { fx.colors = null; }

export function sizeCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = 900 * dpr; canvas.height = 400 * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  fx.colors = { p: cs.getPropertyValue('--particle').trim(), q: cs.getPropertyValue('--queue').trim(), c: cs.getPropertyValue('--crit').trim() };
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

function dot(x, y, color, r, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  if (world() === 'cafe') { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  else ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function frame(now) {
  const dt = Math.min(0.05, (now - (fx.last || now)) / 1000);
  fx.last = now;
  ctx.clearRect(0, 0, 900, 400);
  const r = run(), d = design(), sc = scene().scenario;
  const tick = r && !r.stale ? tickAt(r) : null;
  if (!fx.colors) readColors();
  const C = fx.colors;

  if (tick && fx.playing) {
    const per = (sc.base.reads + sc.base.writes) * 2.5; // requests per drawn particle
    d.wires.forEach(([a, b]) => {
      const k = a + '>' + b;
      fx.acc[k] = (fx.acc[k] || 0) + (wireFlow(d, tick, a, b) / per) * dt * SPEED;
      while (fx.acc[k] >= 1 && fx.parts.length < 600) { fx.acc[k] -= 1; fx.parts.push({ a, b, p: 0, j: (Math.random() - 0.5) * 6 }); }
    });
    d.blocks.forEach((b) => {
      const rb = tick.blocks[b.id];
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
    pt.p += dt / 0.6;
    if (pt.p >= 1) return false;
    const g = geom(d, pt.a, pt.b); if (!g) return false;
    const [x, y] = bez(g, pt.p);
    dot(x, y + pt.j, C.p, 3, 0.9);
    return true;
  });
  fx.drops = fx.drops.filter((p) => {
    p.life -= dt / 1.1; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0) return false;
    dot(p.x, p.y, C.c, 3.2, Math.max(0, p.life));
    return true;
  });

  // The line: one dot per customer (50 requests in software).
  if (tick) {
    d.blocks.forEach((b) => {
      const rb = tick.blocks[b.id];
      if (!rb || !rb.queue) return;
      const n = Math.min(48, Math.round(rb.queue / SCALE));
      for (let i = 0; i < n; i++) dot(b.x + NODE_W - 7 - (i % 16) * 9, b.y + NODE_H + 10 + Math.floor(i / 16) * 9, C.q, 3.2, 0.95);
      if (rb.queue / SCALE > 48) {
        ctx.globalAlpha = 0.9; ctx.fillStyle = C.q; ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillText(`+${fmtN(rb.queue / SCALE - 48)}`, b.x, b.y + NODE_H + 40);
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
