// Submit: run a design on the sample scenario and every hidden test. Pure, like the simulator.
import { simulate } from '../sim/sim.js';
import { LEVELS } from './levels.js';

// A hidden test changes the sample's shocks or base traffic; `null` removes a shock.
export function testScenario(sample, change) {
  const sc = JSON.parse(JSON.stringify(sample));
  for (const [k, v] of Object.entries(change || {})) {
    if (v === null) delete sc[k];
    else sc[k] = JSON.parse(JSON.stringify(v));
  }
  return sc;
}

// The tests Submit runs, sample first, named in the scene's world.
export function suite(level, world) {
  const sample = level.scenes[world].scenario;
  return [
    { id: 'sample', n: 1, hidden: false, name: world === 'cafe' ? 'The sample morning' : 'The sample run', story: level.scenes[world].brief, scenario: sample },
    ...(level.tests || []).map((t, i) => ({ id: t.id, n: i + 2, hidden: true, name: t.name[world], story: t.story[world], scenario: testScenario(sample, t.change) }))
  ];
}

// `design` has one `name` per block (see simDesign). Returns every result, and the first failure.
export function grade(design, levelId, world) {
  const level = LEVELS.find((l) => l.id === levelId);
  const results = suite(level, world).map((t) => {
    const log = simulate(design, t.scenario);
    return { ...t, passed: log.result.passed, checks: log.result.checks, log };
  });
  const failed = results.find((r) => !r.passed) || null;
  return { results, accepted: !failed, failed, passedCount: results.filter((r) => r.passed).length, total: results.length };
}
