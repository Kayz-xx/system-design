// Optional wiring suggestions. All connections still use the simulator's wiring rules.
import { canWire } from '../sim/sim.js';

export function applyConnectionPlan(design, plan) {
  if (!plan || !Array.isArray(plan.add) || !plan.add.length) return null;
  const removed = plan.remove || [];
  if (removed.some(([a, b]) => !design.wires.some(([x, y]) => x === a && y === b))) return null;
  const next = { ...design, wires: design.wires.filter(([a, b]) => !removed.some(([x, y]) => x === a && y === b)) };
  for (const [from, to] of plan.add) {
    if (!canWire(next, from, to).ok) return null;
    next.wires.push([from, to]);
  }
  return next;
}

export function connectionGuide(design, preferredId) {
  const needs = (block) => {
    if (!design.wires.some(([, to]) => to === block.id)) return 'input';
    if (['cache', 'queue', 'loadBalancer'].includes(block.type) && !design.wires.some(([from]) => from === block.id)) return 'output';
    return null;
  };
  const preferred = design.blocks.find((b) => b.id === preferredId);
  const block = preferred && needs(preferred) ? preferred : design.blocks.find(needs);
  if (!block) return null;
  const side = needs(block), plans = [];
  const ids = ['traffic', ...design.blocks.map((b) => b.id)];
  for (const id of ids) {
    const edge = side === 'input' ? [id, block.id] : [block.id, id];
    if (canWire(design, ...edge).ok) plans.push({ add: [edge] });
  }
  // A shared line can be inserted into the existing entrance, without asking the
  // learner to first discover that its old connection must be removed.
  if (side === 'input' && block.type === 'loadBalancer') {
    const entry = design.wires.find(([from]) => from === 'traffic');
    if (entry) {
      const plan = { remove: [entry], add: [['traffic', block.id], [block.id, entry[1]]] };
      if (applyConnectionPlan(design, plan)) plans.push(plan);
    }
  }
  let addType = null;
  if (!plans.length) {
    if (!design.blocks.some((b) => b.type === 'server')) addType = 'server';
    else if (side === 'output' && ['cache', 'queue'].includes(block.type) && !design.blocks.some((b) => b.type === 'database')) addType = 'database';
    else if (block.type === 'server' && !design.blocks.some((b) => b.type === 'loadBalancer')) addType = 'loadBalancer';
  }
  return { block, side, plans, addType };
}
