import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionGuide, applyConnectionPlan } from './build-guide.js';

const shop = () => ({ blocks: [{ id: 's', type: 'server', copies: 1 }, { id: 'db', type: 'database' }], wires: [['traffic', 's']] });

test('new equipment gets an optional valid input suggestion without changing the graph', () => {
  const d = shop(), original = structuredClone(d);
  const guide = connectionGuide(d, 'db');
  assert.equal(guide.side, 'input');
  assert.deepEqual(guide.plans, [{ add: [['s', 'db']] }]);
  assert.deepEqual(d, original);
  assert.deepEqual(applyConnectionPlan(d, guide.plans[0]).wires, [['traffic', 's'], ['s', 'db']]);
});

test('a cache is guided through its input and then its missing output', () => {
  let d = shop();
  d.blocks.push({ id: 'c', type: 'cache' });
  let guide = connectionGuide(d, 'c');
  assert.equal(guide.side, 'input');
  d = applyConnectionPlan(d, guide.plans[0]);
  guide = connectionGuide(d, 'c');
  assert.equal(guide.side, 'output');
  assert.deepEqual(guide.plans, [{ add: [['c', 'db']] }]);
  d = applyConnectionPlan(d, guide.plans[0]);
  assert.equal(connectionGuide(d), null);
});

test('inserting a shared line preserves the existing downstream path', () => {
  const d = shop(); d.blocks.push({ id: 'lb', type: 'loadBalancer' });
  d.wires.push(['s', 'db']);
  const guide = connectionGuide(d, 'lb');
  const plan = guide.plans.find((p) => p.remove);
  assert.deepEqual(applyConnectionPlan(d, plan).wires, [['s', 'db'], ['traffic', 'lb'], ['lb', 's']]);
  assert.deepEqual(d.wires, [['traffic', 's'], ['s', 'db']]);
});

test('an extra barista can suggest a shared line without adding or rewiring anything', () => {
  const d = shop(); d.blocks.push({ id: 's2', type: 'server', copies: 1 });
  const guide = connectionGuide(d, 's2');
  assert.equal(guide.addType, 'loadBalancer');
  assert.deepEqual(guide.plans, []);
  assert.equal(d.blocks.length, 3);
});

test('a stale suggestion is rejected instead of removing unrelated connections', () => {
  const d = shop(); d.blocks.push({ id: 'lb', type: 'loadBalancer' });
  const plan = connectionGuide(d, 'lb').plans.find((p) => p.remove);
  d.wires = [];
  assert.equal(applyConnectionPlan(d, plan), null);
  assert.equal(applyConnectionPlan(d, { add: [['db', 's']] }), null);
});

test('a machine-only starter suggests taking orders before configuring the machine', () => {
  const d = { blocks: [{ id: 'db', type: 'database' }], wires: [] };
  assert.equal(connectionGuide(d).addType, 'server');
});

test('a connected cache without a database can suggest adding its next stop', () => {
  const d = { blocks: [{ id: 's', type: 'server' }, { id: 'c', type: 'cache' }], wires: [['traffic', 's'], ['s', 'c']] };
  assert.equal(connectionGuide(d).addType, 'database');
});
