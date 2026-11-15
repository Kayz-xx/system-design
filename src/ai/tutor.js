// Client for the AI tutor. Browser-safe: no key, no secrets, only a call to our own /api/tutor.
// Usage from the coach column (ui-panels):
//   const { text, source } = await askTutor(request, { fallback: scene.hints[step - 1] });
// `source` is 'ai' when the tutor answered and 'template' otherwise. Escape `text` before putting it in HTML.

export const TUTOR_TIMEOUT_MS = 4000;

// Build the request body from what the UI already has. `design` is the board's design (with `names`).
export function tutorRequest({ world, level, design, scenario, log, prediction, hintStep }) {
  return {
    world,
    level,
    design: { blocks: design.blocks, wires: design.wires },
    scenario,
    events: log ? log.events : [],
    result: log ? log.result : {},
    prediction: prediction || null,
    hintStep
  };
}

export async function askTutor(body, { fallback = '', timeoutMs = TUTOR_TIMEOUT_MS, fetchImpl = globalThis.fetch, url = '/api/tutor' } = {}) {
  const template = { text: fallback, source: 'template' };
  if (typeof fetchImpl !== 'function') return template;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!res.ok) return template;
    const data = await res.json();
    if (!data || typeof data.text !== 'string' || !data.text.trim()) return template;
    return { text: data.text.trim(), source: 'ai' };
  } catch {
    return template;
  } finally {
    clearTimeout(timer);
  }
}

// The design review (POST /api/review): the learner's explanation of a passing design, checked by the server against
// the simulator. Resolves to { ok: true, claims, question } or { ok: false }; the card just moves on without it.
export const REVIEW_TIMEOUT_MS = 12000;
export async function askReview(body, { timeoutMs = REVIEW_TIMEOUT_MS, fetchImpl = globalThis.fetch, url = '/api/review' } = {}) {
  if (typeof fetchImpl !== 'function') return { ok: false };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    if (!data || !Array.isArray(data.claims)) return { ok: false };
    return { ok: true, claims: data.claims, question: typeof data.question === 'string' ? data.question : '' };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}
