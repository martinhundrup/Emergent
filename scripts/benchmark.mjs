import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { Simulation, settingsFor, speciesDefaults } from '../simulation.js';
import { UniverseRenderer } from '../renderer.js';

// Run with `node scripts/benchmark.mjs`. JSON goes to stdout; case progress to stderr.
// This is a CPU microbenchmark, not browser FPS: GPU work, worker transport,
// scheduling, UI updates and long-run clustering are deliberately not measured.
const warmupSteps = 60;
const measuredSteps = 120;
const phaseIterations = 120;
let sink;

function distribution(operation, iterations) {
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const started = performance.now();
    sink = operation();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const round = value => Number(value.toFixed(4));
  return {
    mean: round(samples.reduce((sum, value) => sum + value, 0) / iterations),
    median: round(samples[Math.floor(iterations / 2)]),
    p95: round(samples[Math.min(iterations - 1, Math.ceil(iterations * .95) - 1)]),
  };
}

function packFrame(sim) {
  // Keep these operations identical to worker.js frame() packing.
  return {
    positions: sim.positions.slice(), types: sim.types.slice(), energies: sim.energies.slice(),
    bonds: Uint16Array.from(Array.from(sim.bonds.values()).flat()),
  };
}

function rendererFor(sim, frame) {
  // Exercise production CPU appearance code without constructing a WebGL context.
  const renderer = Object.create(UniverseRenderer.prototype);
  Object.assign(renderer, {
    frame, species: sim.settings.species,
    colors: sim.settings.species.map(item => {
      const rgb = Number.parseInt(item.color.slice(1), 16);
      return [(rgb >> 16 & 255) / 255, (rgb >> 8 & 255) / 255, (rgb & 255) / 255];
    }),
    colorMode: 'species', clusterPalette: [],
    pointData: new Float32Array(0), nodeData: new Float32Array(0), bondData: new Float32Array(0),
    parents: new Int32Array(0), degrees: new Uint16Array(0),
  });
  return renderer;
}

function neighborCounts(sim) {
  // Sample one final state outside timed work. Rebuild the same linked-cell grid.
  const n = sim.settings.count, grid = sim.gridSize, half = sim.settings.boxSize / 2;
  const coordinates = new Int32Array(n * 3);
  const head = new Int32Array(grid ** 3).fill(-1), next = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) coordinates[i * 3 + k] = Math.min(grid - 1, Math.max(0, Math.floor((sim.positions[i * 3 + k] + half) / sim.cellSize)));
    const cell = coordinates[i * 3] + coordinates[i * 3 + 1] * grid + coordinates[i * 3 + 2] * grid * grid;
    next[i] = head[cell]; head[cell] = i;
  }
  let candidatePairs = 0, inCutoffPairs = 0;
  for (let i = 0; i < n; i++) {
    const a = i * 3, cx = coordinates[a], cy = coordinates[a + 1], cz = coordinates[a + 2];
    for (let z = Math.max(0, cz - 1); z <= Math.min(grid - 1, cz + 1); z++)
      for (let y = Math.max(0, cy - 1); y <= Math.min(grid - 1, cy + 1); y++)
        for (let x = Math.max(0, cx - 1); x <= Math.min(grid - 1, cx + 1); x++)
          for (let j = head[x + y * grid + z * grid * grid]; j !== -1; j = next[j]) {
            if (j <= i) continue;
            candidatePairs++;
            const b = j * 3, dx = sim.positions[b] - sim.positions[a], dy = sim.positions[b + 1] - sim.positions[a + 1], dz = sim.positions[b + 2] - sim.positions[a + 2];
            if (dx * dx + dy * dy + dz * dz < sim.cutoff ** 2) inCutoffPairs++;
          }
  }
  return { candidatePairs, inCutoffPairs };
}

const cases = [];
function addCase(name, settings, density) {
  if (density === 'constant') settings.boxSize = 48 * Math.cbrt(settings.count / 1200);
  cases.push({ name, density, settings });
}
for (const count of [1200, 3000, 6000]) {
  for (const density of ['fixed-box', 'constant']) {
    if (count === 1200 && density === 'constant') continue;
    addCase(`soup-${count}-${density}`, settingsFor('soup', count, 42), density);
  }
}
for (const preset of ['gas', 'autocatalytic']) {
  for (const density of ['fixed-box', 'constant']) addCase(`${preset}-6000-${density}`, settingsFor(preset, 6000, 42), density);
}
for (const speciesCount of [2, 3, 6]) {
  for (const density of ['fixed-box', 'constant']) {
    const settings = settingsFor('soup', 6000, 42);
    // Identical physical properties and affinities isolate species count from chemistry.
    settings.species = Array.from({ length: speciesCount }, (_, i) => ({ ...speciesDefaults(i), abundance: 1 }));
    settings.matrix = Array(speciesCount ** 2).fill(.5);
    addCase(`identical-${speciesCount}-species-${density}`, settings, density);
  }
}
for (const interactionRadius of [6, 12, 16]) {
  addCase(`soup-3000-radius-${interactionRadius}`, { ...settingsFor('soup', 3000, 42), interactionRadius }, 'fixed-box');
}

// Warm up the major chemistry code paths before collecting any case results.
for (const preset of ['soup', 'gas', 'autocatalytic']) {
  const sim = new Simulation(settingsFor(preset, 1200, 42));
  for (let i = 0; i < 150; i++) sim.step();
  for (let i = 0; i < 30; i++) sim.stats();
  const renderer = rendererFor(sim, packFrame(sim));
  for (let i = 0; i < 30; i++) renderer.updateAppearance();
}

const results = [];
for (const { name, density, settings } of cases) {
  const sim = new Simulation(settings);
  for (let i = 0; i < warmupSteps; i++) sim.step();
  const stepMs = distribution(() => sim.step(), measuredSteps);
  const statsMs = distribution(() => sim.stats(), phaseIterations);
  const packMs = distribution(() => packFrame(sim), phaseIterations);
  const frame = packFrame(sim), renderer = rendererFor(sim, frame);
  for (let i = 0; i < 30; i++) renderer.updateAppearance();
  const appearanceSpeciesMs = distribution(() => renderer.updateAppearance(), phaseIterations);
  renderer.colorMode = 'cluster';
  for (let i = 0; i < 30; i++) renderer.updateAppearance();
  const appearanceClusterMs = distribution(() => renderer.updateAppearance(), phaseIterations);
  const result = {
    name, density, particles: settings.count, species: settings.species.length,
    boxSize: Number(settings.boxSize.toFixed(3)), interactionRadius: settings.interactionRadius,
    actualCutoff: sim.cutoff, gridSize: sim.gridSize, bonds: sim.bonds.size,
    ...neighborCounts(sim),
    stepMs, statsMs, packMs, appearanceSpeciesMs, appearanceClusterMs,
    frameBytes: Object.values(frame).reduce((total, array) => total + array.byteLength, 0),
    uploadedGeometryBytes: renderer.pointData.byteLength + renderer.nodeData.byteLength + renderer.bondData.byteLength,
  };
  results.push(result);
  process.stderr.write(`${name}: step ${stepMs.median} ms, p95 ${stepMs.p95} ms\n`);
}
process.stdout.write(`${JSON.stringify({
  environment: { node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length },
  methodology: { seed: 42, warmupSteps, measuredSteps, phaseIterations, dt: 1 / 60, units: 'milliseconds', note: 'Fixed initial seed, evolving state; stats and preparation measured at final tick 180. CPU only. No GPU, worker transport, UI, or long-run clustering. Species control changes only names/colors/labels, with identical physical properties and pair affinities. Default cases use original preset chemistry.' },
  results,
}, null, 2)}\n`);
// Keep allocation results observable throughout the benchmark.
void sink;
