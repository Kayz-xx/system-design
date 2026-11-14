// The run panel: target checks, time scrubber and three charts with a shared crosshair.
import { S, W, world, scene, run, esc, fmtN, fmt1, fmtPct } from './state.js';

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v - 1e-9) return m * p;
  return 10 * p;
}

function chartSvg(o, width) {
  const H = 120, m = { l: 40, r: 8, t: 14, b: 18 };
  const Wd = W(), Wp = Math.max(200, width);
  const iw = Wp - m.l - m.r, ih = H - m.t - m.b;
  const N = o.vals.length;
  const shown = o.vals.map((v) => Math.min(isFinite(v) ? v : o.clampMax, o.clampMax));
  const max = niceMax(Math.max(...shown, o.target ? o.target * 1.5 : 0) || 1);
  const x = (t) => m.l + (t / (N - 1)) * iw;
  const y = (v) => m.t + ih - (v / max) * ih;
  const lab = (v) => (max < 10 ? fmt1(v) : fmtN(v));
  let s = '';
  const sc = o.sc, bands = [];
  if (sc.spike) bands.push([sc.spike.t, sc.spike.t + sc.spike.dur, Wd.bands.spike]);
  if (sc.serverFail) bands.push([sc.serverFail.t, sc.serverFail.t + sc.serverFail.dur, Wd.bands.serverFail]);
  if (sc.cacheFlush) bands.push([sc.cacheFlush.t, sc.cacheFlush.t + sc.cacheFlush.warm, Wd.bands.cacheFlush]);
  bands.forEach(([a, b, label]) => {
    s += `<rect class="band" x="${x(a)}" y="${m.t}" width="${x(Math.min(b, N - 1)) - x(a)}" height="${ih}"/><text class="band-label" x="${x(a) + 3}" y="${m.t - 4}">${label}</text>`;
  });
  [0, 0.5, 1].forEach((f) => {
    const v = max * f;
    s += `<line class="gridline" x1="${m.l}" x2="${Wp - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 3}" text-anchor="end">${lab(v)}</text>`;
  });
  for (let t = 0; t < N; t += 30) s += `<text x="${x(t)}" y="${H - 4}" text-anchor="middle">${Wd.clock(t)}</text>`;
  if (o.target) {
    s += `<line class="target-line" x1="${m.l}" x2="${Wp - m.r}" y1="${y(o.target)}" y2="${y(o.target)}"/><text x="${Wp - m.r}" y="${y(o.target) - 4}" text-anchor="end">target ${lab(o.target)}</text>`;
  }
  const end = Math.min(o.upto, N - 1);
  let line = '';
  for (let t = 0; t <= end; t++) line += (t ? 'L' : 'M') + x(t).toFixed(1) + ',' + y(shown[t]).toFixed(1);
  s += `<path class="area${o.err ? ' err' : ''}" d="${line}L${x(end).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z"/><path class="series${o.err ? ' err' : ''}" d="${line}"/>`;
  if (S.hoverT !== null && S.hoverT <= end) {
    s += `<line class="cross" x1="${x(S.hoverT)}" x2="${x(S.hoverT)}" y1="${m.t}" y2="${m.t + ih}"/><circle class="dot" r="4" cx="${x(S.hoverT)}" cy="${y(shown[S.hoverT])}"/>`;
  } else if (end < N - 1) {
    s += `<line class="playhead" x1="${x(end)}" x2="${x(end)}" y1="${m.t}" y2="${m.t + ih}"/>`;
  }
  const unbounded = o.vals.some((v) => !Number.isFinite(v));
  return `<svg viewBox="0 0 ${Wp} ${H}" data-n="${N}" data-l="${m.l}" data-iw="${iw}" data-w="${Wp}" role="img" aria-label="${esc(o.title)}">${unbounded ? '<desc>Unbounded waits are drawn at the chart ceiling. The readout shows infinity.</desc>' : ''}${s}</svg>`;
}

export function renderRun() {
  const el = document.getElementById('run');
  const r = run(), sc = scene().scenario, Wd = W();
  if (!r) {
    el.innerHTML = `<div class="run-head"><span class="label">Run</span></div><p class="empty">${world() === 'cafe'
      ? 'Make your guess, then open the doors. You’ll see every customer arrive, wait and get served.'
      : 'Predict first, then run. Traffic, latency and errors for each second appear here.'}</p>`;
    return;
  }
  const res = r.log.result, done = r.done;
  const check = (ok, label, val, tgt) => `<span class="check ${done ? (ok ? 'ok' : 'bad') : ''}"><span class="mark">${done ? (ok ? '✓' : '✗') : '·'}</span>${label} <span class="mono">${done ? val : '…'}</span> <span class="muted mono">≤ ${tgt}</span></span>`;
  el.innerHTML = `<div class="run-head">
      <span class="label">${r.stale ? 'Previous run' : 'Run results'}</span>
      <div class="checks">
        ${check(res.checks.errors, Wd.checks.errors, fmtPct(res.errorRate), fmtPct(sc.targets.errorRate))}
        ${check(res.checks.slow, Wd.checks.slow(sc.latencyTargetMs), fmtPct(res.slowShare), fmtPct(sc.targets.slowShare))}
        ${check(res.checks.cost, 'Cost', Wd.cost(res.costPerHour), Wd.cost(sc.targets.cost))}
      </div>
      <div class="scrub">
        ${r.stale ? '<span class="chip warn">Design changed since this run</span>' : ''}
        <label class="muted mono" for="scrub" id="scrub-label"></label>
        <input id="scrub" type="range" min="0" max="${r.log.ticks.length - 1}" value="${r.t}" ${done ? '' : 'disabled'}>
        <button class="btn small" id="replay" ${done ? '' : 'disabled'}>Replay</button>
      </div>
    </div>
    ${r.stale ? '<p class="hint" role="status">Your design has changed. These charts show the previous run. Make a new prediction to test your edits.</p>' : ''}
    <div class="readout" id="readout"></div>
    <div class="charts">
      <div class="chart" data-chart="traffic"><h4>${Wd.charts.traffic}</h4><div class="plot"></div></div>
      <div class="chart" data-chart="latency"><h4>${Wd.charts.latency}</h4><div class="plot"></div></div>
      <div class="chart" data-chart="errors"><h4>${Wd.charts.errors}</h4><div class="plot"></div></div>
    </div>`;
  renderRunBody();
}

// Updates only the moving parts, so the slider is never rebuilt while dragged.
export function renderRunBody() {
  const el = document.getElementById('run');
  const r = run(), sc = scene().scenario, Wd = W();
  if (!r || !el.querySelector('.charts')) return;
  const ticks = r.log.ticks, N = ticks.length;
  const t = Math.min(r.t, N - 1);
  const rt = S.hoverT !== null ? S.hoverT : t;
  const rk = ticks[rt];
  document.getElementById('scrub-label').textContent = `${Wd.clock(t)} / ${Wd.clock(N - 1)}`;
  const scrub = document.getElementById('scrub');
  if (scrub && document.activeElement !== scrub) scrub.value = t;
  const cv = Wd.chartVal;
  document.getElementById('readout').textContent = world() === 'cafe'
    ? `${Wd.clock(rt)} · ${fmt1(cv.traffic(rk.traffic.reads + rk.traffic.writes))} customers/min · longest wait ${fmt1(cv.latency(rk.latencyMs))} min · ${fmt1(cv.errors(rk.dropped))} walking out/min`
    : `${Wd.clock(rt)} · traffic ${fmtN(rk.traffic.reads + rk.traffic.writes)}/s · slowest path ${fmtN(rk.latencyMs)} ms · dropped ${fmtN(rk.dropped)}/s`;
  const latencies = ticks.map((x) => cv.latency(x.latencyMs));
  const latencyCeiling = Math.max(cv.latency(sc.latencyTargetMs), 1, ...latencies.filter(Number.isFinite));
  const series = {
    traffic: { vals: ticks.map((x) => cv.traffic(x.traffic.reads + x.traffic.writes)), title: Wd.charts.traffic },
    latency: { vals: latencies, target: cv.latency(sc.latencyTargetMs), clampMax: latencyCeiling, title: Wd.charts.latency },
    errors: { vals: ticks.map((x) => cv.errors(x.dropped)), err: true, title: Wd.charts.errors }
  };
  el.querySelectorAll('.chart').forEach((c) => {
    const o = Object.assign({ upto: t, sc, clampMax: Infinity }, series[c.dataset.chart]);
    c.querySelector('.plot').innerHTML = chartSvg(o, c.clientWidth);
  });
}

// Maps a pointer position over a chart to a tick, for the shared crosshair.
export function tickFromPointer(svg, clientX) {
  const b = svg.getBoundingClientRect();
  const Wp = +svg.dataset.w, l = +svg.dataset.l, iw = +svg.dataset.iw, N = +svg.dataset.n;
  return Math.max(0, Math.min(N - 1, Math.round(((((clientX - b.left) / b.width) * Wp - l) / iw) * (N - 1))));
}
