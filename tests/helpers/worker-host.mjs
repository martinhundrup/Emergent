import { parentPort } from 'node:worker_threads';
globalThis.self = globalThis;
globalThis.postMessage = (message, transfer) => parentPort.postMessage(message, transfer);
await import('../../worker.js');
parentPort.on('message', data => self.onmessage({ data }));
