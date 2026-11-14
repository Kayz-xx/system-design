// One call to the OpenAI Responses API, shared by the endpoints. Server-side only.
// Throws on any failure; the endpoints turn that into an error response and the client falls back.
export const DEFAULT_MODEL = 'gpt-4.1-mini';

export class OpenAIError extends Error {
  constructor(message, timedOut = false) { super(message); this.timedOut = timedOut; }
}

const outputText = (data) => {
  if (typeof data.output_text === 'string') return data.output_text;
  return (data.output || [])
    .flatMap((o) => o.content || [])
    .filter((c) => c.type === 'output_text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('');
};

// `schema` (optional) asks for strict JSON output and returns the parsed object.
export async function callOpenAI({ instructions, input, schema, maxTokens = 220, env = process.env, fetchImpl = fetch, timeoutMs = 3500 }) {
  if (!env.OPENAI_API_KEY) throw new OpenAIError('no key');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || DEFAULT_MODEL,
        instructions,
        input,
        max_output_tokens: maxTokens,
        store: false,
        ...(schema ? { text: { format: { type: 'json_schema', name: schema.name, schema: schema.schema, strict: true } } } : {})
      }),
      signal: ctrl.signal
    });
    if (!res.ok) throw new OpenAIError(`status ${res.status}`);
    const text = outputText(await res.json()).trim();
    if (!schema) return text;
    try { return JSON.parse(text); } catch { throw new OpenAIError('bad json'); }
  } catch (e) {
    if (e instanceof OpenAIError) throw e;
    throw new OpenAIError(e && e.name === 'AbortError' ? 'timeout' : 'network', e && e.name === 'AbortError');
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
