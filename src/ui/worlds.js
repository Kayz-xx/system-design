// The two worlds a level is shown in. Everything world-specific (words, units, icons, costs) lives here.
// The simulator always runs in software units; the cafe divides by SCALE and reads a tick as a minute.
import { SCALE, LIMITS } from '../levels/levels.js';
import { TYPE_NAME } from '../sim/sim.js';

const fmtN = (n) => (isFinite(n) ? Math.round(n).toLocaleString('en-US') : '∞');
const fmt1 = (n) => (!isFinite(n) ? '∞' : Math.abs(n) >= 10 ? fmtN(n) : String(Math.round(n * 10) / 10));

const ICON_PATHS = {
  cafe: {
    traffic: '<path d="M6 21V4h12v17M3 21h18M14.5 12.5h.01"/>',
    server: '<path d="M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 9.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3v2.5M12 3v2.5"/>',
    loadBalancer: '<path d="M12 3v18M5 6h11l3 3-3 3H5zM8 21h8"/>',
    cache: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M6 10h12M9 6v2M9 13v3"/>',
    database: '<path d="M5 4h14v5H5zM7 9v3h10V9M10 12v2M14 12v2M8 20h8M9.5 16h5v4h-5z"/>',
    queue: '<path d="M3 5h18M6 5v5l2 1 2-1V5M14 5v5l2 1 2-1V5M5 21h14M12 14v4"/>'
  },
  software: {
    traffic: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    server: '<rect x="4" y="4" width="16" height="7" rx="1"/><rect x="4" y="13" width="16" height="7" rx="1"/><path d="M8 7.5h.01M8 16.5h.01"/>',
    loadBalancer: '<path d="M3 12h6M9 12l6-6h6M9 12l6 6h6"/>',
    cache: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    queue: '<rect x="3" y="8" width="4" height="8" rx="1"/><rect x="9" y="8" width="4" height="8" rx="1"/><rect x="15" y="8" width="4" height="8" rx="1"/><path d="M21 10v4"/>'
  }
};
export const icon = (world, type) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[world][type]}</svg>`;

const cafeClock = (t) => { const m = 450 + t; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const swClock = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;

export const WORLDS = {
  cafe: {
    label: 'Coffee shop', scale: SCALE,
    clock: cafeClock,
    rate: (v) => `${fmt1(v / SCALE)}/min`,
    rateWord: (v) => `${fmt1(v / SCALE)} a minute`,
    type: { traffic: 'Door', server: 'Barista', loadBalancer: 'Shared line', cache: 'Fridge', database: 'Espresso machine', queue: 'Ticket rail' },
    defaultName: { server: 'Barista', loadBalancer: 'Shared line', cache: 'Fridge', database: 'Espresso machine', queue: 'Ticket rail' },
    trafficName: 'Customers',
    cost: (c) => '$' + Math.round(c * 200) + '/h',
    latTarget: (ms) => fmt1(ms / 1000) + ' min',
    checks: { errors: 'Walk-outs', slow: (ms) => `Waited over ${fmt1(ms / 1000)} min` },
    charts: { traffic: 'Customers arriving, per min', latency: 'Longest wait, min', errors: 'Walk-outs, per min' },
    chartVal: { traffic: (v) => v / SCALE, latency: (v) => v / 1000, errors: (v) => v / SCALE },
    bands: { spike: 'Rush', serverFail: 'Barista out', cacheFlush: 'Restocking' },
    cacheLabel: { small: 'Small fridge · 80% grab one', medium: 'Fridge · 90% grab one', large: 'Big fridge · 95% grab one' },
    palette: { server: 'Barista', loadBalancer: 'Shared line', cache: 'Grab-and-go fridge', database: 'Espresso machine', queue: 'Ticket rail' },
    callout: (t) => `Bottleneck · ${cafeClock(t)}`
  },
  software: {
    label: 'Software', scale: 1,
    clock: swClock,
    rate: (v) => `${fmtN(v)}/s`,
    rateWord: (v) => `${fmtN(v)}/s`,
    type: TYPE_NAME,
    defaultName: { server: 'Server', loadBalancer: 'Load balancer', cache: 'Cache', database: 'Database', queue: 'Queue' },
    trafficName: 'Requests',
    cost: (c) => '$' + c.toFixed(2) + '/h',
    latTarget: (ms) => fmtN(ms) + ' ms',
    checks: { errors: 'Errors', slow: (ms) => `Slower than ${fmtN(ms)} ms` },
    charts: { traffic: 'Traffic, req/s', latency: 'Slowest path, ms', errors: 'Dropped, req/s' },
    chartVal: { traffic: (v) => v, latency: (v) => v, errors: (v) => v },
    bands: { spike: 'Spike', serverFail: 'Copy down', cacheFlush: 'Cache warming' },
    cacheLabel: { small: 'Small · 80% hits', medium: 'Medium · 90% hits', large: 'Large · 95% hits' },
    palette: { server: 'Server', loadBalancer: 'Load balancer', cache: 'Cache', database: 'Database', queue: 'Queue + workers' },
    callout: (t) => `First to fail · ${swClock(t)}`
  }
};

// Inspector fields. `scaled` values are stored in software units and shown divided by the world's scale.
export const FIELDS = {
  server: [
    { key: 'capacity', cafe: 'Drinks a minute, each', software: 'Capacity per copy, req/s', scaled: true, step: 50, min: 50, max: LIMITS.server.capacity },
    { key: 'copies', cafe: 'Baristas', software: 'Copies', step: 1, min: 1, int: true },
    { key: 'queueLimit', cafe: 'People who will wait', software: 'Queue limit', scaled: true, step: 50, min: 0 }
  ],
  database: [
    { key: 'readCapacity', cafe: 'Drinks a minute', software: 'Reads, req/s', scaled: true, step: 50, min: 50, max: LIMITS.database.readCapacity },
    { key: 'writeCapacity', cafe: 'Order drinks a minute', software: 'Writes, req/s', scaled: true, step: 50, min: 50, max: LIMITS.database.writeCapacity, writesOnly: true },
    { key: 'replicas', cafe: 'Extra machines', software: 'Read replicas', step: 1, min: 0, int: true },
    { key: 'queueLimit', cafe: 'Orders that will wait', software: 'Queue limit', scaled: true, step: 50, min: 0 }
  ],
  queue: [
    { key: 'workers', cafe: 'Baristas on tickets', software: 'Workers', step: 1, min: 1, int: true },
    { key: 'workerRate', cafe: 'Drinks a minute, each', software: 'Writes per worker, /s', scaled: true, step: 25, min: 25 },
    { key: 'queueLimit', cafe: 'Tickets the rail holds', software: 'Queue limit', scaled: true, step: 50, min: 0 }
  ]
};

export const DEFAULTS = {
  server: { capacity: 100, copies: 1, queueLimit: 500 },
  loadBalancer: {},
  cache: { size: 'medium' },
  database: { readCapacity: 300, writeCapacity: 100, replicas: 0, queueLimit: 2000 },
  queue: { workers: 2, workerRate: 50, queueLimit: 5000 }
};

// Wiring refusals in cafe words, keyed by the type the wire starts from.
export const CAFE_REFUSAL = {
  traffic: 'Customers come in through the door to a barista or a shared line.',
  loadBalancer: 'A shared line only sends people to baristas.',
  server: 'A barista hands customers to the fridge or the espresso machine, and app orders to the ticket rail.',
  queue: 'Baristas take tickets off the rail to the espresso machine.',
  cache: 'When the fridge has nothing, people go to the espresso machine.',
  database: 'The espresso machine is the last stop. It hands drinks out, not customers on.'
};

export const cafeWords = (s) => s
  .replace(/load balancer/gi, 'shared line').replace(/traffic/gi, 'customers').replace(/copies/g, 'baristas')
  .replace(/servers/g, 'baristas').replace(/a database/g, 'an espresso machine').replace(/database/g, 'espresso machine')
  .replace(/requests/g, 'customers').replace(/a queue/g, 'a ticket rail').replace(/queue/g, 'ticket rail').replace(/workers/g, 'baristas')
  .replace(/writes/g, 'orders');

// Small, code-native props: each is the interactive object, not a picture of a dashboard card.
export function artifact(w, type, copies = 1) {
  const cafe = {
    traffic: '<ellipse class="art-shadow" cx="65" cy="73" rx="39" ry="5"/><path class="art-wood" d="M33 73V12a32 32 0 0 1 64 0v61z"/><path class="art-glass" d="M41 68V15a24 24 0 0 1 48 0v53z"/><path class="art-line" d="M65 0v68M43 24h44"/><rect class="art-light" x="48" y="32" width="34" height="18" rx="3"/><text x="65" y="44" text-anchor="middle" fill="var(--accent)" font-size="9" font-family="var(--font)">OPEN</text><circle class="art-accent" cx="80" cy="57" r="2"/>',
    server: '<ellipse class="art-shadow" cx="65" cy="74" rx="51" ry="5"/><path class="art-accent" d="M42 55V37c0-17 46-17 46 0v18z"/><circle class="art-skin" cx="65" cy="16" r="14"/><path class="art-hair" d="M51 15C44-8 84-8 79 15L68 5 55 13z"/><path class="art-light" d="M55 31h20v27H55z"/><path class="art-skin" d="M44 38h-7v16h21v-6H44zm42 0h7v16H72v-6h14z"/><rect class="art-wood" x="14" y="54" width="102" height="18" rx="3"/><path class="art-line" d="M23 72v7m84-7v7"/><path class="art-light" d="M80 43h13v10H80zM93 45h5v5h-5"/><path class="art-line" d="M83 34v4m6-6v6"/>',
    loadBalancer: '<ellipse class="art-shadow" cx="65" cy="73" rx="47" ry="5"/><path class="art-wood" d="M33 65l10-51h44l10 51z"/><path class="art-body" d="M41 20h48v33H41z"/><path class="art-line" d="M50 36h30m-7-7 8 7-8 7M37 65l-4 10m60-10 4 10"/><circle class="art-accent" cx="23" cy="59" r="5"/><circle class="art-accent" cx="65" cy="65" r="5"/><circle class="art-accent" cx="108" cy="59" r="5"/>',
    cache: '<ellipse class="art-shadow" cx="65" cy="74" rx="39" ry="5"/><rect class="art-body" x="34" y="1" width="62" height="70" rx="7"/><rect class="art-glass" x="42" y="10" width="46" height="49" rx="3"/><path class="art-line" d="M44 34h42M91 28v14M44 62h42"/><path class="art-wood" d="M49 18h9v14h-9zm18-2h9v16h-9zM49 42h9v14h-9zm18-2h9v16h-9z"/><path class="art-line" d="M40 72v5m50-5v5"/>',
    database: '<ellipse class="art-shadow" cx="65" cy="74" rx="51" ry="5"/><rect class="art-wood" x="14" y="62" width="102" height="12" rx="3"/><rect class="art-body" x="28" y="16" width="75" height="43" rx="6"/><path class="art-accent" d="M30 31h71v10H30z"/><circle class="art-light" cx="46" cy="26" r="3"/><circle class="art-light" cx="57" cy="26" r="3"/><path class="art-line" d="M51 42v5h16v-5m-8 5v7M81 43v11"/><path class="art-light" d="M49 54h16v8H49zM81 54h11v8H81z"/><path class="art-line" d="M35 10h15m6 0h15m6 0h15M20 74v5m90-5v5"/>',
    queue: '<ellipse class="art-shadow" cx="65" cy="74" rx="47" ry="5"/><path class="art-wood" d="M18 12h94v11H18z"/><path class="art-line" d="M26 23v44m78-44v44"/><path class="art-light" d="M28 24h18v33l-4-3-5 3-5-3-4 3zm28 0h18v43l-4-3-5 3-5-3-4 3zm28 0h18v28l-4-3-5 3-5-3-4 3z"/><path class="art-line" d="M32 34h10m18 0h10m18 0h10M60 42h10m-10 8h7"/>'
  };
  const crew = w === 'cafe' && type === 'server' ? Array.from({ length: Math.min(3, Math.max(0, copies - 1)) }, (_, i) => {
    const x = [34, 96, 15][i];
    return `<circle class="art-skin" cx="${x}" cy="23" r="10"/><path class="art-accent" d="M${x - 10} 48V36a10 10 0 0 1 20 0v12z"/>`;
  }).join('') : '';
  const software = `<g transform="translate(38 10) scale(2.25)" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square" stroke-linejoin="miter">${ICON_PATHS.software[type]}</g>`;
  return `<svg class="artifact" viewBox="0 0 130 82" aria-hidden="true">${w === 'cafe' ? crew + cafe[type] : software}</svg>`;
}
