import { Simulation, DT } from './simulation.js';
let sim,paused=false,speed=1,visible=true,accumulator=0,last=performance.now(),previousStats=-1,stepMs=0;
let rateStart=last,rateTicks=0,stepsPerSecond=0;
function resetRate() { rateStart=performance.now(); rateTicks=sim?.ticks??0; stepsPerSecond=0; }
function frame(forceStats=false,includeSettings=false) {
  const now=performance.now(),rateElapsed=now-rateStart;
  if(!paused&&visible&&rateElapsed>=500){stepsPerSecond=(sim.ticks-rateTicks)*1000/rateElapsed;rateStart=now;rateTicks=sim.ticks;}
  const positions=sim.positions.slice(),types=sim.types.slice(),energies=sim.energies.slice(),bonds=Uint16Array.from(Array.from(sim.bonds.values()).flat());
  const stats=forceStats||sim.ticks-previousStats>=15?{...sim.stats(),stepMs,stepsPerSecond}:null;
  if(stats)previousStats=sim.ticks;
  postMessage({type:'frame',positions,types,energies,bonds,stats,...(includeSettings?{settings:sim.settings}:{})},[positions.buffer,types.buffer,energies.buffer,bonds.buffer]);
}
function settingsMessage(reason,requestId) {postMessage({type:'settings',settings:sim.settings,reason,requestId,imported:reason==='import',...(reason==='import'&&sim.migration?{migration:sim.migration}:{})});}
self.onmessage=({data})=>{
  try {
    if(data.type==='init'||data.type==='reset') {
      sim=new Simulation(data.settings);accumulator=0;previousStats=-1;stepMs=0;last=performance.now();resetRate();
      settingsMessage(data.type,data.requestId);frame(true,true);
    }
    else if(data.type==='configure'){sim.configure(data.patch);settingsMessage('configure',data.requestId);frame(true,true);}
    else if(data.type==='sync'&&sim){settingsMessage('sync',data.requestId);frame(true,true);}
    else if(data.type==='pause'){paused=Boolean(data.value);accumulator=0;last=performance.now();resetRate();if(paused&&sim)frame(true);}
    else if(data.type==='speed'){if([.5,1,2,4].includes(data.value))speed=data.value;}
    else if(data.type==='visibility'){visible=Boolean(data.value);accumulator=0;last=performance.now();resetRate();if(sim&&visible)frame(true);}
    else if(data.type==='step'){paused=true;const start=performance.now();sim.step();stepMs=performance.now()-start;resetRate();frame(true);}
    else if(data.type==='export'){postMessage({type:'export',snapshot:sim.snapshot(),requestId:data.requestId});}
    else if(data.type==='import') {
      sim=Simulation.restore(data.snapshot);paused=true;previousStats=-1;accumulator=0;stepMs=0;last=performance.now();resetRate();
      settingsMessage('import',data.requestId);frame(true,true);
    }
  }catch(error){postMessage({type:'error',action:data.type,message:error.message,requestId:data.requestId});}
};
setInterval(()=>{
  const now=performance.now(),elapsed=Math.min((now-last)/1000,.1);last=now;
  if(!sim||paused||!visible)return;
  accumulator+=elapsed*speed;
  let steps=0;
  const started=performance.now();
  // A 24ms work budget lets control messages through even in dense experiments.
  while(accumulator>=DT&&steps<12){sim.step();accumulator-=DT;steps++;if(performance.now()-started>=24)break;}
  accumulator=Math.min(accumulator,DT*12);
  if(steps){const sample=(performance.now()-started)/steps;stepMs=stepMs?stepMs*.8+sample*.2:sample;frame();}
},1000/30);
