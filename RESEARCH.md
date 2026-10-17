# Research and design direction for protoform.ing

Research date: October 16, 2026. This document records the scientific basis and proposed development path for a browser-based, three-dimensional artificial chemistry. The implemented feature list belongs in [README.md](README.md); proposals below are not claims that those features already exist.

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
| **Minimal protocells with dissipative particle dynamics**, Fellermann et al., 2006/2007: [paper](https://arxiv.org/abs/nlin/0612024), [full text](https://arxiv.org/pdf/nlin/0612024) | A 3D model couples molecular diffusion, amphiphile self-assembly, precursor conversion, and templating. Its container, metabolism, and information subsystems depend on each other. | The long-term target should be coupled mechanisms: local chemistry builds the compartment, the compartment concentrates chemistry, and information influences both. This is a deliberately designed minimal model, not spontaneous emergence of contemporary biology. |
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

Do not add a “split into two organisms” rule and then describe fission as emergent. A scripted split is useful in an explicitly labeled agent ecology, but a chemistry experiment should derive separation from local structural dynamics. Likewise, mutation of every particle at random is variation; it becomes heritable variation only when a copying or transmission mechanism retains it.

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

**Near term: explainable artificial chemistry.** Expose real species parameters, clearer interaction help, reliable bond rendering, count/density controls, local catalysis, energy-dependent activity, and observable resource turnover. Preserve seeded replay and snapshots. Each new parameter should influence an observable mechanism; inactive or disabled parameters should say why. Keep an inert baseline, a chain-forming baseline, an active mixture, and a driven catalytic mixture.

**Next: a reproducible experiment workbench.** Add parameter sweeps, saved experiments with model version and seed, comparison plots, and automatic discovery of diverse outcomes. Sample multiple seeds rather than selecting one striking movie. Include controls with catalysis, propulsion, or fuel disabled. Archive interesting runs using several descriptors such as structure lifetime, turnover, displacement, and reaction flux; maximizing one “life score” encourages misleading outcomes.

**Later: shape and information.** Implement directional bonding, amphiphile molecules, permeable compartments, templated polymers, and lineage tracing. Couple these mechanisms incrementally. Run stability and conservation checks before interpreting new macroscopic behavior. Once reproduction exists, measure inherited differences across several generations and perturb the resource landscape to test whether the population responds.

**Separate optional substrate: Lenia-style density feedback.** Add a distinct mode with preferred neighborhood density, tolerance, and sensing length. Keep its mathematical assumptions visible. Replacing the passive force law with local density optimization changes the meaning of energy and cannot be treated as a transparent physics improvement.

## Scaling while preserving free static hosting

The suggested architecture keeps computation on the visitor's device. Static hosting serves HTML, JavaScript, shaders, and optional WebAssembly; it does not need a continuously running Go service. Cloudflare currently documents free, unlimited static-asset requests and no asset storage charge; requests that invoke a Worker script follow separate pricing. [Cloudflare static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)

For the current CPU worker, use short interaction cutoffs, a cell grid, typed arrays, sparse bonds, and infrequent statistical sampling. Spatial indexing reduces work when local density is bounded, but a cell packed with most particles can still approach quadratic pair work. Increasing the particle count and increasing the chamber size together preserves density; increasing only particle count changes the experiment as well as the cost. Report physics steps per wall-clock second separately from rendering FPS.

For a larger future version, WebGPU supplies compute pipelines, storage buffers, and GPU command submission in the browser. [W3C GPU for the Web explainer](https://gpuweb.github.io/gpuweb/explainer/) A proposed pipeline is spatial binning, neighborhood interactions, local reactions, integration, then rendering from resident GPU buffers. Read back only compact statistics at a modest cadence. Include a CPU fallback and capability detection; do not assume that every browser, adapter, or mobile device can sustain the same workload.

GPU migration should follow profiling, not precede a clear model. Dynamic bond insertion, competing reactions, and deterministic random-number streams require careful synchronization. A CPU and GPU implementation should aim for statistically consistent behavior; identical floating-point trajectories across devices are a separate and much stricter promise. A 3D field also grows cubically with resolution, so a hybrid of particles plus coarse resource fields may be more practical than a dense fine-resolution volume.

No particle-count or frame-rate target in this document is a measured benchmark. The meaningful scaling target is a larger world that preserves local dynamics and produces comparable observations across timestep, density, and resolution changes.
