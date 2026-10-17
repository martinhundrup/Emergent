# Research and design direction for protoform.ing

Research date: October 16, 2026. This document records the scientific basis and development path for a browser-based, three-dimensional artificial chemistry. The implemented feature list belongs in [README.md](README.md). Scientific proposals below are not claims that those features already exist; the scaling section explicitly distinguishes implemented optimizations, measurements, and future work.

## What the research suggests

The most useful next step is a **coarse-grained particle chemistry with explicit resources, local reactions, and measurable persistence**. The existing spatial particles and bonds are a suitable starting point. Stronger attraction alone makes it easier to form aggregates, but gives no mechanism for maintaining, copying, or varying their organization. The design should therefore connect structure, resource use, and information instead of treating visual complexity as the objective.

This is an engineering inference from the models below. None establishes a recipe that guarantees spontaneous life, and a browser cannot realistically reproduce the full atomic chemistry of the origin of life. A particle should represent an abstract chemical unit or molecular fragment. Its rules should be inspectable and internally consistent, with any external energy source made explicit.

## Relevant models and their practical lessons

| Model and primary source | What it demonstrates | Implication for this project |
| --- | --- | --- |
| **Lenia**, Chan, 2019: [paper](https://arxiv.org/abs/1812.05433), [author's implementation](https://github.com/Chakazul/Lenia) | Continuous cellular automata can support diverse persistent, moving patterns. Many were found through interactive evolutionary search. | Rich behavior can come from local density feedback. A species catalog must distinguish discovered patterns from species parameters deliberately entered by the user. Original Lenia is not a molecular simulation. |
| **Flow-Lenia**, Plantec et al., 2025: [paper and full text](https://arxiv.org/html/2506.08569v1) | Conserved transport and parameters carried with matter allow interacting patterns under different local rules. The study measures evolutionary activity and parameter diversity. | Conserve matter, attach relevant state locally, and measure selection over time. The food and dissipative variants had lower mass-normalized evolutionary activity than vanilla in these experiments: adding resources does not automatically increase complexity. |
| **Particle Lenia**, Mordvintsev, Niklasson, Randazzo, 2022: [interactive technical article](https://google-research.github.io/self-organising-systems/particle-lenia/) | Particles follow gradients determined by neighborhood density and a preferred density range. The authors show three-dimensional patterns and compare individual versus global energy descent. | A preferred local density and tolerance are more expressive than pair attraction alone. Its local motion law can increase the aggregate energy function; borrowing it requires labeling it as an active/artificial rule, not an energy-conserving molecular potential. |
| **Primordial Particle Systems**, Schmickl, Stefanec, Crailsheim, 2016: [paper](https://www.nature.com/articles/srep37969) | Constant-speed particles with local turning rules produce growing and dividing cell-like structures in a two-dimensional periodic world. The model assumes a continuing energy supply for motion. | Directional persistence, neighborhood-dependent turning, and density deserve controlled experiments. A visual division event is insufficient evidence for inherited variation or Darwinian evolution. Porting the motion rule to 3D would be a new model requiring its own characterization. |
| **RAF autocatalytic sets**, Hordijk and Steel, 2003 report / 2004 publication: [author institution's report](https://ir.canterbury.ac.nz/items/51800128-50ad-45de-96d5-bb3c208800ad) | A reaction network can be both catalytically supported by its members and constructible from a specified food set. The authors give an algorithm to detect such subnetworks. | Represent reactions and catalysts explicitly. Detecting a catalytic cycle is weaker than showing it can actually persist at the chosen rates and concentrations. A RAF is a structural property, not proof of a living organism. |
| **Gray–Scott reaction–diffusion**, Pearson, 1993: [paper](https://arxiv.org/abs/patt-sol/9304003) | A simple reaction–diffusion model produces irregular patterns and spots that grow and divide. | Diffusing resources and conversion rates offer a useful complementary layer. Dividing spots are a useful control showing why apparent reproduction alone should not receive an evolution label. |
| **Minimal protocells with dissipative particle dynamics**, Fellermann et al., 2006/2007: [paper](https://arxiv.org/abs/nlin/0612024), [full text](https://arxiv.org/pdf/nlin/0612024) | A 3D model couples molecular diffusion, amphiphile self-assembly, precursor conversion, and templating. Its container, metabolism, and information subsystems depend on each other. | The long-term target should be coupled mechanisms: local chemistry builds the compartment, the compartment concentrates chemistry, and information influences both. This is a deliberately designed minimal model, not a spontaneous path to contemporary biology. |
| **Collective active motion**, Vicsek et al., 1995: [original paper archive](https://arxiv.org/abs/cond-mat/0611743); Tailleur and Cates, 2008: [run-and-tumble paper](https://arxiv.org/abs/0803.1069) | Local alignment can create collective motion; interacting persistent swimmers can form domains. | Propulsion, turning noise, and alignment are meaningful controls, but a moving cluster may simply be active matter. Activity should have an explicit energy budget or be documented as externally powered. |

## Parameters with distinct, understandable effects

The following is a proposed parameter vocabulary. Controls should state their units, what increases when the slider moves, whether changes apply live or on restart, and which other controls they interact with. Dimensionless units are appropriate while the model remains abstract.

| Parameter group | Controls | Meaning and useful experiments |
| --- | --- | --- |
| Species identity | Name, color, initial fraction | Name and color help observation. Initial fraction changes availability and encounter rates; it is not an intrinsic physical property. |
| Mechanics | Mass, effective radius, drag multiplier | Mass controls acceleration under force; radius sets contact distance. Drag controls how long motion persists. Changing mass must also change kinetic-energy and thermostat calculations. |
| Pair interactions | Affinity, interaction distance, charge, screening length | Separate short-range exclusion, medium-range preference, and screened electrostatics. Keep equal-and-opposite passive forces. A nonreciprocal affinity matrix introduces active driving and must be identified accordingly. |
| Bond chemistry | Valence, capture range, association rate, bond length, spring stiffness, rupture strain, thermal dissociation | Valence limits network topology. A capture encounter should not guarantee a bond. Bond lifetime and stiffness are different properties; a stiff spring is not automatically chemically stable. |
| Local geometry | Preferred bond angle, angle stiffness, patch directions | Distinguish chains, branches, sheets, and cages. Isotropic point particles with high valence tend to form compact tangles. Directional sites provide geometrical selectivity. |
| Active behavior | Propulsion, directional persistence, alignment, crowding response | Sustained motion competes with bonding and mixing. Provide an off state and show whether propulsion uses resources or an implicit external drive. |
| Reaction kinetics | Reactant, product, catalyst, rate, activation requirement, catalytic gain, inhibition | Changing a particle's chemical state should be a local, accountable event. A catalyst speeds a specified reaction and survives it. A global random species switch is not catalysis. |
| Energy and resources | Fuel supply, regeneration, energy yield, maintenance cost, activity cost, waste removal | These create a reason for structures to keep working. Distinguish energy input from thermal agitation; raising temperature is not equivalent to supplying usable chemical fuel. |
| Environment | Volume/density, reflective or periodic boundary, gradients, source location, flow | Density changes contact frequency. Spatially separated sources and sinks can create persistent opportunities for transport. Periodic boundaries avoid confinement by walls but can introduce repeated encounters. |

Avoid exposing these all as one undifferentiated panel. Start with Species, Forces, Bonds, Reactions, and Environment, with advanced geometry or transport controls disclosed when relevant. Give presets a short hypothesis, not merely an evocative name.

### What “inert gas” should mean here

In this sandbox, an inert-gas preset is a comparison experiment: particles move, collide through the model's soft repulsion, and interact with the thermostat and boundaries, while chemical bonding and conversion are disabled. “Inert” does not mean stationary or invisible. “Show bonds” should display zero links in this condition and explain that there are no bonds to draw. A show/hide control changes rendering; it must never create or destroy chemical bonds.

Use the preset to distinguish motion caused by thermal agitation from motion sustained by active rules, and to confirm that cluster measurements are not merely counting particles that happen to pass near each other. This is an abstract control, not a calibrated noble-gas simulation.

## A concrete chemistry design to grow toward

The following is a proposed architecture, not a reproduction of one of the papers.

1. **Keep the material ledger.** A chemical identity can change, but its atoms or conserved material units cannot silently appear or vanish. For an initial abstract implementation, use equal-mass material units with multiple chemical states. If species have independently editable masses, either preserve per-particle mass through a state change or implement balanced reactions. Conserving the number of particles alone does not conserve mass when their masses change.
2. **Separate material and energy.** A fuel state can become a waste state while releasing a finite amount of usable energy. Regeneration requires an explicit environmental energy source. Maintain counters for resource consumed, waste produced, external energy supplied, and energy dissipated. A configurable energy yield is a model parameter, not a measured enthalpy.
3. **Make catalysis local.** A nearby catalyst changes the probability of a specific conversion. For a constant rate `k` within a simulation step `dt`, use `1 - exp(-k * dt)` rather than a fixed probability per rendered frame. Establish whether competing reactions are sampled jointly or sequentially; sequential processing can introduce bias.
4. **Couple activity to resources.** Resource capture replenishes an internal reserve; propulsion and maintaining active bonds draw from it. Depleted particles cease active work but remain as material. This creates starvation and turnover without adding an arbitrary organism death rule.
5. **Add cooperative networks.** Allow one product to catalyze a reaction producing another catalyst, with finite precursor supply and inhibition. Measure reaction throughput and persistence when the feed is interrupted. A closed cycle in a diagram should not automatically qualify as a self-sustaining network.
6. **Add compartments through molecular structure.** A head–tail amphiphile needs bonded subunits with different preferences, plus enough particles to represent the surrounding medium or an explicitly modeled substitute. A shell-shaped cluster alone does not establish a sealed compartment. Measure leakage and enrichment before calling it a membrane.
7. **Add information that matters.** Directional polymer sequences can influence templated assembly or catalytic specificity. Copying requires material and energy, permits configurable errors, and competes with cleavage. Demonstrate that descendants retain functionally relevant traits and that trait frequencies change because of performance under shared conditions.

Do not add a “split into two organisms” rule and then describe fission as spontaneous. A scripted split is useful in an explicitly labeled agent ecology, but a chemistry experiment should derive separation from local structural dynamics. Likewise, mutation of every particle at random is variation; it becomes heritable variation only when a copying or transmission mechanism retains it.

## Measurements that can separate interesting chemistry from clumping

| Question | Measurements | Main confound to exclude |
| --- | --- | --- |
| Does structure persist? | Bond lifetime distribution, connected-component survival, recurring bond motifs, size distribution | A large frozen aggregate can score highly on size and longevity. |
| Is it dynamic? | Bond formation/breakage per simulation second, particle exchange, reaction flux | Thermal disruption can produce high activity with no organization. |
| Is there coordinated motion? | Center-of-mass displacement, velocity alignment, angular motion, displacement relative to solvent/flow | Global drift, imposed flow, or camera movement. |
| Is there maintenance? | Recovery after a controlled perturbation; structural persistence with material turnover; dependence on fuel | Passive relaxation into the same energy minimum. |
| Are resources consequential? | Uptake by structure, reserve distribution, waste production, extinction after feed removal, recovery after restoration | Unlimited hidden energy or creation of material on conversion. |
| Is there a compartment? | Interior/exterior composition, tracer retention, permeability, transport across its surface | A visually hollow shell with freely passing particles. |
| Is a split reproduction? | Parent–descendant membership, repeat growth–division cycles, inherited composition or sequence | A single brittle aggregate fragmenting into unrelated pieces. |
| Is there selection? | Trait-dependent descendant counts across generations under shared resource limits; neutral/shuffled controls | Transient sorting, color frequency, or user-chosen reproduction rates. |
| Does complexity increase? | Diversity of persistent functional motifs, lineage novelty, behavioral repertoire over long runs | Random noise, increasing particle count, and metrics that reward static size. |

Track component identity with overlapping particle membership across samples; keep merges and splits explicit rather than assigning an arbitrary new “organism” ID at every frame. Preserve the raw observations so a different clustering definition can be evaluated later. Evolutionary activity is a useful inspiration from Flow-Lenia, but the definition of an individual or species remains part of the experiment, and its mass-normalization caveat matters. [Flow-Lenia discussion](https://arxiv.org/html/2506.08569v1)

## A practical implementation sequence

[Particle processing (soft TODO)](PARTICLE_PROCESSING_TODO.md) sketches balanced build/breakdown reactions and the material and energy accounting they would require.

**Near term: explainable artificial chemistry.** Expose real species parameters, clearer interaction help, reliable bond rendering, count/density controls, local catalysis, energy-dependent activity, and observable resource turnover. Preserve seeded replay and snapshots. Each new parameter should influence an observable mechanism; inactive or disabled parameters should say why. Keep an inert baseline, a chain-forming baseline, an active mixture, and a driven catalytic mixture.

**Next: a reproducible experiment workbench.** Add parameter sweeps, saved experiments with model version and seed, comparison plots, and automatic discovery of diverse outcomes. Sample multiple seeds rather than selecting one striking movie. Include controls with catalysis, propulsion, or fuel disabled. Archive interesting runs using several descriptors such as structure lifetime, turnover, displacement, and reaction flux; maximizing one “life score” encourages misleading outcomes.

**Later: shape and information.** Implement directional bonding, amphiphile molecules, permeable compartments, templated polymers, and lineage tracing. Couple these mechanisms incrementally. Run stability and conservation checks before interpreting new macroscopic behavior. Once reproduction exists, measure inherited differences across several generations and perturb the resource landscape to test whether the population responds.

**Separate optional substrate: Lenia-style density feedback.** Add a distinct mode with preferred neighborhood density, tolerance, and sensing length. Keep its mathematical assumptions visible. Replacing the passive force law with local density optimization changes the meaning of energy and cannot be treated as a transparent physics improvement.

## Scaling while preserving free static hosting

The first CPU and renderer improvements below are now implemented: active cutoffs, contiguous cells, cached coefficients, indexed reactions, wider IDs, recycled frame buffers, cached topology, and instanced bond ribbons. The configured limits are now **50,000 particles, 256 species, and 1,024 reaction rules**. These are validation limits, not a promise of real-time performance at every density or on every device. GPU simulation, Verlet-list reuse, and the other explicitly deferred work remain proposals. Computation stays on the visitor's device, so the application can still be statically hosted.

### Baseline audit before the CPU upgrade

This records the starting implementation in `simulation.js`, `worker.js`, `renderer.js`, and `app.js` on October 16, 2026. The following stages distinguish implemented fixes from remaining proposals.

| Area | Existing implementation | Scaling consequence |
| --- | --- | --- |
| Neighborhood search | Typed particle arrays, one CPU worker, and a linked cell grid already exist. Each particle visits up to 27 cells; `j <= i` prevents duplicate force evaluation. | Adding a spatial hash or a worker is not a new optimization. The next improvements concern candidate counts, memory locality, and reuse. |
| Cutoffs | `rebuildGrid()` uses the maximum of interaction distance, reaction distance, and bond capture distance, including disabled mechanisms. | A long inactive reaction radius can enlarge every search. Dense cells still approach all-pairs work. |
| Pair and bond calculations | Pair loops perform square roots, trigonometry, conditional exponentials, and `Map` lookups. Bonds and their ages live in separate maps. | Pointer chasing and allocations matter alongside arithmetic; a faster language does not remove unnecessary pair tests. |
| Reactions | Every particle scans every rule. Catalyst presence is one byte; conversion targets are signed bytes. | Work is O(N × rule count), and higher species IDs silently exceed the representations if validation is simply relaxed. |
| Frame publication | The worker copies positions, types, and energy with `.slice()`, and flattens bond arrays before transferring their buffers. | Transfer already avoids an additional structured-clone copy, but fresh allocations and the first copy remain. There is no consumer acknowledgement to bound outstanding frames. |
| Geometry preparation | Every new frame rebuilds particle appearance, bonded nodes, and six vertices per bond, even with bonds hidden. All three buffers are uploaded at their allocated capacity. | CPU work and upload traffic grow unnecessarily. A bond currently occupies 66 floats, or 264 bytes, before spare capacity. |
| Statistics and interface | Cluster statistics allocate union-find arrays; cluster coloring separately reconstructs connectivity. The affinity editor creates every matrix cell. | Sampling costs grow with particles/bonds; editing grows quadratically with species. |

For a roughly homogeneous world, local candidate work scales approximately with `N × density × cutoff³`, in addition to grid construction and bonds. This is a workload estimate, not a timing formula. At constant density and cutoff, increasing N can remain near-linear; packing more particles into the same box increases the neighbors per particle. Collapsed clusters can defeat that favorable case. Preserve density with `boxSide ∝ cbrt(N)` when evaluating a *larger* simulation, and also measure dense stress cases separately.

### Stage 1: CPU improvements implemented

1. **Active physical cutoffs.** The engine now compiles pair-specific cutoffs from enabled repulsion, affinity, charge, alignment, bond formation, and catalyst requirements. Conservative distance-to-cell bounds skip cells that cannot intersect the search sphere; a global distance rejection runs before species-table lookup, followed by the pair-specific cutoff. These reject irrelevant work before square roots and force arithmetic. Existing bonds retain their independent force/breakage pass. No active interaction distance is reduced for speed.
2. **Contiguous cell ranges.** Counts, prefix offsets, and contiguous particle-index ranges replace linked particle chains. Descending IDs preserve the previous within-cell order; particle IDs remain stable. The grid limits empty-cell overhead in sparse worlds. **Deferred:** a Verlet list with a skin could reuse candidates across steps, rebuilding before maximum displacement exceeds half the skin and invalidating after cutoff changes/reset/import. Its extra storage and candidate checks must be benchmarked; fast particles may erase the benefit. The method and bin-size tradeoffs are documented in [LAMMPS's neighbor-list implementation](https://docs.lammps.org/stable/Developer_par_neigh.html).
3. **Cached coefficients and scratch data.** Species noise and pair force/bond coefficients are compiled after settings changes; reactions are grouped by reactant; hazards and statistics arrays are reused. Pair tables retain double precision. **Deferred:** packed bond lists and bounded adjacency slots could replace endpoint arrays and the two maps. Valence remains capped at six; preserve bond identity and birth time in any storage migration.

If species later have very different interaction ranges, benchmark separate short/long lists or type-dependent stencils. A single grid sized for the longest range can waste work for most species. Tree-based neighbor construction is an option for sparse, inhomogeneous worlds, not an automatic upgrade for the present bounded box. [HOOMD-blue's cell, stencil, and tree comparison](https://hoomd-blue.readthedocs.io/en/v2.5.1/nlist.html)

Changing grid size and skipping inactive pairs can change accumulation and the order in which the sequential random generator is consumed. Snapshot version 3 records algorithm `cell-ranges-v1`; older snapshots import their saved state, but subsequent trajectories are not promised to match the old implementation. Exact replay within this version is tested. Compare physical distributions, event rates, and invariants against the reference in longer scientific validation. A counter-based random stream keyed by seed, tick, stable particle/pair ID, and event kind remains a possible future migration for parallel scheduling.

### Stage 2: species migration implemented; larger catalogs remain future work

The previous cap of six species and eight rules hid additional representation barriers. These have been migrated alongside the new 256-species / 1,024-rule limit:

| Previous representation | Previous failure boundary | Implemented replacement |
| --- | --- | --- |
| `catalysts: Uint8Array`, populated with `1 << type` | Only eight independent catalyst flags; JavaScript bit shifts also wrap at 32 bits. | Multiple `Uint32Array` words, densely assigned only to species used by active catalytic rules. |
| `convertTo: Int8Array`, `-1` sentinel | Valid product IDs 0–127. | `Int32Array` conversion targets. |
| `types: Uint8Array` | Species IDs 0–255. | `Uint16Array` in simulation and frame buffers; the configured cap remains 256 species. |
| Worker bond endpoints and statistics component sizes: `Uint16Array` | Particle indices above 65,535 and component sizes above 65,535 overflow. | `Uint32Array` endpoints/component sizes. The configured particle cap is currently 50,000. |

The engine now compiles `reactionsByType` and catalyst lookup data on configuration, so a particle visits only its applicable rules. Competing-hazard sampling and the rule that newly converted catalysts act next step are preserved. Catalyst storage scales with the number of distinct catalysts in active rules rather than every defined species. Further sparse per-substrate indexing remains an option: at 100,000 particles and 1,000 catalyst species, even a packed presence bitset would consume about 12.8 MB, plus clearing/scanning bandwidth.

Pair affinity lookup is already constant-time; more species alone does not multiply neighbor visits by species count. A dense float32 matrix costs `4 × speciesCount²` bytes: about 4 MB at 1,000 species and 400 MB at 10,000. Keep a dense typed matrix for moderate catalogs, then benchmark sparse overrides against default interaction classes for very large sparse catalogs. A factorized interaction model would constrain the allowed chemistry and must be offered as a different model, not silently substituted.

For more than six species, searchable selection replaces the tabs and a selected-pair editor replaces the complete matrix. Reaction filters and eight-card pagination bound the rule editor's DOM work. Fully virtualized catalogs remain a possible follow-up. Assigned colors are deterministic; species changes and experiment randomization preserve view preferences. Further limit increases require import/export, removal/remapping, selection, and reaction checks across the next ID boundaries. The current engine also caches several dense double-precision pair tables; this is reasonable at 256 species but must be reconsidered before catalogs grow by orders of magnitude.

### Stage 3: frame pooling and renderer improvements implemented

The worker now uses a maximum of three reusable frame-buffer slots. It fills available buffers directly, transfers ownership, and reuses them after the main thread returns them; a slow consumer cannot accumulate an unlimited visual queue. Physics, frame publication, and statistics cadence are separate; statistics are sampled on a wall-clock interval plus explicit events. **Deferred:** view-dependent energy payloads could reduce traffic further. Ownership matters because transferring detaches the sender's buffer. [HTML's transferable-object specification](https://html.spec.whatwg.org/multipage/structured-data.html#transferable-objects)

The renderer now caches bond topology by generation/version, prepares only the visible view's geometry, retains GPU allocations, and updates used ranges. Instanced ribbons reduce per-bond attributes from 66 floats (264 bytes) to 14 floats (56 bytes), sharing one six-vertex corner shape. WebGL 1 exposes this through [`ANGLE_instanced_arrays`](https://registry.khronos.org/webgl/extensions/ANGLE_instanced_arrays/); the expanded-ribbon fallback remains available. **Deferred:** separate static color/radius attributes from moving positions. Point particles already batch into few draw calls.

**Deferred:** an `OffscreenCanvas` worker could own rendering and consume simulation data locally, reducing main-thread work and frame handoff. This improves responsiveness; it does not make serial physics parallel. Pointer/keyboard handling would stay on the UI thread. [HTML's OffscreenCanvas specification](https://html.spec.whatwg.org/multipage/canvas.html#the-offscreencanvas-interface)

Use `SharedArrayBuffer` only if measured transfer/allocation cost remains material. It needs an ownership protocol with atomic publication; simultaneous reads of a buffer being rewritten can tear a frame. Cross-origin isolation is required for sharing, and the current local server and `_headers` do not set it. Threaded WebAssembly likewise needs appropriate COOP/COEP headers and separate threaded/fallback builds. [Emscripten pthreads documentation](https://emscripten.org/docs/porting/pthreads)

### Stage 4: GPU-resident physics and rendering remain proposed

For the largest simulations, the architectural candidate is WebGPU compute with particle state retained on the GPU and consumed directly by rendering. Upload settings/commands; read back compact statistics and selected-particle information asynchronously. Avoid a GPU → CPU → WebGL round trip each frame. Compute pipelines and storage buffers are the relevant capabilities. [GPU for the Web explainer](https://gpuweb.github.io/gpuweb/explainer/)

Prototype in increasing order of difficulty:

1. Inert particles: cell histogram → prefix scan → scatter particle IDs → local forces → integration → render.
2. Active particles and energy: stable input/output buffers, local alignment, and per-particle random streams.
3. Reactions: gather relevant catalysts from the old species state, evaluate hazards, commit conversions in a separate pass.
4. Dynamic bonds: propose candidates, resolve endpoint/valence conflicts, commit accepted bonds, and compact removals. Capacity overflow must be reported/recovered, never silently drop physical interactions.

The current CPU pair loop writes both endpoints. A direct parallel translation races. Start with one invocation gathering all forces for its own particle, accepting duplicate pair evaluation, or use a separate pair-result/reduction scheme. Core WGSL atomic arithmetic operates on integers, not arbitrary floating-point force values; do not assume floating-point `atomicAdd`. Cross-workgroup phases need separate dispatches rather than a workgroup barrier pretending to synchronize the whole grid. [WGSL atomic types and synchronization](https://gpuweb.github.io/gpuweb/wgsl/)

Query adapter/device limits, especially storage binding size, total buffer size, workgroup storage, and dispatch dimensions. Budget state, two simulation buffers, cells, neighbors, bonds, scratch space, and rendering together; fixed-size per-cell buckets need overflow handling in dense clusters. Implement device-loss recovery and retain the CPU backend. Available limits vary by implementation. [WebGPU limits correspondence](https://gpuweb.github.io/gpuweb/correspondence/)

WebAssembly SIMD is an alternative CPU experiment after data layout is improved; it does not itself fix algorithmic complexity or irregular neighbor access. Benchmark it against optimized JavaScript before committing to a second implementation. [Emscripten SIMD documentation](https://emscripten.org/docs/porting/simd)

### Measured result after optimization: October 16, 2026

The [complete 13-case comparison](benchmarks/cpu-optimized-2026-10-16.json) records settings, raw samples, source hashes, and physical-state checksums. The reference engine and renderer match revision `ed4963b` after line-ending normalization. Both implementations started from the same saved tick-60 state, then ran three 120-step windows with alternating measurement order. Independent single-step samples repeatedly restored that same state outside the timer. All five original-scale comparisons finished with **identical physical-state checksums**, including positions, velocities, species, energy, bonds, random state, and event counters. This is evidence for these cases, not a guarantee of identical old/new trajectories for every configuration.

These measurements used the same Intel Core Ultra 7 265K / Windows x64 / Node 22.23.3 environment as the original baseline. Values below are medians pooled across 360 evolving steps; p95 describes the optimized implementation. They exclude worker transport, GPU work, browser scheduling, and the interface.

| Experiment, 6,000 particles | Previous step | Optimized step | Optimized p95 |
| --- | --- | --- | --- |
| Soup, baseline density, box 82.079 | 7.40 ms | 5.93 ms | 6.19 ms |
| Inert gas, baseline density, box 82.079 | 6.20 ms | 1.35 ms | 1.42 ms |
| Catalytic cycle, baseline density, box 82.079 | 7.47 ms | 5.95 ms | 6.15 ms |
| Soup, dense box 48 | 41.95 ms | 36.39 ms | 43.45 ms |

For the same input state, single-step medians also improved: soup at baseline density 6.96 → 5.55 ms, gas 6.26 → 1.35 ms, and dense soup 25.67 → 20.94 ms. The evolving gas comparison is about 4.6 times faster; soup and catalytic workloads gain less because their active neighborhood work remains. Dense soup still cannot sustain 60 physics steps per second on this CPU. These results do not support a blanket speedup multiplier for every experiment.

The expanded cases all preserve the original nominal density by increasing box side with the cube root of particle count:

| Experiment | Particles | Species / rules | Median step | p95 step |
| --- | --- | --- | --- | --- |
| Soup | 10,000 | 3 / 0 | 9.92 ms | 10.19 ms |
| Soup | 25,000 | 3 / 0 | 25.46 ms | 26.41 ms |
| Soup | 50,000 | 3 / 0 | 51.91 ms | 53.53 ms |
| Inert gas with a large catalog | 50,000 | 256 / 0 | 10.44 ms | 10.73 ms |
| Uniform-property species with active conversion rules | 10,000 | 256 / 1,024 | 13.09 ms | 15.28 ms |

The 256-species reaction case recorded 17,148 conversions by tick 180; its rules were active work, not merely an unused catalog. A separate identical-properties control at 10,000 particles measured 10.85 / 10.56 / 11.14 ms for 2 / 64 / 256 species without reactions. This supports indexing work by local neighbors and applicable rules rather than scanning the entire catalog. It does not establish the cost of arbitrary dense reaction networks or longer-lived aggregates. At 50,000 particles the soup still takes about 52 ms per step; the faster gas case must not be presented as the capacity of every chemistry.

Renderer and packing phases used the same tick-60 fixture, with 6,000 particles and 3,170 bonds. After 120 geometry warmup publications, visible particles/bonds prepared in 0.270 → 0.108 ms; hidden bonds in 0.270 → 0.063 ms; and cluster colors with changed topology every publication in 0.294 → 0.177 ms. The same visible scene's geometry upload payload dropped from 1,172,880 to 345,520 bytes (about 71%); hiding bonds reduced it to 168,000 bytes. These are CPU preparation times and counted payloads, not measured GPU execution times. Frame packing/recycling measured 0.095 → 0.012 ms without actual transfer. Wider IDs slightly increase frame data, while reuse reduces allocation work.

To rerun the current workloads, use `npm run benchmark -- --suite all --output benchmarks/local.json`. The default suite covers original-scale cases; `--suite expanded` covers larger worlds, and `--filter` selects case names. To compare against the original implementation, extract `simulation.js` and `renderer.js` from revision `ed4963b` as separate `.mjs` files and provide their paths with `--reference-engine` and `--reference-renderer`. Run without competing workloads. The harness refuses to publish a result if a measured source file changes during execution. Repeat in fresh processes and real browsers before extrapolating to other hardware, sustained operation, or FPS.

### Original CPU baseline: October 16, 2026

The repository retains the [original 18-case output](benchmarks/cpu-2026-10-16.json), measured before the CPU/renderer upgrade. This baseline used an Intel Core Ultra 7 265K (20 logical processors), Windows x64, Node 22.23.3 / V8 12.4.254.21, and seed 42. After a global warmup of 150 steps for each main chemistry path, each case ran 60 warmup steps and 120 timed evolving steps. The table is one local run, not a cross-device capacity claim. The updated `npm run benchmark` harness measures the current implementation; the comparison options below accept preserved baseline modules.

| Soup particles | Box side | Density treatment | Median physics step | p95 physics step |
| --- | --- | --- | --- | --- |
| 1,200 | 48 | Baseline | 1.29 ms | 1.37 ms |
| 3,000 | 48 | More densely packed | 7.01 ms | 7.22 ms |
| 3,000 | 65.146 | Baseline density preserved | 3.54 ms | 3.71 ms |
| 6,000 | 48 | More densely packed | 41.90 ms | 49.07 ms |
| 6,000 | 82.079 | Baseline density preserved | 7.40 ms | 8.30 ms |

At the final 6,000-particle state, the fixed box had 2,023,243 candidate pairs and 1,382,095 within the cutoff, versus 384,986 and 106,945 respectively at baseline density. These are different physical experiments, not a measured optimization speedup. They show why density and clustering must accompany particle-count claims. At the dense case's measured step time, the CPU physics alone exceeds the 16.67 ms budget for 60 fixed steps per second.

In that same dense case, separate repeated final-state measurements gave medians of 0.28 ms for statistics, 0.12 ms for frame packing, and 0.34 ms for particle-color renderer preparation. Physics is the immediate measured bottleneck on this machine. Nevertheless, a frame contained 119,672 transferred payload bytes while the renderer's allocated geometry uploads totaled 1,502,352 bytes; reducing unnecessary geometry remains useful as count grows. These measurements exclude actual worker messaging, GPU upload/execution, browser scheduling, DOM updates, and display FPS.

The identical-properties species control at 6,000 particles and baseline density measured 8.11 / 7.98 / 7.91 ms medians for 2 / 3 / 6 species, with identical final physical states and pair counts. Those small differences are timing variation; the existing pair loop does not inherently become much slower from six species alone. This does not establish the cost of hundreds of species or thousands of reaction rules. A separate interaction-radius sweep at 3,000 particles measured 7.09 / 79.09 / 81.04 ms at radii 6 / 12 / 16; changing radius also changed chemistry and aggregation, so these are workload examples, not an isolated radius-scaling law.

This original run measured the previous supported counts and short trajectories through tick 180. Longer aggregation and actual browser behavior still need independent measurement.

### Benchmark and acceptance plan

Report physics milliseconds per fixed step and simulated seconds per wall-clock second separately from display FPS. A smooth camera can coexist with slow physics, and the worker's capped accumulator can discard backlog. Speed settings must keep their selected meaning; optimization must not secretly lower timestep, interaction radius, particle count, bond fidelity, or render preferences.

For each backend/version, save seed, full settings, browser/runtime, CPU/GPU, viewport and device-pixel ratio, warmup, run length, and raw timing samples. Measure median and p95 for grid construction, pair work, bonds, reactions, integration, statistics, frame packing, browser transport, renderer preparation, and GPU execution where available. Also record candidate/accepted pairs, cell occupancy, bonds, memory, allocations/GC, and input responsiveness.

Time configuration and snapshot operations separately from steady simulation. A 256-species edit currently validates a dense matrix and recompiles several pair tables; batching rapid slider messages and invalidating only affected caches are possible follow-ups if interaction profiles show a bottleneck.

Run separate sweeps for N, constant versus increasing density, interaction radius, active rule count, and species count with otherwise identical properties. Include inert gas, dense condensation, bonds, propulsion, catalytic rules, and maximum-range stress. The updated harness covers 10k/25k/50k particles, 2/64/256 species, and 1,024 rules within the new limits. A future 100k-particle or 1,024-species target needs another validation/resource-budget review. Check integrated and discrete GPUs and a mobile device before selecting defaults.

Require finite bounded state, reciprocal passive pair forces, valid valence, unique bonds, correct catalyst identity, species population totals, competing reaction behavior, and snapshot round trips. Compare small seeded runs against a brute-force neighbor reference and compare long-run observables across multiple seeds. Version/backend reproducibility and statistical agreement across GPU devices are different guarantees. Prefer the simplest stage that meets the measured budget; retain a change only when its improvement exceeds run-to-run noise without breaking these checks.
