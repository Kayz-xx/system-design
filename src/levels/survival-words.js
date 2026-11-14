// Plain words for a survival-map rule, in the scene's world. Pure, so the map and the auditor endpoint
// say exactly the same thing.
import { LEVELS, SCALE } from './levels.js';

const fmtN = (n) => Math.round(n).toLocaleString('en-US');
const fmt1 = (n) => (Math.abs(n) >= 10 ? fmtN(n) : String(Math.round(n * 10) / 10));
const clock = (t, cafe) => {
  const m = cafe ? 450 + t : t;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

function condWords(c, w, noun) {
  const cafe = w === 'cafe';
  const rate = (v) => (cafe ? `${fmt1(v / SCALE)} ${noun} a minute` : `${fmtN(v)} ${noun} a second`);
  const dur = (v) => (cafe ? `${v} minutes` : `${v} seconds`);
  const more = c.op === '>=' ? 'or more' : 'or less';
  const when = c.op === '>=' ? 'or later' : 'or earlier';
  const at = clock(c.value, cafe);
  switch (c.dim) {
    case 'base': return cafe ? `a normal morning brings ${rate(c.value)} ${more}` : `normal traffic is ${rate(c.value)} ${more}`;
    case 'spike': return cafe ? 'a rush comes' : 'a spike comes';
    case 'spikeLoad': return cafe ? `the rush brings ${rate(c.value)} ${more}` : `the spike reaches ${rate(c.value)} ${more}`;
    case 'spikeDur': return cafe ? `the rush lasts ${dur(c.value)} ${more}` : `the spike lasts ${dur(c.value)} ${more}`;
    case 'spikeT': return cafe ? `the rush starts at ${at} ${when}` : `the spike starts at ${at} ${when}`;
    case 'fail': return cafe ? 'a barista goes home sick' : 'a copy crashes';
    case 'failT': return cafe ? `a barista goes home sick at ${at} ${when}` : `a copy crashes at ${at} ${when}`;
    case 'failDur': return cafe ? `the sick barista is out for ${dur(c.value)} ${more}` : `the crash lasts ${dur(c.value)} ${more}`;
    case 'flush': return cafe ? 'the fridge sells out' : 'the cache restarts empty';
    case 'flushT': return cafe ? `the fridge sells out at ${at} ${when}` : `the cache restarts at ${at} ${when}`;
    default: return '';
  }
}

export function ruleWords(rule, w, levelId) {
  if (!rule || !rule.conds.length) return '';
  const lv = LEVELS.find((l) => l.id === levelId);
  const noun = (lv.map.noun && lv.map.noun[w]) || (w === 'cafe' ? 'customers' : 'requests');
  return rule.conds.map((c) => condWords(c, w, noun)).join(' and ');
}
