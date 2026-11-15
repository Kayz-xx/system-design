// Acumen simulator.
// A deterministic pure function: simulate(design, scenario) -> run log.
// One tick is one simulated second. It counts requests per second; it does not follow single requests.

const BASE_MS = { loadBalancer: 1, server: 20, cache: 1, database: 10, queue: 2 };

const CACHE_SIZES = {
  small: { hit: 0.8, cost: 0.05, label: 'Small (80% hits)' },
  medium: { hit: 0.9, cost: 0.1, label: 'Medium (90% hits)' },
  large: { hit: 0.95, cost: 0.2, label: 'Large (95% hits)' }
};

const TYPE_NAME = {
  traffic: 'Traffic', loadBalancer: 'Load balancer', server: 'Server', cache: 'Cache', database: 'Database', queue: 'Queue'
};

// Which block types may send requests to which.
const ALLOWED = {
  traffic: ['loadBalancer', 'server'],
  loadBalancer: ['server'],
  server: ['cache', 'database', 'queue'],
  cache: ['database'],
  queue: ['database'],
  database: []
};

const REFUSAL = {
  traffic: 'Traffic enters through a load balancer or a single server.',
  loadBalancer: 'A load balancer only spreads requests across servers.',
  server: 'A server sends reads to a cache, writes to a queue, and reads or writes to a database.',
  queue: 'A queue’s workers send the writes on to a database.',
  cache: 'A cache sends its misses to a database.',
  database: 'A database is the end of the line. It answers requests and sends none on.'
};

// Every machine has a fixed cost on top of its capacity: a barista's base wage, a server's overhead. So many
// tiny copies are not free, and one big copy has no spare: the cheapest answer sits between them.
const COPY_COST = 0.05;

function blockCost(b) {
  switch (b.type) {
    case 'server': return (0.1 * (b.capacity / 100) + COPY_COST) * b.copies;
    case 'loadBalancer': return 0.05;
    case 'cache': return CACHE_SIZES[b.size].cost;
    case 'database': return (0.1 * (b.readCapacity / 100) + COPY_COST) * (1 + b.replicas) + 0.1 * (b.writeCapacity / 100);
    case 'queue': return 0.05 + 0.05 * (b.workers * b.workerRate) / 100;
    default: return 0;
  }
}

function designCost(d) {
  return d.blocks.reduce((s, b) => s + blockCost(b), 0);
}

function typeOf(d, id) {
  if (id === 'traffic') return 'traffic';
  const b = d.blocks.find((x) => x.id === id);
  return b ? b.type : undefined;
}

function nameOf(d, id) {
  if (id === 'traffic') return 'Traffic';
  const b = d.blocks.find((x) => x.id === id);
  return b ? b.name : id;
}

function canWire(d, from, to) {
  const no = (reason) => ({ ok: false, reason });
  if (from === to) return no('A block cannot connect to itself.');
  const ft = typeOf(d, from), tt = typeOf(d, to);
  if (!ft || !tt) return no('That block no longer exists.');
  if (tt === 'traffic') return no('Traffic is where requests start. Nothing sends requests to it.');
  if (!ALLOWED[ft].includes(tt)) return no(REFUSAL[ft]);
  if (d.wires.some(([a, b]) => a === from && b === to)) return no('These two blocks are already connected.');
  if (ft === 'traffic' && d.wires.some(([a]) => a === 'traffic')) return no('Traffic enters through one block. Remove the existing traffic wire first.');
  if ((tt === 'server' || tt === 'loadBalancer') && d.wires.some(([, b]) => b === to)) return no(`${nameOf(d, to)} already has a block sending it traffic.`);
  if ((ft === 'server' || ft === 'cache' || ft === 'queue') && d.wires.some(([a, b]) => a === from && typeOf(d, b) === tt)) {
    return no(`${nameOf(d, from)} already has a ${TYPE_NAME[tt].toLowerCase()}.`);
  }
  return { ok: true };
}

// Problems that stop a design from running. The canvas refuses invalid wires, so these are about missing ones.
function validate(d) {
  const problems = [];
  const entry = d.wires.find((w) => w[0] === 'traffic');
  if (!entry) problems.push('Connect Traffic to a server or a load balancer.');
  const outs = (id) => d.wires.filter((w) => w[0] === id).map((w) => w[1]);
  const ins = (id) => d.wires.filter((w) => w[1] === id).map((w) => w[0]);
  d.blocks.forEach((b) => {
    if (ins(b.id).length === 0) problems.push(`${b.name} gets no requests. Wire something into it, or remove it.`);
    if (b.type === 'loadBalancer' && outs(b.id).length === 0) problems.push(`${b.name} has no servers behind it.`);
    if (b.type === 'cache' && !outs(b.id).some((id) => typeOf(d, id) === 'database')) problems.push(`${b.name} needs a database behind it to send its misses to.`);
    if (b.type === 'queue' && !outs(b.id).some((id) => typeOf(d, id) === 'database')) problems.push(`${b.name} needs a database behind it for its workers to write to.`);
    if (b.type === 'server' && b.copies > 1 && ins(b.id).includes('traffic')) {
      problems.push(`${b.name} has ${b.copies} copies. Put a load balancer in front of it so traffic is split between them.`);
    }
  });
  return problems;
}

function trafficAt(sc, t) {
  const s = sc.spike;
  if (s && t >= s.t && t < s.t + s.dur) return { reads: s.reads, writes: s.writes };
  return { reads: sc.base.reads, writes: sc.base.writes };
}

function simulate(d, sc) {
  const byId = Object.fromEntries(d.blocks.map((b) => [b.id, b]));
  const outs = {};
  d.wires.forEach(([a, b]) => { (outs[a] = outs[a] || []).push(b); });
  const of = (id, type) => (outs[id] || []).find((x) => byId[x] && byId[x].type === type);

  const entryId = (outs.traffic || [])[0];
  const entryIsLb = !!entryId && byId[entryId].type === 'loadBalancer';
  const servers = d.blocks.filter((b) => b.type === 'server');
  const caches = d.blocks.filter((b) => b.type === 'cache');
  const dbs = d.blocks.filter((b) => b.type === 'database');
  const queues = d.blocks.filter((b) => b.type === 'queue');

  const route = {};
  servers.forEach((s) => {
    const cache = of(s.id, 'cache');
    const db = of(s.id, 'database') || (cache ? of(cache, 'database') : undefined);
    // Writes go to the server's queue if it has one, otherwise straight to its database.
    route[s.id] = { cache, db, queue: of(s.id, 'queue') };
  });
  const cacheDb = {};
  caches.forEach((c) => { cacheDb[c.id] = of(c.id, 'database'); });
  const queueDb = {};
  queues.forEach((q) => { queueDb[q.id] = of(q.id, 'database'); });

  // The server-failure shock hits the first server that traffic reaches.
  let failId = null;
  if (sc.serverFail && entryId) failId = entryIsLb ? (outs[entryId] || [])[0] || null : entryId;

  const sq = {}; servers.forEach((s) => { sq[s.id] = { r: 0, w: 0 }; });
  const dq = {}; dbs.forEach((b) => { dq[b.id] = { r: 0, w: 0 }; });
  const qq = {}; queues.forEach((q) => { qq[q.id] = 0; });
  const satActive = {}, dropActive = {};
  let peakBacklog = 0;
  const ticks = [], events = [];
  const target = sc.latencyTargetMs;
  let totEmit = 0, totDrop = 0, totSlow = 0, totDone = 0;

  for (let t = 0; t < sc.duration; t++) {
    const tr = trafficAt(sc, t);
    const emit = tr.reads + tr.writes;
    totEmit += emit;
    const rec = { t, traffic: tr, blocks: {}, dropped: 0, latencyMs: 0, queue: 0 };

    // Shock events.
    if (sc.spike && t === sc.spike.t) events.push({ t, type: 'shock', shock: 'spike' });
    if (sc.spike && t === sc.spike.t + sc.spike.dur) events.push({ t, type: 'shock', shock: 'spikeEnd' });
    if (sc.serverFail && t === sc.serverFail.t) events.push({ t, type: 'shock', shock: 'serverFail', block: failId });
    if (sc.serverFail && t === sc.serverFail.t + sc.serverFail.dur) events.push({ t, type: 'shock', shock: 'serverBack', block: failId });
    if (sc.cacheFlush && t === sc.cacheFlush.t) events.push({ t, type: 'shock', shock: 'cacheFlush', block: caches[0] ? caches[0].id : null });

    const failing = !!sc.serverFail && t >= sc.serverFail.t && t < sc.serverFail.t + sc.serverFail.dur;
    const alive = (s) => Math.max(0, s.copies - (failing && s.id === failId ? 1 : 0));
    if (failing && t === sc.serverFail.t && failId && alive(byId[failId]) === 0) {
      events.push({ t, type: 'down', block: failId });
    }

    // Traffic into servers.
    const sIn = {}; servers.forEach((s) => { sIn[s.id] = { r: 0, w: 0 }; });
    if (!entryId) {
      rec.dropped += emit;
    } else if (!entryIsLb) {
      sIn[entryId].r += tr.reads; sIn[entryId].w += tr.writes;
    } else {
      const behind = (outs[entryId] || []).map((id) => byId[id]);
      const caps = behind.map((s) => s.capacity * alive(s));
      const tot = caps.reduce((a, b) => a + b, 0);
      if (tot <= 0) rec.dropped += emit;
      else behind.forEach((s, i) => { sIn[s.id].r += tr.reads * caps[i] / tot; sIn[s.id].w += tr.writes * caps[i] / tot; });
      rec.blocks[entryId] = { load: emit, capacity: null, ratio: 0, queue: 0, dropped: tot <= 0 ? emit : 0, latencyMs: BASE_MS.loadBalancer };
    }

    // Servers.
    const cIn = {}; caches.forEach((c) => { cIn[c.id] = 0; });
    const dIn = {}; dbs.forEach((b) => { dIn[b.id] = { r: 0, w: 0 }; });
    const qIn = {}; queues.forEach((q) => { qIn[q.id] = 0; });
    const sOut = {};
    servers.forEach((s) => {
      const cap = s.capacity * alive(s);
      const q = sq[s.id], a = sIn[s.id];
      q.r += a.r; q.w += a.w;
      const total = q.r + q.w;
      const serve = Math.min(total, cap);
      const f = total > 0 ? serve / total : 0;
      const sr = q.r * f, sw = q.w * f;
      q.r -= sr; q.w -= sw;
      let left = q.r + q.w, drop = 0;
      if (left > s.queueLimit) {
        drop = left - s.queueLimit;
        const k = s.queueLimit / left; q.r *= k; q.w *= k; left = s.queueLimit;
      }
      rec.dropped += drop;
      rec.queue += left;
      const lat = cap > 0 ? BASE_MS.server + (left / cap) * 1000 : Infinity;
      rec.blocks[s.id] = {
        load: a.r + a.w, capacity: cap, ratio: cap > 0 ? (a.r + a.w) / cap : Infinity, served: serve,
        queue: left, queueLimit: s.queueLimit, dropped: drop, latencyMs: lat, alive: alive(s), copies: s.copies
      };
      sOut[s.id] = { sr, sw, lat, left };
      const rt = route[s.id];
      if (rt.cache) cIn[rt.cache] += sr; else if (rt.db) dIn[rt.db].r += sr;
      if (rt.queue) qIn[rt.queue] += sw; else if (rt.db) dIn[rt.db].w += sw;
    });

    // Queues: writes are accepted at once and wait in the backlog; workers drain it at a fixed rate.
    let backlog = 0;
    queues.forEach((q) => {
      const rate = q.workers * q.workerRate;
      let b = qq[q.id] + qIn[q.id];
      const drained = Math.min(b, rate);
      b -= drained;
      let drop = 0;
      if (b > q.queueLimit) { drop = b - q.queueLimit; b = q.queueLimit; }
      qq[q.id] = b;
      if (queueDb[q.id]) dIn[queueDb[q.id]].w += drained;
      rec.dropped += drop;
      rec.queue += b;
      backlog += b;
      rec.blocks[q.id] = {
        load: qIn[q.id], capacity: rate, ratio: rate > 0 ? qIn[q.id] / rate : Infinity, served: drained, drained,
        queue: b, queueLimit: q.queueLimit, dropped: drop, latencyMs: BASE_MS.queue, waitMs: rate > 0 ? (b / rate) * 1000 : Infinity
      };
    });
    peakBacklog = Math.max(peakBacklog, backlog);

    // Caches.
    const hitRate = {};
    caches.forEach((c) => {
      let h = CACHE_SIZES[c.size].hit;
      if (sc.cacheFlush && t >= sc.cacheFlush.t) h *= Math.min(1, (t - sc.cacheFlush.t) / sc.cacheFlush.warm);
      hitRate[c.id] = h;
      const r = cIn[c.id], miss = r * (1 - h);
      if (cacheDb[c.id]) dIn[cacheDb[c.id]].r += miss;
      rec.blocks[c.id] = { load: r, capacity: null, ratio: 0, hitRate: h, hits: r * h, misses: miss, queue: 0, dropped: 0, latencyMs: BASE_MS.cache };
    });

    // Databases: reads and writes queue separately; replicas add read capacity only.
    const dbLat = {};
    dbs.forEach((b) => {
      const capR = b.readCapacity * (1 + b.replicas), capW = b.writeCapacity;
      const q = dq[b.id], a = dIn[b.id];
      const side = (qv, av, cap) => {
        qv += av;
        const served = Math.min(qv, cap);
        qv -= served;
        let dropped = 0;
        if (qv > b.queueLimit) { dropped = qv - b.queueLimit; qv = b.queueLimit; }
        return [qv, served, dropped];
      };
      const [qr, servedR, dr] = side(q.r, a.r, capR);
      const [qw, servedW, dw] = side(q.w, a.w, capW);
      q.r = qr; q.w = qw;
      const Lr = BASE_MS.database + (capR > 0 ? (qr / capR) * 1000 : Infinity);
      const Lw = BASE_MS.database + (capW > 0 ? (qw / capW) * 1000 : Infinity);
      dbLat[b.id] = { r: Lr, w: Lw };
      rec.dropped += dr + dw;
      rec.queue += qr + qw;
      rec.blocks[b.id] = {
        load: a.r + a.w, readLoad: a.r, writeLoad: a.w, capacity: capR + capW, readCapacity: capR, writeCapacity: capW,
        ratio: Math.max(capR > 0 ? a.r / capR : 0, capW > 0 ? a.w / capW : 0), served: servedR + servedW,
        queue: qr + qw, queueR: qr, queueW: qw, queueLimit: b.queueLimit, dropped: dr + dw, latencyMs: Math.max(Lr, a.w > 0 || qw > 0 ? Lw : 0)
      };
    });

    // Latency along each path, weighted by the requests that took it.
    let maxLat = 0, done = 0, slow = 0;
    const lbL = entryIsLb ? BASE_MS.loadBalancer : 0;
    servers.forEach((s) => {
      const o = sOut[s.id], rt = route[s.id];
      const base = lbL + o.lat;
      if (o.left > 0.5) maxLat = Math.max(maxLat, base);
      const paths = [];
      if (rt.cache) {
        const h = hitRate[rt.cache];
        paths.push([o.sr * h, base + BASE_MS.cache]);
        paths.push([o.sr * (1 - h), base + BASE_MS.cache + (rt.db ? dbLat[rt.db].r : 0)]);
      } else {
        paths.push([o.sr, base + (rt.db ? dbLat[rt.db].r : 0)]);
      }
      // A queued write is answered as soon as the queue accepts it; the work happens later.
      paths.push([o.sw, base + (rt.queue ? BASE_MS.queue : rt.db ? dbLat[rt.db].w : 0)]);
      paths.forEach(([n, L]) => {
        if (n <= 1e-9) return;
        done += n;
        if (L > target) slow += n;
        if (L > maxLat) maxLat = L;
      });
    });
    rec.latencyMs = maxLat;
    totDrop += rec.dropped; totSlow += slow; totDone += done;

    // Saturation, dropping and recovery events, per block.
    // A queue building a backlog is doing its job, so it logs `backlog` and `drained`, not `saturated`.
    queues.forEach((q) => {
      const r = rec.blocks[q.id];
      if (r.queue > 0.5 && !satActive[q.id]) { satActive[q.id] = true; events.push({ t, type: 'backlog', block: q.id, load: r.load, capacity: r.capacity }); }
      else if (r.queue <= 0.5 && satActive[q.id]) { satActive[q.id] = false; events.push({ t, type: 'drained', block: q.id }); }
      if (r.dropped > 0 && !dropActive[q.id]) { dropActive[q.id] = true; events.push({ t, type: 'dropping', block: q.id, limit: q.queueLimit }); }
      else if (r.dropped === 0 && dropActive[q.id]) dropActive[q.id] = false;
    });
    [...servers, ...dbs].forEach((b) => {
      const r = rec.blocks[b.id];
      if (r.queue > 0.5 && !satActive[b.id]) {
        satActive[b.id] = true;
        const ev = { t, type: 'saturated', block: b.id, load: r.load, capacity: r.capacity };
        if (b.type === 'database') {
          const readSide = r.queueR >= r.queueW;
          ev.side = readSide ? 'reads' : 'writes';
          ev.load = readSide ? r.readLoad : r.writeLoad;
          ev.capacity = readSide ? r.readCapacity : r.writeCapacity;
        }
        events.push(ev);
      } else if (r.queue <= 0.5 && satActive[b.id]) {
        satActive[b.id] = false;
        events.push({ t, type: 'recovered', block: b.id });
      }
      if (r.dropped > 0 && !dropActive[b.id]) {
        dropActive[b.id] = true;
        events.push({ t, type: 'dropping', block: b.id, limit: b.queueLimit });
      } else if (r.dropped === 0 && dropActive[b.id]) {
        dropActive[b.id] = false;
      }
    });

    ticks.push(rec);
  }

  const errorRate = totEmit > 0 ? totDrop / totEmit : 0;
  const slowShare = totDone > 0 ? totSlow / totDone : 0;
  const costPerHour = designCost(d);
  const backlogAtClose = queues.reduce((s, q) => s + qq[q.id], 0);
  const checks = {
    errors: errorRate <= sc.targets.errorRate,
    slow: slowShare <= sc.targets.slowShare,
    cost: costPerHour <= sc.targets.cost + 1e-9
  };
  // Optional: every queued write must be done by closing. Without it a queue whose workers are slower than
  // the writes arriving still passes, because the backlog only grows and nothing is dropped.
  if (sc.targets.drain) checks.drained = backlogAtClose <= 0.5;
  const first = events.find((e) => e.type === 'saturated' || e.type === 'down' || (e.type === 'dropping' && byId[e.block] && byId[e.block].type === 'queue'));
  const firstFailure = first ? { block: first.block, t: first.t, load: first.load } : null;

  // Numbers the levels ask learners to predict.
  const metrics = { recoverySeconds: null, peakErrorRate: 0, dbReadLoadAfterFlush: null, peakBacklog };
  if (sc.spike) {
    const end = sc.spike.t + sc.spike.dur;
    if (ticks[end - 1].queue <= 0.5) metrics.recoverySeconds = 0;
    else {
      const k = ticks.findIndex((r) => r.t >= end && r.queue <= 0.5);
      metrics.recoverySeconds = k === -1 ? sc.duration - end : k - end + 1;
      metrics.recoveryNeverEnded = k === -1;
    }
  }
  metrics.peakErrorRate = Math.max(...ticks.map((r) => {
    const e = r.traffic.reads + r.traffic.writes;
    return e > 0 ? Math.min(1, r.dropped / e) * 100 : 0; // drops of earlier backlog can exceed this second's arrivals
  }));
  if (sc.cacheFlush) {
    const r = ticks[sc.cacheFlush.t];
    metrics.dbReadLoadAfterFlush = dbs.reduce((s, b) => s + r.blocks[b.id].readLoad, 0);
  }

  return {
    ticks, events, metrics,
    result: { errorRate, slowShare, costPerHour, passed: Object.values(checks).every(Boolean), checks, firstFailure, backlogAtClose }
  };
}

export const Sim = { simulate, validate, canWire, blockCost, designCost, trafficAt, CACHE_SIZES, TYPE_NAME, BASE_MS, REFUSAL, COPY_COST };
export { simulate, validate, canWire, blockCost, designCost, trafficAt, CACHE_SIZES, TYPE_NAME, BASE_MS, REFUSAL, COPY_COST };
