import test from 'node:test';
import assert from 'node:assert/strict';
import { desiredReplicas, selectReusableToken } from './planner.js';

test('desired replicas follows demand within limits', () => {
  assert.equal(desiredReplicas(0, 1, 5), 1);
  assert.equal(desiredReplicas(3, 1, 5), 3);
  assert.equal(desiredReplicas(9, 1, 5), 5);
  assert.equal(desiredReplicas(0, 1, 5), 1);
});

test('offline agent token is reused', () => {
  const token = { id: 4, value: 'offline' };
  assert.deepEqual(selectReusableToken({ agents: [{ online: false, tokenId: token.id }], tokens: [token], leases: {}, now: 10 }), token);
});

test('online and actively leased tokens are excluded', () => {
  const online = { id: 1, value: 'online' };
  const leased = { id: 2, value: 'leased' };
  const free = { id: 3, value: 'free' };
  assert.deepEqual(selectReusableToken({
    agents: [{ online: true, tokenId: online.id }], tokens: [online, leased, free],
    leases: { runner: { tokenId: 2, expiresAt: 20 } }, now: 10,
  }), free);
});
