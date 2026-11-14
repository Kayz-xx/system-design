import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRun, renderRunBody } from './run-panel.js';
import { S, clone } from './state.js';
import { LEVELS } from '../levels/levels.js';
import { simulate } from '../sim/sim.js';

// Capture chart output without a browser. Geometry and responsive layout require browser QA.
function panelFor(level, world, edit, check) {
  const previous = { ...S }, previousDocument = globalThis.document;
  const lv = LEVELS.find((item) => item.id === level), d = clone(lv.design);
  const charts = ['traffic', 'latency', 'errors'].map((name) => ({
    dataset: { chart: name }, clientWidth: 300, plot: { innerHTML: '' },
    querySelector() { return this.plot; }
  }));
  const panel = { innerHTML: '', querySelector: () => ({}), querySelectorAll: () => charts };
  const elements = { run: panel, readout: {}, 'scrub-label': {}, scrub: {} };
  try {
    edit(d);
    const log = simulate({ ...d, blocks: d.blocks.map((b) => ({ ...b, name: b.names[world] })) }, lv.scenes[world].scenario);
    const r = { log, t: log.ticks.length - 1, done: true, stale: false };
    Object.assign(S, { level, scene: { [level]: world }, runs: { [level + ':' + world]: r }, hoverT: null });
    globalThis.document = { activeElement: null, getElementById: (id) => elements[id] };
    renderRun();
    check({ panel, charts, elements, r });
  } finally {
    Object.assign(S, previous);
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

test('all six scenes produce finite SVG coordinates and named charts', () => {
  for (const lv of LEVELS) {
    for (const world of ['cafe', 'software']) {
      panelFor(lv.id, world, () => {}, ({ charts, elements }) => {
        for (const chart of charts) {
          assert.ok(chart.plot.innerHTML.includes('role="img" aria-label="'));
          assert.doesNotMatch(chart.plot.innerHTML, /NaN|Infinity/);
        }
        assert.ok(elements.readout.textContent.includes(world === 'cafe' ? 'customers/min' : 'traffic'));
      });
    }
  }
});

test('long waits are shown on their real scale instead of being capped at ten minutes', () => {
  panelFor('l1', 'cafe', () => {}, ({ charts, elements, r }) => {
    const tick = r.log.ticks.reduce((worst, item) => item.latencyMs > worst.latencyMs ? item : worst);
    assert.ok(tick.latencyMs > 10000);
    r.t = tick.t; renderRunBody();
    assert.ok(elements.readout.textContent.includes('longest wait 20 min'));
    assert.match(charts[1].plot.innerHTML, />25<\/text>/);
  });
});

test('a complete outage has a readable infinite wait and valid chart coordinates', () => {
  panelFor('l2', 'cafe', (d) => { d.blocks[1].copies = 1; }, ({ charts, elements, r }) => {
    r.t = 40; renderRunBody();
    assert.ok(elements.readout.textContent.includes('longest wait ∞ min'));
    assert.ok(charts[1].plot.innerHTML.includes('Unbounded waits'));
    assert.doesNotMatch(charts[1].plot.innerHTML, /NaN|Infinity/);
  });
});

test('old results clearly identify the previous design until a new run replaces them', () => {
  panelFor('l1', 'cafe', () => {}, ({ panel, r }) => {
    assert.ok(!panel.innerHTML.includes('These charts show the previous run'));
    r.stale = true; renderRun();
    assert.ok(panel.innerHTML.includes('Previous run'));
    assert.ok(panel.innerHTML.includes('Make a new prediction to test your edits.'));
    r.stale = false; renderRun();
    assert.ok(!panel.innerHTML.includes('These charts show the previous run'));
  });
});
