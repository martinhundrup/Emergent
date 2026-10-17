// Dimensionless, mesoscopic artificial chemistry. The bath, energy supply and
// active motors exchange energy with this deliberately open, driven system.
export const BOX = 48;
export const DT = 1 / 60;
export const LIMITS = Object.freeze({ particles: 50000, species: 256, reactions: 1024, boxSize: 640 });
export const ALGORITHM = 'cell-ranges-v1';
export const SPECIES = ['Scaffold', 'Linker', 'Solvent'];
const COLORS = ['#f28b82', '#8aaaf5', '#c2a2ed', '#edb76c', '#e989b9', '#a3b8db'];
const RATE_WINDOW = 120;

function defaultColor(index) {
  if (index < COLORS.length) return COLORS[index];
  // A fixed blue → violet → red → amber palette; adding species never recolors others.
  const hue = (215 + ((index - COLORS.length) * 97 % 250) * 185 / 250) % 360;
  const light = .64, amplitude = .68 * Math.min(light, 1 - light);
  const channel = offset => {
    const phase = (offset + hue / 30) % 12;
    return Math.round(255 * (light - amplitude * Math.max(-1, Math.min(phase - 3, 9 - phase, 1)))).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function speciesDefaults(index = 0) {
  return { name: SPECIES[index] ?? `Species ${index + 1}`, color: defaultColor(index), abundance: 1,
    mass: 1, radius: .6, charge: 0, valence: 2, bondEnergy: 1, propulsion: 0, alignment: 0, turnRate: .2 };
}
const species = overrides => overrides.map((item, i) => ({ ...speciesDefaults(i), ...item }));
const BASE = {
  temperature: .3, attraction: 1.5, bondStrength: 1.8, damping: .8,
  boxSize: BOX, interactionRadius: 6, repulsion: 30,
  bondFormation: 5, bondBreakage: .2, chargeStrength: 1, screeningLength: 3,
  reactionRadius: 3.5, energyInput: .5, energyDecay: .1, energyGradient: 0,
  reactions: [],
};
export const PRESETS = {
  lucky: { ...BASE, name: 'Lucky experiment', description: 'Random model rules with your colors, view, and playback settings preserved.',
    matrix: [.5, .2, .2, .5], species: species([{ abundance: 50 }, { abundance: 50 }]) },
  soup: { ...BASE, name: 'Primordial soup', description: 'Reversible branching structures in a thermal bath.',
    matrix: [.65,.9,-.2,.9,.3,.05,-.2,.05,-.1],
    species: species([{ valence: 3, abundance: 45, mass: 1.4, radius: .68 }, { valence: 2, abundance: 35, radius: .55 }, { valence: 0, abundance: 20, bondEnergy: 0, mass: .6, radius: .45 }]) },
  chains: { ...BASE, name: 'Chain builders', description: 'Two binding sites favor filaments and rings. Solvent cannot bond.', temperature: .1, attraction: 2, bondStrength: 2.6, damping: 1.2,
    matrix: [.8,1,-.2,1,.7,-.2,-.2,-.2,0],
    species: species([{ name: 'Monomer A', valence: 2, abundance: 45, bondEnergy: 1.5 }, { name: 'Monomer B', valence: 2, abundance: 45, bondEnergy: 1.5 }, { valence: 0, abundance: 10, bondEnergy: 0, radius: .4 }]) },
  droplets: { ...BASE, name: 'Condensation', description: 'Positive self-affinity and mutual repulsion separate the mixture into domains.', temperature: .12, attraction: 3, bondStrength: 1, damping: 1.3,
    matrix: [1,-.7,-.6,-.7,1,-.6,-.6,-.6,.6],
    species: species([{ name: 'Phase A', valence: 4, abundance: 40 }, { name: 'Phase B', valence: 4, abundance: 40 }, { valence: 0, abundance: 20, radius: .4 }]) },
  gas: { ...BASE, name: 'Inert gas', description: 'Neutral particles collide and receive thermal kicks, but neither attract, bond nor react. A reference for comparing structure.', temperature: 1.2, attraction: 0, bondStrength: 0, damping: .3, energyInput: 0,
    matrix: Array(9).fill(0), species: species([{ name: 'Light gas', mass: .5, radius: .4, valence: 0, bondEnergy: 0 }, { name: 'Medium gas', mass: 1, radius: .5, valence: 0, bondEnergy: 0 }, { name: 'Heavy gas', mass: 2, radius: .65, valence: 0, bondEnergy: 0 }]) },
  active: { ...BASE, name: 'Active swarms', description: 'Fueled propulsion and local heading alignment compete with rotational noise.', temperature: .08, attraction: .8, bondStrength: .6, damping: 1.5, energyInput: 1.5, energyGradient: .65,
    matrix: [.5,-.25,0,-.25,.5,0,0,0,0],
    species: species([{ name: 'Swimmer A', abundance: 45, propulsion: 3.5, alignment: 5, turnRate: .08, valence: 1 }, { name: 'Swimmer B', abundance: 45, propulsion: 2.7, alignment: 4, turnRate: .15, valence: 1 }, { abundance: 10, valence: 0, radius: .4 }]) },
  autocatalytic: { ...BASE, name: 'Catalytic cycle', description: 'Local catalysts convert feedstock into more catalysts; decay and energy supply control persistence.', temperature: .2, attraction: 1.8, bondStrength: 1.3, energyInput: .8, energyDecay: .08, energyGradient: .85, reactionRadius: 4.5,
    matrix: [.05,.25,.2,.25,.8,-.3,.2,-.3,.8],
    species: species([{ name: 'Feedstock', abundance: 76, valence: 0, bondEnergy: 0 }, { name: 'Catalyst A', abundance: 12, valence: 3, propulsion: .7, alignment: 1, turnRate: .3 }, { name: 'Catalyst B', abundance: 12, valence: 3, propulsion: .7, alignment: 1, turnRate: .3 }]),
    reactions: [
      { name: 'A helps produce B', from: 0, to: 2, catalyst: 1, rate: 1.4, activationEnergy: .4, energyCost: .7 },
      { name: 'B helps produce A', from: 0, to: 1, catalyst: 2, rate: 1.4, activationEnergy: .4, energyCost: .7 },
      { name: 'A decays to feedstock', from: 1, to: 0, catalyst: -1, rate: .12, activationEnergy: 0, energyCost: 0 },
      { name: 'B decays to feedstock', from: 2, to: 0, catalyst: -1, rate: .12, activationEnergy: 0, energyCost: 0 },
    ] },
};

export function settingsFor(preset = 'soup', count = 1200, seed = 42) {
  if (!Object.hasOwn(PRESETS, preset)) throw new Error('Unknown experiment preset.');
  return validateSettings({ ...structuredClone(PRESETS[preset]), preset, count, seed });
}

// Lucky varies working recipes together. Independent full-range controls often
// cancel each other out (hot, fast-breaking bonds; inactive catalysts; no
// attractive pairs), leaving a world that behaves like a dilute gas.
const LUCKY_RECIPES = ['soup', 'chains', 'droplets', 'active', 'autocatalytic'];
const LUCKY_FIELD_RANGES = {
  common: { temperature: [.08, .4], attraction: [1.3, 3], interactionRadius: [5, 8], repulsion: [25, 55], damping: [.6, 1.6],
    bondStrength: [1, 3], bondFormation: [3, 10], bondBreakage: [.04, .45], chargeStrength: [.2, 1.2], screeningLength: [2, 5],
    energyInput: [.3, 1.2], energyDecay: [.03, .22], energyGradient: [0, .6], reactionRadius: [3.2, 6] },
  chains: { temperature: [.04, .23], attraction: [1.7, 3.2], bondStrength: [2, 3.6], bondFormation: [4, 12], bondBreakage: [.03, .25] },
  droplets: { temperature: [.04, .25], attraction: [2, 4], bondStrength: [.6, 1.8], bondFormation: [2, 7], chargeStrength: [.2, .8] },
  active: { temperature: [.03, .22], attraction: [.4, 1.4], interactionRadius: [5, 9], damping: [1, 2.2], bondStrength: [.3, 1.2],
    bondFormation: [1, 5], bondBreakage: [.1, .7], energyInput: [1, 2.5], energyGradient: [.2, .9] },
  autocatalytic: { attraction: [1.2, 2.8], bondStrength: [.8, 2.4], energyInput: [.7, 1.8], energyGradient: [.1, .9], reactionRadius: [3.5, 6] },
};
const LUCKY_REACTIONS = {
  soup: [
    { name: 'Scaffold recruits linker', from: 2, to: 1, catalyst: 0, rate: .35, activationEnergy: .3, energyCost: .3 },
    { name: 'Linker returns to solvent', from: 1, to: 2, catalyst: -1, rate: .06, activationEnergy: .15, energyCost: .1 },
  ],
  chains: [
    { name: 'Chain recruits monomer', from: 2, to: 0, catalyst: 1, rate: .3, activationEnergy: .25, energyCost: .25 },
    { name: 'Monomer returns to solvent', from: 0, to: 2, catalyst: -1, rate: .04, activationEnergy: .15, energyCost: .1 },
  ],
  droplets: [
    { name: 'Phase A recruits B', from: 1, to: 0, catalyst: 0, rate: .15, activationEnergy: .2, energyCost: .2 },
    { name: 'Phase B recruits A', from: 0, to: 1, catalyst: 1, rate: .15, activationEnergy: .2, energyCost: .2 },
  ],
  active: [
    { name: 'Swimmer recruits fuel', from: 2, to: 0, catalyst: 0, rate: .4, activationEnergy: .2, energyCost: .4 },
    { name: 'Swimmer returns to fuel', from: 0, to: 2, catalyst: -1, rate: .06, activationEnergy: .1, energyCost: .1 },
  ],
};
export function luckySettingsFor(current, world, seed, random = Math.random) {
  const recipe = LUCKY_RECIPES[Math.min(LUCKY_RECIPES.length - 1, Math.floor(random() * LUCKY_RECIPES.length))];
  const speciesCount = 2 + Math.min(4, Math.floor(random() * 5));
  const next = settingsFor(recipe, world.count, seed);
  const sample = (low, high) => low + (high - low) * random();
  const vary = (value, low, high) => value * sample(low, high);
  const boundedValue = (value, low, high) => Math.max(low, Math.min(high, value));
  next.preset = 'lucky';
  next.boxSize = world.boxSize;
  for (const [key, [low, high]] of Object.entries({ ...LUCKY_FIELD_RANGES.common, ...LUCKY_FIELD_RANGES[recipe] })) next[key] = sample(low, high);
  const baseMatrix = next.matrix;
  next.species = next.species.map((item, index) => ({
    ...item,
    color: current.species[index]?.color ?? item.color,
    abundance: item.abundance ? Math.max(1, Math.round(vary(item.abundance, .75, 1.25))) : 0,
    mass: boundedValue(vary(item.mass, .8, 1.25), .2, 10),
    radius: boundedValue(vary(item.radius, .85, 1.15), .2, 1.5),
    charge: (recipe === 'droplets' || index % 2 === 0 ? 1 : -1) * sample(index === 2 ? .05 : .2, index === 2 ? .35 : 1.1),
    valence: item.valence ? Math.round(boundedValue(item.valence + sample(-1, 1), 1, 6)) : Math.floor(sample(0, 2)),
    bondEnergy: item.bondEnergy ? boundedValue(vary(item.bondEnergy, .65, 1.5), 0, 6) : sample(.05, .35),
    propulsion: item.propulsion ? boundedValue(vary(item.propulsion, .65, 1.5), 0, 15) : sample(.03, .45),
    alignment: item.alignment ? boundedValue(vary(item.alignment, .65, 1.45), 0, 10) : sample(.05, 1.2),
    turnRate: item.turnRate ? boundedValue(vary(item.turnRate, .6, 1.55), 0, 10) : sample(.05, .5),
  }));
  const roles = [0, 1, 2];
  while (next.species.length < speciesCount) {
    const index = next.species.length, parent = (recipe === 'autocatalytic' ? 1 : 0) + Math.floor(random() * 2), source = next.species[parent];
    roles.push(parent);
    next.species.push({ ...source, name: `${source.name} ${index + 1}`, color: current.species[index]?.color ?? defaultColor(index),
      abundance: Math.max(4, Math.round(vary(source.abundance, .2, .5))),
      mass: boundedValue(vary(source.mass, .75, 1.3), .2, 10), radius: boundedValue(vary(source.radius, .8, 1.2), .2, 1.5),
      charge: boundedValue(vary(source.charge, .7, 1.3), -3, 3),
      valence: source.valence ? Math.round(boundedValue(source.valence + sample(-1, 1), 1, 6)) : Math.floor(sample(0, 2)),
      bondEnergy: boundedValue(vary(source.bondEnergy, .7, 1.3), 0, 6),
      propulsion: boundedValue(vary(source.propulsion, .7, 1.3), 0, 15), alignment: boundedValue(vary(source.alignment, .7, 1.3), 0, 10),
      turnRate: boundedValue(vary(source.turnRate, .7, 1.3), 0, 10) });
  }
  next.species.length = speciesCount;
  const m = speciesCount;
  next.matrix = Array(m * m).fill(0);
  for (let row = 0; row < m; row++) for (let col = row; col < m; col++) {
    const template = baseMatrix[roles[row] * 3 + roles[col]];
    const value = template > 0 ? sample(Math.max(.08, template * .55), Math.min(1, template * 1.2))
      : template < 0 ? -sample(Math.max(.08, -template * .55), Math.min(1, -template * 1.2)) : sample(-.18, .18);
    next.matrix[row * m + col] = next.matrix[col * m + row] = value;
  }
  const twoSpeciesRules = [
    { name: `${next.species[1].name} recruits ${next.species[0].name}`, from: 0, to: 1, catalyst: 1, rate: .3, activationEnergy: .3, energyCost: .3 },
    { name: `${next.species[1].name} returns to ${next.species[0].name}`, from: 1, to: 0, catalyst: -1, rate: .08, activationEnergy: .1, energyCost: .1 },
  ];
  next.reactions = (m === 2 ? twoSpeciesRules : LUCKY_REACTIONS[recipe] ?? next.reactions).map(rule => ({
    ...rule,
    rate: vary(rule.rate, .6, 1.7),
    activationEnergy: sample(.02, Math.max(.25, rule.activationEnergy + .45)),
    energyCost: sample(.02, Math.max(.25, rule.energyCost + .45)),
  }));
  for (let index = 3; index < m; index++) {
    const parent = roles[index], variant = next.species[index].name;
    next.reactions.push({ name: `${next.species[parent].name} branches to ${variant}`, from: parent, to: index, catalyst: index,
      rate: sample(.08, .28), activationEnergy: sample(.05, .5), energyCost: sample(.1, .7) });
    next.reactions.push({ name: `${variant} returns`, from: index, to: parent, catalyst: -1,
      rate: sample(.03, .12), activationEnergy: sample(.02, .3), energyCost: sample(.02, .25) });
  }
  const extraRules = Math.floor(random() * 3);
  const used = new Set(next.reactions.map(rule => `${rule.from}:${rule.to}:${rule.catalyst}`));
  for (let added = 0, attempts = 0; added < extraRules && attempts < 50; attempts++) {
    const from = Math.floor(random() * m), to = (from + 1 + Math.floor(random() * (m - 1))) % m;
    const catalyst = random() < .7 ? Math.floor(random() * m) : -1;
    const key = `${from}:${to}:${catalyst}`;
    if (used.has(key)) continue;
    used.add(key); added++;
    next.reactions.push({ name: `${next.species[from].name} to ${next.species[to].name} ${added}`, from, to, catalyst,
      rate: sample(.03, .16), activationEnergy: sample(.05, .7), energyCost: sample(.05, .6) });
  }
  return validateSettings(next);
}
function bounded(value, min, max, label, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`Invalid ${label}: expected ${integer ? 'an integer ' : ''}between ${min} and ${max}.`);
  return value;
}
function label(value, max, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${field}.`);
  return value.trim();
}
export function validateSettings(s) {
  if (!s || !Object.hasOwn(PRESETS, s.preset)) throw new Error('Unknown experiment preset.');
  const out = { preset: s.preset, count: bounded(s.count, 100, LIMITS.particles, 'particle count', true), seed: bounded(s.seed, 0, 4294967295, 'seed', true) };
  for (const [key, min, max] of [['temperature',0,5],['attraction',0,5],['bondStrength',0,6],['damping',0,5],['boxSize',24,LIMITS.boxSize],['interactionRadius',2,16],['repulsion',0,100],['bondFormation',0,20],['bondBreakage',0,10],['chargeStrength',0,10],['screeningLength',.2,16],['reactionRadius',.5,12],['energyInput',0,10],['energyDecay',0,5],['energyGradient',0,1]]) out[key] = bounded(s[key], min, max, key);
  if (!Array.isArray(s.species) || s.species.length < 2 || s.species.length > LIMITS.species) throw new Error(`Choose between 2 and ${LIMITS.species} species.`);
  out.species = s.species.map(item => {
    if (!item || !/^#[0-9a-f]{6}$/i.test(item.color)) throw new Error('Species color must be a six-digit hex color.');
    const result = { name: label(item.name, 32, 'species name'), color: item.color };
    for (const [key, min, max] of [['abundance',0,100],['mass',.2,10],['radius',.2,1.5],['charge',-3,3],['valence',0,6],['bondEnergy',0,6],['propulsion',0,15],['alignment',0,10],['turnRate',0,10]]) result[key] = bounded(item[key], min, max, `species ${key}`, key === 'valence');
    return result;
  });
  if (!out.species.some(item => item.abundance > 0)) throw new Error('At least one species needs a nonzero abundance.');
  const m = out.species.length;
  if (!Array.isArray(s.matrix) || s.matrix.length !== m * m || s.matrix.some(value => !Number.isFinite(value) || Math.abs(value) > 1)) throw new Error('Invalid affinity matrix.');
  for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) if (Math.abs(s.matrix[a*m+b] - s.matrix[b*m+a]) > 1e-12) throw new Error('Affinity matrix must be symmetric.');
  out.matrix = [...s.matrix];
  if (!Array.isArray(s.reactions) || s.reactions.length > LIMITS.reactions) throw new Error(`Choose up to ${LIMITS.reactions} reaction rules.`);
  out.reactions = s.reactions.map(rule => {
    if (!rule) throw new Error('Invalid reaction.');
    const result = { name: label(rule.name, 48, 'reaction name'), from: bounded(rule.from,0,m-1,'reactant',true), to: bounded(rule.to,0,m-1,'product',true), catalyst: bounded(rule.catalyst,-1,m-1,'catalyst',true) };
    if (result.from === result.to) throw new Error('A reaction must change the substrate species.');
    for (const [key, max] of [['rate',20],['activationEnergy',10],['energyCost',10]]) result[key] = bounded(rule[key],0,max,`reaction ${key}`);
    return result;
  });
  return out;
}

export class Simulation {
  constructor(settings = settingsFor()) { this.reset(settings); }
  random() {
    this.rng = (this.rng + 0x6D2B79F5) >>> 0;
    let t = this.rng;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  reset(settings) {
    this.settings = validateSettings(settings);
    this.rng = this.settings.seed;
    const n = this.settings.count;
    this.positions = new Float32Array(n*3);
    this.velocities = new Float32Array(n*3);
    this.forces = new Float32Array(n*3);
    this.headings = new Float32Array(n*3);
    this.energies = new Float32Array(n);
    this.types = new Uint16Array(n);
    this.degrees = new Uint8Array(n);
    this.alignment = new Float32Array(n*3);
    this.neighbors = new Float32Array(n);
    this.convertTo = new Int32Array(n);
    this.reactionCosts = new Float32Array(n);
    this.cellIds = new Uint32Array(n);
    this.cellParticles = new Uint32Array(n);
    this.statsParents = new Int32Array(n);
    this.statsSizes = new Uint32Array(n);
    this.bonds = new Map();
    this.bondBirths = new Map();
    this.ticks = 0;
    this.reactions = 0;
    this.bondsFormed = 0;
    this.bondsBroken = 0;
    this.topologyVersion = 0;
    this.reactionHistory = new Uint32Array(RATE_WINDOW);
    this.compileSettings();
    const total = this.settings.species.reduce((sum,item) => sum+item.abundance,0);
    for (let i=0;i<n;i++) {
      let selection = this.random()*total, type = 0;
      while (type < this.settings.species.length-1 && selection >= this.settings.species[type].abundance) selection -= this.settings.species[type++].abundance;
      this.types[i] = type;
      const item = this.settings.species[type], velocityScale = Math.sqrt(3*this.settings.temperature/item.mass);
      for (let k=0;k<3;k++) {
        this.positions[i*3+k] = (this.random()-.5)*this.settings.boxSize*.78;
        this.velocities[i*3+k] = (this.random()*2-1)*velocityScale;
      }
      const z = this.random()*2-1, phi = this.random()*Math.PI*2, circle = Math.sqrt(1-z*z);
      this.headings[i*3]=circle*Math.cos(phi);this.headings[i*3+1]=circle*Math.sin(phi);this.headings[i*3+2]=z;
      this.energies[i] = this.settings.energyInput > 0 ? 2 : 0;
    }
  }
  compileSettings() {
    const { count:n, species, matrix, reactions, temperature, damping, energyDecay,
      attraction, repulsion, interactionRadius, chargeStrength, bondStrength, bondFormation,
      bondBreakage, reactionRadius } = this.settings, m=species.length;
    this.decay = Math.exp(-damping*DT);
    this.energyRetention = Math.exp(-energyDecay*DT);
    this.noise = Float64Array.from(species, item=>Math.sqrt(temperature*(1-this.decay*this.decay)*3/item.mass));
    this.headingNoise = Float64Array.from(species, item=>Math.sqrt(6*item.turnRate*DT));
    this.alignmentActive = species.some(item=>item.alignment>0);
    this.alignment.fill(0);this.neighbors.fill(0);
    this.statsSpeciesCounts = new Uint32Array(m);

    // Only species mentioned as catalysts need bits. Words are indexed densely,
    // so a rule using species 255 alone still needs just one word per particle.
    this.catalystSlots = new Int16Array(m).fill(-1);
    let catalystCount=0;
    for(const rule of reactions) if(rule.rate>0 && rule.catalyst>=0 && this.catalystSlots[rule.catalyst]<0) this.catalystSlots[rule.catalyst]=catalystCount++;
    this.catalystWords = Math.ceil(catalystCount/32);
    this.catalysts = new Uint32Array(n*this.catalystWords);
    this.catalystMasks = Uint32Array.from(this.catalystSlots, slot=>slot<0?0:1<<(slot&31));
    this.catalystOffsets = Uint16Array.from(this.catalystSlots, slot=>slot<0?0:slot>>>5);
    this.reactionsByType = Array.from({length:m},()=>[]);
    let maxRules=0;
    for(const rule of reactions) if(rule.rate>0) {
      const slot=rule.catalyst<0?-1:this.catalystSlots[rule.catalyst];
      const compiled={...rule,massRatio:species[rule.from].mass/species[rule.to].mass,catalystWord:slot<0?0:slot>>>5,catalystMask:slot<0?0:1<<(slot&31)};
      maxRules=Math.max(maxRules,this.reactionsByType[rule.from].push(compiled));
    }
    this.hazards = new Float64Array(maxRules);

    // Tables retain double precision and the model's original arithmetic order.
    const table=()=>new Float64Array(m*m);
    this.pairContact=table();this.pairAttraction=table();this.pairRangeDenominator=table();
    this.pairCharge=table();this.pairBarrier=table();this.pairReducedMass=table();
    this.pairFormation=table();this.pairBreakage=table();this.pairCutoff2=table();
    this.cutoff=0;
    for(let a=0;a<m;a++)for(let b=0;b<m;b++) {
      const at=a*m+b,sa=species[a],sb=species[b],affinity=matrix[at],contact=sa.radius+sb.radius;
      this.pairContact[at]=contact;
      this.pairAttraction[at]=affinity*attraction*2;
      this.pairRangeDenominator[at]=Math.max(.01,interactionRadius-contact);
      this.pairCharge[at]=chargeStrength*sa.charge*sb.charge;
      this.pairBarrier[at]=bondStrength*Math.max(0,affinity)*Math.sqrt(sa.bondEnergy*sb.bondEnergy);
      this.pairReducedMass[at]=sa.mass*sb.mass/(sa.mass+sb.mass);
      this.pairFormation[at]=affinity>0?1-Math.exp(-bondFormation*affinity*DT):0;
      this.pairBreakage[at]=1-Math.exp(-bondBreakage*DT*Math.exp(-this.pairBarrier[at]/Math.max(.001,temperature)));
      const binds=this.pairBarrier[at]>0&&bondFormation>0&&sa.valence>0&&sb.valence>0;
      const ranged=this.pairAttraction[at]!==0||this.pairCharge[at]!==0||(a===b&&sa.alignment>0);
      const catalyzes=this.catalystMasks[a]!==0||this.catalystMasks[b]!==0;
      const cutoff=Math.max(repulsion>0?contact:0,ranged?interactionRadius:0,binds?contact+1.25:0,catalyzes?reactionRadius:0);
      this.pairCutoff2[at]=cutoff*cutoff;this.cutoff=Math.max(this.cutoff,cutoff);
    }
    this.rebuildGrid();
  }
  rebuildGrid() {
    // Wider cells are safe. Bound the number of empty cells in very sparse worlds.
    this.gridSize = this.cutoff>0?Math.max(1, Math.min(Math.floor(this.settings.boxSize/this.cutoff),Math.ceil(Math.cbrt(this.settings.count*2)))):1;
    this.cellSize = this.settings.boxSize/this.gridSize;
    const cells=this.gridSize**3;
    this.cellCounts=new Uint32Array(cells);this.cellStarts=new Uint32Array(cells+1);this.cellCursors=new Uint32Array(cells);
  }
  buildGrid() {
    const n=this.settings.count,p=this.positions,half=this.settings.boxSize/2,grid=this.gridSize,cellSize=this.cellSize;
    const counts=this.cellCounts,starts=this.cellStarts,cursors=this.cellCursors,ids=this.cellIds,particles=this.cellParticles;
    counts.fill(0);
    for(let i=0;i<n;i++) {
      const a=i*3;
      const x=Math.min(grid-1,Math.max(0,Math.floor((p[a]+half)/cellSize))),y=Math.min(grid-1,Math.max(0,Math.floor((p[a+1]+half)/cellSize))),z=Math.min(grid-1,Math.max(0,Math.floor((p[a+2]+half)/cellSize)));
      const cell=x+y*grid+z*grid*grid;ids[i]=cell;counts[cell]++;
    }
    starts[0]=0;
    for(let cell=0;cell<counts.length;cell++){starts[cell+1]=starts[cell]+counts[cell];cursors[cell]=starts[cell];}
    // Descending IDs match the previous linked-list order inside each cell.
    for(let i=n-1;i>=0;i--)particles[cursors[ids[i]]++]=i;
  }
  configure(patch) {
    const previous = this.settings, next = validateSettings({...previous,...patch});
    if (next.count !== previous.count || next.seed !== previous.seed || next.boxSize !== previous.boxSize || next.species.length !== previous.species.length) throw new Error('Particle count, seed, box size and number of species require a reset.');
    // Validate before changing any particle, including extreme imported velocities.
    for (let i=0;i<next.count;i++) {
      const ratio=previous.species[this.types[i]].mass/next.species[this.types[i]].mass;
      for(let k=0;k<3;k++)if(!Number.isFinite(Math.fround(this.velocities[i*3+k]*ratio)))throw new Error('This mass change would exceed the numeric velocity range.');
    }
    for (let i=0;i<next.count;i++) {
      const oldMass = previous.species[this.types[i]].mass, newMass = next.species[this.types[i]].mass;
      if (oldMass !== newMass) for (let k=0;k<3;k++) this.velocities[i*3+k] *= oldMass/newMass;
      const limit = next.boxSize/2-next.species[this.types[i]].radius;
      for (let k=0;k<3;k++) this.positions[i*3+k] = Math.max(-limit,Math.min(limit,this.positions[i*3+k]));
    }
    this.settings = next;
    this.compileSettings();
    this.pruneBonds();
  }
  removeBond(key, a, b) {
    this.bonds.delete(key);this.bondBirths.delete(key);this.degrees[a]--;this.degrees[b]--;this.bondsBroken++;this.topologyVersion++;
  }
  bondBarrier(a, b) {
    return this.pairBarrier[this.types[a]*this.settings.species.length+this.types[b]];
  }
  pruneBonds() {
    const {species} = this.settings;
    for (const [key,[a,b]] of this.bonds) {
      if (this.degrees[a] > species[this.types[a]].valence || this.degrees[b] > species[this.types[b]].valence || this.bondBarrier(a,b) <= 0) this.removeBond(key,a,b);
    }
  }
  step() {
    const {count:n, temperature, bondStrength, species, boxSize, interactionRadius, repulsion, screeningLength, reactionRadius, energyInput, energyGradient, reactions} = this.settings;
    const m=species.length,p=this.positions,v=this.velocities,f=this.forces,h=this.headings,types=this.types,degrees=this.degrees;
    const grid=this.gridSize,half=boxSize/2,cellSize=this.cellSize,cutoff2=this.cutoff*this.cutoff,range2=interactionRadius*interactionRadius,reactionRange2=reactionRadius*reactionRadius;
    const starts=this.cellStarts,particles=this.cellParticles,words=this.catalystWords;
    const pairCutoff2=this.pairCutoff2,contacts=this.pairContact,attractions=this.pairAttraction,barriers=this.pairBarrier,formations=this.pairFormation,charges=this.pairCharge;
    f.fill(0);
    if(this.alignmentActive){this.alignment.fill(0);this.neighbors.fill(0);}
    if(words)this.catalysts.fill(0);
    if(this.cutoff>0)this.buildGrid();
    for(let i=0;this.cutoff>0&&i<n;i++) {
      const a=i*3,ti=types[i],si=species[ti];
      const cell=this.cellIds[i],cx=cell%grid,cy=Math.floor(cell/grid)%grid,cz=Math.floor(cell/(grid*grid));
      for(let z=Math.max(0,cz-1);z<=Math.min(grid-1,cz+1);z++) {
      const zLower=z*cellSize-half,zGap=Math.max(0,zLower-p[a+2],p[a+2]-(zLower+cellSize)),zDistance=zGap*zGap;
      for(let y=Math.max(0,cy-1);y<=Math.min(grid-1,cy+1);y++) {
      const yLower=y*cellSize-half,yGap=Math.max(0,yLower-p[a+1],p[a+1]-(yLower+cellSize)),yzDistance=zDistance+yGap*yGap;
      for(let x=Math.max(0,cx-1);x<=Math.min(grid-1,cx+1);x++) {
      const xLower=x*cellSize-half,xGap=Math.max(0,xLower-p[a],p[a]-(xLower+cellSize));
      // Conservative cell bounds: the margin keeps face-rounding errors from
      // dropping a pair that is just inside an active physical cutoff.
      if(yzDistance+xGap*xGap>cutoff2+1e-9)continue;
      const neighborCell=x+y*grid+z*grid*grid,end=starts[neighborCell+1];
      for(let cursor=starts[neighborCell];cursor<end;cursor++) {
        const j=particles[cursor];if(j<=i)break;
        const b=j*3,dx=p[b]-p[a],dy=p[b+1]-p[a+1],dz=p[b+2]-p[a+2],r2=dx*dx+dy*dy+dz*dz;
        if(r2>=cutoff2)continue;
        const tj=types[j],pair=ti*m+tj;
        if(r2>=pairCutoff2[pair])continue;
        const sj=species[tj];
        if(words && r2<reactionRange2) {
          if(this.catalystMasks[tj])this.catalysts[i*words+this.catalystOffsets[tj]]|=this.catalystMasks[tj];
          if(this.catalystMasks[ti])this.catalysts[j*words+this.catalystOffsets[ti]]|=this.catalystMasks[ti];
        }
        const r=Math.sqrt(r2),contact=contacts[pair];
        // Contact suppresses affinity even when collision repulsion is disabled.
        let force=r<contact?-repulsion*(1-r/contact):r<interactionRadius&&attractions[pair]!==0?attractions[pair]*Math.sin(Math.PI*(r-contact)/this.pairRangeDenominator[pair]):0;
        if(charges[pair]!==0 && r2<range2) {
          const softR=Math.max(contact*.5,r),taper=(1-r/interactionRadius)**2;
          force-=charges[pair]*Math.exp(-softR/screeningLength)*(1/(softR*softR)+1/(screeningLength*softR))*taper;
        }
        force=Math.max(-150,Math.min(150,force));
        // The fallback direction is deterministic and pair forces remain opposite.
        const inverse=r>.0001?1/r:0,fx=r>.0001?force*dx*inverse:force,fy=force*dy*inverse,fz=force*dz*inverse;
        f[a]+=fx;f[a+1]+=fy;f[a+2]+=fz;f[b]-=fx;f[b+1]-=fy;f[b+2]-=fz;
        if(ti===tj && si.alignment && r2<range2) {
          const weight=1-r/interactionRadius;
          this.neighbors[i]+=weight;this.neighbors[j]+=weight;
          for(let k=0;k<3;k++){this.alignment[a+k]+=h[b+k]*weight;this.alignment[b+k]+=h[a+k]*weight;}
        }
        if(barriers[pair]>0 && formations[pair]>0 && r<contact+1.25 && r>contact*.7 && degrees[i]<si.valence && degrees[j]<sj.valence) {
          const key=i*n+j;
          if(!this.bonds.has(key)) {
            const dvx=v[a]-v[b],dvy=v[a+1]-v[b+1],dvz=v[a+2]-v[b+2];
            if(.5*this.pairReducedMass[pair]*(dvx*dvx+dvy*dvy+dvz*dvz)<barriers[pair]*3 && this.random()<formations[pair]) {
              this.bonds.set(key,[i,j]);this.bondBirths.set(key,this.ticks);degrees[i]++;degrees[j]++;this.bondsFormed++;this.topologyVersion++;
            }
          }
        }
      }
      }
      }
      }
    }
    for(const [key,[i,j]] of this.bonds) {
      const a=i*3,b=j*3,dx=p[b]-p[a],dy=p[b+1]-p[a+1],dz=p[b+2]-p[a+2];
      const pair=types[i]*m+types[j],r=Math.max(.0001,Math.hypot(dx,dy,dz)),contact=contacts[pair],barrier=barriers[pair];
      if(r>contact+2.25 || barrier<=0 || (this.settings.bondBreakage && this.random()<this.pairBreakage[pair])) {this.removeBond(key,i,j);continue;}
      const force=Math.max(-120,Math.min(120,12*bondStrength*(r-contact*1.2)))/r;
      f[a]+=force*dx;f[a+1]+=force*dy;f[a+2]+=force*dz;f[b]-=force*dx;f[b+1]-=force*dy;f[b+2]-=force*dz;
    }
    const decay=this.decay,energyRetention=this.energyRetention;
    for(let i=0;i<n;i++) {
      const a=i*3,item=species[types[i]],noise=this.noise[types[i]];
      // gradient=1 gives no supply at -X and full supply at +X.
      const supply=energyInput*(1-energyGradient+energyGradient*(p[a]/boxSize+.5));
      this.energies[i]=Math.min(10,this.energies[i]*energyRetention+supply*DT);
      const headingNoise=this.headingNoise[types[i]],neighborWeight=this.neighbors[i];
      for(let k=0;k<3;k++) {
        if(neighborWeight>0)h[a+k]+=item.alignment*DT*(this.alignment[a+k]/neighborWeight-h[a+k]);
        if(headingNoise)h[a+k]+=(this.random()*2-1)*headingNoise;
      }
      const length=Math.hypot(h[a],h[a+1],h[a+2])||1;
      const thrust=item.propulsion*Math.min(1,this.energies[i]);
      this.energies[i]=Math.max(0,this.energies[i]-.1*thrust*DT);
      const limit=half-item.radius;
      for(let k=0;k<3;k++) {
        h[a+k]/=length;
        v[a+k]=(v[a+k]+(f[a+k]+h[a+k]*thrust)*DT/item.mass)*decay+(this.random()*2-1)*noise;
        p[a+k]+=v[a+k]*DT;
        // Mirror arbitrary finite overshoots; imported fast particles also stay in bounds.
        if(p[a+k]>limit || p[a+k]<-limit) {
          const span=2*limit,period=2*span,wrapped=((p[a+k]+limit)%period+period)%period;
          p[a+k]=wrapped<=span?wrapped-limit:period-wrapped-limit;
          if(wrapped>span)v[a+k]=-v[a+k];
        }
      }
    }
    let conversions=0;
    if(reactions.length) {
      // All candidates read the same species state. Newly made catalysts act next step.
      this.convertTo.fill(-1);
      const hazards=this.hazards;
      for(let i=0;i<n;i++) {
        const rules=this.reactionsByType[types[i]];
        if(!rules.length)continue;
        let total=0;
        const thermal=Math.max(.05,temperature+this.energies[i]);
        for(let k=0;k<rules.length;k++) {
          const rule=rules[k],ratio=rule.massRatio;
          const eligible=this.energies[i]>=rule.energyCost && (rule.catalyst===-1 || (this.catalysts[i*words+rule.catalystWord]&rule.catalystMask))
            && Number.isFinite(Math.fround(v[i*3]*ratio)) && Number.isFinite(Math.fround(v[i*3+1]*ratio)) && Number.isFinite(Math.fround(v[i*3+2]*ratio));
          hazards[k]=eligible?rule.rate*Math.exp(-rule.activationEnergy/thermal):0;
          total+=hazards[k];
        }
        if(total<=0 || this.random()>=1-Math.exp(-total*DT))continue;
        let selection=this.random()*total,chosen=0;
        while(chosen<rules.length-1 && selection>=hazards[chosen])selection-=hazards[chosen++];
        this.convertTo[i]=rules[chosen].to;this.reactionCosts[i]=rules[chosen].energyCost;
      }
      for(const [key,[a,b]] of this.bonds)if(this.convertTo[a]>=0 || this.convertTo[b]>=0)this.removeBond(key,a,b);
      for(let i=0;i<n;i++)if(this.convertTo[i]>=0) {
        const to=this.convertTo[i],ratio=species[types[i]].mass/species[to].mass,limit=half-species[to].radius;
        for(let k=0;k<3;k++){v[i*3+k]*=ratio;p[i*3+k]=Math.max(-limit,Math.min(limit,p[i*3+k]));}
        types[i]=to;this.energies[i]=Math.max(0,this.energies[i]-this.reactionCosts[i]);conversions++;
      }
    }
    this.reactions+=conversions;this.reactionHistory[this.ticks%RATE_WINDOW]=conversions;this.ticks++;
  }
  stats() {
    const {count:n,species}=this.settings,parent=this.statsParents,sizes=this.statsSizes,speciesCounts=this.statsSpeciesCounts;
    sizes.fill(0);speciesCounts.fill(0);
    for(let i=0;i<n;i++)parent[i]=i;
    const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
    for(const [a,b]of this.bonds.values()){const x=find(a),y=find(b);if(x!==y)parent[x]=y;}
    for(let i=0;i<n;i++)sizes[find(i)]++;
    let clusters=0,largest=1,bonded=0,energy=0,internal=0,active=0,hx=0,hy=0,hz=0,age=0;
    for(let i=0;i<n;i++) {
      if(sizes[i]>=3)clusters++;largest=Math.max(largest,sizes[i]);if(this.degrees[i])bonded++;
      const item=species[this.types[i]];speciesCounts[this.types[i]]++;internal+=this.energies[i];
      for(let k=0;k<3;k++)energy+=item.mass*this.velocities[i*3+k]**2*.5;
      if(item.propulsion>0 && this.energies[i]>.05){active++;hx+=this.headings[i*3];hy+=this.headings[i*3+1];hz+=this.headings[i*3+2];}
    }
    for(const birth of this.bondBirths.values())age+=this.ticks-birth;
    const recent=this.reactionHistory.reduce((sum,value)=>sum+value,0),windowTime=Math.min(this.ticks,RATE_WINDOW)*DT;
    return {particles:n,bonds:this.bonds.size,clusters,largest,bonded,energy:energy/n,time:this.ticks*DT,ticks:this.ticks,
      speciesCounts:Array.from(speciesCounts),reactions:this.reactions,reactionRate:windowTime?recent/windowTime:0,meanEnergy:internal/n,activeFraction:active/n,
      polarOrder:active?Math.hypot(hx,hy,hz)/active:0,bondsFormed:this.bondsFormed,bondsBroken:this.bondsBroken,meanBondAge:this.bonds.size?age*DT/this.bonds.size:0};
  }
  snapshot() {
    return {format:'protoform-experiment',version:3,algorithm:ALGORITHM,settings:structuredClone(this.settings),ticks:this.ticks,rng:this.rng,
      positions:Array.from(this.positions),velocities:Array.from(this.velocities),types:Array.from(this.types),headings:Array.from(this.headings),energies:Array.from(this.energies),
      bonds:Array.from(this.bonds.values()),bondAges:Array.from(this.bonds.keys(),key=>this.ticks-this.bondBirths.get(key)),
      reactions:this.reactions,bondsFormed:this.bondsFormed,bondsBroken:this.bondsBroken,reactionHistory:Array.from(this.reactionHistory)};
  }
  static restore(data) {
    const knownFormat=data?.format==='protoform-experiment' || (typeof data?.format==='string' && /^[a-z]{8}-experiment$/.test(data.format));
    if(!knownFormat || ![1,2,3].includes(data.version))throw new Error('This is not a supported protoform.ing experiment.');
    if(data.version===3&&data.algorithm!==ALGORITHM)throw new Error('Unsupported simulation algorithm.');
    let rawSettings=data.settings;
    if(data.version===1) {
      if(!rawSettings || !Array.isArray(rawSettings.valence) || rawSettings.valence.length!==3)throw new Error('Invalid legacy species settings.');
      const defaults=settingsFor(rawSettings.preset,rawSettings.count,rawSettings.seed);
      // v1 used equal masses and a fixed .5-unit wall margin.
      rawSettings={...defaults,...rawSettings,species:defaults.species.map((item,i)=>({...item,mass:1,radius:.5,valence:rawSettings.valence[i],abundance:1,propulsion:0,alignment:0,bondEnergy:1})),reactions:[]};
    }
    const settings=validateSettings(rawSettings),n=settings.count,m=settings.species.length;
    const array=(field,length,valid)=>{if(!Array.isArray(data[field]) || data[field].length!==length || data[field].some(value=>!valid(value)))throw new Error(`Invalid ${field}.`);};
    array('positions',n*3,value=>Number.isFinite(value)&&Math.abs(value)<=settings.boxSize/2);
    // Accept all finite representable engine velocities. A valid mass edit can
    // exceed an arbitrary speed cutoff without corrupting the saved state.
    array('velocities',n*3,value=>Number.isFinite(value)&&Number.isFinite(Math.fround(value)));
    array('types',n,value=>Number.isInteger(value)&&value>=0&&value<m);
    for(let i=0;i<n;i++)for(let k=0;k<3;k++)if(Math.abs(data.positions[i*3+k])>settings.boxSize/2-settings.species[data.types[i]].radius+1e-5)throw new Error('Particle outside container.');
    if(!Number.isSafeInteger(data.ticks)||data.ticks<0||!Number.isInteger(data.rng)||data.rng<0||data.rng>4294967295)throw new Error('Invalid simulation clock or random state.');
    if(!Array.isArray(data.bonds)||data.bonds.length>n*3)throw new Error('Invalid bond list.');
    const sim=new Simulation(settings);
    sim.positions.set(data.positions);sim.velocities.set(data.velocities);sim.types.set(data.types);sim.ticks=data.ticks;sim.rng=data.rng;
    if(data.version>=2) {
      array('headings',n*3,value=>Number.isFinite(value)&&Math.abs(value)<=1.00001);
      for(let i=0;i<n;i++)if(Math.abs(Math.hypot(...data.headings.slice(i*3,i*3+3))-1)>.001)throw new Error('Invalid particle heading.');
      array('energies',n,value=>Number.isFinite(value)&&value>=0&&value<=10);
      array('bondAges',data.bonds.length,value=>Number.isSafeInteger(value)&&value>=0&&value<=data.ticks);
      array('reactionHistory',RATE_WINDOW,value=>Number.isSafeInteger(value)&&value>=0&&value<=n);
      for(const field of ['reactions','bondsFormed','bondsBroken'])if(!Number.isSafeInteger(data[field])||data[field]<0)throw new Error(`Invalid ${field}.`);
      if(data.reactions<data.reactionHistory.reduce((sum,value)=>sum+value,0) || data.bondsFormed-data.bondsBroken!==data.bonds.length)throw new Error('Inconsistent event counters.');
      sim.headings.set(data.headings);sim.energies.set(data.energies);sim.reactionHistory.set(data.reactionHistory);
      sim.reactions=data.reactions;sim.bondsFormed=data.bondsFormed;sim.bondsBroken=data.bondsBroken;
    } else sim.bondsFormed=data.bonds.length;
    const seenBonds=new Set();
    for(let index=0;index<data.bonds.length;index++) {
      const pair=data.bonds[index];
      if(!Array.isArray(pair)||pair.length!==2)throw new Error('Invalid bond.');
      const [a,b]=pair;
      const key=a*n+b;
      if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b>=n||a>=b||seenBonds.has(key))throw new Error('Invalid or duplicate bond.');
      seenBonds.add(key);
      const excess=sim.degrees[a]>=settings.species[sim.types[a]].valence || sim.degrees[b]>=settings.species[sim.types[b]].valence;
      const unbound=sim.bondBarrier(a,b)<=0;
      // v1 allowed live edits while paused without reconciling its bond graph.
      // Migration removes those stale bonds; malformed topology is still rejected.
      if(excess || unbound) {
        if(data.version===1){sim.bondsBroken++;continue;}
        throw new Error(excess?'Bond count exceeds species valence.':'Bond has no binding affinity.');
      }
      sim.degrees[a]++;sim.degrees[b]++;
      sim.bonds.set(key,[a,b]);sim.bondBirths.set(key,data.version>=2?data.ticks-data.bondAges[index]:data.ticks);
    }
    sim.topologyVersion=sim.bonds.size?1:0;
    if(data.version<3)sim.migration={fromVersion:data.version,prunedBonds:data.version===1?sim.bondsBroken:0,algorithmChanged:true};
    return sim;
  }
}
