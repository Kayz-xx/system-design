// The audit card under an accepted submission: 1,000 random mornings, 100 monkeys, and a skill-or-luck stamp.
// The numbers come from src/levels/audit.js, which runs the simulator; this file only lays them out.
import { audit, MONKEYS, MORNINGS, SKILL_SURVIVAL } from '../levels/audit.js';
import { MONKEY_SCORES } from '../levels/monkey-scores.js';
import { ruleWords } from '../levels/audit-words.js';
import { askTutor } from '../ai/tutor.js';
import { S, R, key, design, simDesign, world, esc, fmtN } from './state.js';

// One audit per scene and design. Editing the design makes a fresh one.
const cache = {};
const designKey = () => key() + '#' + JSON.stringify(simDesign(design()).blocks) + JSON.stringify(design().wires);

export function currentAudit() { return cache[designKey()] || null; }

export function runAudit() {
  const k = designKey();
  if (!cache[k]) {
    const a = cache[k] = { ...audit(simDesign(design()), S.level, world(), MONKEY_SCORES[S.level][world()]), fresh: true, note: null };
    if (a.mildest) askAuditor(k, a);
  }
  return cache[k];
}

// The auditor's note: Gemini words why the broken mornings break this design. The server reruns the
// audit from the design alone. With no key or a failed check, no note is shown; the rule above still is.
function askAuditor(k, a) {
  a.note = { loading: true };
  const d = design();
  askTutor({ world: world(), level: S.level, design: { blocks: d.blocks, wires: d.wires } }, { url: '/api/audit/note', fallback: '', timeoutMs: 7000 })
    .then((out) => {
      a.note = out.text ? out : null;
      const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#side input, #side select');
      if (designKey() === k && !typing && R.side) R.side();
    });
}

// The morning the Watch button replays: the mildest one that still breaks the design.
export function auditMorning() {
  const a = currentAudit();
  return a && a.mildest ? a.mildest : null;
}

// Ten bars: how many monkeys landed in each tenth of the mornings. Yours is marked.
function histogram(scores, survived) {
  const bins = Array(10).fill(0);
  for (const s of scores) bins[Math.min(9, Math.floor((s / MORNINGS) * 10))]++;
  const mine = Math.min(9, Math.floor((survived / MORNINGS) * 10));
  const max = Math.max(...bins, 1);
  return `<div class="monkey-hist" role="img" aria-label="Random designs by mornings survived, in tenths. Yours is in the ${mine * 10} to ${mine * 10 + 10}% group.">
      ${bins.map((b, i) => `<span class="col${i === mine ? ' mine' : ''}" title="${b} of ${scores.length} survived ${i * 10}–${i * 10 + 10}% of mornings">${i === mine ? '<em>You</em>' : ''}<i style="height:${Math.max(b ? 6 : 0, (b / max) * 100)}%"></i></span>`).join('')}
    </div>
    <div class="monkey-axis"><span>0%</span><span>survived</span><span>100%</span></div>`;
}

// The dots fill in once, the first time the result is shown; later redraws show them at once.
function dots(passed, fresh) {
  return `<div class="audit-dots${fresh ? ' fresh' : ''}" role="img" aria-label="${passed.filter(Boolean).length} of ${passed.length} mornings survived">${passed.map((p, i) => `<i class="${p ? 'ok' : 'bad'}" style="--i:${i}"></i>`).join('')}</div>`;
}

export function auditHtml(levelId, w) {
  const cafe = w === 'cafe';
  const a = currentAudit();
  if (!a) {
    return `<div class="audit" aria-label="Audit">
        <div class="label">${cafe ? 'Skill or luck?' : 'Robustness audit'}</div>
        <p class="muted">${cafe
          ? `Four mornings went your way. Open on ${fmtN(MORNINGS)} random mornings from inside the constraints, and see how your shop does against ${MONKEYS} shops built at random for the same budget.`
          : `Four tests passed. Run ${fmtN(MORNINGS)} random scenarios from inside the constraints, and compare with ${MONKEYS} random designs at the same budget.`}</p>
        <div class="btn-row"><button class="btn small" id="audit-btn">${cafe ? `Open on ${fmtN(MORNINGS)} random mornings` : `Run ${fmtN(MORNINGS)} random scenarios`}</button></div>
      </div>`;
  }
  const fresh = a.fresh; a.fresh = false;
  const m = a.monkeys, beat = Math.round(m.percentile * MONKEYS), share = a.survived / a.n;
  const skill = a.verdict === 'skill';
  const why = skill ? (cafe ? 'It holds up on nearly every morning, and beats 9 in 10 random shops.' : 'It survives nearly every scenario and beats 9 in 10 random designs.')
    : share < 0.95 ? (cafe ? `It passed the tests, but ${fmtN(a.n - a.survived)} random mornings still break it.` : `It passed the tests, but ${fmtN(a.n - a.survived)} random scenarios still break it.`)
      : (cafe ? 'It holds up, but so do many shops built at random for this budget.' : 'It holds up, but so do many random designs at this budget.');
  const rule = ruleWords(a.rule, w, levelId);
  const fails = a.n - a.survived;
  let breaks = '';
  if (fails) {
    breaks = rule
      ? `<p><b>${cafe ? 'It breaks when' : 'It fails when'}</b> ${esc(rule)}.<small class="muted"> ${a.rule.tp} of ${fails} broken ${cafe ? 'mornings' : 'scenarios'} fit this${a.rule.fp ? `, and ${a.rule.fp} that fit it held up` : ''}.</small></p>`
      : `<p class="muted">${cafe ? 'The broken mornings share no simple pattern.' : 'The failures share no simple pattern.'}</p>`;
    if (a.note && a.note.loading) breaks += `<div class="hint" aria-busy="true"><b>Auditor</b><span class="muted">${cafe ? 'The auditor is reading the broken mornings…' : 'The auditor is reading the failing runs…'}</span></div>`;
    else if (a.note) breaks += `<div class="hint"><b>Auditor · ${cafe ? 'from the mildest broken morning' : 'from the mildest failing run'}</b>${esc(a.note.text)}</div>`;
    breaks += `<div class="btn-row"><button class="btn small" id="audit-watch">${cafe ? 'Watch the mildest morning that breaks it' : 'Watch the mildest failing scenario'}</button></div>`;
  }
  return `<div class="audit ${skill ? 'skill' : 'lucky'}" aria-label="Audit">
      <div class="label">${cafe ? 'Skill or luck?' : 'Robustness audit'}</div>
      <div class="audit-head"><span class="stamp">${skill ? 'Skill' : 'Lucky'}</span>
        <span><b class="mono">${fmtN(a.survived)}</b> of ${fmtN(a.n)} ${cafe ? 'mornings survived' : 'scenarios passed'}</span></div>
      ${dots(a.passed, fresh)}
      <p class="${skill ? 'right' : ''}">${esc(why)}</p>
      ${skill ? '' : `<p class="muted">${cafe ? `Skill needs ${fmtN(Math.ceil(SKILL_SURVIVAL * a.n))} mornings and a better shop than 9 in 10 monkeys.` : `Skill needs ${fmtN(Math.ceil(SKILL_SURVIVAL * a.n))} passes and a better score than 9 in 10 random designs.`}</p>`}
      ${breaks}
      <div class="label audit-sub">${cafe ? `Against ${MONKEYS} random shops` : `Against ${MONKEYS} random designs`}</div>
      ${histogram(m.scores, a.survived)}
      <p class="muted">${cafe ? `Built from the same equipment for the same budget, by monkeys.` : `Same palette, same budget, picked at random.`} You did at least as well as <b>${beat} of ${MONKEYS}</b>. The average one survived ${Math.round((m.mean / a.n) * 100)}%.</p>
    </div>`;
}
