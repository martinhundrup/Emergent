import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, settingsFor, speciesDefaults, validateSettings, PRESETS, DT, LIMITS, ALGORITHM } from '../simulation.js';

const advance=(sim,steps)=>{for(let i=0;i<steps;i++)sim.step();};
function pairWorld(overrides={}) {
  const settings={...settingsFor('gas',100,7),boxSize:160,temperature:0,damping:0,attraction:0,repulsion:0,energyInput:0,energyDecay:0,...overrides};
  settings.species=settings.species.map(item=>({...item,turnRate:0}));
  const sim=new Simulation(settings);
  sim.velocities.fill(0);sim.headings.fill(0);
  for(let i=0;i<100;i++) {
    sim.positions[i*3]=40+(i%5)*8;sim.positions[i*3+1]=40+(Math.floor(i/5)%5)*8;sim.positions[i*3+2]=40+Math.floor(i/25)*8;
    sim.headings[i*3]=1;sim.types[i]=2;
  }
  sim.types[0]=0;sim.types[1]=1;
  sim.positions.set([-1,0,0,1,0,0]);
  return sim;
}

test('seeded reactions, headings, bonds and saved continuations are deterministic',()=>{
  const a=new Simulation(settingsFor('autocatalytic',200,42)),b=new Simulation(settingsFor('autocatalytic',200,42));
  advance(a,180);advance(b,180);
  assert.deepEqual(a.snapshot(),b.snapshot());
  assert.ok(a.reactions>0);
  const c=Simulation.restore(JSON.parse(JSON.stringify(a.snapshot())));
  assert.equal(a.snapshot().format,'protoform-experiment');
  const oldFormat=structuredClone(a.snapshot());oldFormat.format='previous-experiment';
  assert.deepEqual(Simulation.restore(oldFormat).snapshot(),a.snapshot());
  advance(a,180);advance(c,180);
  assert.deepEqual(a.snapshot(),c.snapshot());assert.deepEqual(a.stats(),c.stats());
  assert.equal(a.stats().time,360*DT);
});

test('two through six species work and zero-abundance species are absent on reset',()=>{
  const s=settingsFor('soup',200,1);
  s.species=Array.from({length:6},(_,i)=>({...speciesDefaults(i),abundance:i===4?100:0}));s.matrix=Array(36).fill(0);
  const sim=new Simulation(s);assert.ok(sim.types.every(value=>value===4));
  assert.deepEqual(sim.stats().speciesCounts,[0,0,0,0,200,0]);
  s.species=s.species.slice(0,2).map(item=>({...item,abundance:1}));s.matrix=Array(4).fill(0);
  assert.equal(new Simulation(s).stats().speciesCounts.length,2);
  assert.throws(()=>sim.configure({count:300}),/reset/);
  assert.throws(()=>sim.configure({boxSize:60}),/reset/);
  assert.throws(()=>sim.configure({seed:45}),/reset/);
});

test('pair forces conserve mass-weighted momentum and mass controls acceleration',()=>{
  const s=settingsFor('gas',100);
  s.species[0].mass=1;s.species[1].mass=4;
  const sim=pairWorld({species:s.species,attraction:1,matrix:[0,1,0,1,0,0,0,0,0]});
  sim.step();assert.ok(sim.velocities[0]>0);assert.ok(sim.velocities[3]<0);
  assert.ok(Math.abs(sim.velocities[0]+4*sim.velocities[3])<1e-7);
  assert.ok(Math.abs(sim.velocities[0]/-sim.velocities[3]-4)<1e-6);
  const before=sim.velocities[0],next=structuredClone(sim.settings.species);next[0].mass=2;
  sim.configure({species:next});assert.equal(sim.velocities[0],before/2);
});

test('screened charge attracts opposite signs and repels equal signs',()=>{
  const s=settingsFor('gas',100);s.species[0].charge=1;s.species[1].charge=-1;
  const attractive=pairWorld({species:s.species,chargeStrength:3});attractive.step();assert.ok(attractive.velocities[0]>0);
  s.species[1].charge=1;
  const repulsive=pairWorld({species:s.species,chargeStrength:3});repulsive.step();assert.ok(repulsive.velocities[0]<0);
  const screened=pairWorld({species:s.species,chargeStrength:3,screeningLength:.2});screened.step();
  assert.ok(Math.abs(screened.velocities[0])<Math.abs(repulsive.velocities[0])*.01);
});

test('radius sets contact distance and live expansion stays inside walls',()=>{
  const s=settingsFor('gas',100);s.species[0].radius=1.2;s.species[1].radius=1.2;
  const sim=pairWorld({species:s.species,repulsion:30});sim.step();assert.ok(sim.velocities[0]<0);
  sim.positions[0]=78.8;
  const next=structuredClone(sim.settings.species);next[0].radius=1.5;sim.configure({species:next});
  assert.ok(sim.positions[0]<=78.5);
});

test('inert gas has only collisions and thermal motion; zero temperature and separated particles stay still',()=>{
  const sim=pairWorld();const before=sim.positions.slice();advance(sim,20);
  assert.deepEqual(sim.positions,before);assert.equal(sim.stats().bonds,0);assert.equal(sim.stats().reactions,0);
  sim.configure({temperature:1,damping:1});advance(sim,30);assert.ok(sim.stats().energy>0);
});

test('bonding creates structures, immediately prunes lowered valence and obeys binding energy',()=>{
  const sim=new Simulation({...settingsFor('chains',200,42),temperature:0});
  sim.velocities.fill(0);
  for(let i=0;i<200;i++) {
    sim.types[i]=i%2;
    sim.positions[i*3]=(i%10)*1.6-8;sim.positions[i*3+1]=(Math.floor(i/10)%5)*1.6-4;sim.positions[i*3+2]=Math.floor(i/50)*1.6-3;
  }
  advance(sim,100);assert.ok(sim.bonds.size>0);assert.ok(sim.stats().largest>=3);assert.ok(sim.stats().meanBondAge>0);
  const single=sim.settings.species.map(item=>({...item,valence:1}));sim.configure({species:single});
  assert.ok(sim.degrees.every(value=>value<=1));assert.equal(sim.stats().clusters,0);
  sim.configure({species:single.map(item=>({...item,bondEnergy:0}))});
  assert.equal(sim.bonds.size,0);assert.ok(sim.degrees.every(value=>value===0));
  assert.equal(sim.bondsFormed,sim.bondsBroken);
});

test('bond capture remains local and works beyond a short affinity cutoff',()=>{
  const s=settingsFor('chains',100);s.species=s.species.map(item=>({...item,radius:1.2}));
  const sim=pairWorld({species:s.species,matrix:s.matrix,interactionRadius:2,reactionRadius:.5,bondStrength:2,bondFormation:20});
  sim.positions[0]=-1.7;sim.positions[3]=1.7;
  advance(sim,120);assert.equal(sim.bonds.size,1);assert.equal(sim.degrees[0],1);assert.equal(sim.degrees[1],1);
});

test('propulsion consumes fuel and is absent without fuel; spatial supply has the correct direction',()=>{
  const s=settingsFor('gas',100);s.species[0].propulsion=4;
  const dry=pairWorld({species:s.species});dry.step();assert.equal(dry.velocities[0],0);
  const fueled=pairWorld({species:s.species});fueled.energies[0]=2;fueled.step();
  assert.ok(fueled.velocities[0]>0);assert.ok(fueled.energies[0]<2);
  const gradient=pairWorld({energyInput:2,energyGradient:1});gradient.energies.fill(0);gradient.positions[0]=-50;gradient.positions[3]=50;
  gradient.step();assert.ok(gradient.energies[1]>gradient.energies[0]*3);
});

test('same-species alignment reduces disagreement when turning noise is zero',()=>{
  const s=settingsFor('gas',100);s.species[0].alignment=8;
  const sim=pairWorld({species:s.species});sim.types[1]=0;sim.headings.set([1,0,0,0,1,0]);
  sim.step();const dot=sim.headings[0]*sim.headings[3]+sim.headings[1]*sim.headings[4];assert.ok(dot>0);
});

test('catalysis requires a nearby different particle and sufficient fuel',()=>{
  const rule={name:'Catalysis',from:0,to:2,catalyst:1,rate:20,activationEnergy:0,energyCost:1};
  const alone=pairWorld({reactions:[rule]});alone.types[1]=2;alone.energies.fill(2);advance(alone,120);assert.equal(alone.reactions,0);
  const starved=pairWorld({reactions:[rule]});advance(starved,120);assert.equal(starved.reactions,0);
  const catalyzed=pairWorld({reactions:[rule]});catalyzed.energies.fill(2);advance(catalyzed,120);
  assert.equal(catalyzed.reactions,1);assert.equal(catalyzed.types[0],2);assert.equal(catalyzed.energies[0],1);
  const far=pairWorld({reactions:[rule]});far.positions[3]=20;far.energies.fill(2);advance(far,120);assert.equal(far.reactions,0);
  const self=pairWorld({reactions:[{...rule,catalyst:0}]});self.energies.fill(2);advance(self,120);assert.equal(self.reactions,0);
});

test('spontaneous conversion preserves particle count and momentum when mass changes',()=>{
  const rule={name:'Decay',from:0,to:1,catalyst:-1,rate:20,activationEnergy:0,energyCost:0};
  const s=settingsFor('gas',100);s.species[0].mass=1;s.species[1].mass=5;
  const sim=pairWorld({reactions:[rule],species:s.species});sim.velocities[0]=2;advance(sim,120);
  assert.equal(sim.reactions,1);assert.equal(sim.types[0],1);assert.ok(Math.abs(sim.velocities[0]-.4)<1e-7);assert.equal(sim.stats().particles,100);
});

test('conversion removes affected bonds without leaving corrupt degrees',()=>{
  const s=settingsFor('chains',100);s.reactions=[{name:'Convert',from:0,to:2,catalyst:-1,rate:20,activationEnergy:0,energyCost:0}];
  const sim=pairWorld({species:s.species,reactions:s.reactions,matrix:s.matrix,bondStrength:2});
  sim.bonds.set(1,[0,1]);sim.bondBirths.set(1,0);sim.bondsFormed=1;sim.degrees[0]=1;sim.degrees[1]=1;
  advance(sim,120);assert.equal(sim.types[0],2);assert.equal(sim.bonds.size,0);assert.equal(sim.degrees[0],0);assert.equal(sim.degrees[1],0);
});

test('all six presets stay finite and confined under extreme controls',()=>{
  for(const preset of Object.keys(PRESETS)) {
    const settings={...settingsFor(preset,200,19),temperature:5,attraction:5,bondStrength:6,repulsion:100,chargeStrength:10,damping:0,energyInput:10};
    settings.species=settings.species.map((item,i)=>({...item,mass:i===0?.2:10,radius:i===0?1.5:.2,charge:i%2?-3:3,propulsion:15,alignment:10,turnRate:10}));
    const sim=new Simulation(settings);advance(sim,400);
    for(let i=0;i<sim.settings.count;i++)for(let k=0;k<3;k++)assert.ok(Number.isFinite(sim.positions[i*3+k])&&Math.abs(sim.positions[i*3+k])<=24-sim.settings.species[sim.types[i]].radius+1e-5);
    assert.ok(sim.velocities.every(Number.isFinite));assert.ok(sim.energies.every(value=>value>=0&&value<=10));
    assert.doesNotThrow(()=>Simulation.restore(sim.snapshot()));
  }
});

test('malformed settings and snapshots reject bad species, matrices, fuel and topology',()=>{
  const base=new Simulation(settingsFor('soup',200)).snapshot();
  const cases=[d=>d.positions[0]=NaN,d=>d.positions[0]=30,d=>d.settings.count=100000,d=>d.settings.matrix[1]=-.5,d=>d.bonds=[[0,200]],d=>d.bonds=[[1,0]],d=>d.bonds=[[0,1],[0,1]],d=>d.rng=-1,d=>d.types[0]=6,d=>d.ticks=1.1,d=>d.settings.species[0].valence=-1,d=>d.settings.species[0].color='red',d=>d.energies[0]=11,d=>d.headings[0]=100,d=>d.settings.reactions=[{name:'Invalid',from:0,to:1,catalyst:5,rate:1,activationEnergy:0,energyCost:0}],d=>d.bondsFormed=10];
  for(const mutate of cases){const data=structuredClone(base);mutate(data);assert.throws(()=>Simulation.restore(data));}
  const zero=structuredClone(base.settings);zero.species.forEach(item=>item.abundance=0);assert.throws(()=>validateSettings(zero));
});

test('v1 saves migrate to editable species and v3 continuation data',()=>{
  const sim=new Simulation(settingsFor('soup',200)),data=sim.snapshot();data.version=1;
  data.settings={preset:'soup',count:200,seed:42,temperature:.35,attraction:1.2,bondStrength:1.4,damping:.7,matrix:[.65,.85,-.25,.85,.25,.15,-.25,.15,-.1],valence:[3,2,1]};
  const restored=Simulation.restore(data);assert.equal(restored.snapshot().version,3);assert.equal(restored.snapshot().algorithm,ALGORITHM);assert.deepEqual(restored.settings.species.map(item=>item.valence),[3,2,1]);
  assert.ok(restored.settings.species.every(item=>item.mass===1));advance(restored,20);assert.ok(restored.positions.every(Number.isFinite));
});

test('v1 paused edits migrate stale bonds safely while v2 and duplicate bonds stay strict',()=>{
  const data=new Simulation(settingsFor('soup',100)).snapshot();data.version=1;
  data.settings={preset:'soup',count:100,seed:42,temperature:.35,attraction:1.2,bondStrength:1.4,damping:.7,matrix:[.65,-.65,-.25,-.65,.25,.15,-.25,.15,-.1],valence:[1,2,1]};
  data.types[0]=0;data.types[1]=1;data.types[2]=0;data.types[3]=0;
  data.bonds=[[0,1],[0,2],[0,3]];
  const restored=Simulation.restore(data);
  assert.deepEqual(Array.from(restored.bonds.values()),[[0,2]]);
  assert.deepEqual(restored.migration,{fromVersion:1,prunedBonds:2,algorithmChanged:true});
  assert.equal(restored.bondsFormed,3);assert.equal(restored.bondsBroken,2);
  assert.deepEqual(Simulation.restore(restored.snapshot()).snapshot(),restored.snapshot());
  const duplicate=structuredClone(data);duplicate.bonds=[[0,1],[0,1]];assert.throws(()=>Simulation.restore(duplicate),/duplicate/);
  const invalidV2=restored.snapshot();invalidV2.version=2;delete invalidV2.algorithm;invalidV2.bonds=[[0,1]];assert.throws(()=>Simulation.restore(invalidV2),/binding affinity/);
});

test('fast states after a valid mass edit still save and restore; overflow is rejected atomically',()=>{
  const sim=pairWorld();sim.velocities[0]=10000;
  const next=structuredClone(sim.settings.species);next[0].mass=.2;sim.configure({species:next});
  assert.ok(sim.velocities[0]>10000);
  assert.deepEqual(Simulation.restore(sim.snapshot()).snapshot(),sim.snapshot());
  const huge=sim.snapshot();huge.velocities[0]=1e300;assert.throws(()=>Simulation.restore(huge),/velocities/);
  const heavier=structuredClone(sim.settings.species);heavier[0].mass=10;sim.configure({species:heavier});sim.velocities[0]=3e38;
  const before=sim.snapshot(),lighter=structuredClone(heavier);lighter[0].mass=.2;
  assert.throws(()=>sim.configure({species:lighter}),/numeric velocity/);assert.deepEqual(sim.snapshot(),before);
});

test('isolated particles reflect from both walls without losing speed, including large overshoots',()=>{
  for(const sign of [-1,1]) {
    const sim=pairWorld();const limit=80-sim.settings.species[0].radius;
    sim.positions[0]=sign*(limit-.01);sim.velocities[0]=sign*2;sim.step();
    assert.ok(Math.abs(sim.positions[0])<=limit);assert.equal(sim.velocities[0],-sign*2);
    sim.velocities[0]=10000;sim.step();assert.ok(Math.abs(sim.positions[0])<=limit);assert.equal(Math.abs(sim.velocities[0]),10000);
  }
});

test('6,000 particles use valid typed indices and export a complete state',()=>{
  const sim=new Simulation({...settingsFor('gas',6000,1),boxSize:120});sim.step();
  assert.equal(sim.types.length,6000);assert.equal(sim.stats().speciesCounts.reduce((a,b)=>a+b,0),6000);
  assert.ok(sim.positions.every(Number.isFinite));assert.equal(Simulation.restore(sim.snapshot()).positions.length,18000);
});

// Deliberately independent all-pairs reference: no grid, pair tables or cache data.
function referenceForces(sim) {
  const s=sim.settings,p=sim.positions,forces=new Float64Array(p.length),m=s.species.length;
  for(let i=0;i<s.count;i++)for(let j=i+1;j<s.count;j++) {
    const a=i*3,b=j*3,dx=p[b]-p[a],dy=p[b+1]-p[a+1],dz=p[b+2]-p[a+2],r=Math.sqrt(dx*dx+dy*dy+dz*dz);
    const sa=s.species[sim.types[i]],sb=s.species[sim.types[j]],contact=sa.radius+sb.radius;
    let force=r<contact?-s.repulsion*(1-r/contact):r<s.interactionRadius?s.matrix[sim.types[i]*m+sim.types[j]]*s.attraction*2*Math.sin(Math.PI*(r-contact)/Math.max(.01,s.interactionRadius-contact)):0;
    if(s.chargeStrength&&sa.charge&&sb.charge&&r<s.interactionRadius) {
      const softR=Math.max(contact*.5,r);
      force-=s.chargeStrength*sa.charge*sb.charge*Math.exp(-softR/s.screeningLength)*(1/(softR*softR)+1/(s.screeningLength*softR))*(1-r/s.interactionRadius)**2;
    }
    force=Math.max(-150,Math.min(150,force));
    const inverse=r>.0001?1/r:0,components=[r>.0001?force*dx*inverse:force,force*dy*inverse,force*dz*inverse];
    for(let k=0;k<3;k++){forces[a+k]+=components[k];forces[b+k]-=components[k];}
  }
  return forces;
}

test('contiguous neighbor cells match independent all-pairs forces at boundaries and mixed ranges',()=>{
  for(const controls of [
    {interactionRadius:2,repulsion:30,attraction:0,chargeStrength:0},
    {interactionRadius:6,repulsion:30,attraction:2,chargeStrength:3},
    {interactionRadius:16,repulsion:0,attraction:2,chargeStrength:0},
    {interactionRadius:2,repulsion:0,attraction:0,chargeStrength:3},
  ]) {
    const settings={...settingsFor('soup',160,31),...controls,boxSize:24,temperature:0,damping:0,bondStrength:0,bondFormation:0};
    settings.species=settings.species.map((item,i)=>({...item,radius:[1.5,.2,.7][i],charge:i-1,turnRate:0}));
    const sim=new Simulation(settings);
    // Cell boundaries, opposite wall regions, an overlap and an exact cutoff.
    const edge=sim.gridSize>1?-12+sim.cellSize:9;
    sim.positions.set([edge-.01,0,0,edge+.01,0,0,-10,0,0,10,0,0,0,0,0,0,0,0]);
    sim.types[4]=0;sim.types[5]=1;
    sim.velocities.fill(0);
    const expected=referenceForces(sim);
    sim.step();
    for(let i=0;i<expected.length;i++)assert.ok(Math.abs(sim.forces[i]-expected[i])<=2e-5*Math.max(1,Math.abs(expected[i])),`force ${i}: ${sim.forces[i]} vs ${expected[i]}`);
  }
});

test('active ranges discard unused mechanisms and retain overlap suppression without repulsion',()=>{
  const inert=pairWorld({interactionRadius:16,reactionRadius:12});
  assert.equal(inert.cutoff,0);
  inert.configure({repulsion:10});assert.equal(inert.cutoff,1.3);
  inert.configure({repulsion:0,reactions:[{name:'Decay',from:0,to:1,catalyst:-1,rate:1,activationEnergy:0,energyCost:0}]});
  assert.equal(inert.cutoff,0,'spontaneous reactions do not need neighbor searches');
  inert.configure({reactions:[{name:'Catalysis',from:0,to:1,catalyst:2,rate:1,activationEnergy:0,energyCost:0}]});
  assert.equal(inert.cutoff,12);
  inert.configure({reactions:[]});assert.equal(inert.cutoff,0);
  const s=settingsFor('gas',100);s.species[0].radius=1.5;s.species[1].radius=1.5;
  const overlap=pairWorld({species:s.species,attraction:2,repulsion:0,matrix:[0,1,0,1,0,0,0,0,0]});
  overlap.step();assert.equal(overlap.velocities[0],0);assert.equal(overlap.velocities[3],0);
  const reactive=pairWorld({reactions:[{name:'Catalysis',from:0,to:2,catalyst:1,rate:20,activationEnergy:0,energyCost:0}],reactionRadius:12});
  reactive.positions[3]=9;advance(reactive,120);assert.equal(reactive.types[0],2,'catalysis beyond inactive force ranges remains active');
});

test('cell bounding-box pruning retains near-cutoff pairs across sparse-world faces, edges and corners',()=>{
  for(const dimensions of [1,2,3]) {
    const settings={...settingsFor('gas',100,9),boxSize:LIMITS.boxSize,temperature:0,damping:0};
    settings.species=settings.species.map(item=>({...item,radius:.65,turnRate:0}));
    const sim=new Simulation(settings),face=-settings.boxSize/2+2*sim.cellSize;
    sim.velocities.fill(0);
    for(let i=0;i<100;i++)sim.positions.set([170+(i%5)*24,170+(Math.floor(i/5)%5)*24,170+Math.floor(i/25)*24],i*3);
    for(let axis=0;axis<3;axis++) {
      const offset=axis<dimensions?.64995/Math.sqrt(dimensions):0;
      sim.positions[axis]=face-offset;sim.positions[3+axis]=face+offset;
    }
    const expected=referenceForces(sim);
    assert.ok(expected[0]<0,'the two particles are just inside collision range');
    sim.step();
    for(let axis=0;axis<3;axis++)assert.ok(Math.abs(sim.forces[axis]-expected[axis])<1e-7,`missed face/edge/corner component ${dimensions}/${axis}`);
  }
});

test('256 species and catalyst words beyond eight and 32 bits preserve high product IDs',()=>{
  const species=Array.from({length:LIMITS.species},(_,i)=>({...speciesDefaults(i),valence:0,turnRate:0,abundance:i===255?1:0}));
  const settings={species,matrix:Array(LIMITS.species**2).fill(0)};
  const initial=new Simulation({...settingsFor('gas',100),...settings});
  assert.ok(initial.types.every(type=>type===255));
  assert.equal(initial.stats().speciesCounts[255],100);
  assert.equal(new Set(species.map(item=>item.color)).size,LIMITS.species,'palette gives every supported species a fixed distinct color');
  const decoys=Array.from({length:64},(_,i)=>({name:`Other catalyst ${i}`,from:129,to:130,catalyst:i,rate:1,activationEnergy:0,energyCost:0}));
  const reaction={name:'High ID conversion',from:128,to:255,catalyst:200,rate:20,activationEnergy:0,energyCost:0};
  const make=neighbor=>{
    const sim=pairWorld({...settings,reactions:[...decoys,reaction]});
    sim.types[0]=128;sim.types[1]=neighbor;
    return sim;
  };
  const absent=make(0);advance(absent,120);assert.equal(absent.types[0],128,'a set bit in a different word is not the catalyst');
  const present=make(200);advance(present,120);assert.equal(present.types[0],255);assert.equal(present.reactions,1);
  const saved=Simulation.restore(present.snapshot());advance(present,30);advance(saved,30);assert.deepEqual(saved.snapshot(),present.snapshot());
});

test('1024 indexed reaction rules preserve source matching and configuration invalidates caches',()=>{
  const settings=settingsFor('gas',100),rule={name:'Conversion',from:0,to:1,catalyst:-1,rate:1,activationEnergy:0,energyCost:0};
  settings.reactions=Array.from({length:LIMITS.reactions},(_,i)=>({...rule,from:i===0?0:2,to:i===0?1:0}));
  const sim=pairWorld(settings);sim.types.fill(1);sim.types[0]=0;advance(sim,600);
  assert.equal(sim.types[0],1);assert.equal(sim.reactions,1);
  const before=sim.stats();
  sim.configure({reactions:[{...rule,from:1,to:2,rate:20}],temperature:2,damping:1});advance(sim,120);
  assert.equal(sim.stats().speciesCounts[2],100);assert.ok(sim.stats().energy>0);
  assert.equal(before.speciesCounts[1],100,'returned stats remain stable across later scratch reuse');
});

test('50,000 particles remain bounded in memory in the largest sparse world and round trip',()=>{
  const sim=new Simulation({...settingsFor('gas',LIMITS.particles,10),boxSize:LIMITS.boxSize});
  assert.ok(sim.cellCounts.length<sim.settings.count*3);
  sim.step();
  assert.equal(sim.stats().speciesCounts.reduce((sum,count)=>sum+count,0),LIMITS.particles);
  assert.ok(sim.positions.every(Number.isFinite));
  const restored=Simulation.restore(sim.snapshot());
  assert.equal(restored.positions.length,LIMITS.particles*3);
  assert.deepEqual(restored.snapshot(),sim.snapshot());
});

test('v2 states migrate losslessly while declaring the new continuation algorithm',()=>{
  const sim=new Simulation(settingsFor('chains',200,42));advance(sim,120);
  assert.ok(sim.bonds.size>0);
  assert.equal(sim.topologyVersion,sim.bondsFormed+sim.bondsBroken);
  const snapshot=sim.snapshot(),v2=structuredClone(snapshot);v2.version=2;delete v2.algorithm;
  const restored=Simulation.restore(v2);
  assert.deepEqual(restored.snapshot(),snapshot);
  assert.deepEqual(restored.migration,{fromVersion:2,prunedBonds:0,algorithmChanged:true});
  const foreign=structuredClone(snapshot);foreign.algorithm='unknown';assert.throws(()=>Simulation.restore(foreign),/algorithm/);
  const oldVersion=sim.topologyVersion;
  sim.configure({species:sim.settings.species.map(item=>({...item,valence:0}))});
  assert.ok(sim.topologyVersion>oldVersion);assert.equal(sim.topologyVersion,sim.bondsFormed+sim.bondsBroken);
  assert.equal(sim.bonds.size,0);
});
