# protoform.ing

A 3D artificial chemistry laboratory, running entirely in the browser. Version 0.2 supports configurable species, passive and active forces, reversible bonding, local catalytic conversion, and an external energy supply. [RESEARCH.md](RESEARCH.md) records the primary sources, design choices, and roadmap toward compartments, heredity, and selection.

The interface follows a scientific field notebook: paper and ink, vermilion annotations, a dark observation chamber, and a separate control column. Measurements and experiment notes sit beneath the chamber. On small screens, controls follow the chamber before the readouts; the numbered navigation jumps directly to each part of the laboratory. All fonts and visuals are local, with no external asset requests. The product is branded **protoform.ing**; existing `/emergent/` routes and saved experiment formats remain compatible.

## Run locally

Double-click **`start.cmd`**, then open **http://localhost:3002/emergent/**. The Windows launcher finds Node on PATH or the portable Node runtime used by the adjacent Bonsai repository. No dependency installation is needed.

With Node.js 22.18 or newer on PATH:

```sh
npm run dev
npm test
npm run build
npm run preview
```

The local server supports both `/` and `/emergent/`. Seed links use a path such as `/emergent/12345`; opening one directly loads that seed with the default recipe. Serve the files over HTTP: opening `index.html` as a local file cannot start the module worker.

## Experiment controls

The interface groups controls into four tabs. Every physical and reaction parameter has a help button accessible by hover, keyboard focus, or tap. Numeric values can be typed directly beside the sliders.

| Tab | Controls |
| --- | --- |
| World | Six experiment recipes; seed; 100–6,000 particles; box size; temperature; drag; contact repulsion; interaction reach/strength; bond association, stiffness/stability and breakage; screened charge |
| Species | Add/remove between two and six species; name, color, initial mixture weight, mass, radius, charge, valence, binding stability, fueled propulsion, same-species heading alignment, directional noise; symmetric affinity matrix |
| Chemistry | Stored-energy input, leakage, and spatial gradient; catalyst reach; up to eight conversion rules with substrate, product, catalyst, rate, activation barrier, and energy cost |
| View | Visual particle size, bond line width, boundary, and selected-particle inspector |

Physical properties and reaction edits apply live. **Count, box size, seed, and initial mixture weights apply on restart.** Add/remove species and selecting a recipe also restart. Removing a species removes reaction rules that reference it. Mixture weights are normalized: they are not percentages that must sum to 100.

The observation toolbar provides a **Bond network** mode, a meaningful Show bonds toggle, and species/energy/connected-component coloring. Bonds use bright screen-facing triangle ribbons with adjustable pixel width. Particle display size is separate from physical radius. Click a particle to inspect its species, energy, position, and bonds.

### Recipes

- **Primordial soup:** reversible branching assembly in a thermal bath.
- **Chain builders:** valence two encourages chains and rings; solvent cannot bond.
- **Condensation:** self-attraction and cross-repulsion produce species separation.
- **Inert gas:** neutral species with soft collisions and thermal motion. Affinity, valence, and bond strength are zero; there are no reactions or active motors. Bond/network views therefore have nothing to draw. This is a nonreactive baseline, not calibrated noble-gas physics.
- **Active swarms:** internal-energy-powered propulsion, local same-species alignment, and directional noise. Supply varies across the box.
- **Catalytic cycle:** A catalyzes feedstock → B and B catalyzes feedstock → A. Both catalysts can decay to feedstock. Their mutual amplification and decay create competing local processes; conversion consumes stored energy.

Each recipe includes an explanation, a suggested perturbation, and observations to compare. You can also configure direct autocatalysis by making the product and catalyst the same species.

### Measurements and playback

Measurements include populations, active bonds, connected components of at least three particles, largest component, mean bond age, bond formation/breakage totals, reaction flux and conversion totals, kinetic energy, stored energy, powered fraction, and collective heading agreement. The history chart switches between bonded fraction, largest-component share, stored energy, reaction rate, and mixture diversity over 120 simulation seconds.

Mixture diversity is normalized Shannon abundance entropy of the configured species (0 = one species present; 1 = an even mixture). It is not evolutionary novelty. Heading agreement is the magnitude of the average heading of powered particles. Reaction rate is measured over up to the most recent two simulation seconds.

Pause/resume, single-step, 0.5×–4× playback, random seeds, and restart are supported. Space toggles playback; Right arrow steps outside the chamber. With the chamber focused, arrow keys orbit, `+` / `−` zoom, Home resets the camera, and Escape clears selection. Drag/pinch gestures and fullscreen are supported. Reduced motion starts paused; hidden tabs suspend physics.

## Physics and chemistry model

All quantities are dimensionless. Particles move inside a reflective cube with configurable side length. Semi-implicit integration uses a fixed 1/60 simulation-second step. A uniform spatial grid restricts pair evaluation to local neighborhoods.

- **Passive mechanics:** equal-and-opposite pair forces; soft repulsion below combined radii; a finite-range attraction/repulsion profile determined by affinity; softened screened charge truncated at interaction reach. Per-species mass controls acceleration and thermal velocity variance. Soft contacts discourage overlap but do not guarantee hard-sphere exclusion; force caps protect numerical stability.
- **Bonds:** compatible particles with spare valence can bind during sufficiently low-energy encounters. The geometric capture range is separate from affinity reach. Global bond strength sets spring stiffness and contributes to binding stability; endpoint binding energies and pair affinity affect capture and thermal survival. Bonds break when stretched, thermally activated, disabled by controls, or attached to a converting substrate. Lowering valence removes excess bonds.
- **Thermostat:** exponential drag plus random thermal impulses approximate coupling to a bath. At zero drag there is no bath-induced velocity noise. This is not a closed energy-conserving system or a calibrated DPD implementation.
- **Active motion:** each particle carries a heading and a stored-energy reservoir from 0 to 10. Same-species neighbor alignment competes with rotational noise. Propulsion scales down below one unit of energy and consumes stored energy. The external supply and leakage are independent of thermal temperature.
- **Supply gradient:** local input is `input * (1 - gradient + gradient * (x / boxSize + 0.5))`. Increasing the gradient makes −X poorer while +X stays near full input. It also lowers average input; comparisons should account for this.
- **Conversions:** a rule is `substrate + catalyst → product + catalyst`, or spontaneous conversion without a catalyst. A separate matching catalyst must be in range; substrates cannot catalyze themselves. Candidate conversions use the same pre-conversion type state, so new catalysts act on later ticks. Competing eligible rules use one summed stochastic hazard, with at most one conversion per particle per tick. Individual hazard is `rate * exp(-barrier / max(0.05, temperature + storedEnergy))`; an unaffordable cost disables the rule and a successful conversion deducts that cost.

Conversion **preserves particle count and momentum**, but user-defined unequal species masses change total mass and kinetic energy. Live mass edits also preserve momentum rather than kinetic energy. Stored energy is a phenomenological activity budget, not a complete thermodynamic ledger. These are abstract chemical-state rules, not atomistic reactions or measured chemical kinetics.

The model supports self-assembly, active matter, and chemical amplification. It does not yet implement amphiphilic membranes, semipermeable compartments, templated genomes, inherited cellular reproduction, or open-ended evolution. Large clumps and fluctuating catalyst counts are observations to investigate, not evidence of life. The research document explains the next mechanisms and the measurements needed to make stronger claims.

## Saves and reproducibility

Save experiment downloads a v2 JSON snapshot with settings, positions, velocities, particle types, headings, stored energy, bonds and their ages, event counters, recent reaction history, tick, and random state. Load validates the snapshot and pauses immediately. Invalid files leave the current experiment intact. Older v1 experiments are migrated; their state is preserved where possible, but subsequent evolution follows the new model. The original paused editor could save stale bonds after changing affinity; migration removes incompatible/excess-valence legacy bonds and reports their count. Modern v2 snapshots retain strict topology validation.

The camera, playback speed, and displayed chart history are not physical snapshot state. A seed and the same fixed-step sequence of interventions reproduce a run within the same JavaScript runtime. Bit-for-bit results across different browser engines are not promised.

## Performance and hosting

Physics runs in a dedicated Web Worker and the main thread renders with WebGL. Worker updates target 30 Hz; rendering follows display refresh. The UI reports render FPS and physics milliseconds per step. A bounded work batch keeps control messages serviceable. On slow hardware or dense, long-range experiments, simulation time advances more slowly instead of accumulating unbounded catch-up work.

Increasing count at fixed volume increases density and encounter cost. Enlarge the box when studying more particles at comparable density. The maximum count is 6,000; this does not promise real-time performance at every combination of density and reach. A host Node benchmark at 6,000 particles and box size 82 measured about 7.2 ms per step; browser hardware and renderer load differ. WebGPU compute and larger-scale field models remain future work described in [RESEARCH.md](RESEARCH.md).

The application has **no backend, database, runtime dependencies, external CDN, or API keys**. `npm run build` emits ten static files in `dist/`, including downloadable research notes. Cloudflare Pages can use build command `npm run build` and output directory `dist`.

For the existing domain, `cloudflare.config.ts` follows the adjacent project's assets-only Worker convention for **https://martinhundrup.com/emergent/**. Preparation puts assets beneath `/emergent/`, adds a root index for seed-path fallback, and declares the more-specific routes. Credentials are not stored in the repository.

```sh
npm run cf:check   # Build, package, dry-run; no publishing
npm run deploy     # Publish the assets-only Worker and its routes
```

The pinned `cf` CLI is `1.0.0-beta.18`, matching the sister project. Static asset requests are currently [free and unlimited](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/). No Worker server code or bindings are required. This update is local; production has not been published.

## Source and validation

| File | Responsibility |
| --- | --- |
| `simulation.js` | Physics, species/reaction schema, presets, measurements, deterministic snapshots |
| `worker.js` | Fixed-step scheduling, playback, messaging, final pause statistics |
| `renderer.js` | WebGL points and bond ribbons, coloring, picking, camera |
| `app.js` | Live controls, dynamic species/reaction editors, charts, tooltips, save/load |
| `controls.js` | Parameter labels, bounds, explanations, experiment guides |
| `index.html`, `styles.css` | Responsive lab interface |
| `RESEARCH.md` | Primary-source synthesis, model comparisons, limits, future work |
| `scripts/` | Local preview, static build, Cloudflare preparation |
| `tests/simulation.test.mjs` | Mechanics, reaction, snapshot, stability, and scale regressions |

The 20 physics tests cover deterministic reaction replay, v2 continuation/v1 migration, stale legacy bonds, dynamic species, mass-weighted momentum, charge signs and screening, radii, valence pruning, fuel-gated propulsion, heading alignment, catalyst locality, no self-catalysis, conversion bond cleanup, bound/finite behavior, 6,000 particles, independent bond capture range, and valid fast-state restores.

Chromium checks cover desktop/mobile, help focus/tap, visible bond toggling and network mode, species/matrix expansion, reaction editing, save/load, the nonreactive baseline, and catalytic activity. Renderer checks use a controlled five-bond scene to verify a measurable on/off image difference at device-pixel ratio two. Firefox remains unverified because its installed headless browser previously crashed before opening a page.
