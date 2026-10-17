import test from 'node:test';
import assert from 'node:assert/strict';
import { FramePool, frameBuffers } from '../frame-pool.js';

const state = (count = 4) => ({ positions: Float32Array.from({ length: count * 3 }, (_, i) => i / 2), types: new Uint16Array(count).fill(255), energies: new Float32Array(count).fill(2), bonds: new Map([[0, [1, count - 1]]]) });
const transfer = frame => structuredClone(frame, { transfer: frameBuffers(frame) });

test('frame pool bounds outstanding frames and recycles transferred ownership', () => {
  const pool = new FramePool(2), sim = state();
  const first = transfer(pool.publish(pool.acquire(4, 1), sim));
  const second = transfer(pool.publish(pool.acquire(4, 1), sim));
  assert.equal(pool.acquire(4, 1), null);
  assert.equal(first.types[0], 255); assert.deepEqual([...first.bonds], [1, 3]);
  assert.equal(sim.positions.byteLength, 48, 'physics buffers remain owned by simulation');
  const returned = transfer(first);
  assert.equal(first.positions.byteLength, 0, 'main relinquishes the obsolete frame');
  assert.ok(pool.recycle(returned));
  assert.equal(pool.recycle(returned), false, 'duplicate return is ignored');
  sim.positions[0] = 90;
  const third = transfer(pool.publish(pool.acquire(4, 1), sim));
  assert.equal(third.positions[0], 90);
  assert.equal(second.positions[0], 0, 'in-flight frame must not be overwritten');
});

test('pool handles resized worlds, wider endpoints, and rejects malformed returns', () => {
  const pool = new FramePool(1), sim = state(70000);
  const frame = transfer(pool.publish(pool.acquire(70000, 1), sim));
  assert.equal(frame.bonds[1], 69999);
  assert.equal(pool.recycle({ ...frame, types: new Uint16Array(1) }), false);
  assert.ok(pool.recycle(transfer(frame)));
  const small = state(4), slot = pool.acquire(4, 1);
  const next = pool.publish(slot, small);
  assert.equal(next.positions.length, 12); assert.equal(next.types.length, 4);
  assert.deepEqual([...next.bonds], [1, 3]);
});
