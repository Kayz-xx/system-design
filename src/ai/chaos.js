// Browser loop for the chaos agent: plan, simulate, retry up to five times.
// Only an attack that simulate() confirms breaks the design is returned as `broken`.
// If /api/chaos/plan is unreachable, the same deterministic search runs here, so the button always works.
//
//   const out = await breakDesign({ world, level, design, scenario });
//   out.broken  → { attack, story, facts, log, attempts, source }   show story + facts, replay log on the board
//   out.survived → { attempts }                                      "Nothing we tried broke it."
import { cleanDesign } from './facts.js';
import { DEFAULT_BUDGET, cleanAttack, describeAttack, searchAttacks, storyReason, templateStory, tryAttack } from './attacks.js';

export const MAX_ATTEMPTS = 5;
export const PLAN_TIMEOUT_MS = 7000;

async function plan(body, { fetchImpl, timeoutMs, url }) {
  if (typeof fetchImpl !== 'function') return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function breakDesign({ world, level, design, scenario, budget = DEFAULT_BUDGET },
  { fetchImpl = globalThis.fetch, timeoutMs = PLAN_TIMEOUT_MS, url = '/api/chaos/plan', maxAttempts = MAX_ATTEMPTS } = {}) {
  const d = cleanDesign(design, world);
  if (!d) return { survived: false, broken: false, error: 'The design is not valid.', attempts: [] };
  const attempts = [];
  let offline = false, local = null;

  for (let i = 0; i < maxAttempts; i++) {
    let proposal = null, source = 'search';
    if (!offline) {
      proposal = await plan({ world, level, design: { blocks: design.blocks, wires: design.wires }, scenario, budget,
        previousAttempts: attempts.map((a) => ({ attack: a.attack, result: a.result })) }, { fetchImpl, timeoutMs, url });
      if (proposal === null) offline = true;
      else if (proposal.survived) return { survived: true, broken: false, attempts };
      else source = proposal.source || 'ai';
    }
    if (offline) {
      local = local || searchAttacks(d, scenario, budget, { limit: maxAttempts });
      const tried = new Set(attempts.map((a) => JSON.stringify(a.attack)));
      const next = local.find((c) => !tried.has(JSON.stringify(c.attack)));
      if (!next) return { survived: true, broken: false, attempts };
      proposal = { attack: next.attack, story: templateStory(next.attack, world) };
    }

    const attack = cleanAttack(proposal.attack, scenario, d, budget);
    if (!attack) { attempts.push({ attack: proposal.attack, result: null, rejected: true }); continue; }
    const r = tryAttack(d, scenario, attack);
    attempts.push({ attack, result: r.log.result });
    if (r.broke) {
      const story = storyReason(proposal.story, world) ? templateStory(attack, world) : proposal.story.trim();
      return { broken: true, survived: false, attack, story, facts: describeAttack(attack, scenario, d, world), log: r.log, attempts, source };
    }
  }
  return { survived: true, broken: false, attempts };
}
