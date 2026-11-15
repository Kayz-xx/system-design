// Run with: npm test. The stored best designs must pass every test and still be the cheapest the search finds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from './levels.js';
import { BEST } from './best-designs.js';
import { findBest, describe } from './best.js';
import { grade } from './grade.js';

for (const l of LEVELS) {
  for (const w of ['cafe', 'software']) {
    test(`${l.id} ${w}: the stored best design is accepted and is still the cheapest`, () => {
      const stored = BEST[l.id][w];
      assert.ok(stored, 'a best design exists');
      assert.equal(grade(stored.design, l.id, w).accepted, true);
      // The capstone search takes minutes, so it is checked only by make-best.js, not on every test run.
      if (!l.capstone) {
        const found = findBest(l.id, w);
        assert.equal(found.cost, stored.cost, 'run node src/levels/make-best.js to regenerate');
      }
      assert.ok(stored.cost <= l.scenes[w].scenario.targets.cost + 1e-9, 'within budget');
      assert.ok(describe(stored.design, w, 50).length > 0);
    });
  }
}
