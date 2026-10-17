import { Simulation, DT } from './simulation.js';
import { FramePool, frameBuffers } from './frame-pool.js';

let sim, paused = false, speed = 1, visible = true, accumulator = 0, last = performance.now(), stepMs = 0;
let rateStart = last, rateTicks = 0, stepsPerSecond = 0, lastStatsAt = -Infinity, generation = 0;
let pendingFrame = false, pendingStats = false, pendingSettings = false;
const pool = new FramePool(3);

function resetRate() { rateStart = performance.now(); rateTicks = sim?.ticks ?? 0; stepsPerSecond = 0; }
function frame(forceStats = false, includeSettings = false) {
  pendingFrame = true; pendingStats ||= forceStats; pendingSettings ||= includeSettings;
  const slot = pool.acquire(sim.settings.count, sim.bonds.size);
  if (!slot) return; // Publish the newest state when the consumer returns a slot.
  const now = performance.now(), rateElapsed = now - rateStart;
  if (!paused && visible && rateElapsed >= 500) {
    stepsPerSecond = (sim.ticks - rateTicks) * 1000 / rateElapsed;
    rateStart = now; rateTicks = sim.ticks;
  }
  const payload = pool.publish(slot, sim);
  const stats = pendingStats || now - lastStatsAt >= 250 ? { ...sim.stats(), stepMs, stepsPerSecond } : null;
  if (stats) lastStatsAt = now;
  postMessage({ type: 'frame', ...payload, generation, topologyVersion: sim.topologyVersion, stats,
    ...(pendingSettings ? { settings: sim.settings } : {}) }, frameBuffers(payload));
  pendingFrame = pendingStats = pendingSettings = false;
}
function settingsMessage(reason, requestId) {
  postMessage({ type: 'settings', settings: sim.settings, reason, requestId, generation, imported: reason === 'import',
    ...(reason === 'import' && sim.migration ? { migration: sim.migration } : {}) });
}
function resetClock() {
  generation++; accumulator = 0; lastStatsAt = -Infinity; stepMs = 0; last = performance.now(); resetRate();
}
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'recycle') {
      if (pool.recycle(data) && pendingFrame && sim) frame();
    } else if (data.type === 'init' || data.type === 'reset') {
      sim = new Simulation(data.settings); resetClock();
      settingsMessage(data.type, data.requestId); frame(true, true);
    } else if (data.type === 'configure') {
      // The editor already owns this validated patch; avoid cloning a 256²
      // affinity matrix back twice for every slider event. Errors request sync.
      sim.configure(data.patch); frame(true);
    } else if (data.type === 'sync' && sim) {
      settingsMessage('sync', data.requestId); frame(true, true);
    } else if (data.type === 'pause') {
      paused = Boolean(data.value); accumulator = 0; last = performance.now(); resetRate();
      if (paused && sim) frame(true);
    } else if (data.type === 'speed') {
      if ([.5, 1, 2, 4].includes(data.value)) speed = data.value;
    } else if (data.type === 'visibility') {
      visible = Boolean(data.value); accumulator = 0; last = performance.now(); resetRate();
      if (sim && visible) frame(true);
    } else if (data.type === 'step') {
      paused = true; const start = performance.now(); sim.step(); stepMs = performance.now() - start; resetRate(); frame(true);
    } else if (data.type === 'export') {
      postMessage({ type: 'export', snapshot: sim.snapshot(), requestId: data.requestId });
    } else if (data.type === 'import') {
      sim = Simulation.restore(data.snapshot); paused = true; resetClock();
      settingsMessage('import', data.requestId); frame(true, true);
    }
  } catch (error) { postMessage({ type: 'error', action: data.type, message: error.message, requestId: data.requestId }); }
};
setInterval(() => {
  const now = performance.now(), elapsed = Math.min((now - last) / 1000, .1); last = now;
  if (!sim || paused || !visible) return;
  accumulator += elapsed * speed;
  let steps = 0;
  const started = performance.now();
  // Bound batches so the worker services controls between physics steps.
  while (accumulator >= DT && steps < 12) {
    sim.step(); accumulator -= DT; steps++;
    if (performance.now() - started >= 24) break;
  }
  accumulator = Math.min(accumulator, DT * 12);
  if (steps) {
    const sample = (performance.now() - started) / steps;
    stepMs = stepMs ? stepMs * .8 + sample * .2 : sample; frame();
  }
}, 1000 / 30);
