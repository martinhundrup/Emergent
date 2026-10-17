import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { settingsFor } from '../simulation.js';
import { frameBuffers } from '../frame-pool.js';

test('worker bounds publication, keeps stepping, and delivers latest reset state after recycling', async () => {
  const worker = new Worker(new URL('./helpers/worker-host.mjs', import.meta.url));
  const messages = [], waiters = [];
  worker.on('message', message => {
    const index = waiters.findIndex(waiter => waiter.predicate(message));
    if (index < 0) messages.push(message);
    else { const waiter = waiters.splice(index, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(message); }
  });
  const next = predicate => {
    const index = messages.findIndex(predicate);
    if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve };
      waiter.timer = setTimeout(() => reject(new Error('Worker response timed out')), 5000);
      waiters.push(waiter);
    });
  };
  const send = data => worker.postMessage(data);
  try {
    send({ type: 'pause', value: true });
    send({ type: 'init', settings: settingsFor('gas', 100, 1) });
    const initial = await next(message => message.type === 'frame');
    for (let i = 0; i < 8; i++) send({ type: 'step' });
    send({ type: 'export', requestId: 9 });
    const saved = await next(message => message.type === 'export');
    assert.equal(saved.snapshot.ticks, 8, 'physics remains serviceable while renderer is behind');
    assert.equal(messages.filter(message => message.type === 'frame').length, 2, 'at most three frames outstanding');
    send({ type: 'reset', settings: { ...settingsFor('gas', 200, 55), boxSize: 120 } });
    await next(message => message.type === 'settings' && message.reason === 'reset');
    worker.postMessage({ ...initial, type: 'recycle' }, frameBuffers(initial));
    const latest = await next(message => message.type === 'frame' && message.generation > initial.generation);
    assert.equal(latest.types.length, 200); assert.equal(latest.settings.seed, 55); assert.equal(latest.stats.time, 0);
    assert.ok(latest.types instanceof Uint16Array); assert.ok(latest.bonds instanceof Uint32Array);
    send({ type: 'import', snapshot: { version: -1 } });
    await next(message => message.type === 'error' && message.action === 'import');
    send({ type: 'export' });
    assert.equal((await next(message => message.type === 'export')).snapshot.settings.seed, 55, 'invalid import leaves current world intact');
  } finally {
    for (const waiter of waiters) clearTimeout(waiter.timer);
    await worker.terminate();
  }
});
