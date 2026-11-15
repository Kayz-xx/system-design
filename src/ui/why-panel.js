// "Why it worked": under an accepted submission, one line per principle the level teaches, with the numbers
// from the design's run on the hardest test (src/levels/why.js). Coffee shop words in the café, software
// words in software.
import { whyItWorked } from '../levels/why.js';
import { SCALE } from '../levels/levels.js';
import { W, design, simDesign, esc, fmtN, fmt1 } from './state.js';

const PRINCIPLE = {
  scaling: { cafe: 'Scaling · enough baristas for the rush', software: 'Scaling · capacity for the peak' },
  redundancy: { cafe: 'Redundancy · one barista to spare', software: 'Redundancy · N+1 copies' },
  caching: { cafe: 'Caching · the fridge takes the easy orders', software: 'Caching · reads stay off the database' },
  async: { cafe: 'Queues · take the order now, make it later', software: 'Queues · accept now, write later' }
};

function line(f, cafe, Wd, sc) {
  // Numbers in the scene's units, with the noun spelled out: "24 customers a minute", "300 writes a second".
  const n = (v) => (cafe ? fmt1(v / SCALE) : fmtN(v));
  const per = cafe ? 'a minute' : 'a second';
  const rate = (v, noun) => `${n(v)}${noun ? ' ' + noun : ''} ${per}`;
  const count = (v) => (cafe ? `${fmt1(v / SCALE)} ${Math.round(v / SCALE) === 1 ? 'person' : 'people'}` : `${fmtN(v)} requests`);
  const wait = (ms) => (cafe ? `${fmt1(ms / 1000)} min` : `${fmtN(ms)} ms`);
  const people = cafe ? 'customers' : 'requests';
  switch (f.principle) {
    case 'scaling':
      if (f.line <= 0.5) {
        return cafe ? `At the busiest point ${rate(f.peak, people)} came in, and your baristas serve ${n(f.capacity)}. That leaves ${n(f.headroom)} ${per} to spare, so a line never forms.`
          : `At peak ${rate(f.peak, people)} arrived, and your servers handle ${n(f.capacity)}. That is ${n(f.headroom)} ${per} of headroom, so no queue forms.`;
      }
      return cafe ? `At the busiest point ${rate(f.peak, people)} came in, against ${n(f.capacity)} served. A line of up to ${count(f.line)} formed, but the longest wait was ${wait(f.waitMs)}, inside the ${Wd.latTarget(sc.latencyTargetMs)} limit.`
        : `At peak ${rate(f.peak, people)} arrived, against ${n(f.capacity)} served. The queue reached ${count(f.line)}, but the slowest wait was ${wait(f.waitMs)}, inside the ${Wd.latTarget(sc.latencyTargetMs)} target.`;
    case 'redundancy': {
      const enough = f.left >= f.loadDuring;
      const head = cafe ? `At ${Wd.clock(f.failT)} one of your ${f.copies} baristas went home for ${f.failDur} minutes.` : `At ${Wd.clock(f.failT)} one of your ${f.copies} copies crashed for ${f.failDur} seconds.`;
      const rest = cafe ? `The other ${f.copies - 1} still serve ${n(f.left)} ${per}, with ${n(f.loadDuring)} coming in` : `The other ${f.copies - 1} still handle ${n(f.left)} ${per}, with ${n(f.loadDuring)} arriving`;
      const tail = enough ? '.' : cafe ? ', so a short line formed and cleared.' : ', so a short queue formed and cleared.';
      return `${head} ${rest}${tail} ${cafe ? `That spare barista costs ${Wd.cost(f.spareCost)}, even on quiet days.` : `The spare copy costs ${Wd.cost(f.spareCost)}, even when nothing crashes.`}`;
    }
    case 'caching': {
      const machines = cafe ? `${f.replicas ? 1 + f.replicas : 'one'} espresso machine${f.replicas ? 's' : ''}` : f.replicas ? `the database and ${f.replicas} replica${f.replicas > 1 ? 's' : ''}` : 'the database';
      if (!f.cache) {
        return cafe ? `You skipped the fridge: ${machines} make ${rate(f.readCap, 'drinks')} and carry all ${n(f.reads)} customers themselves. It works, but a fridge would take most of them off the machines for less.`
          : `You skipped the cache: ${machines} serve ${rate(f.readCap, 'reads')} and carry all ${n(f.reads)} reads themselves. It works, but a cache would answer most of them for less.`;
      }
      const pct = Math.round(f.hit * 100);
      let s = cafe ? `The fridge serves ${pct}% of customers, so the espresso machine got at most ${n(f.dbWarm)} orders ${per} instead of ${n(f.reads)}.`
        : `The cache answers ${pct}% of reads, so the database got at most ${rate(f.dbWarm, 'reads')} instead of ${n(f.reads)}.`;
      if (f.flushT !== undefined) {
        s += cafe ? ` When it sold out at ${Wd.clock(f.flushT)}, ${n(f.dbAtFlush)} orders ${per} hit the machines at once. ${machines.charAt(0).toUpperCase() + machines.slice(1)} make ${n(f.readCap)}${f.dbQueue > 0.5 ? `, so a line of up to ${count(f.dbQueue)} formed while the fridge restocked` : ', enough for everyone'}.`
          : ` When it restarted at ${Wd.clock(f.flushT)}, ${rate(f.dbAtFlush, 'reads')} hit the database at once. Your read capacity is ${n(f.readCap)}${f.dbQueue > 0.5 ? `, so up to ${count(f.dbQueue)} queued while the cache warmed up` : ', enough for the stampede'}.`;
      }
      return s;
    }
    case 'async': {
      if (!f.queue) {
        return cafe ? `You made the machine fast enough for every app order: ${n(f.writeCap)} ${per}, against ${n(f.writes)}. It works, but you pay for that speed all day; a ticket rail would let a slower machine catch up.`
          : `You sized the database for the burst: ${rate(f.writeCap, 'writes')}, against ${n(f.writes)}. It works, but you pay for it all day; a queue would let a smaller one catch up.`;
      }
      const end = f.drainedT !== null
        ? (cafe ? `, so the last ticket came off at ${Wd.clock(f.drainedT)}` : `, so it was empty again by ${Wd.clock(f.drainedT)}`)
        : (cafe ? `. ${fmtN(f.leftAtClose / SCALE)} tickets were still on the rail at closing` : `. ${fmtN(f.leftAtClose)} writes were still queued at the end`);
      return cafe ? `The promo brought ${rate(f.writes, 'app orders')}, and the machine makes ${n(f.writeCap)}. The ticket rail took every order at once, holding up to ${fmtN(f.backlog / SCALE)} of its ${fmtN(f.limit / SCALE)} tickets, and baristas pulled ${n(f.drainRate)} ${per}${end}.`
        : `The burst sent ${rate(f.writes, 'writes')}, and the database takes ${n(f.writeCap)}. The queue accepted every one, holding up to ${fmtN(f.backlog)} of its ${fmtN(f.limit)}, while workers drained ${n(f.drainRate)} ${per}${end}.`;
    }
    default: return '';
  }
}

export function whyHtml(lv, w) {
  const out = whyItWorked(simDesign(design()), lv.id, w);
  if (!out.passed || !out.facts.length) return '';
  const cafe = w === 'cafe', Wd = W();
  const items = out.facts.map((f) => `<li><b>${esc(PRINCIPLE[f.principle][w])}</b><span>${esc(line(f, cafe, Wd, out.scenario))}</span></li>`).join('');
  const lead = cafe ? `On Test ${out.test.n}, ${esc(out.test.name)}, the hardest morning in the brief:` : `On Test ${out.test.n}, ${esc(out.test.name)}, the worst case in the constraints:`;
  return `<section class="why-worked" aria-label="Why it worked"><div class="label">Why it worked</div><p>${lead}</p><ol>${items}</ol></section>`;
}

// For tests: the plain lines without markup.
export function whyLines(lv, w) {
  const out = whyItWorked(simDesign(design()), lv.id, w);
  return out.facts.map((f) => line(f, w === 'cafe', W(), out.scenario));
}

