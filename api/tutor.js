// POST /api/tutor — one worded hint about a run, written by OpenAI from the simulator's log.
// Contract: docs/contracts.md. The key comes from OPENAI_API_KEY and never leaves the server.
// The server reruns simulate() itself, so the model only sees what the simulator logged,
// and the reply is checked before it is returned. Any failure returns an error; the client shows its template hint.
import { prepareTutor, rejectReason } from '../src/ai/facts.js';

const DEFAULT_MODEL = 'gpt-4.1-mini';
const OPENAI_TIMEOUT_MS = 3500; // under the client's 4 s budget
const MAX_BODY = 64 * 1024;

const outputText = (data) => {
  if (typeof data.output_text === 'string') return data.output_text;
  return (data.output || [])
    .flatMap((o) => o.content || [])
    .filter((c) => c.type === 'output_text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('');
};

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
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let text;
  try {
    const res = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || DEFAULT_MODEL,
        instructions: prompt.instructions,
        input: prompt.input,
        max_output_tokens: 220,
        store: false
      }),
      signal: ctrl.signal
    });
    if (!res.ok) return { status: 502, json: { error: 'The tutor is unavailable.' } };
    text = outputText(await res.json()).trim();
  } catch (e) {
    const timedOut = e && e.name === 'AbortError';
    return { status: timedOut ? 504 : 502, json: { error: timedOut ? 'The tutor took too long.' : 'The tutor is unavailable.' } };
  } finally {
    clearTimeout(timer);
  }

  const reason = rejectReason(text, { names: prompt.names, world: body.world });
  if (reason) return { status: 502, json: { error: 'The tutor reply did not pass the check.', reason } };
  return { status: 200, json: { text, step: prompt.step } };
}

async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new Error('too large');
  }
  return raw ? JSON.parse(raw) : null;
}

// Vercel-style Node handler.
export default async function handler(req, res) {
  const send = (status, json) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(json));
  };
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return send(405, { error: 'Use POST.' });
  }
  let body;
  try {
    body = await readBody(req);
  } catch {
    return send(400, { error: 'Send a JSON body.' });
  }
  const out = await tutorResponse(body);
  return send(out.status, out.json);
}
