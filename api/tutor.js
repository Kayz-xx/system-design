// POST /api/tutor — one worded hint about a run, written by OpenAI from the simulator's log.
// Contract: docs/contracts.md. The key comes from OPENAI_API_KEY and never leaves the server.
// The server reruns simulate() itself, so the model only sees what the simulator logged,
// and the reply is checked before it is returned. Any failure returns an error; the client shows its template hint.
import { prepareTutor, rejectReason } from '../src/ai/facts.js';
import { callOpenAI, jsonHandler, OpenAIError } from './_openai.js';

const OPENAI_TIMEOUT_MS = 3500; // under the client's 4 s budget

// Framework-free core, used by the handler, the dev server and the tests.
export async function tutorResponse(body, { env = process.env, fetchImpl = fetch, timeoutMs = OPENAI_TIMEOUT_MS } = {}) {
  let prep;
  try {
    prep = prepareTutor(body);
  } catch {
    return { status: 400, json: { error: 'Could not read that run.' } };
  }
  if (prep.error) return { status: 400, json: { error: prep.error } };
  if (!env.OPENAI_API_KEY) return { status: 503, json: { error: 'The tutor is not set up.' } };

  const { prompt } = prep;
  let text;
  try {
    text = await callOpenAI({ instructions: prompt.instructions, input: prompt.input, env, fetchImpl, timeoutMs });
  } catch (e) {
    const timedOut = e instanceof OpenAIError && e.timedOut;
    return { status: timedOut ? 504 : 502, json: { error: timedOut ? 'The tutor took too long.' : 'The tutor is unavailable.' } };
  }

  const reason = rejectReason(text, { names: prompt.names, world: body.world });
  if (reason) return { status: 502, json: { error: 'The tutor reply did not pass the check.', reason } };
  return { status: 200, json: { text, step: prompt.step } };
}

export default jsonHandler((body) => tutorResponse(body));
