import test from 'node:test';
import assert from 'node:assert/strict';
import { UniverseRenderer } from '../renderer.js';

function renderer(options={}) {
  const result=Object.assign(Object.create(UniverseRenderer.prototype),{
    instancing:true,species:[{color:'#f28b82',radius:.6},{color:'#8aaaf5',radius:.8}],
    colors:[[.95,.55,.51],[.54,.67,.96]],colorMode:'species',viewMode:'particles',showBonds:true,
    selectedId:null,...options,
  });
  result.initializeGeometry();
  return result;
}
function frame(bonds=[0,1,2,3],options={}) {
  return {positions:new Float32Array([0,0,0,2,0,0,4,0,0,6,0,0,8,0,0]),types:new Uint8Array([0,1,0,1,0]),
    energies:new Float32Array([0,2,4,6,8]),bonds:Uint32Array.from(bonds),...options};
}

test('hidden geometry is deferred and appears correctly when toggled while paused',()=>{
  const r=renderer({showBonds:false});r.update(frame());r.updateAppearance();
  assert.equal(r.bondData.length,0);assert.equal(r.nodeData.length,0);
  assert.equal(r.bondsUpload,false);assert.equal(r.nodesUpload,false);assert.equal(r.topologyValid,false);
  r.showBonds=true;r.updateAppearance();
  assert.equal(r.bondDataLength,28);assert.equal(r.bondVertexCount,12);assert.equal(r.nodeData.length,0);
  r.viewMode='bonds';r.updateAppearance();
  assert.equal(r.nodeCount,4);assert.equal(r.nodeData[7],2);assert.equal(r.nodeData[21],6);
  r.showBonds=false;r.update(frame([1,4]));r.updateAppearance();
  assert.equal(r.nodeCount,2);assert.equal(r.nodeData[0],2);assert.equal(r.nodeData[7],8);
  r.viewMode='particles';r.updateAppearance();
  assert.equal(r.pointData[2*7],4);assert.equal(r.pointsComplete,true);
  r.showBonds=true;r.updateAppearance();
  assert.equal(r.bondDataLength,14);assert.equal(r.bondData[0],2);assert.equal(r.bondData[3],8);
});

test('generation and topology versions reuse clusters across moving frames and invalidate on resets',()=>{
  const r=renderer({colorMode:'cluster'}),root=r.root;
  let roots=0;r.root=function(id){roots++;return root.call(this,id);};
  r.update(frame([0,1,2,3],{generation:1,topologyVersion:0}));r.updateAppearance();
  assert.ok(roots>0);const first=r.pointData.slice();
  roots=0;
  const moved=frame([0,1,2,3],{generation:1,topologyVersion:0});moved.positions[0]=1;
  r.update(moved);r.updateAppearance();
  assert.equal(roots,0,'Unchanged topology should not rebuild connected components');
  assert.equal(r.pointData[0],1);assert.deepEqual(r.pointData.slice(3,6),first.slice(3,6));
  r.update(frame([0,2,1,3],{generation:1,topologyVersion:1}));r.updateAppearance();
  assert.ok(roots>0);assert.deepEqual(r.pointData.slice(3,6),r.pointData.slice(17,20));
  roots=0;
  r.update(frame([0,4],{generation:2,topologyVersion:1}));r.updateAppearance();
  assert.ok(roots>0);assert.equal(r.degrees[1],0);assert.equal(r.degrees[4],1);
});

test('legacy frames compare owned topology copies even if old transferable frames are detached',()=>{
  const r=renderer({colorMode:'cluster'}),old=frame();r.update(old);r.updateAppearance();
  r.update(frame([1,4]));
  structuredClone(old,{transfer:[old.positions.buffer,old.types.buffer,old.bonds.buffer,old.energies.buffer]});
  r.updateAppearance();
  assert.equal(r.nodeCount,2);assert.deepEqual(Array.from(r.bondIndices.slice(0,2)),[1,4]);
  r.update(frame([0,2]));r.updateAppearance();
  assert.equal(r.degrees[4],0);assert.equal(r.degrees[2],1);
});

test('instanced ribbons preserve both endpoint colors, positions and radii of the fallback',()=>{
  const a=renderer(),b=renderer({instancing:false});
  for(const r of [a,b]){r.update(frame([0,1]));r.updateAppearance();}
  assert.equal(a.bondDataLength,14);assert.equal(b.bondDataLength,66);
  assert.deepEqual(a.bondData.slice(0,3),b.bondData.slice(0,3));
  assert.deepEqual(a.bondData.slice(3,6),b.bondData.slice(11,14));
  assert.deepEqual(a.bondData.slice(6,9),b.bondData.slice(6,9));
  assert.deepEqual(a.bondData.slice(9,12),b.bondData.slice(17,20));
  assert.equal(a.bondData[12],b.bondData[9]);assert.equal(a.bondData[13],b.bondData[20]);
  assert.deepEqual([10,21,32,43,54,65].map(i=>b.bondData[i]),[1,-1,-1,-1,-1,1]);
});

test('wide particle and species indices survive network geometry preparation',()=>{
  const n=70000,r=renderer({viewMode:'bonds'});
  r.species=Array.from({length:300},()=>({radius:.6}));r.species[299].radius=1.25;
  r.colors=Array.from({length:300},()=>[.8,.4,.5]);r.colors[299]=[.4,.5,.9];
  const data={positions:new Float32Array(n*3),types:new Uint16Array(n),energies:new Float32Array(n),
    bonds:new Uint32Array([65536,69999]),generation:3,topologyVersion:0};
  data.positions[65536*3]=17;data.positions[69999*3]=21;data.types[69999]=299;
  r.update(data);r.updateAppearance();
  assert.deepEqual(Array.from(r.nodeIds.slice(0,2)),[65536,69999]);
  assert.equal(r.nodeCount,2);assert.equal(r.nodeData[0],17);assert.equal(r.nodeData[7],21);
  assert.equal(r.bondData[0],17);assert.equal(r.bondData[3],21);assert.equal(r.bondData[13],1.25);
  assert.ok(Math.abs(r.nodeData[12]-.9)<1e-6);assert.equal(r.pointsUpload,false);
});

test('GPU buffers retain allocation and upload only the requested live range',()=>{
  const allocations=[],uploads=[],r=renderer(),buffer={};
  r.bufferCapacities=new Map();
  r.gl={ARRAY_BUFFER:1,DYNAMIC_DRAW:2,bindBuffer(){},bufferData(target,bytes){allocations.push(bytes);},
    bufferSubData(target,offset,data){uploads.push(data.byteLength);}};
  const data=new Float32Array(1000);
  r.upload(buffer,data,100);r.upload(buffer,data,80);r.upload(buffer,data,90);r.upload(buffer,data,0);
  assert.deepEqual(allocations,[400]);assert.deepEqual(uploads,[400,320,360]);
  r.upload(buffer,data,110);
  assert.equal(allocations.length,2);assert.equal(allocations[1],600);assert.equal(uploads.at(-1),440);
});

function camera(){
  const rect={left:20,top:30,width:1000,height:700};
  const canvas={width:2000,height:1400,getBoundingClientRect:()=>rect};
  const r=renderer({boxSize:48,particleScale:.72,canvas});r.initializeCamera();
  return {r,rect};
}
const near=(actual,expected,tolerance=1e-10)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const vectorNear=(actual,expected)=>actual.forEach((value,i)=>near(value,expected[i]));

test('orbit and fly preserve view on switching, while fly look keeps the eye fixed in portrait',()=>{
  const {r,rect}=camera();r.target=[4,5,6];r.yaw=.9;r.pitch=-.4;r.distance=8;
  const eye=r.cameraEye(),projection=r.projectPoint([5,6,7]);
  assert.equal(r.setCameraMode('fly'),true);
  vectorNear(r.cameraEye(),eye);assert.deepEqual(r.projectPoint([5,6,7]),projection);
  r.lookAround(.4,.25);vectorNear(r.cameraEye(),eye);
  const centered=r.projectPoint(r.target);near(centered.x,520);near(centered.y,380);
  rect.width=360;rect.height=800;r.canvas.width=720;r.canvas.height=1600;
  vectorNear(r.cameraEye(),eye);
  r.lookAround(-.8,.3);vectorNear(r.cameraEye(),eye);
  const portrait=r.projectPoint(r.target);near(portrait.x,200);near(portrait.y,430);
  const target=[...r.target];r.setCameraMode('orbit');r.lookAround(.2,.1);
  vectorNear(r.target,target);assert.notDeepEqual(r.cameraEye(),eye);
  assert.equal(r.setCameraMode('unknown'),false);assert.equal(r.cameraMode,'orbit');
});

test('close zoom, near clipping and size-capped picking use the same perspective',()=>{
  const {r,rect}=camera();r.yaw=0;r.pitch=0;r.zoom(-1e6);
  assert.equal(r.distance,.05);assert.equal(r.nearPlane,.03);
  const data={positions:new Float32Array([0,0,.03,0,0,-.01,0,0,.1]),types:new Uint16Array(3),bonds:new Uint32Array(0),energies:new Float32Array(3)};
  r.update(data);
  assert.equal(r.projectPoint([0,0,.03]).visible,false,'Particle center before the near plane is clipped');
  assert.equal(r.projectPoint([0,0,.1]).visible,false,'Particle behind the eye is clipped');
  assert.equal(r.projectPoint([0,0,-.01]).visible,true);
  assert.equal(r.projectPoint([0,0,-1000]).visible,false,'Far clipping matches the renderer');
  const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
  assert.equal(r.pick(cx,cy),1,'Picking can reach particles closer than the old one-unit near plane');
  const diameter=r.projectedPointSize(.6,.06);
  near(diameter,r.maxPointSize/2);
  assert.equal(r.pick(cx+diameter/2+2,cy),1);
  assert.equal(r.pick(cx+diameter/2+4,cy),null,'Picking respects the GPU point-size cap');
  r.zoom(1e6);assert.equal(r.distance,r.boxSize*8);
});

test('panning moves the view in screen space without changing orientation or depth',()=>{
  const {r}=camera();r.target=[4,-3,2];r.distance=12;r.yaw=.7;r.pitch=-.2;
  const world=[...r.target],before=r.projectPoint(world),angles=[r.yaw,r.pitch];
  r.pan(50,-25);
  const after=r.projectPoint(world);
  near(after.x,before.x+50);near(after.y,before.y-25);near(after.depth,before.depth);
  assert.deepEqual([r.yaw,r.pitch],angles);
});

test('sequential two-finger events zoom without centroid drift and preserve combined panning',()=>{
  const {r}=camera();r.distance=12;r.yaw=.7;r.pitch=-.2;
  const origin=[...r.target],center=r.projectPoint(origin);
  r.panAndZoom(center.x,center.y,center.x-10,center.y,100/120);
  r.panAndZoom(center.x-10,center.y,center.x,center.y,120/140);
  vectorNear(r.target,origin);near(r.distance,12*100/140);
  const before=r.projectPoint(origin);
  r.panAndZoom(before.x,before.y,before.x+10,before.y,100/80);
  r.panAndZoom(before.x+10,before.y,before.x+20,before.y,80/100);
  const after=r.projectPoint(origin);near(after.x,before.x+20);near(after.y,before.y);
});

test('movement is time based, normalized diagonally and respects speed modifiers',()=>{
  const setup=()=>{const {r}=camera();r.yaw=r.pitch=0;r.distance=8;return r;};
  const once=setup(),many=setup(),diagonal=setup();
  for(const r of [once,many,diagonal])r.startMovement('forward');
  once.updateCamera(1);for(let i=0;i<120;i++)many.updateCamera(1/120);
  vectorNear(once.target,many.target);near(Math.hypot(...once.target),4.8);
  diagonal.startMovement('right');diagonal.updateCamera(1);
  near(Math.hypot(...diagonal.target),4.8);assert.ok(diagonal.target[0]>0&&diagonal.target[2]<0);
  for(const [fast,precision,multiplier,expected] of [[true,false,1,19.2],[false,true,1,1.2],[true,true,1,4.8],[false,false,4,19.2]]){
    const r=setup();r.fastMove=fast;r.precisionMove=precision;r.movementSpeed=multiplier;
    r.pressedKeys.add('KeyW');r.updateCamera(1);near(Math.hypot(...r.target),expected);
  }
  const vertical=setup();vertical.pitch=.8;vertical.startMovement('up');vertical.updateCamera(1);
  vectorNear(vertical.target,[0,4.8,0]);
  vertical.stopMovement();const stopped=[...vertical.target];vertical.updateCamera(1);vectorNear(vertical.target,stopped);
});

test('focus centers the selected particle without changing its state or camera mode',()=>{
  const {r}=camera();r.update(frame());r.setCameraMode('fly');r.select(1);
  const positions=r.frame.positions.slice();r.autoRotate=true;r.startMovement('forward');
  assert.equal(r.focusSelected(),true);assert.equal(r.cameraMode,'fly');assert.equal(r.autoRotate,false);
  vectorNear(r.target,[2,0,0]);near(r.distance,.8*.72*8);assert.equal(r.movementActions.size,0);
  const point=r.projectPoint([2,0,0]);near(point.x,520);near(point.y,380);
  assert.equal(r.pick(point.x,point.y),1);assert.deepEqual(r.frame.positions,positions);
  r.select(null);assert.equal(r.focusSelected(),false);
});

test('reset clears navigation and auto-rotation; world resizing retains relative framing',()=>{
  const {r}=camera();r.target=[3,-4,5];r.distance=12;r.setCameraMode('fly');r.movementSpeed=4;
  r.setSettings({boxSize:96});vectorNear(r.target,[6,-8,10]);near(r.distance,24);assert.equal(r.cameraMode,'fly');
  r.startMovement('left');r.pressedKeys.add('KeyE');r.autoRotate=true;r.fastMove=true;
  let changes=0;r.onCameraChange=()=>changes++;r.resetCamera();
  assert.equal(changes,1);vectorNear(r.target,[0,0,0]);near(r.distance,96*1.855);
  near(r.yaw,-.36);near(r.pitch,.23);assert.equal(r.cameraMode,'orbit');assert.equal(r.autoRotate,false);
  assert.equal(r.movementSpeed,4);assert.equal(r.movementActions.size,0);assert.equal(r.pressedKeys.size,0);assert.equal(r.fastMove,false);
});
