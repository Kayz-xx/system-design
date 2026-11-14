// Run with: npm test. No network: Gemini and /api/chaos/plan are replaced by fake fetch functions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../levels/levels.js';
import { cleanDesign } from './facts.js';
import { cleanAttack, describeAttack, searchAttacks, storyReason, templateStory, tryAttack } from './attacks.js';
import { breakDesign } from './chaos.js';
import { chaosResponse } from '../../api/chaos/plan.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const level = (id) => LEVELS.find((l) => l.id === id);
// The passing fix for each level, from sim.test.js.
const FIX = { l1: (d) => { d.blocks[0].capacity = 200; }, l2: (d) => { d.blocks[1].copies = 4; }, l3: (d) => { d.blocks[2].replicas = 2; } };
const passing = (id) => { const d = clone(level(id).design); FIX[id](d); return d; };
// Built so big that nothing within the budget breaks it. It is over the cost target, which an attack does not count.
const fortress = () => {
  const d = clone(level('l1').design);
  d.blocks = [{ id: 'lb1', type: 'loadBalancer', names: { cafe: 'Shared line', software: 'Load balancer' } },
    { id: 's1', type: 'server', names: { cafe: 'Baristas', software: 'App servers' }, capacity: 1000, copies: 3, queueLimit: 5000 }];
  d.wires = [['traffic', 'lb1'], ['lb1', 's1']];
  return d;
};
const env = { GEMINI_API_KEY: 'test-key' };
const geminiJson = (obj) => async () => ({ ok: true, json: async () => ({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(obj) }] } }] }) });
const api = (core) => async (url, init) => { const out = await core(JSON.parse(init.body)); return { ok: out.status === 200, json: async () => out.json }; };

for (const id of ['l1', 'l2', 'l3']) {
  for (const world of ['cafe', 'software']) {
    test(`search: every attack it finds really breaks passing ${id} ${world}`, () => {
      const d = cleanDesign(passing(id), world), sc = level(id).scenes[world].scenario;
      assert.equal(tryAttack(d, sc, {}).broke, false, 'the fix passes with no attack');
      const found = searchAttacks(d, sc);
      assert.ok(found.length > 0);
      for (const f of found) {
        assert.ok(cleanAttack(f.attack, sc, d), 'within budget');
        assert.equal(tryAttack(d, sc, f.attack).broke, true);
      }
      for (let i = 1; i < found.length; i++) assert.ok(found[i - 1].severity <= found[i].severity, 'mildest first');
    });
  }
}

test('search is deterministic and finds nothing against a fortress', () => {
  const d = cleanDesign(passing('l2'), 'cafe'), sc = level('l2').scenes.cafe.scenario;
  assert.deepEqual(searchAttacks(d, sc), searchAttacks(d, sc));
  assert.deepEqual(searchAttacks(cleanDesign(fortress(), 'cafe'), level('l1').scenes.cafe.scenario), []);
});

test('attacks outside the budget or the design are refused', () => {
  const d = cleanDesign(passing('l1'), 'cafe'), sc = level('l1').scenes.cafe.scenario;
  assert.equal(cleanAttack({ spike: { t: 30, dur: 10, reads: 1000, writes: 0 } }, sc, d), null, 'over 3x');
  assert.equal(cleanAttack({ cacheFlush: { t: 30, warm: 30 } }, sc, d), null, 'no cache here');
  assert.equal(cleanAttack({ serverFail: { t: 30, dur: 500 } }, sc, d), null, 'too long');
  assert.equal(cleanAttack({ spike: { t: 30, dur: 10, reads: 120, writes: 0 }, serverFail: { t: 40, dur: 20 }, cacheFlush: { t: 40, warm: 20 } }, sc, d), null, 'three shocks');
  assert.equal(cleanAttack({}, sc, d), null);
  assert.deepEqual(cleanAttack({ serverFail: { t: 40.4, dur: 20 } }, sc, d), { serverFail: { t: 40, dur: 20 } });
});

test('facts and stories use the world’s words', () => {
  const d = cleanDesign(passing('l2'), 'cafe'), sc = level('l2').scenes.cafe.scenario;
  const a = { spike: { t: 30, dur: 20, reads: 300, writes: 60 }, serverFail: { t: 40, dur: 20 } };
  assert.equal(describeAttack(a, sc, d, 'cafe'), 'From 8:00, 7.2 customers a minute arrive for 20 minutes. At 8:10, one of the Baristas is out for 20 minutes.');
  assert.equal(storyReason(templateStory(a, 'cafe'), 'cafe'), null);
  assert.equal(storyReason(templateStory(a, 'software'), 'software'), null);
  assert.ok(storyReason('A bus arrives at 8:20 with 40 people.', 'cafe'), 'digits');
  const one = cleanDesign(passing('l1'), 'cafe');
  assert.equal(describeAttack({ serverFail: { t: 40, dur: 20 } }, level('l1').scenes.cafe.scenario, one, 'cafe'), 'At 8:10, Barista is out for 20 minutes, and nobody covers.');
  assert.ok(storyReason('The server melts down under a flood of requests.', 'cafe'), 'software words');
});

test('endpoint: the model picks a proven attack and tells it; it cannot invent one', async () => {
  const body = { world: 'cafe', level: 'l2', design: passing('l2'), scenario: level('l2').scenes.cafe.scenario };
  const good = await chaosResponse(body, { env, fetchImpl: geminiJson({ choice: 1, story: 'A tour bus pulls up outside. Then a barista burns their hand and goes home.' }) });
  assert.equal(good.status, 200);
  assert.equal(good.json.source, 'ai');
  assert.match(good.json.story, /tour bus/);
  const d = cleanDesign(body.design, 'cafe');
  assert.equal(tryAttack(d, body.scenario, good.json.attack).broke, true);
  const out = await chaosResponse(body, { env, fetchImpl: geminiJson({ choice: 99, story: 'whatever happens here today' }) });
  assert.equal(out.json.source, 'search');
  const digits = await chaosResponse(body, { env, fetchImpl: geminiJson({ choice: 0, story: 'At 8:20 a bus brings 40 people to the door.' }) });
  assert.equal(digits.json.source, 'ai-pick');
  assert.doesNotMatch(digits.json.story, /\d/);
  const nokey = await chaosResponse(body, { env: {}, fetchImpl: geminiJson({}) });
  assert.equal(nokey.json.source, 'search');
  assert.equal((await chaosResponse({ ...body, design: { blocks: [], wires: [['traffic', 'x']] } }, { env })).status, 400);
  const safe = await chaosResponse({ ...body, level: 'l1', design: fortress() }, { env, fetchImpl: geminiJson({}) });
  assert.deepEqual(safe.json, { attack: null, story: null, survived: true });
});

test('loop: breaks a passing Level 1 coffee shop through the endpoint', async () => {
  const fetchImpl = api((b) => chaosResponse(b, { env, fetchImpl: geminiJson({ choice: 0, story: 'The only barista wakes up with a fever and calls in sick.' }) }));
  const out = await breakDesign({ world: 'cafe', level: 'l1', design: passing('l1'), scenario: level('l1').scenes.cafe.scenario }, { fetchImpl });
  assert.equal(out.broken, true);
  assert.equal(out.log.result.passed, false);
  assert.equal(out.log.result.checks.errors && out.log.result.checks.slow, false);
  assert.equal(out.story, 'The only barista wakes up with a fever and calls in sick.');
  assert.equal(out.attempts.length, 1);
});

test('loop: an attack that does not break the design is retried, and bad ones are skipped', async () => {
  const sc = level('l2').scenes.software.scenario;
  const plans = [
    { attack: { spike: { t: 30, dur: 10, reads: 210, writes: 42 } }, story: 'A small bump in traffic arrives.' }, // too mild
    { attack: { spike: { t: 30, dur: 10, reads: 9999, writes: 0 } }, story: 'Way over budget for this level.' }, // refused
    { attack: { spike: { t: 30, dur: 20, reads: 300, writes: 60 }, serverFail: { t: 40, dur: 20 } }, story: 'A launch email goes out. Then one copy crashes.' }
  ];
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push(JSON.parse(init.body)); return { ok: true, json: async () => plans[seen.length - 1] }; };
  const out = await breakDesign({ world: 'software', level: 'l2', design: passing('l2'), scenario: sc }, { fetchImpl });
  assert.equal(out.broken, true);
  assert.equal(out.attempts.length, 3);
  assert.equal(out.attempts[1].rejected, true);
  assert.equal(seen[2].previousAttempts.length, 2);
});

test('loop: works offline with the local search, and reports a design that survives', async () => {
  const offline = async () => { throw new Error('offline'); };
  const out = await breakDesign({ world: 'cafe', level: 'l3', design: passing('l3'), scenario: level('l3').scenes.cafe.scenario }, { fetchImpl: offline });
  assert.equal(out.broken, true);
  assert.equal(out.source, 'search');
  assert.equal(storyReason(out.story, 'cafe'), null);
  const safe = await breakDesign({ world: 'cafe', level: 'l1', design: fortress(), scenario: level('l1').scenes.cafe.scenario }, { fetchImpl: offline });
  assert.equal(safe.survived, true);
  assert.equal(safe.broken, false);
});

test('endpoint: Gemini gets a JSON schema in its own format, and the key only in a header', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({ url, init, payload: JSON.parse(init.body) }); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ choice: 0, story: 'A tour bus pulls up outside the shop.' }) }] } }] }) }; };
  await chaosResponse({ world: 'cafe', level: 'l2', design: passing('l2'), scenario: level('l2').scenes.cafe.scenario }, { env, fetchImpl });
  const cfg = seen[0].payload.generationConfig;
  assert.equal(cfg.responseMimeType, 'application/json');
  assert.equal(cfg.responseSchema.type, 'OBJECT');
  assert.equal(cfg.responseSchema.properties.choice.type, 'INTEGER');
  assert.ok(!('additionalProperties' in cfg.responseSchema));
  assert.ok(!seen[0].url.includes('test-key'));
  assert.ok(!JSON.stringify(seen[0].payload).includes('test-key'));
});
