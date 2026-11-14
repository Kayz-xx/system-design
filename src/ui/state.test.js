import test from 'node:test';
import assert from 'node:assert/strict';
import { playbackTick } from './state.js';

test('the first frame cannot address a negative simulation tick', () => {
  assert.equal(playbackTick(999.8, 1000, 42, 150), 0);
  assert.equal(playbackTick(1000, 1000, 42, 150), 0);
});

test('playback advances in simulation ticks at its configured speed', () => {
  assert.equal(playbackTick(1500, 1000, 42, 150), 21);
  assert.equal(playbackTick(2000, 1000, 42, 150), 42);
});

test('late frames stop at the last tick instead of indexing beyond the log', () => {
  assert.equal(playbackTick(20000, 1000, 42, 150), 149);
  assert.equal(playbackTick(20000, 1000, 42, 1), 0);
});
