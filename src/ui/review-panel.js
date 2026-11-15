// The interview step under an accepted submission: the learner explains why they built the design, and the
// reviewer checks that reasoning against what the simulator measured (src/ai/review.js). Nothing here grades.
import { esc } from './state.js';

// "Why it worked" and the cost comparison wait until the learner has explained, skipped, or the reviewer failed.
export const explained = (sub) => !!sub.explain && ['done', 'skipped', 'error'].includes(sub.explain.status);

const VERDICT = { holds: ['✓', 'Holds up'], contradicted: ['✗', 'Not quite'], untested: ['?', 'Not tested here'] };

export function explainHtml(sub, w) {
  const cafe = w === 'cafe', ex = sub.explain || { status: 'ask' };
  if (ex.status === 'ask') {
    return `<section class="explain" aria-label="Explain your design">
      <h3>${cafe ? 'Walk me through your shop.' : 'Walk me through your design.'}</h3>
      <p>Like in an interview: why did you ${cafe ? 'set it up' : 'build it'} this way, and what does it cost you?</p>
      <label class="sr-only" for="explain-text">Your explanation</label>
      <textarea id="explain-text" rows="4" maxlength="600" placeholder="Two or three sentences. What does each part do, and what are you giving up?">${esc(ex.text || '')}</textarea>
      <div class="btn-row"><button class="btn primary" id="explain-send">Get feedback</button><button class="text-btn" id="explain-skip">Skip</button><span class="muted" id="explain-note" role="status"></span></div>
      <p class="muted fine">Your words are sent to an AI reviewer, which checks them against what the simulator measured. It never changes your score.</p>
    </section>`;
  }
  if (ex.status === 'loading') return `<section class="explain" aria-label="Explain your design" aria-busy="true"><h3>${cafe ? 'Walk me through your shop.' : 'Walk me through your design.'}</h3><p class="muted">Checking your reasoning against the run…</p></section>`;
  if (ex.status === 'error') return `<section class="explain" aria-label="Explain your design"><p class="muted">The reviewer could not read that just now. Your ${cafe ? 'shop' : 'design'} still passed.</p></section>`;
  if (ex.status !== 'done') return '';
  const r = ex.review;
  const claims = r.claims.map((c) => {
    const [mark, label] = VERDICT[c.verdict];
    return `<li class="claim ${c.verdict}"><span class="verdict"><i aria-hidden="true">${mark}</i> ${label}</span><q>${esc(c.said)}</q><span class="because">${esc(c.because)}</span></li>`;
  }).join('');
  return `<section class="explain done" aria-label="Your reasoning, checked">
      <h3>Your reasoning, checked against the run</h3>
      ${claims ? `<ul class="claims">${claims}</ul>` : `<p class="muted">There was no reason in that I could check against the run.</p>`}
      ${r.question ? `<div class="hint interviewer"><b>Interviewer · one more thing</b>${esc(r.question)}</div>` : ''}
      <p class="muted fine">Checked against the simulator’s numbers. It does not change your score.</p>
    </section>`;
}
