// One call to Gemini (generateContent), shared by the endpoints. Server-side only.
// Works with an AI Studio key (AIza…, generativelanguage.googleapis.com) or a Vertex AI express key
// (AQ.…, aiplatform.googleapis.com, billed to Google Cloud). GEMINI_API=studio|vertex overrides the guess.
// Throws on any failure; the endpoints turn that into an error response and the client falls back.
export const DEFAULT_MODEL = 'gemini-2.5-flash';
export const hasKey = (env) => !!env.GEMINI_API_KEY;

export function endpointFor(env, model) {
  const api = env.GEMINI_API || (String(env.GEMINI_API_KEY).startsWith('AQ.') ? 'vertex' : 'studio');
  const m = encodeURIComponent(model);
  return api === 'vertex'
    ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${m}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
}

export class LLMError extends Error {
  constructor(message, timedOut = false) { super(message); this.timedOut = timedOut; }
}

const outputText = (data) => ((data.candidates || [])[0]?.content?.parts || [])
  .filter((p) => typeof p.text === 'string' && !p.thought)
  .map((p) => p.text)
  .join('');

// Gemini's response schema uses upper-case OpenAPI types and has no additionalProperties.
const toGeminiSchema = (s) => {
  const out = { type: String(s.type).toUpperCase() };
  if (s.description) out.description = s.description;
  if (s.properties) out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
  if (s.required) out.required = s.required;
  if (s.items) out.items = toGeminiSchema(s.items);
  return out;
};

// `schema` (optional) asks for JSON output and returns the parsed object.
export async function callLLM({ instructions, input, schema, maxTokens = 220, env = process.env, fetchImpl = fetch, timeoutMs = 3500 }) {
  if (!hasKey(env)) throw new LLMError('no key');
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const generationConfig = { maxOutputTokens: maxTokens, temperature: 0.4 };
  // Flash models think by default, which spends the output budget and adds seconds. Short hints do not need it.
  if (/flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  if (schema) Object.assign(generationConfig, { responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema.schema) });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(endpointFor(env, model), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig
      }),
      signal: ctrl.signal
    });
    if (!res.ok) {
      // Log Gemini's own reason (never the key), so a billing or model problem is visible in the server log.
      const detail = await res.json().then((j) => j.error && j.error.message, () => '').catch(() => '');
      console.warn(`[gemini] ${model} returned ${res.status}${detail ? ': ' + String(detail).trim().slice(0, 200) : ''}`);
      throw new LLMError(`status ${res.status}`);
    }
    const text = outputText(await res.json()).trim();
    if (!schema) return text;
    try { return JSON.parse(text); } catch { throw new LLMError('bad json'); }
  } catch (e) {
    if (e instanceof LLMError) throw e;
    throw new LLMError(e && e.name === 'AbortError' ? 'timeout' : 'network', e && e.name === 'AbortError');
  } finally {
    clearTimeout(timer);
  }
}

// Shared Node handler plumbing for POST JSON endpoints.
export function jsonHandler(core, { maxBody = 64 * 1024 } = {}) {
  return async function handler(req, res) {
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
      if (req.body !== undefined) body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      else {
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > maxBody) throw new Error('too large');
        }
        body = raw ? JSON.parse(raw) : null;
      }
    } catch {
      return send(400, { error: 'Send a JSON body.' });
    }
    const out = await core(body);
    return send(out.status, out.json);
  };
}
