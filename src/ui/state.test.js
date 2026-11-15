import test from 'node:test';
import assert from 'node:assert/strict';
import { playbackTick, advancePlayback } from './state.js';

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

test('paused playback preserves its position and resumes without jumping ahead', () => {
  const clock = { lastFrame: 1000, elapsedMs: 0, paused: false };
  assert.equal(advancePlayback(clock, 1500, 12, 150), 6);
  clock.paused = true;
  assert.equal(advancePlayback(clock, 2500, 12, 150), 6);
  assert.equal(advancePlayback(clock, 12500, 12, 150), 6);
  clock.paused = false;
  assert.equal(advancePlayback(clock, 13000, 12, 150), 12);
  assert.equal(advancePlayback(clock, 30000, 12, 150), 149);
});
