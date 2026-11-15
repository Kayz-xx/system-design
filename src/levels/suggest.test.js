// Run with: npm test. "A way to fix it" comes from the simulator, never a model: the suggested change must pass
// every test, and a stale stored answer is never offered.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from './levels.js';
import { BEST } from './best-designs.js';
import { describe } from './best.js';
import { grade } from './grade.js';
import { partsOf, cheapestTweak, redesign, suggestChange } from './suggest.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const named = (d, w) => ({ ...d, blocks: d.blocks.map((b) => ({ ...b, name: b.names[w] })) });
const l3 = (w, replicas) => { const d = named(clone(LEVELS[2].design), w); d.blocks.find((b) => b.type === 'database').replicas = replicas; return d; };

test('splitting a description back into parts gives the same words for every stored design', () => {
  for (const [id, scenes] of Object.entries(BEST)) {
    for (const w of ['cafe', 'software']) {
      const d = scenes[w].design;
      assert.equal(partsOf(d, w).map((p) => p.text).join(', '), describe(d, w, 50), `${id} ${w}`);
    }
  }
});

test('the cheapest single change is found, in the scene words, and it really passes', () => {
  const sw = suggestChange(l3('software', 2), 'l3', 'software');
  assert.equal(sw.kind, 'tweak');
  assert.equal(sw.rows.length, 1);
  assert.equal(sw.rows[0].type, 'database');
  assert.match(sw.rows[0].yours, /2 read replicas/);
  assert.match(sw.rows[0].best, /3 read replicas/);
  const fixed = l3('software', 3);
  assert.equal(grade(fixed, 'l3', 'software').accepted, true);

  const cafe = suggestChange(l3('cafe', 0), 'l3', 'cafe');
  assert.equal(cafe.kind, 'tweak');
  assert.match(cafe.rows[0].best, /extra machines/);
  assert.doesNotMatch(cafe.rows.map((r) => `${r.yours} ${r.best}`).join(' '), /replica|server|database|cache/i, 'coffee shop words only');
});

test('level 1: the one change is the barista or server speed', () => {
  const d = named(clone(LEVELS[0].design), 'software');
  const s = suggestChange(d, 'l1', 'software');
  assert.equal(s.kind, 'tweak');
  assert.equal(s.rows[0].type, 'server');
  assert.match(s.rows[0].best, /at 250\/s/);
});

test('with no single change that is enough, the cheapest passing design is offered, after it is graded again', () => {
  const d = named(clone(LEVELS[3].design), 'software');
  assert.equal(cheapestTweak(d, 'l4', 'software'), null);
  const s = suggestChange(d, 'l4', 'software');
  assert.equal(s.kind, 'redesign');
  assert.ok(s.rows.length > 1);
  assert.equal(grade(BEST.l4.software.design, 'l4', 'software').accepted, true);
});

test('a stored best design that no longer passes is never offered', () => {
  const stale = clone(BEST.l3.software);
  stale.design.blocks.find((b) => b.type === 'database').replicas = 0;
  assert.equal(redesign(l3('software', 2), 'l3', 'software', stale), null);
  assert.equal(redesign(l3('software', 2), 'l3', 'software', null), null, 'no stored answer, no suggestion');
});
