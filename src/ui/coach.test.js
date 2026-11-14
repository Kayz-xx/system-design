import test from 'node:test';
import assert from 'node:assert/strict';
import { predError, renderSide } from './coach.js';
import { S, stars, clone } from './state.js';
import { LEVELS } from '../levels/levels.js';
import { simulate } from '../sim/sim.js';

// No DOM or server required: grading must remain tied to observed run metrics.
test('prediction error distinguishes a real zero from an unobserved recovery', () => {
  assert.equal(predError(0, 0), 0);
  assert.equal(predError(10, 0), 1);
  for (const unobserved of [null, undefined, Infinity, NaN]) {
    assert.equal(predError(100, unobserved), null);
  }
});

// Exercise the real renderer and simulator without installing a DOM package.
// Only the final HTML sink is stubbed; this does not verify browser layout.
function renderLesson(options, check) {
  const { level = 'l1', world = 'cafe', edit = () => {}, attempt = {} } = options;
  const previous = { ...S }, previousDocument = globalThis.document;
  const lv = LEVELS.find((item) => item.id === level), d = clone(lv.design);
  const output = { innerHTML: '' };
  try {
    edit(d);
    const log = simulate({ ...d, blocks: d.blocks.map((b) => ({ ...b, name: b.names[world] })) }, lv.scenes[world].scenario);
    const key = level + ':' + world;
    Object.assign(S, {
      level, scene: { [level]: world }, designs: { [level]: { [world]: d } },
      pred: {}, hint: {}, problems: {}, sel: null,
      runs: { [key]: { log, t: log.ticks.length - 1, done: true, stale: false } },
      attempts: { [key]: [{ guessBlock: 's1', actualBlock: 's1', blockRight: true, guess: 20, actual: 50, err: 0.6, passed: log.result.passed, ...attempt }] }
    });
    globalThis.document = { getElementById: (id) => { assert.equal(id, 'side'); return output; } };
    const render = () => { renderSide(); return output.innerHTML; };
    check(render, log);
  } finally {
    Object.assign(S, previous);
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

test('coffee shop and software results use their own units and log language', () => {
  for (const world of ['cafe', 'software']) {
    renderLesson({ world }, (render) => {
      const html = render();
      assert.ok(html.includes(world === 'cafe' ? '50 min' : '50 s'));
      assert.ok(html.includes(world === 'cafe' ? 'The rush starts' : 'Traffic jumps'));
      assert.ok(html.includes('60%'));
      assert.ok(html.includes('Chapter stars'));
      assert.ok(html.includes('Meet every target in the coffee shop.'));
    });
  }
});

test('a recovery not observed before closing is explained without a numeric score', () => {
  renderLesson({
    edit: (d) => { d.blocks[0].capacity = 50; },
    attempt: { guess: 100, actual: Infinity, err: null }
  }, (render, log) => {
    assert.equal(log.metrics.recoveryNeverEnded, true);
    const html = render();
    assert.ok(html.includes('Not cleared during this run'));
    assert.ok(html.includes('There is no exact recovery time to score.'));
    assert.ok(!html.includes('gap-big'));
    assert.ok(html.includes('0 of 3 stars'));
  });
});

test('passing software first returns to the coffee shop instead of skipping it', () => {
  renderLesson({
    world: 'software', edit: (d) => { d.blocks[0].capacity = 200; },
    attempt: { guess: 0, actual: 0, err: 0 }
  }, (render, log) => {
    assert.equal(log.result.passed, true);
    const html = render();
    assert.ok(html.includes('Finish the coffee shop'));
    assert.ok(!html.includes('All three chapters complete'));
    assert.ok(html.includes('2 of 3 stars'));
    assert.ok(!html.includes('your café intuition carried over'));
  });
});

test('the last chapter does not claim completion when earlier chapters were skipped', () => {
  renderLesson({
    level: 'l3', world: 'software', edit: (d) => { d.blocks[2].replicas = 2; },
    attempt: { guess: 1000, actual: 1000, err: 0 }
  }, (render, log) => {
    assert.equal(log.result.passed, true);
    let html = render();
    assert.ok(html.includes('Continue: Morning rush'));
    assert.ok(!html.includes('All three chapters complete'));
    for (const lv of LEVELS) {
      for (const world of ['cafe', 'software']) S.attempts[lv.id + ':' + world] = [{ passed: true, err: 0 }];
    }
    html = render();
    assert.ok(html.includes('All three chapters complete'));
    assert.ok(html.includes('3 of 3 stars'));
  });
});

test('editing a completed run hides its grade and hints', () => {
  renderLesson({}, (render) => {
    assert.ok(render().includes('aria-label="Result"'));
    S.runs['l1:cafe'].stale = true;
    const html = render();
    assert.ok(!html.includes('aria-label="Result"'));
    assert.ok(!html.includes('aria-label="Tutor"'));
    assert.ok(html.includes('aria-label="Prediction"'));
  });
});

test('prediction error compares finite measurements and caps large errors', () => {
  assert.equal(predError(50, 50), 0);
  assert.equal(predError(20, 50), 0.6);
  assert.equal(predError(1000, 50), 1);
  assert.equal(predError(NaN, 50), null);
});

test('an unscored first software attempt cannot earn an accuracy star', () => {
  const previous = S.attempts;
  try {
    S.attempts = {
      'l1:cafe': [{ passed: true }],
      'l1:software': [{ passed: false, err: null }, { passed: true, err: 0 }]
    };
    assert.deepEqual(stars('l1'), [true, true, false]);
    S.attempts['l1:software'] = [{ passed: false, err: 0.15 }, { passed: true, err: 1 }];
    assert.deepEqual(stars('l1'), [true, true, true]);
    S.attempts['l1:software'] = [{ passed: true, err: 0.16 }, { passed: true, err: 0 }];
    assert.deepEqual(stars('l1'), [true, true, false]);
  } finally {
    S.attempts = previous;
  }
});
