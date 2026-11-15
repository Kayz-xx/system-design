// POST /api/review — the learner explains why they built a passing design; Gemini checks that reasoning against
// what the simulator measured. Body: { world, level, design, explanation }. The server reruns the simulator and
// refuses a design that has not passed every test, so the model reads real numbers and nothing here grades.
// Reply: { claims: [{ said, verdict, because }], question }. Any failure returns an error; the card just moves on.
import { prepareReview, checkReview, REVIEW_SCHEMA } from '../src/ai/review.js';
import { callLLM, hasKey, jsonHandler, LLMError } from './_llm.js';

const LLM_TIMEOUT_MS = 10000; // under the client's 12 s budget

export async function reviewResponse(body, { env = process.env, fetchImpl = fetch, timeoutMs = LLM_TIMEOUT_MS } = {}) {
  let prep;
  try {
    prep = prepareReview(body);
  } catch {
    return { status: 400, json: { error: 'Could not read that design.' } };
  }
  if (prep.error) return { status: 400, json: { error: prep.error } };
  if (!hasKey(env)) return { status: 503, json: { error: 'The reviewer is not set up.' } };

  let raw;
  try {
    raw = await callLLM({ instructions: prep.prompt.instructions, input: prep.prompt.input, schema: REVIEW_SCHEMA, maxTokens: 700, env, fetchImpl, timeoutMs });
  } catch (e) {
    const timedOut = e instanceof LLMError && e.timedOut;
    return { status: timedOut ? 504 : 502, json: { error: timedOut ? 'The reviewer took too long.' : 'The reviewer is unavailable.' } };
  }
  const review = checkReview(raw, prep);
  if (!review) return { status: 502, json: { error: 'The review did not pass the check.' } };
  return { status: 200, json: review };
}

export default jsonHandler((body) => reviewResponse(body), { maxBody: 16 * 1024 });
