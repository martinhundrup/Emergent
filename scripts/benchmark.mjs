import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as engine from '../simulation.js';
import { UniverseRenderer } from '../renderer.js';
import { FramePool, frameBuffers } from '../frame-pool.js';

// CPU benchmark only: no GPU, browser transport, UI, or real-time scheduler.
// npm run benchmark -- --suite all --output benchmarks/local.json
// Optional immutable old sources: --reference-engine path --reference-renderer path
const options = { suite: 'baseline', repeats: 3, steps: 120, warmup: 60, phases: 60 };
const paths = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (key === '--skip-appearance') { options.skipAppearance = true; continue; }
  if (!['--suite', '--filter', '--repeats', '--steps', '--warmup', '--phases', '--output', '--reference-engine', '--reference-renderer'].includes(key)) throw new Error(`Unknown option ${key}`);
  const value = process.argv[++i];
  if (!value) throw new Error(`Missing value for ${key}`);
  if (['--output', '--reference-engine', '--reference-renderer'].includes(key)) paths[key.slice(2)] = resolve(value);
  else options[key.slice(2)] = ['--suite', '--filter'].includes(key) ? value : Number(value);
}
if (!['baseline', 'expanded', 'all'].includes(options.suite)) throw new Error('Suite must be baseline, expanded, or all.');
for (const key of ['repeats', 'steps', 'warmup', 'phases']) if (!Number.isInteger(options[key]) || options[key] < 1 || options[key] > 10000) throw new Error(`Invalid ${key}.`);
const reference = paths['reference-engine'] ? await import(pathToFileURL(paths['reference-engine'])) : null;
const ReferenceRenderer = paths['reference-renderer'] ? (await import(pathToFileURL(paths['reference-renderer']))).UniverseRenderer : null;
const sourcePaths = { benchmark: new URL(import.meta.url), simulation: new URL('../simulation.js', import.meta.url), renderer: new URL('../renderer.js', import.meta.url), framePool: new URL('../frame-pool.js', import.meta.url), ...paths };
delete sourcePaths.output;
async function hashSources() {
  return Object.fromEntries(await Promise.all(Object.entries(sourcePaths).map(async ([name, path]) => [name, createHash('sha256').update(await readFile(path)).digest('hex')])));
}
const sourceHashes = await hashSources();
const round = value => Number(value.toFixed(4));
const checksum = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
let sink;

function distribution(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { mean: round(samples.reduce((sum, value) => sum + value, 0) / samples.length), median: round(sorted[Math.floor(sorted.length / 2)]), p95: round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * .95) - 1)]), samplesMs: samples.map(round) };
}
function sample(operation, count, setup) {
  const times = [];
  for (let i = 0; i < count; i++) {
    setup?.(i);
    const start = performance.now();
    sink = operation();
    times.push(performance.now() - start);
  }
  return distribution(times);
}
function physicalChecksum(sim) {
  const snapshot = sim.snapshot();
  return checksum(Object.fromEntries(['positions', 'velocities', 'types', 'headings', 'energies', 'bonds', 'bondAges', 'ticks', 'rng', 'reactions', 'bondsFormed', 'bondsBroken', 'reactionHistory'].map(key => [key, snapshot[key]])));
}
function resetter(sim, source) {
  const arrays = Object.fromEntries(['positions', 'velocities', 'headings', 'energies', 'types', 'degrees', 'reactionHistory'].map(key => [key, source[key].slice()]));
  const scalarKeys = ['rng', 'ticks', 'reactions', 'bondsFormed', 'bondsBroken', 'topologyVersion'];
  const scalars = Object.fromEntries(scalarKeys.filter(key => key in source).map(key => [key, source[key]]));
  if ('topologyVersion' in sim && !('topologyVersion' in scalars)) scalars.topologyVersion = sim.topologyVersion;
  const bonds = Array.from(source.bonds, ([key, pair]) => [key, [...pair]]), births = [...source.bondBirths];
  return () => {
    for (const [key, value] of Object.entries(arrays)) sim[key].set(value);
    Object.assign(sim, scalars);
    sim.bonds.clear(); sim.bondBirths.clear();
    for (const [key, pair] of bonds) sim.bonds.set(key, pair);
    for (const [key, birth] of births) sim.bondBirths.set(key, birth);
  };
}
function legacyPack(sim) {
  return { positions: sim.positions.slice(), types: sim.types.slice(), energies: sim.energies.slice(), bonds: Uint16Array.from(Array.from(sim.bonds.values()).flat()) };
}
function packer(sim, legacy = false) {
  if (legacy) return () => legacyPack(sim);
  const pool = new FramePool(1);
  return () => {
    const frame = pool.publish(pool.acquire(sim.settings.count, sim.bonds.size), sim);
    if (!pool.recycle(frame)) throw new Error('Frame pool rejected its own frame.');
    return frame;
  };
}
function rendererFor(Renderer, sim, frame, instanced = false) {
  // Exercise production CPU geometry code, without constructing a GPU context.
  const renderer = Object.create(Renderer.prototype);
  Object.assign(renderer, {
    frame, species: sim.settings.species, selectedId: null,
    colors: sim.settings.species.map(item => {
      const rgb = Number.parseInt(item.color.slice(1), 16);
      return [(rgb >> 16 & 255) / 255, (rgb >> 8 & 255) / 255, (rgb & 255) / 255];
    }),
    colorMode: 'species', viewMode: 'particles', showBonds: true, clusterPalette: [],
    pointData: new Float32Array(0), nodeData: new Float32Array(0), bondData: new Float32Array(0),
    parents: new Int32Array(0), degrees: new Uint16Array(0),
    instancing: instanced, appearanceDirty: true, geometryDirty: false,
  });
  renderer.initializeGeometry?.();
  return renderer;
}
function appearance(Renderer, sim, legacy = false) {
  const frame = { ...legacyPack(sim), generation: 1, topologyVersion: sim.topologyVersion ?? 1 };
  if (!legacy) frame.bonds = Uint32Array.from(Array.from(sim.bonds.values()).flat());
  const modes = [
    { name: 'particlesWithBonds', colorMode: 'species', viewMode: 'particles', showBonds: true },
    { name: 'particlesHiddenBonds', colorMode: 'species', viewMode: 'particles', showBonds: false },
    { name: 'clusterWithBonds', colorMode: 'cluster', viewMode: 'particles', showBonds: true },
    { name: 'bondNetwork', colorMode: 'species', viewMode: 'bonds', showBonds: true },
  ];
  if (!legacy) modes.push({ name: 'particlesWithBondsFallback', colorMode: 'species', viewMode: 'particles', showBonds: true, instancing: false });
  modes.push({ name: 'changingTopology', colorMode: 'cluster', viewMode: 'particles', showBonds: true, changeTopology: true });
  const result = {};
  for (const mode of modes) {
    const renderer = rendererFor(Renderer, sim, frame, !legacy);
    renderer.colorMode = mode.colorMode; renderer.viewMode = mode.viewMode; renderer.showBonds = mode.showBonds;
    if ('instancing' in mode) renderer.instancing = mode.instancing;
    let version = frame.topologyVersion;
    const prepare = () => { renderer.update({ ...frame, topologyVersion: mode.changeTopology ? ++version : version }); renderer.updateAppearance(); };
    for (let i = 0; i < 120; i++) prepare();
    result[mode.name] = {
      cpuMs: sample(prepare, options.phases),
      allocatedGeometryBytes: renderer.pointData.byteLength + renderer.nodeData.byteLength + renderer.bondData.byteLength,
      uploadedGeometryBytes: legacy ? renderer.pointData.byteLength + renderer.nodeData.byteLength + renderer.bondData.byteLength : ((mode.viewMode === 'bonds' ? renderer.nodeCount : renderer.pointCount) * 7 + (mode.showBonds ? renderer.bondDataLength : 0)) * 4,
      pointCount: renderer.pointCount, nodeCount: renderer.nodeCount, bondVertexCount: renderer.bondVertexCount,
    };
  }
  return result;
}
function neighborCounts(sim) {
  const n = sim.settings.count, grid = sim.gridSize, half = sim.settings.boxSize / 2;
  const coordinates = new Int32Array(n * 3), head = new Int32Array(grid ** 3).fill(-1), next = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) coordinates[i * 3 + k] = Math.min(grid - 1, Math.max(0, Math.floor((sim.positions[i * 3 + k] + half) / sim.cellSize)));
    const cell = coordinates[i * 3] + coordinates[i * 3 + 1] * grid + coordinates[i * 3 + 2] * grid * grid;
    next[i] = head[cell]; head[cell] = i;
  }
  let unprunedCandidatePairs = 0, cellPrunedCandidatePairs = 0, inCutoffPairs = 0, inPairCutoffPairs = 0;
  for (let i = 0; i < n; i++) {
    const a = i * 3, cx = coordinates[a], cy = coordinates[a + 1], cz = coordinates[a + 2];
    for (let z = Math.max(0, cz - 1); z <= Math.min(grid - 1, cz + 1); z++)
      for (let y = Math.max(0, cy - 1); y <= Math.min(grid - 1, cy + 1); y++)
        for (let x = Math.max(0, cx - 1); x <= Math.min(grid - 1, cx + 1); x++) {
          // Observe both search strategies; this matches production's conservative AABB test.
          const left = x * sim.cellSize - half, bottom = y * sim.cellSize - half, back = z * sim.cellSize - half;
          const gx = Math.max(0, left - sim.positions[a], sim.positions[a] - (left + sim.cellSize));
          const gy = Math.max(0, bottom - sim.positions[a + 1], sim.positions[a + 1] - (bottom + sim.cellSize));
          const gz = Math.max(0, back - sim.positions[a + 2], sim.positions[a + 2] - (back + sim.cellSize));
          const relevantCell = gx * gx + gy * gy + gz * gz <= sim.cutoff ** 2 + 1e-9;
          for (let j = head[x + y * grid + z * grid * grid]; j !== -1; j = next[j]) {
            if (j <= i) continue;
            unprunedCandidatePairs++;
            if (!relevantCell) continue;
            cellPrunedCandidatePairs++;
            const b = j * 3, dx = sim.positions[b] - sim.positions[a], dy = sim.positions[b + 1] - sim.positions[a + 1], dz = sim.positions[b + 2] - sim.positions[a + 2];
            const r2 = dx * dx + dy * dy + dz * dz;
            if (r2 < sim.cutoff ** 2) inCutoffPairs++;
            if (r2 < (sim.pairCutoff2?.[sim.types[i] * sim.settings.species.length + sim.types[j]] ?? sim.cutoff ** 2)) inPairCutoffPairs++;
          }
        }
  }
  return { unprunedCandidatePairs, cellPrunedCandidatePairs, inCutoffPairs, inPairCutoffPairs };
}

const cases = [];
function addCase(name, settings, density, expanded = false) {
  if (density === 'constant') settings.boxSize = 48 * Math.cbrt(settings.count / 1200);
  cases.push({ name, density, settings, expanded });
}
if (options.suite !== 'expanded') {
  addCase('soup-1200-fixed-box', engine.settingsFor('soup', 1200, 42), 'fixed-box');
  addCase('soup-6000-fixed-box', engine.settingsFor('soup', 6000, 42), 'fixed-box');
  for (const preset of ['soup', 'gas', 'autocatalytic']) addCase(`${preset}-6000-constant`, engine.settingsFor(preset, 6000, 42), 'constant');
}
if (options.suite !== 'baseline') {
  for (const count of [10000, 25000, 50000]) addCase(`soup-${count}-constant`, engine.settingsFor('soup', count, 42), 'constant', true);
  const largeGas = engine.settingsFor('gas', 50000, 42);
  largeGas.species = Array.from({ length: 256 }, (_, i) => ({ ...engine.speciesDefaults(i), abundance: 1, mass: 1, radius: .5, valence: 0, bondEnergy: 0 }));
  largeGas.matrix = Array(256 ** 2).fill(0);
  addCase('gas-256-species-50000-constant', largeGas, 'constant', true);
  for (const speciesCount of [2, 64, 256]) {
    const settings = engine.settingsFor('soup', 10000, 42);
    settings.species = Array.from({ length: speciesCount }, (_, i) => ({ ...engine.speciesDefaults(i), abundance: 1 }));
    settings.matrix = Array(speciesCount ** 2).fill(.5);
    addCase(`identical-${speciesCount}-species-10000-constant`, settings, 'constant', true);
    if (speciesCount === 256) {
      const catalytic = structuredClone(settings);
      catalytic.reactions = Array.from({ length: 1024 }, (_, i) => {
        const from = Math.floor(i / 4), channel = i % 4;
        return { name: `Rule ${i}`, from, to: (from + channel + 1) % speciesCount, catalyst: channel === 0 ? -1 : (from + channel * 83) % speciesCount, rate: .5, activationEnergy: .1, energyCost: .05 };
      });
      addCase('256-species-1024-rules-10000-constant', catalytic, 'constant', true);
    }
  }
}

const backends = [{ name: 'optimized', module: engine, Renderer: UniverseRenderer }];
if (reference) backends.unshift({ name: 'reference', module: reference, Renderer: ReferenceRenderer });
for (const backend of backends) for (const preset of ['soup', 'gas', 'autocatalytic']) {
  const sim = new backend.module.Simulation(backend.module.settingsFor(preset, 1200, 42));
  for (let i = 0; i < 150; i++) sim.step();
  for (let i = 0; i < 30; i++) sim.stats();
}

const results = [];
const selectedCases = cases.filter(item => !options.filter || item.name.includes(options.filter));
if (!selectedCases.length) throw new Error('The case filter matched no cases.');
for (const item of selectedCases) {
  const { name, settings, density, expanded } = item;
  const applicable = expanded ? backends.filter(item => item.name !== 'reference') : backends;
  const sourceModule = !expanded && reference ? reference : engine;
  const source = new sourceModule.Simulation(settings);
  for (let i = 0; i < options.warmup; i++) source.step();
  const fixture = source.snapshot();
  const result = { name, density, settings, fixtureTick: fixture.ticks, fixtureChecksum: physicalChecksum(source), backends: {} };
  for (const backend of applicable) result.backends[backend.name] = { evolvingRuns: [], fixedStateRuns: [] };
  for (let repeat = 0; repeat < options.repeats; repeat++) {
    for (const backend of repeat % 2 ? [...applicable].reverse() : applicable) {
      const sim = backend.module.Simulation.restore(fixture);
      const measured = sample(() => sim.step(), options.steps);
      const target = result.backends[backend.name];
      target.evolvingRuns.push(measured);
      target.finalChecksum = physicalChecksum(sim);
      target.finalTicks = sim.ticks; target.bonds = sim.bonds.size; target.reactions = sim.reactions;
      if (!expanded) {
        const fixed = backend.module.Simulation.restore(fixture), restore = resetter(fixed, source);
        for (let i = 0; i < 20; i++) { restore(); fixed.step(); }
        const expectedChecksum = physicalChecksum(fixed);
        target.fixedStateRuns.push(sample(() => fixed.step(), options.steps, restore));
        if (physicalChecksum(fixed) !== expectedChecksum) throw new Error(`${backend.name} fixed-state reset failed for ${name}`);
      }
      if (repeat === options.repeats - 1) {
        const phaseSim = backend.module.Simulation.restore(fixture);
        const pack = packer(phaseSim, backend.name === 'reference');
        for (let i = 0; i < 30; i++) pack();
        target.statsMs = sample(() => phaseSim.stats(), options.phases);
        target.packMs = sample(pack, options.phases);
        target.phaseFixtureTick = phaseSim.ticks; target.phaseBonds = phaseSim.bonds.size;
        const frame = pack();
        target.framePayloadBytes = frame.positions.byteLength + frame.types.byteLength + frame.energies.byteLength + frame.bonds.byteLength;
        target.frameTransferredCapacityBytes = frameBuffers(frame).reduce((sum, buffer) => sum + buffer.byteLength, 0);
        target.cutoff = sim.cutoff; target.gridSize = sim.gridSize;
        Object.assign(target, neighborCounts(sim));
        if (!options.skipAppearance && backend.Renderer) target.appearance = appearance(backend.Renderer, phaseSim, backend.name === 'reference');
      }
      process.stderr.write(`${name} ${backend.name} run ${repeat + 1}: ${measured.median} ms median / ${measured.p95} ms p95\n`);
    }
  }
  for (const target of Object.values(result.backends)) {
    target.evolvingStepMs = distribution(target.evolvingRuns.flatMap(run => run.samplesMs));
    if (target.fixedStateRuns.length) target.fixedStateStepMs = distribution(target.fixedStateRuns.flatMap(run => run.samplesMs));
  }
  if (result.backends.reference) result.identicalFinalState = result.backends.reference.finalChecksum === result.backends.optimized.finalChecksum;
  results.push(result);
}
if (JSON.stringify(sourceHashes) !== JSON.stringify(await hashSources())) throw new Error('Benchmark source changed during the run; repeat with stable source files.');
const output = `${JSON.stringify({
  environment: { node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length },
  methodology: { ...options, seed: 42, dt: engine.DT, rendererWarmupFrames: 120, sourceHashes, units: 'milliseconds', note: 'CPU only. Shared warmup fixture per case; alternating backend order across repeated evolving windows. Fixed-state steps reset physical state outside timer, verifying repeatability. Frame pool measured without ownership transfer. Renderer geometry only, with stable object shape; same topology with a new frame publication per sample except changingTopology. No GPU upload/execution, browser transport, UI, or long-run clustering. Expanded cases preserve initial baseline density.' },
  results,
}, null, 2)}\n`;
if (paths.output) { await writeFile(paths.output, output); process.stderr.write(`Saved ${paths.output}\n`); }
else process.stdout.write(output);
void sink;
