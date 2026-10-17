// Dimensionless, mesoscopic artificial chemistry. The bath, energy supply and
// active motors exchange energy with this deliberately open, driven system.
export const BOX = 48;
export const DT = 1 / 60;
export const SPECIES = ['Scaffold', 'Linker', 'Solvent'];
const COLORS = ['#f28b82', '#8aaaf5', '#c2a2ed', '#edb76c', '#e989b9', '#a3b8db'];
const RATE_WINDOW = 120;

export function speciesDefaults(index = 0) {
  return { name: SPECIES[index] ?? `Species ${index + 1}`, color: COLORS[index % COLORS.length], abundance: 1,
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
  const out = { preset: s.preset, count: bounded(s.count, 100, 6000, 'particle count', true), seed: bounded(s.seed, 0, 4294967295, 'seed', true) };
  for (const [key, min, max] of [['temperature',0,5],['attraction',0,5],['bondStrength',0,6],['damping',0,5],['boxSize',24,160],['interactionRadius',2,16],['repulsion',0,100],['bondFormation',0,20],['bondBreakage',0,10],['chargeStrength',0,10],['screeningLength',.2,16],['reactionRadius',.5,12],['energyInput',0,10],['energyDecay',0,5],['energyGradient',0,1]]) out[key] = bounded(s[key], min, max, key);
  if (!Array.isArray(s.species) || s.species.length < 2 || s.species.length > 6) throw new Error('Choose between 2 and 6 species.');
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
  if (!Array.isArray(s.reactions) || s.reactions.length > 8) throw new Error('Choose up to 8 reaction rules.');
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
    this.types = new Uint8Array(n);
    this.degrees = new Uint8Array(n);
    this.alignment = new Float32Array(n*3);
    this.neighbors = new Float32Array(n);
    this.catalysts = new Uint8Array(n);
    this.convertTo = new Int8Array(n);
    this.reactionCosts = new Float32Array(n);
    this.next = new Int32Array(n);
    this.bonds = new Map();
    this.bondBirths = new Map();
    this.ticks = 0;
    this.reactions = 0;
    this.bondsFormed = 0;
    this.bondsBroken = 0;
    this.reactionHistory = new Uint32Array(RATE_WINDOW);
    this.rebuildGrid();
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
  rebuildGrid() {
    // A cell is at least as wide as every local interaction, so 27 cells suffice.
    // Bond capture has its own physical range, even if the affinity range is short.
    this.cutoff = Math.max(this.settings.interactionRadius, this.settings.reactionRadius, 2*Math.max(...this.settings.species.map(item=>item.radius))+1.25);
    this.gridSize = Math.max(1, Math.floor(this.settings.boxSize/this.cutoff));
    this.cellSize = this.settings.boxSize/this.gridSize;
    this.head = new Int32Array(this.gridSize**3);
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
    this.rebuildGrid();
    this.pruneBonds();
  }
  removeBond(key, a, b) {
    this.bonds.delete(key);this.bondBirths.delete(key);this.degrees[a]--;this.degrees[b]--;this.bondsBroken++;
  }
  bondBarrier(a, b) {
    const {species, matrix, bondStrength} = this.settings, ta=this.types[a],tb=this.types[b];
    return bondStrength*Math.max(0,matrix[ta*species.length+tb])*Math.sqrt(species[ta].bondEnergy*species[tb].bondEnergy);
  }
  pruneBonds() {
    const {species} = this.settings;
    for (const [key,[a,b]] of this.bonds) {
      if (this.degrees[a] > species[this.types[a]].valence || this.degrees[b] > species[this.types[b]].valence || this.bondBarrier(a,b) <= 0) this.removeBond(key,a,b);
    }
  }
  step() {
    const {count:n, temperature, attraction, bondStrength, damping, matrix, species, boxSize, interactionRadius, repulsion, bondFormation, bondBreakage, chargeStrength, screeningLength, reactionRadius, energyInput, energyDecay, energyGradient, reactions} = this.settings;
    const m=species.length,p=this.positions,v=this.velocities,f=this.forces,h=this.headings,types=this.types,degrees=this.degrees;
    const grid=this.gridSize,cellSize=this.cellSize,half=boxSize/2,cutoff2=this.cutoff*this.cutoff,range2=interactionRadius*interactionRadius,reactionRange2=reactionRadius*reactionRadius;
    f.fill(0);this.head.fill(-1);this.alignment.fill(0);this.neighbors.fill(0);this.catalysts.fill(0);
    for(let i=0;i<n;i++) {
      const x=Math.min(grid-1,Math.max(0,Math.floor((p[i*3]+half)/cellSize))),y=Math.min(grid-1,Math.max(0,Math.floor((p[i*3+1]+half)/cellSize))),z=Math.min(grid-1,Math.max(0,Math.floor((p[i*3+2]+half)/cellSize)));
      const cell=x+y*grid+z*grid*grid;
      this.next[i]=this.head[cell];this.head[cell]=i;
    }
    for(let i=0;i<n;i++) {
      const a=i*3,ti=types[i],si=species[ti];
      const cx=Math.min(grid-1,Math.max(0,Math.floor((p[a]+half)/cellSize))),cy=Math.min(grid-1,Math.max(0,Math.floor((p[a+1]+half)/cellSize))),cz=Math.min(grid-1,Math.max(0,Math.floor((p[a+2]+half)/cellSize)));
      for(let z=Math.max(0,cz-1);z<=Math.min(grid-1,cz+1);z++)
      for(let y=Math.max(0,cy-1);y<=Math.min(grid-1,cy+1);y++)
      for(let x=Math.max(0,cx-1);x<=Math.min(grid-1,cx+1);x++)
      for(let j=this.head[x+y*grid+z*grid*grid];j!==-1;j=this.next[j]) {
        if(j<=i)continue;
        const b=j*3,dx=p[b]-p[a],dy=p[b+1]-p[a+1],dz=p[b+2]-p[a+2],r2=dx*dx+dy*dy+dz*dz;
        if(r2>=cutoff2)continue;
        const tj=types[j],sj=species[tj];
        if(reactions.length && r2<reactionRange2) {this.catalysts[i]|=1<<tj;this.catalysts[j]|=1<<ti;}
        const r=Math.sqrt(r2),contact=si.radius+sj.radius,affinity=matrix[ti*m+tj];
        let force=r<contact?-repulsion*(1-r/contact):r<interactionRadius?affinity*attraction*2*Math.sin(Math.PI*(r-contact)/Math.max(.01,interactionRadius-contact)):0;
        if(chargeStrength && si.charge && sj.charge && r2<range2) {
          const softR=Math.max(contact*.5,r),taper=(1-r/interactionRadius)**2;
          force-=chargeStrength*si.charge*sj.charge*Math.exp(-softR/screeningLength)*(1/(softR*softR)+1/(screeningLength*softR))*taper;
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
        if(r<contact+1.25 && r>contact*.7 && affinity>0 && bondStrength>0 && bondFormation>0 && degrees[i]<si.valence && degrees[j]<sj.valence) {
          const key=i*n+j,barrier=bondStrength*affinity*Math.sqrt(si.bondEnergy*sj.bondEnergy);
          if(barrier>0 && !this.bonds.has(key)) {
            const dvx=v[a]-v[b],dvy=v[a+1]-v[b+1],dvz=v[a+2]-v[b+2],reducedMass=si.mass*sj.mass/(si.mass+sj.mass);
            if(.5*reducedMass*(dvx*dvx+dvy*dvy+dvz*dvz)<barrier*3 && this.random()<1-Math.exp(-bondFormation*affinity*DT)) {
              this.bonds.set(key,[i,j]);this.bondBirths.set(key,this.ticks);degrees[i]++;degrees[j]++;this.bondsFormed++;
            }
          }
        }
      }
    }
    for(const [key,[i,j]] of this.bonds) {
      const a=i*3,b=j*3,dx=p[b]-p[a],dy=p[b+1]-p[a+1],dz=p[b+2]-p[a+2];
      const r=Math.max(.0001,Math.hypot(dx,dy,dz)),contact=species[types[i]].radius+species[types[j]].radius,barrier=this.bondBarrier(i,j);
      if(r>contact+2.25 || barrier<=0 || (bondBreakage && this.random()<1-Math.exp(-bondBreakage*DT*Math.exp(-barrier/Math.max(.001,temperature))))) {this.removeBond(key,i,j);continue;}
      const force=Math.max(-120,Math.min(120,12*bondStrength*(r-contact*1.2)))/r;
      f[a]+=force*dx;f[a+1]+=force*dy;f[a+2]+=force*dz;f[b]-=force*dx;f[b+1]-=force*dy;f[b+2]-=force*dz;
    }
    const decay=Math.exp(-damping*DT),energyRetention=Math.exp(-energyDecay*DT);
    for(let i=0;i<n;i++) {
      const a=i*3,item=species[types[i]],noise=Math.sqrt(temperature*(1-decay*decay)*3/item.mass);
      // gradient=1 gives no supply at -X and full supply at +X.
      const supply=energyInput*(1-energyGradient+energyGradient*(p[a]/boxSize+.5));
      this.energies[i]=Math.min(10,this.energies[i]*energyRetention+supply*DT);
      const headingNoise=Math.sqrt(6*item.turnRate*DT),neighborWeight=this.neighbors[i];
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
      const hazards=new Float64Array(reactions.length);
      for(let i=0;i<n;i++) {
        let total=0;
        for(let k=0;k<reactions.length;k++) {
          const rule=reactions[k],ratio=species[types[i]].mass/species[rule.to].mass;
          const eligible=rule.from===types[i] && this.energies[i]>=rule.energyCost && (rule.catalyst===-1 || (this.catalysts[i]&(1<<rule.catalyst)))
            && Number.isFinite(Math.fround(v[i*3]*ratio)) && Number.isFinite(Math.fround(v[i*3+1]*ratio)) && Number.isFinite(Math.fround(v[i*3+2]*ratio));
          hazards[k]=eligible?rule.rate*Math.exp(-rule.activationEnergy/Math.max(.05,temperature+this.energies[i])):0;
          total+=hazards[k];
        }
        if(total<=0 || this.random()>=1-Math.exp(-total*DT))continue;
        let selection=this.random()*total,chosen=0;
        while(chosen<hazards.length-1 && selection>=hazards[chosen])selection-=hazards[chosen++];
        this.convertTo[i]=reactions[chosen].to;this.reactionCosts[i]=reactions[chosen].energyCost;
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
    const {count:n,species}=this.settings,parent=Int32Array.from({length:n},(_,i)=>i),sizes=new Uint16Array(n),speciesCounts=Array(species.length).fill(0);
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
      speciesCounts,reactions:this.reactions,reactionRate:windowTime?recent/windowTime:0,meanEnergy:internal/n,activeFraction:active/n,
      polarOrder:active?Math.hypot(hx,hy,hz)/active:0,bondsFormed:this.bondsFormed,bondsBroken:this.bondsBroken,meanBondAge:this.bonds.size?age*DT/this.bonds.size:0};
  }
  snapshot() {
    return {format:'emergent-experiment',version:2,settings:structuredClone(this.settings),ticks:this.ticks,rng:this.rng,
      positions:Array.from(this.positions),velocities:Array.from(this.velocities),types:Array.from(this.types),headings:Array.from(this.headings),energies:Array.from(this.energies),
      bonds:Array.from(this.bonds.values()),bondAges:Array.from(this.bonds.keys(),key=>this.ticks-this.bondBirths.get(key)),
      reactions:this.reactions,bondsFormed:this.bondsFormed,bondsBroken:this.bondsBroken,reactionHistory:Array.from(this.reactionHistory)};
  }
  static restore(data) {
    if(!data || data.format!=='emergent-experiment' || ![1,2].includes(data.version))throw new Error('This is not a supported Emergent experiment.');
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
    if(data.version===2) {
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
      sim.bonds.set(key,[a,b]);sim.bondBirths.set(key,data.version===2?data.ticks-data.bondAges[index]:data.ticks);
    }
    if(data.version===1)sim.migration={fromVersion:1,prunedBonds:sim.bondsBroken};
    return sim;
  }
}
