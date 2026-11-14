import test from 'node:test';
import assert from 'node:assert/strict';
import { predError } from './coach.js';
import { S, stars } from './state.js';

// No DOM or server required: grading must remain tied to observed run metrics.
test('prediction error distinguishes a real zero from an unobserved recovery', () => {
  assert.equal(predError(0, 0), 0);
  assert.equal(predError(10, 0), 1);
  for (const unobserved of [null, undefined, Infinity, NaN]) {
    assert.equal(predError(100, unobserved), null);
  }
});

test('prediction error compares finite measurements and caps large errors', () => {
  assert.equal(predError(50, 50), 0);
  assert.equal(predError(20, 50), 0.6);
  assert.equal(predError(1000, 50), 1);
  assert.equal(predError(NaN, 50), null);
});

test('an unscored first software attempt cannot earn an accuracy star', () => {
  const previous = S.attempts;
  try {
    S.attempts = {
      'l1:cafe': [{ passed: true }],
      'l1:software': [{ passed: false, err: null }, { passed: true, err: 0 }]
    };
    assert.deepEqual(stars('l1'), [true, true, false]);
    S.attempts['l1:software'] = [{ passed: false, err: 0.15 }, { passed: true, err: 1 }];
    assert.deepEqual(stars('l1'), [true, true, true]);
    S.attempts['l1:software'] = [{ passed: true, err: 0.16 }, { passed: true, err: 0 }];
    assert.deepEqual(stars('l1'), [true, true, false]);
  } finally {
    S.attempts = previous;
  }
});
