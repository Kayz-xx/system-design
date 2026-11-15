import test from 'node:test';
import assert from 'node:assert/strict';
import { predError, renderSide } from './coach.js';
import { S, stars, clone } from './state.js';
import { LEVELS } from '../levels/levels.js';
import { simulate } from '../sim/sim.js';
import { grade } from '../levels/grade.js';

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
      level, labPhase: { [key]: 'review' }, scene: { [level]: world }, designs: { [level]: { [world]: d } },
      pred: {}, hint: {}, problems: {}, sel: null, submits: {}, accepted: {}, subGuess: {},
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
      assert.ok(html.includes('You predicted 20'));
      assert.ok(!html.includes('Chapter stars'));
      assert.ok(!html.includes('aria-label="Prediction"'));
      assert.ok(!html.includes('aria-label="Submit"'));
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
    assert.ok(html.includes('Still waiting at closing time.'));
    assert.ok(!html.includes('100%'));
    assert.ok(!html.includes('gap-big'));
    assert.ok(!html.includes('Chapter stars'));
  });
});

// A submission as Submit stores it, for the scene being rendered.
function submit(level, world, d) {
  const sd = { ...d, blocks: d.blocks.map((b) => ({ ...b, name: b.names[world] })) };
  const g = grade(sd, level, world);
  S.labPhase[level + ':' + world] = 'submission';
  S.submits[level + ':' + world] = { ...g, guess: g.total, stale: false };
  if (g.accepted) S.accepted[level + ':' + world] = true;
  return g;
}

test('a sample pass is not a solve: Run asks for Submit, and hidden tests decide', () => {
  renderLesson({ edit: (d) => { d.blocks[0].capacity = 200; } }, (render, log) => {
    assert.equal(log.result.passed, true);
    let html = render();
    assert.ok(html.includes('Try a full week'));
    assert.ok(!html.includes('See it as software'));
    const d = S.designs.l1.cafe;
    const g = submit('l1', 'cafe', d);
    assert.equal(g.accepted, false, 'capacity 200 survives only the sample');
    html = render();
    assert.ok(html.includes(`Failed on test ${g.failed.n}`));
    assert.ok(html.includes('Two trains at once'));
    assert.ok(html.includes('Waits ran too long'));
    assert.ok(!html.includes('See it as software'));
    d.blocks[0].capacity = 250;
    assert.equal(submit('l1', 'cafe', d).accepted, true);
    html = render();
    assert.ok(html.includes('Accepted'));
    assert.ok(html.includes('See it as software'));
    assert.ok(html.includes('1 of 3 stars'));
  });
});

test('passing software first returns to the coffee shop instead of skipping it', () => {
  renderLesson({
    world: 'software', edit: (d) => { d.blocks[0].capacity = 250; },
    attempt: { guess: 0, actual: 0, err: 0 }
  }, (render, log) => {
    assert.equal(log.result.passed, true);
    assert.equal(submit('l1', 'software', S.designs.l1.software).accepted, true);
    const html = render();
    assert.ok(html.includes('Finish the coffee shop'));
    assert.ok(!html.includes(`All ${LEVELS.length} chapters complete`));
    assert.ok(html.includes('2 of 3 stars'));
    assert.ok(!html.includes('your café intuition carried over'));
  });
});

test('the last chapter does not claim completion when earlier chapters were skipped', () => {
  renderLesson({
    level: 'l4', world: 'software', edit: (d) => {
      d.blocks.push({ id: 'q1', type: 'queue', names: { cafe: 'Ticket rail', software: 'Queue' }, workers: 2, workerRate: 50, queueLimit: 10000 });
      d.wires.push(['s1', 'q1'], ['q1', 'db1']);
    },
    attempt: { guess: 1000, actual: 1000, err: 0 }
  }, (render, log) => {
    assert.equal(log.result.passed, true);
    assert.equal(submit('l4', 'software', S.designs.l4.software).accepted, true);
    let html = render();
    assert.ok(html.includes('Continue: Morning rush'));
    assert.ok(!html.includes(`All ${LEVELS.length} chapters complete`));
    for (const lv of LEVELS) {
      for (const world of ['cafe', 'software']) { S.attempts[lv.id + ':' + world] = [{ passed: true, err: 0 }]; S.accepted[lv.id + ':' + world] = true; }
    }
    html = render();
    assert.ok(html.includes(`All ${LEVELS.length} chapters complete`));
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
    assert.ok(html.includes('aria-label="Build experiment"'));
    S.labPhase['l1:cafe'] = 'predict';
    assert.ok(render().includes('aria-label="Prediction"'));
  });
});

test('prediction error compares finite measurements and caps large errors', () => {
  assert.equal(predError(50, 50), 0);
  assert.equal(predError(20, 50), 0.6);
  assert.equal(predError(1000, 50), 1);
  assert.equal(predError(NaN, 50), null);
});

test('an unscored first software attempt cannot earn an accuracy star', () => {
  const previous = S.attempts, previousAccepted = S.accepted;
  try {
    S.accepted = { 'l1:cafe': true, 'l1:software': true };
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
    S.attempts = previous; S.accepted = previousAccepted;
  }
});


test('the initial task shows only one action, with brief and prediction revealed on request', () => {
  renderLesson({}, (render) => {
    S.labPhase['l1:cafe'] = 'build';
    let html = render();
    assert.ok(html.includes('aria-label="Build experiment"'));
    for (const hidden of ['Prediction', 'Submit', 'Equipment settings', 'Brief', 'Chapter stars']) assert.ok(!html.includes(`aria-label="${hidden}"`));
    S.labPhase['l1:cafe'] = 'brief'; html = render();
    assert.ok(html.includes('aria-label="Brief"'));
    assert.ok(html.includes('Limits &amp; targets'));
    assert.ok(!html.includes('aria-label="Prediction"'));
    S.labPhase['l1:cafe'] = 'predict'; html = render();
    assert.ok(html.includes('aria-label="Prediction"'));
    assert.ok(!html.includes('aria-label="Brief"'));
  });
});

test('an accepted submission is compared with the best possible cost', () => {
  renderLesson({ level: 'l2', edit: (d) => { d.blocks[1].copies = 5; d.blocks[1].capacity = 90; } }, (render) => {
    assert.equal(submit('l2', 'cafe', S.designs.l2.cafe).accepted, true);
    let html = render();
    assert.ok(html.includes('Running cost against the best shop'));
    assert.ok(html.includes('$100/h') && html.includes('$90/h'));
    assert.ok(html.includes('11% more than the best'));
    assert.ok(html.includes('A shared line, 4 baristas making 2 a minute each'));
    assert.ok(html.includes('aria-label="Why it worked"'));
    assert.ok(html.includes('Redundancy · one barista to spare'));
    assert.ok(html.includes('one of your 5 baristas went home for 90 minutes. The other 4 still serve 7.2 a minute'), html.match(/Redundancy[^<]*<\/b><span>([^<]*)/)?.[1]);
    Object.assign(S.designs.l2.cafe.blocks[1], { copies: 4, capacity: 100 });
    submit('l2', 'cafe', S.designs.l2.cafe);
    html = render();
    assert.ok(html.includes('Best possible cost'));
    assert.ok(!html.includes('Show the cheapest shop'));
  });
});
