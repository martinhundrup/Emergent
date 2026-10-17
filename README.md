# protoform.ing

A 3D artificial chemistry laboratory, running entirely in the browser. Version 0.3 supports up to 50,000 particles, 256 configurable species, and 1,024 reaction rules, with passive and active forces, reversible bonding, local catalytic conversion, and an external energy supply. [RESEARCH.md](RESEARCH.md) records the primary sources, performance measurements, design choices, and roadmap toward compartments, heredity, and selection.

The interface is dark throughout, with charcoal surfaces and coral, blue, lavender, amber, and pink accents. The introduction and numbered navigation sit in the left column; the controls begin just below the header on the right and stay near the top while scrolling. Measurements and experiment notes sit beneath the chamber. On small screens, controls follow the chamber before the readouts. Default species and generated observation palettes avoid green; imported and manually chosen colors remain intact. All fonts and visuals are local, with no external asset requests. The product is branded **protoform.ing** throughout; older saved experiments remain importable.

## Run locally

Double-click **`start.cmd`**, then open **http://localhost:3002/protoform.ing/**. The Windows launcher finds Node on PATH or the portable Node runtime used by the adjacent Bonsai repository. No dependency installation is needed.

With Node.js 22.18 or newer on PATH:

```sh
npm run dev
npm test
npm run build
npm run preview
```

The local server supports both `/` and `/protoform.ing/`. Seed links use a path such as `/protoform.ing/12345`; opening one directly loads that seed with the default recipe. Serve the files over HTTP: opening `index.html` as a local file cannot start the module worker.

## Experiment controls

The interface groups controls into four tabs. Every physical and reaction parameter has a help button accessible by hover, keyboard focus, or tap. Numeric values can be typed directly beside the sliders.

| Tab | Controls |
| --- | --- |
| World | Six experiment recipes; seed; 100–50,000 particles; box side up to 640; temperature; drag; contact repulsion; interaction reach/strength; bond association, stiffness/stability and breakage; screened charge |
| Species | Add/remove or set the count between 2 and 256; searchable catalog; name, color, mixture, mass, radius, charge, valence, binding stability, fueled propulsion, alignment, directional noise; symmetric affinity matrix for small catalogs or selected-pair editor for larger ones |
| Chemistry | Stored-energy input, leakage, spatial gradient, catalyst reach; up to 1,024 searchable conversion rules, shown eight per page, with substrate, product, catalyst, rate, activation barrier, and energy cost |
| View | Visual particle size, bond line width, boundary, and selected-particle inspector |

Physical properties and reaction edits apply live. **Count, box size, seed, and initial mixture weights apply on restart.** Add/remove species and selecting a recipe also restart. Removing a species removes reaction rules that reference it. Mixture weights are normalized: they are not percentages that must sum to 100.

Setting a larger species count adds species with positive self-affinity and neutral cross-affinity; existing species and their colors remain intact. Reducing the count removes species from the end and their referenced rules. The individual Remove button removes the selected species and remaps the remaining rules. Recipe changes keep your current count and box size.

**I'm feeling lucky** stays visible in the page header while scrolling and moves into the chamber in fullscreen. The observation and color modes, playback speed, pause/resume, single step, simulation time, and restart controls are also available in fullscreen. Lucky samples two to six species, their properties, all global force and energy controls, pair affinities, and a varying set of reaction rules. Samples use coherent structure, swarm, and catalytic regimes so related values work together. Lucky uses the particle count and box side length currently selected in World, including edits awaiting Apply. It also preserves existing species colors, playback speed and pause state, observation mode, visibility toggles, display sizes, chart selection, and camera orientation/relative zoom. New species receive fixed palette colors. The simulation-size slider separately scales particle count with volume to keep density approximately constant within the supported limits.

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

Pause/resume, single-step, 0.5×–4× playback, random seeds, and restart are supported. Space toggles playback; Right arrow steps outside the chamber. Reduced motion starts paused; hidden tabs suspend physics.

Open **Navigate** in the chamber to switch between Orbit and Free flight, choose travel speed, or hold the movement buttons (also available on touch screens and in fullscreen). Zoom reaches inside the world for particle-scale inspection. Navigation only changes the camera; travel speed is separate from simulation playback speed.

| Camera control | Action |
| --- | --- |
| Drag / arrow keys | Orbit the current target, or look around from the current position in Free flight |
| Scroll, pinch, `+` / `−` | Zoom in and out |
| Shift-drag, right/middle-drag, two-finger drag | Pan sideways and vertically |
| `W` / `S`, `A` / `D` | Move forward/backward and strafe left/right |
| `Q` / `E` | Move down/up |
| Hold Shift / Alt while moving | Move faster / more precisely |
| Click a particle, then `F` or Focus selected particle | Frame that particle up close |
| Home / reset camera button | Return to the initial overview |
| Escape | Clear particle selection |

Click the chamber before using movement keys. Movement stops when it loses focus or the browser tab is hidden. Names and numeric fields retain normal typing behavior. Randomizing the model preserves camera mode, travel speed, orientation, and relative framing.

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

Save experiment downloads a v3 JSON snapshot with an explicit algorithm identifier, settings, positions, velocities, particle types, headings, stored energy, bonds and their ages, event counters, recent reaction history, tick, and random state. Load validates the snapshot and pauses immediately. Invalid files leave the current experiment intact. Older v1/v2 experiments are migrated; v2 physical state is preserved, but subsequent evolution uses the updated engine. The original v1 paused editor could save stale bonds after changing affinity; migration removes incompatible/excess-valence legacy bonds and reports their count. V2/v3 snapshots retain strict topology validation. The import limit is 64 MB to accommodate larger worlds.

The camera, playback speed, and displayed chart history are not physical snapshot state. A seed and the same fixed-step sequence of interventions reproduce a run within the same algorithm version and JavaScript runtime. Active cutoffs and the new grid can change neighbor traversal and subsequent random choices compared with older versions; imports disclose the migration. Bit-for-bit results across different browser engines are not promised.

## Performance and hosting

Physics runs in a dedicated Web Worker and the main thread renders with WebGL. Worker publication targets 30 Hz; rendering follows display refresh. At most three reusable frame buffers are in flight. A slow consumer receives the latest state when it returns a buffer, instead of accumulating snapshots. Statistics update at most four times per wall-clock second during playback, plus explicit control events. The UI reports render FPS and physics milliseconds per step. A bounded work batch keeps control messages serviceable between steps. On slow hardware or dense, long-range experiments, simulation time advances more slowly instead of accumulating unbounded catch-up work.

The CPU engine uses contiguous spatial cells, active per-pair interaction cutoffs, cached force/bond coefficients, rules indexed by substrate, and reusable scratch storage. Particle types and conversion targets have wider IDs; catalysts use multiple words rather than one byte. The renderer caches topology, skips hidden geometry, retains GPU allocations, and uses instanced bond ribbons where supported: 56 bytes per bond instead of 264, with a matching fallback.

Increasing count at fixed volume increases density and encounter cost. Use **Simulation size** to enlarge count and volume together. The new limits are capacity bounds, not a guarantee of real-time performance for dense or long-range experiments. [The scaling research](RESEARCH.md#scaling-while-preserving-free-static-hosting) records before/after benchmarks and the remaining architecture work. GPU compute, cached Verlet neighbor lists, and multithreaded physics are not implemented in this release.

Run `npm run benchmark` for the original-scale CPU suite, or `npm run benchmark -- --suite expanded --output benchmarks/local.json` for larger worlds. Optional `--reference-engine` and `--reference-renderer` paths enable paired old/new measurements; `--suite all` runs both scales. The harness records repeated evolving windows, fixed-state steps, raw timings, source hashes, and separate packing/statistics/renderer-preparation phases. These are local Node timings, not browser/GPU FPS or a promise about sustained performance after prolonged clustering.

The application has **no backend, database, runtime dependencies, external CDN, or API keys**. `npm run build` emits twelve static files in `dist/`, including downloadable research notes and the particle-processing TODO. Cloudflare Pages can use build command `npm run build` and output directory `dist`.

For the existing domain, `cloudflare.config.ts` follows the adjacent project's assets-only Worker convention for **https://martinhundrup.com/protoform.ing/**. Preparation puts assets beneath `/protoform.ing/`, adds a root index for seed-path fallback, and declares the more-specific routes. Credentials are not stored in the repository.

```sh
npm run cf:check   # Build, package, dry-run; no publishing
npm run deploy     # Publish the assets-only Worker and its routes
```

The pinned `cf` CLI is `1.0.0-beta.18`, matching the sister project. The live release is published at **https://martinhundrup.com/protoform.ing/**. The available CLI login lacks Worker edit access, so this release uses the static-file Worker generated by `node scripts/build-inline-worker.mjs` and uploaded through the connected Cloudflare API. `npm run deploy` remains the assets-only deployment path for a CLI credential with Worker edit access. Neither path needs a database, runtime dependency, or application secret.

## Source and validation

| File | Responsibility |
| --- | --- |
| `simulation.js` | Physics, species/reaction schema, presets, measurements, deterministic snapshots |
| `worker.js` | Fixed-step scheduling, playback, messaging, final pause statistics |
| `frame-pool.js` | Bounded reusable transferable buffers and ownership validation |
| `renderer.js` | WebGL points and bond ribbons, coloring, picking, camera |
| `app.js` | Live controls, dynamic species/reaction editors, charts, tooltips, save/load |
| `controls.js` | Parameter labels, bounds, explanations, experiment guides |
| `index.html`, `styles.css` | Responsive lab interface |
| `RESEARCH.md`, `PARTICLE_PROCESSING_TODO.md` | Primary-source synthesis, model comparisons, limits, and future chemistry work |
| `scripts/` | Local preview, static build, Cloudflare preparation and fallback bundle, reproducible CPU benchmark |
| `tests/` | Physics, high-ID reactions, snapshots, renderer geometry/caches, buffer ownership, worker backpressure |

The physics suite covers seeded replay, v3 continuation and v1/v2 migration, independent all-pairs force comparisons, active cutoffs, momentum, charge, radius, valence, fueled motion, catalyst locality, competing conversions, 256-species identities, 1,024 indexed rules, and 50,000-particle snapshot round trips. Renderer and worker tests cover topology invalidation, deferred geometry, wide endpoints, ownership transfer, bounded publication, and responsive resets while frames are outstanding.

Camera regressions cover close zoom, projection and picking after panning, fixed-position free-flight look, frame-rate-independent movement, speed modifiers, focus/reset, and preserved relative framing. Browser checks exercise keyboard focus, held movement buttons, mobile pan/pinch, and navigation controls at narrow widths and in fullscreen.

Chromium checks cover desktop/mobile, help focus/tap, visible bonds, 256-species search and pair editing, 1,024-rule pagination/filtering, save/load/remapping, and a live 50,000-particle world. Instanced and fallback rendering match pixel-for-pixel across twelve view/color/visibility combinations. A separate renderer-only case checks 100,000 particles and endpoints above 65,535; this does not raise the simulation's 50,000-particle limit. Firefox remains unverified because its installed headless browser previously crashed before opening a page.
