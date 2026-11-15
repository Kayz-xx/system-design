// POST /api/audit/note — the auditor's note: why the mornings that break a design on its survival map break it.
// Body: { world, level, design }. The server redraws the map itself; the client's numbers are never used.
// The note only says what breaks and why: advice and questions are stripped, and a way to fix it comes from the stored best design instead.
// Any failure returns an error, and the audit card simply shows no note.
import { prepareAuditor, diagnosisOnly } from '../../src/ai/auditor.js';
import { rejectReason } from '../../src/ai/facts.js';
import { callLLM, hasKey, jsonHandler, LLMError } from '../_llm.js';

const LLM_TIMEOUT_MS = 3500;

export async function auditNoteResponse(body, { env = process.env, fetchImpl = fetch, timeoutMs = LLM_TIMEOUT_MS } = {}) {
  let prep;
  try {
    prep = prepareAuditor(body);
  } catch {
    return { status: 400, json: { error: 'Could not read that design.' } };
  }
  if (prep.error) return { status: 400, json: { error: prep.error } };
  if (!prep.prompt) return { status: 200, json: { text: null, survived: prep.result.survived } };
  if (!hasKey(env)) return { status: 503, json: { error: 'The auditor is not set up.' } };

  let text;
  try {
    text = await callLLM({ instructions: prep.prompt.instructions, input: prep.prompt.input, maxTokens: 260, env, fetchImpl, timeoutMs });
  } catch (e) {
    const timedOut = e instanceof LLMError && e.timedOut;
    return { status: timedOut ? 504 : 502, json: { error: timedOut ? 'The auditor took too long.' : 'The auditor is unavailable.' } };
  }
  text = diagnosisOnly(text);
  if (!text) return { status: 502, json: { error: 'The auditor reply did not pass the check.', reason: 'only advice or questions' } };
  const reason = rejectReason(text, { names: prep.prompt.names, world: body.world });
  if (reason) return { status: 502, json: { error: 'The auditor reply did not pass the check.', reason } };
  return { status: 200, json: { text, survived: prep.result.survived } };
}

export default jsonHandler((body) => auditNoteResponse(body));
