// Run with: npm test. The auditor endpoint redraws the survival map itself, only words facts from it,
// and its reply passes the same check as the tutor's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditNoteResponse } from '../../api/audit/note.js';
import { prepareAuditor, diagnosisOnly } from './auditor.js';
import { LEVELS } from '../levels/levels.js';

const env = { GEMINI_API_KEY: 'test-key' };
const gemini = (text, seen) => async (url, init) => {
  if (seen) seen.push(JSON.parse(init.body));
  return { ok: true, json: async () => ({ candidates: [{ content: { role: 'model', parts: [{ text }] } }] }) };
};
const l1 = (capacity) => { const d = JSON.parse(JSON.stringify(LEVELS[0].design)); d.blocks[0].capacity = capacity; d.blocks[0].queueLimit = 5000; return d; };
const l3 = () => { const d = JSON.parse(JSON.stringify(LEVELS[2].design)); d.blocks.find((b) => b.type === 'database').replicas = 2; return d; };

test('the prompt holds the redrawn map: the rule and the mildest failing run', () => {
  const p = prepareAuditor({ world: 'software', level: 'l3', design: l3() });
  assert.equal(p.result.survived, 37);
  assert.match(p.prompt.input, /survived 37 of 42 scenarios\. The worst case broke it/);
  assert.match(p.prompt.input, /PATTERN: it breaks when normal traffic is 1,060 requests a second or more and the cache restarts empty/);
  assert.match(p.prompt.input, /MILDEST FAILING RUN:\n- /);
  assert.match(p.prompt.instructions, /critique, not a hint/);
  assert.match(p.prompt.instructions, /do not ask a question/);
  assert.doesNotMatch(p.prompt.instructions, /points the learner at where to look/);
});

test('the client cannot claim a better map: numbers come from the design only', async () => {
  const seen = [];
  await auditNoteResponse({ world: 'software', level: 'l3', design: l3(), survived: 42, rule: 'none' }, { env, fetchImpl: gemini('When the cache restarts, the database gets more reads than it handles. Where does the queue grow?', seen) });
  const input = seen[0].contents[0].parts[0].text;
  assert.match(input, /survived 37 of 42/);
});

test('a design that never breaks gets no note and no model call', async () => {
  let called = false;
  const out = await auditNoteResponse({ world: 'cafe', level: 'l1', design: l1(250) }, { env, fetchImpl: async () => { called = true; } });
  assert.equal(out.status, 200);
  assert.equal(out.json.text, null);
  assert.equal(called, false);
});

test('a good note is returned; bad input, no key, failures and unchecked words are refused', async () => {
  const b = { world: 'cafe', level: 'l1', design: l1(200) };
  const ok = await auditNoteResponse(b, { env, fetchImpl: gemini('During the long rushes more customers arrive than the barista can serve, so the line grows. How much faster would the barista need to be?') });
  assert.equal(ok.status, 200);
  assert.match(ok.json.text, /barista/);
  assert.equal((await auditNoteResponse(b, { env: {}, fetchImpl: gemini('x') })).status, 503);
  assert.equal((await auditNoteResponse({ ...b, level: 'l9' }, { env, fetchImpl: gemini('x') })).status, 400);
  assert.equal((await auditNoteResponse({ ...b, design: { blocks: 'x' } }, { env, fetchImpl: gemini('x') })).status, 400);
  assert.equal((await auditNoteResponse(b, { env, fetchImpl: async () => ({ ok: false, json: async () => ({}) }) })).status, 502);
  const sw = await auditNoteResponse(b, { env, fetchImpl: gemini('The server is overloaded by requests during the spike, so add capacity.') });
  assert.equal(sw.status, 502, 'software words in the coffee shop are refused');
});

test('a note only diagnoses: questions and advice are stripped, and a reply with nothing left is refused', async () => {
  const keep = 'When the cache restarts empty, 1,060 reads a second reach the database, which handles 900. The extra requests add to the queue, so waits grow.';
  assert.equal(diagnosisOnly(`${keep} How could you increase the database's read capacity?`), keep);
  assert.equal(diagnosisOnly(`${keep} You should add more replicas. Try a bigger cache.`), keep);
  assert.equal(diagnosisOnly('Consider adding a replica. What if the cache were larger?'), '');
  assert.equal(diagnosisOnly(''), '');
  const b = { world: 'software', level: 'l3', design: l3() };
  const ok = await auditNoteResponse(b, { env, fetchImpl: gemini(`${keep} How could you increase the database's read capacity?`) });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.text, keep);
  const advice = await auditNoteResponse(b, { env, fetchImpl: gemini('You should add more replicas. How many would it take?') });
  assert.equal(advice.status, 502, 'advice alone is not shown');
});
