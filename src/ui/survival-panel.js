// The survival map sheet: every morning on a grid of the level's two main knobs, green where the design
// holds and red where it breaks, with the tests marked on it. The numbers come from src/levels/survival.js,
// which runs the simulator; this file only lays them out.
import { survivalMap } from '../levels/survival.js';
import { ruleWords } from '../levels/survival-words.js';
import { LEVELS, SCALE } from '../levels/levels.js';
import { askTutor } from '../ai/tutor.js';
import { S, R, W, key, design, simDesign, world, esc, fmt1, fmtN } from './state.js';

// One map per scene and design. Editing the design draws a fresh one.
const cache = {};
const designKey = () => key() + '#' + JSON.stringify(simDesign(design()).blocks) + JSON.stringify(design().wires);

export function currentMap() { return cache[designKey()] || null; }

export function drawMap() {
  const k = designKey();
  if (!cache[k]) {
    const m = cache[k] = { ...survivalMap(simDesign(design()), S.level, world()), note: null };
    if (m.mildest) askAuditor(k, m);
  }
  return cache[k];
}

// The auditor's note: Gemini words why the red mornings break this design. The server redraws the map
// from the design alone. With no key or a failed check, no note is shown; the rule still is.
function askAuditor(k, m) {
  m.note = { loading: true };
  const d = design();
  askTutor({ world: world(), level: S.level, design: { blocks: d.blocks, wires: d.wires } }, { url: '/api/audit/note', fallback: '', timeoutMs: 7000 })
    .then((out) => {
      m.note = out.text ? out : null;
      const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#side input, #side select');
      if (designKey() === k && !typing && R.side) R.side();
    });
}

// The morning a cell or the Watch button replays.
export function mapMorning(index) {
  const m = currentMap();
  if (!m) return null;
  if (index === 'mildest') return m.mildest;
  return m.cells[Number(index)] || null;
}

// Axis names and values in the scene's words.
function axis(dim, w, noun) {
  const cafe = w === 'cafe';
  const rate = (v) => (cafe ? `${fmt1(v / SCALE)}/min` : `${fmtN(v)}/s`);
  const len = (v) => (cafe ? `${v} min` : `${v} s`);
  switch (dim) {
    case 'spikeDur': return { name: cafe ? 'How long the rush lasts' : 'How long the spike lasts', v: len };
    case 'spikeLoad': return { name: cafe ? `Rush size (${noun})` : `Spike size (${noun})`, v: rate };
    case 'base': return { name: cafe ? `Normal morning (${noun})` : `Normal traffic (${noun})`, v: rate };
    case 'failDur': return { name: cafe ? 'How long a barista is out sick' : 'How long a copy is down', v: len };
    case 'flush': return { name: '', v: (v) => (v ? (cafe ? 'Fridge sells out' : 'Cache restarts') : (cafe ? 'Fridge stays stocked' : 'Cache stays warm')) };
    default: return { name: dim, v: String };
  }
}

// The auditor's words about the design: a loading line while Gemini reads, the note once it passes the
// check, and nothing if there is no key or the reply failed.
function noteHtml(m, cafe) {
  if (m.note && m.note.loading) return `<div class="hint auditor" aria-busy="true"><b>Auditor</b><span class="muted">${cafe ? 'The auditor is reading the red mornings…' : 'The auditor is reading the failing runs…'}</span></div>`;
  if (m.note) return `<div class="hint auditor"><b>Auditor · ${cafe ? 'from the mildest red morning' : 'from the mildest failing run'}</b>${esc(m.note.text)}</div>`;
  return '';
}

// The one action the map offers, shown in the card's pinned footer so it is never scrolled out of reach.
export function mapActionsHtml(w) {
  const m = currentMap();
  if (!m || !m.mildest) return '';
  return `<button class="btn primary" data-cell="mildest">${w === 'cafe' ? 'Watch the mildest morning that breaks it' : 'Watch the mildest failing scenario'}</button>`;
}

export function mapHtml(levelId, w) {
  const m = currentMap();
  if (!m) return '';
  const cafe = w === 'cafe', Wd = W();
  const lv = LEVELS.find((l) => l.id === levelId);
  const noun = (lv.map.noun && lv.map.noun[w]) || (cafe ? 'customers' : 'requests');
  const ax = axis(m.x.dim, w, noun), ay = axis(m.y.dim, w, noun);
  const unit = cafe ? 'mornings' : 'scenarios';
  const testAt = {};
  m.tests.filter((t) => t.x !== null).forEach((t) => { (testAt[`${t.x}:${t.y}`] ||= []).push(t); });
  const cols = m.x.values.length;

  // Rows top to bottom go from the hardest value of the y knob to the easiest.
  const rows = [...m.y.values].reverse().map((yv) => {
    const cells = m.x.values.map((xv) => {
      const i = m.cells.findIndex((c) => c.x === xv && c.y === yv), c = m.cells[i];
      const here = testAt[`${xv}:${yv}`] || [];
      const tip = `${ay.name ? ay.name + ' ' : ''}${ay.v(yv)} · ${ax.name} ${ax.v(xv)} · ${c.passed ? 'holds' : 'breaks'}${here.length ? ` · Test ${here.map((t) => t.n).join(', ')}` : ''}`;
      return `<button class="cell ${c.passed ? 'ok' : 'bad'}${here.length ? ' test' : ''}" data-cell="${i}" title="${esc(tip)}" aria-label="${esc(tip)}">${here.length ? `<span>${here.map((t) => t.n).join('')}</span>` : ''}</button>`;
    }).join('');
    return `<span class="ylab">${esc(ay.v(yv))}</span><div class="map-row" style="--cols:${cols}">${cells}</div>`;
  });
  const showY = (i, n) => i === 0 || i === n - 1 || n <= 3;
  const rowsHtml = rows.map((r, i) => (showY(i, rows.length) ? r : r.replace(/<span class="ylab">.*?<\/span>/, '<span class="ylab"></span>'))).join('');

  const worst = m.worst.passed
    ? `<p class="right">✓ ${cafe ? 'It survives the worst morning in the brief, so it survives every easier one too.' : 'It survives the worst case in the constraints, so it survives every easier one too.'}</p>`
    : `<p class="wrong">✗ ${cafe ? 'The worst morning in the brief breaks it.' : 'The worst case in the constraints breaks it.'}</p>`;
  const rule = ruleWords(m.rule, w, levelId);
  let breaks = '';
  if (m.mildest) {
    breaks = rule ? `<p><b>${cafe ? 'It breaks when' : 'It fails when'}</b> ${esc(rule)}.</p>` : '';
    breaks += noteHtml(m, cafe);
  }
  const off = m.tests.filter((t) => t.x === null);
  const fixedNote = Object.keys(lv.map.fixed).filter((k) => k === 'base').length
    ? (cafe ? `Every square has the busiest normal morning, ${fmt1(lv.map.fixed.base / SCALE)} ${noun} a minute.` : `Every square has the busiest normal traffic, ${fmtN(lv.map.fixed.base)} ${noun} a second.`)
    : '';
  const intro = cafe ? 'Every square is one morning from the brief, from quiet to the worst case. The numbers are your tests.' : 'Every square is one scenario from the constraints, from easy to the worst case. The numbers are your tests.';
  // The verdict and the explanation come first; the map is the evidence below them.
  return `<div class="survival" aria-label="Survival map">
      <div class="map-why">
        <div class="map-verdict"><p><b class="mono">${m.survived}</b> of ${m.total} ${unit} on this map hold up.</p>${worst}</div>
        ${breaks}
      </div>
      <div class="map-block">
        <p class="muted">${intro}</p>
        <div class="map" role="group" aria-label="${esc(`${m.survived} of ${m.total} ${unit} hold up. Across: ${ax.name}. Up: ${ay.name || 'with or without the shock'}.`)}">
          ${ay.name ? `<span class="map-yname">${esc(ay.name)} ↑</span>` : ''}
          <div class="map-grid">${rowsHtml}<span class="ylab"></span><div class="map-x"><span>${esc(ax.v(m.x.values[0]))}</span><span>${esc(ax.name)} →</span><span>${esc(ax.v(m.x.values[cols - 1]))}</span></div></div>
        </div>
        <div class="map-key"><span><i class="ok"></i>${cafe ? 'Holds up' : 'Passes'}</span><span><i class="bad"></i>${cafe ? 'Breaks' : 'Fails'}</span><span><i class="test-key">2</i>A test from Submit</span></div>
        <p class="muted">${esc(fixedNote)} ${cafe ? 'Tap a square to watch that morning.' : 'Select a square to replay that scenario.'}</p>
        ${off.length ? `<p class="muted">Also tested, off the map: ${off.map((t) => `Test ${t.n} · ${esc(t.name)} ${t.passed ? '✓' : '✗'}`).join(' · ')}</p>` : ''}
      </div>
    </div>`;
}

// Words for the label of a replayed square.
export function cellLabel(c, w, levelId) {
  const lv = LEVELS.find((l) => l.id === levelId), cafe = w === 'cafe';
  const noun = (lv.map.noun && lv.map.noun[w]) || (cafe ? 'customers' : 'requests');
  const ax = axis(lv.map.x.dim, w, noun), ay = axis(lv.map.y.dim, w, noun);
  return `${cafe ? 'Map morning' : 'Map scenario'} · ${ay.v(c.y)}, ${ax.v(c.x)}`;
}
