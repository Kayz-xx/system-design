// The two worlds a level is shown in. Everything world-specific (words, units, icons, costs) lives here.
// The simulator always runs in software units; the cafe divides by SCALE and reads a tick as a minute.
import { SCALE } from '../levels/levels.js';
import { TYPE_NAME } from '../sim/sim.js';

const fmtN = (n) => (isFinite(n) ? Math.round(n).toLocaleString('en-US') : '∞');
const fmt1 = (n) => (!isFinite(n) ? '∞' : Math.abs(n) >= 10 ? fmtN(n) : String(Math.round(n * 10) / 10));

const ICON_PATHS = {
  cafe: {
    traffic: '<path d="M6 21V4h12v17M3 21h18M14.5 12.5h.01"/>',
    server: '<path d="M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 9.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3v2.5M12 3v2.5"/>',
    loadBalancer: '<path d="M12 3v18M5 6h11l3 3-3 3H5zM8 21h8"/>',
    cache: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M6 10h12M9 6v2M9 13v3"/>',
    database: '<path d="M5 4h14v5H5zM7 9v3h10V9M10 12v2M14 12v2M8 20h8M9.5 16h5v4h-5z"/>'
  },
  software: {
    traffic: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    server: '<rect x="4" y="4" width="16" height="7" rx="1"/><rect x="4" y="13" width="16" height="7" rx="1"/><path d="M8 7.5h.01M8 16.5h.01"/>',
    loadBalancer: '<path d="M3 12h6M9 12l6-6h6M9 12l6 6h6"/>',
    cache: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'
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
    type: { traffic: 'Door', server: 'Barista', loadBalancer: 'Shared line', cache: 'Fridge', database: 'Espresso machine' },
    defaultName: { server: 'Barista', loadBalancer: 'Shared line', cache: 'Fridge', database: 'Espresso machine' },
    trafficName: 'Customers',
    cost: (c) => '$' + Math.round(c * 200) + '/h',
    latTarget: (ms) => fmt1(ms / 1000) + ' min',
    checks: { errors: 'Walk-outs', slow: (ms) => `Waited over ${fmt1(ms / 1000)} min` },
    charts: { traffic: 'Customers arriving, per min', latency: 'Longest wait, min', errors: 'Walk-outs, per min' },
    chartVal: { traffic: (v) => v / SCALE, latency: (v) => v / 1000, errors: (v) => v / SCALE },
    bands: { spike: 'Rush', serverFail: 'Barista out', cacheFlush: 'Restocking' },
    cacheLabel: { small: 'Small fridge · 80% grab one', medium: 'Fridge · 90% grab one', large: 'Big fridge · 95% grab one' },
    palette: { server: 'Barista', loadBalancer: 'Shared line', cache: 'Grab-and-go fridge', database: 'Espresso machine', queue: 'Mobile orders' },
    callout: (t) => `Bottleneck · ${cafeClock(t)}`
  },
  software: {
    label: 'Software', scale: 1,
    clock: swClock,
    rate: (v) => `${fmtN(v)}/s`,
    rateWord: (v) => `${fmtN(v)}/s`,
    type: TYPE_NAME,
    defaultName: { server: 'Server', loadBalancer: 'Load balancer', cache: 'Cache', database: 'Database' },
    trafficName: 'Users',
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
    { key: 'capacity', cafe: 'Drinks a minute, each', software: 'Capacity per copy, req/s', scaled: true, step: 50, min: 50 },
    { key: 'copies', cafe: 'Baristas', software: 'Copies', step: 1, min: 1, int: true },
    { key: 'queueLimit', cafe: 'People who will wait', software: 'Queue limit', scaled: true, step: 50, min: 0 }
  ],
  database: [
    { key: 'readCapacity', cafe: 'Drinks a minute', software: 'Reads, req/s', scaled: true, step: 50, min: 50 },
    { key: 'writeCapacity', software: 'Writes, req/s', step: 100, min: 100 },
    { key: 'replicas', cafe: 'Extra machines', software: 'Read replicas', step: 1, min: 0, int: true },
    { key: 'queueLimit', cafe: 'Orders that will wait', software: 'Queue limit', scaled: true, step: 50, min: 0 }
  ]
};

export const DEFAULTS = {
  server: { capacity: 100, copies: 1, queueLimit: 500 },
  loadBalancer: {},
  cache: { size: 'medium' },
  database: { readCapacity: 300, writeCapacity: 100, replicas: 0, queueLimit: 2000 }
};

// Wiring refusals in cafe words, keyed by the type the wire starts from.
export const CAFE_REFUSAL = {
  traffic: 'Customers come in through the door to a barista or a shared line.',
  loadBalancer: 'A shared line only sends people to baristas.',
  server: 'A barista hands customers to the fridge or the espresso machine.',
  cache: 'When the fridge has nothing, people go to the espresso machine.',
  database: 'The espresso machine is the last stop. It hands drinks out, not customers on.'
};

export const cafeWords = (s) => s
  .replace(/load balancer/gi, 'shared line').replace(/traffic/gi, 'customers').replace(/copies/g, 'baristas')
  .replace(/servers/g, 'baristas').replace(/a database/g, 'an espresso machine').replace(/database/g, 'espresso machine')
  .replace(/requests/g, 'customers');
