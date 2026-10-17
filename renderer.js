const DEFAULT_SPECIES = [
  { color: '#f28b82', radius: .6 },
  { color: '#8aaaf5', radius: .55 },
  { color: '#c2a2ed', radius: .65 },
];
const UNBONDED_COLOR=[.39,.41,.47];
const POINT_LAYOUT=[['position',3,0],['color',3,12],['radius',1,24]];
const BOND_LAYOUT=[['position',3,0],['other',3,12],['color',3,24],['radius',1,36],['side',1,40]];
const INSTANCE_LAYOUT=[['startPosition',3,0],['endPosition',3,12],['startColor',3,24],['endColor',3,36],['radii',2,48]];
const CAMERA_UNIFORMS=['angles','target','distance','aspect','nearPlane','farPlane','focalLength','maxPointSize'];
const MOVE_KEYS={KeyW:'forward',KeyS:'back',KeyA:'left',KeyD:'right',KeyQ:'down',KeyE:'up'};
const MOVE_CODES=Object.fromEntries(Object.entries(MOVE_KEYS).map(([key,action])=>[action,key]));
const MOVE_ACTIONS=new Set(Object.values(MOVE_KEYS));
const TURN_KEYS=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']);

// Both programs use the same camera so picking, spheres and ribbons stay aligned.
const projection = `
uniform vec2 angles;
uniform vec3 target;
uniform float distance;
uniform float aspect;
uniform float nearPlane;
uniform float farPlane;
uniform float focalLength;
uniform float maxPointSize;
vec3 cameraPosition(vec3 p){
  p-=target;
  float cy=cos(angles.x),sy=sin(angles.x),cx=cos(angles.y),sx=sin(angles.y);
  p=vec3(cy*p.x+sy*p.z,p.y,-sy*p.x+cy*p.z);
  return vec3(p.x,cx*p.y-sx*p.z,sx*p.y+cx*p.z);
}
vec4 project(vec3 p){
  float depth=distance-p.z;
  return vec4(p.x*focalLength/aspect,p.y*focalLength,
    (farPlane+nearPlane)/(farPlane-nearPlane)*depth-2.0*farPlane*nearPlane/(farPlane-nearPlane),depth);
}`;
const pointVertex = `
attribute vec3 position;
attribute vec3 color;
attribute float radius;
uniform float resolution;
uniform float particleScale;
uniform float extraPixels;
uniform float boxSize;
varying vec3 tint;
${projection}
void main(){
  vec3 p=cameraPosition(position);
  gl_Position=project(p);
  gl_PointSize=clamp(resolution*focalLength*radius*particleScale/max(nearPlane,distance-p.z),2.0,maxPointSize)+extraPixels;
  tint=color*(.8+.2*clamp(p.z/boxSize+.5,0.0,1.0));
}`;
const pointFragment = `precision mediump float;
varying vec3 tint;
uniform int style;
uniform float opacity;
void main(){
  if(style==0){gl_FragColor=vec4(tint,opacity);return;}
  vec2 uv=gl_PointCoord*2.0-1.0;
  float r=dot(uv,uv);
  if(r>1.0)discard;
  if(style==2){
    if(r<.57)discard;
    float alpha=smoothstep(.57,.68,r)*(1.0-smoothstep(.86,1.0,r));
    gl_FragColor=vec4(1.0,.96,.73,alpha);return;
  }
  float z=sqrt(1.0-r);
  float light=.48+.52*max(0.0,dot(vec3(uv.x,-uv.y,z),normalize(vec3(-.4,.6,1.0))));
  gl_FragColor=vec4(tint*light+pow(z,14.0)*.18,(1.0-smoothstep(.8,1.0,r))*opacity);
}`;
const bondProjection = `
uniform vec2 viewport;
uniform float width;
uniform float particleScale;
varying vec3 tint;
${projection}
void projectBond(vec3 position,vec3 other,vec3 color,float radius,float side){
  vec3 ca=cameraPosition(position),cb=cameraPosition(other);
  float da=distance-ca.z,db=distance-cb.z,clipDepth=nearPlane*1.001;
  tint=color;
  if(da<clipDepth&&db<clipDepth){gl_Position=vec4(0.0,0.0,2.0,1.0);return;}
  bool clipped=da<clipDepth;
  // Clip the centerline before dividing by depth: a bond crossing behind the
  // eye must not turn into a flipped, screen-filling ribbon.
  if(clipped)ca=mix(ca,cb,(clipDepth-da)/(db-da));
  else if(db<clipDepth)cb=mix(cb,ca,(clipDepth-db)/(da-db));
  vec4 a=project(ca),b=project(cb);
  vec2 delta=(b.xy/b.w-a.xy/a.w)*viewport;
  float span=max(.0001,length(delta));
  vec2 normal=vec2(-delta.y,delta.x)/span;
  // End the bond at the visible particle surface instead of painting a stripe
  // across its center. Short projected bonds retain a small visible segment.
  float pointSize=clamp(viewport.y*focalLength*radius*particleScale/a.w,2.0,maxPointSize);
  float inset=clipped?0.0:min(span*.21,pointSize*.47);
  a.xy+=delta/span*inset*2.0/viewport*a.w;
  // WebGL line widths are commonly fixed to 1px. These triangles have an
  // explicit screen-space width, including on high density displays.
  a.xy+=normal*side*width/viewport*a.w;
  gl_Position=a;
  tint=color;
}`;
const bondVertex = `
attribute vec3 position;
attribute vec3 other;
attribute vec3 color;
attribute float radius;
attribute float side;
${bondProjection}
void main(){projectBond(position,other,color,radius,side);}`;
const instancedBondVertex = `
attribute vec3 startPosition;
attribute vec3 endPosition;
attribute vec3 startColor;
attribute vec3 endColor;
attribute vec2 radii;
attribute vec2 corner;
${bondProjection}
void main(){
  projectBond(mix(startPosition,endPosition,corner.x),mix(endPosition,startPosition,corner.x),
    mix(startColor,endColor,corner.x),mix(radii.x,radii.y,corner.x),corner.y);
}`;
const bondFragment = `precision mediump float;
varying vec3 tint;
uniform float opacity;
void main(){
  gl_FragColor=vec4(tint,opacity);
}`;

function hexColor(value, fallback) {
  const match=/^#([\da-f]{6})$/i.exec(value || '');
  if(!match)return fallback;
  const rgb=parseInt(match[1],16);
  return [(rgb>>16&255)/255,(rgb>>8&255)/255,(rgb&255)/255];
}
function clusterColor(id) {
  // Stable component hues span blue, violet, coral and amber, avoiding green.
  const h=(215+(id*.61803398875)%1*185)/360;
  return [0,2/3,1/3].map(phase=>.28+.68*Math.max(0,Math.min(1,Math.abs(((h+phase)%1)*6-3)-1)));
}

export class UniverseRenderer {
  constructor(canvas) {
    this.canvas=canvas;
    const gl=this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'low-power'});
    if(!gl)throw new Error('WebGL is unavailable. Enable hardware acceleration or try a browser with WebGL support.');
    this.instancing=gl.getExtension('ANGLE_instanced_arrays');
    this.maxAttributes=gl.getParameter(gl.MAX_VERTEX_ATTRIBS);this.bufferCapacities=new Map();
    this.maxPointSize=Math.min(512,gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1]);
    this.pointProgram=this.createProgram(pointVertex,pointFragment,
      ['position','color','radius'],[...CAMERA_UNIFORMS,'resolution','particleScale','extraPixels','boxSize','style','opacity']);
    this.bondProgram=this.createProgram(this.instancing?instancedBondVertex:bondVertex,bondFragment,
      this.instancing?[...INSTANCE_LAYOUT.map(([name])=>name),'corner']:BOND_LAYOUT.map(([name])=>name),
      [...CAMERA_UNIFORMS,'viewport','width','particleScale','opacity']);
    this.pointBuffer=gl.createBuffer();this.bondBuffer=gl.createBuffer();
    this.boundsBuffer=gl.createBuffer();this.nodeBuffer=gl.createBuffer();this.selectionBuffer=gl.createBuffer();
    if(this.instancing){
      this.cornerBuffer=gl.createBuffer();
      this.upload(this.cornerBuffer,new Float32Array([0,1,1,-1,0,-1,0,-1,1,-1,1,1]),12,gl.STATIC_DRAW);
    }
    this.boxSize=48;this.energyInput=0;this.energyGradient=0;
    this.species=DEFAULT_SPECIES;this.colors=DEFAULT_SPECIES.map(s=>hexColor(s.color,[.8,.65,.7]));
    this.showBonds=true;this.showBounds=true;this.autoRotate=false;
    this.viewMode='particles';this.colorMode='species';this.particleScale=.72;this.bondWidth=2.2;
    this.selectedId=null;this.onSelect=null;
    this.initializeGeometry();
    this.initializeCamera();this.makeBounds();
    this.pointers=new Map();
    canvas.addEventListener('pointerdown',event=>{
      if(![0,1,2].includes(event.button))return;
      event.preventDefault();canvas.focus({preventScroll:true});
      canvas.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,
        pan:event.button!==0||event.shiftKey,button:event.button,moved:false});
      if(this.pointers.size>1)for(const pointer of this.pointers.values())pointer.moved=true;
    });
    canvas.addEventListener('pointermove',event=>{
      const previous=this.pointers.get(event.pointerId);if(!previous)return;
      if(this.pointers.size===2){
        let other;for(const [id,pointer] of this.pointers)if(id!==event.pointerId)other=pointer;
        const before=Math.hypot(previous.x-other.x,previous.y-other.y),after=Math.hypot(event.clientX-other.x,event.clientY-other.y);
        this.panAndZoom((previous.x+other.x)/2,(previous.y+other.y)/2,
          (event.clientX+other.x)/2,(event.clientY+other.y)/2,before>1&&after>1?before/after:1);
      }else if(previous.pan||event.shiftKey){
        this.pan(event.clientX-previous.x,event.clientY-previous.y);
      }else{
        this.lookAround((event.clientX-previous.x)*.006,(event.clientY-previous.y)*.006);
      }
      previous.moved ||= Math.hypot(event.clientX-previous.startX,event.clientY-previous.startY)>5;
      previous.x=event.clientX;previous.y=event.clientY;
    });
    canvas.addEventListener('pointerup',event=>{
      const pointer=this.pointers.get(event.pointerId);
      if(pointer&&!pointer.moved&&!pointer.pan&&pointer.button===0)this.select(this.pick(event.clientX,event.clientY));
      this.pointers.delete(event.pointerId);
    });
    canvas.addEventListener('pointercancel',event=>{this.pointers.delete(event.pointerId);this.stopMovement();});
    canvas.addEventListener('lostpointercapture',event=>this.pointers.delete(event.pointerId));
    canvas.addEventListener('contextmenu',event=>event.preventDefault());
    canvas.addEventListener('wheel',event=>{
      event.preventDefault();
      const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1);
      this.zoom(this.distance*(Math.exp(Math.max(-2,Math.min(2,pixels*.0015)))-1));
    },{passive:false});
    canvas.addEventListener('keydown',event=>{
      if(event.ctrlKey||event.metaKey)return;
      const motion=MOVE_KEYS[event.code]||TURN_KEYS.has(event.key),modifier=event.key==='Shift'||event.key==='Alt';
      if(!motion&&!modifier&&!['+','=','-','Home','Escape','f','F'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      this.fastMove=event.shiftKey;this.precisionMove=event.altKey;
      if(motion)this.pressedKeys.add(event.code);
      if(event.key==='+'||event.key==='=')this.zoom(-this.distance*.15);if(event.key==='-')this.zoom(this.distance*.18);
      if(event.key==='Home')this.resetCamera();if(event.key.toLowerCase()==='f')this.focusSelected();
      if(event.key==='Escape'){this.select(null);this.stopMovement();}
    });
    canvas.addEventListener('keyup',event=>{this.pressedKeys.delete(event.code);this.fastMove=event.shiftKey;this.precisionMove=event.altKey;});
    canvas.addEventListener('blur',()=>this.stopMovement());
    window.addEventListener('blur',()=>{this.stopMovement();this.pointers.clear();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.stopMovement();this.pointers.clear();}});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
  }

  initializeGeometry(){
    this.frame=null;this.pointData=new Float32Array(0);this.bondData=new Float32Array(0);this.nodeData=new Float32Array(0);
    this.selectionData=new Float32Array(7);this.parents=new Int32Array(0);this.degrees=new Uint32Array(0);this.clusterPalette=[];
    this.nodeIds=new Uint32Array(0);this.bondIndices=new Uint32Array(0);this.bondCount=0;
    this.pointCount=0;this.bondVertexCount=0;this.nodeCount=0;this.appearanceDirty=false;
    this.pointsStale=true;this.nodesStale=true;this.bondsStale=true;this.pointsComplete=false;
    this.pointsUpload=false;this.nodesUpload=false;this.bondsUpload=false;
    this.topologyCheckPending=true;this.topologyValid=false;this.clustersDirty=true;
  }

  initializeCamera(){
    this.target=[0,0,0];this.nearPlane=.03;this.cameraMode='orbit';this.movementSpeed=1;
    this.movementActions=new Set();this.pressedKeys=new Set();this.onCameraChange=null;
    this.maxPointSize ??= 512;
    this.resetCamera();
  }

  createProgram(vertex,fragment,attributes,uniforms) {
    const gl=this.gl,program=gl.createProgram();
    for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
        const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);gl.deleteProgram(program);
        throw new Error(`The 3D renderer could not compile: ${message}`);
      }
      gl.attachShader(program,shader);gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){gl.deleteProgram(program);throw new Error('The 3D renderer could not initialize.');}
    const attributeLocations=Object.fromEntries(attributes.map(name=>[name,gl.getAttribLocation(program,name)]));
    return {program,attributes:attributeLocations,enabledAttributes:Object.values(attributeLocations),
      uniforms:Object.fromEntries(uniforms.map(name=>[name,gl.getUniformLocation(program,name)]))};
  }

  setSettings(settings) {
    if(Array.isArray(settings.species)&&settings.species.length){
      // Copy visual properties: the controls can edit their model in place.
      this.species=settings.species.map(s=>({color:s.color,radius:Number(s.radius)||.6,name:s.name}));
      this.colors=this.species.map((s,i)=>hexColor(s.color,hexColor(DEFAULT_SPECIES[i%DEFAULT_SPECIES.length].color,[.8,.65,.7])));
    }
    const box=Number(settings.boxSize),wasDriven=this.energyGradient>0&&this.energyInput>0;
    let boundsChanged=false;
    if(Number.isFinite(box)&&box>0&&box!==this.boxSize){
      const ratio=box/this.boxSize;
      this.distance=Math.max(.05,this.distance*ratio);
      for(let i=0;i<3;i++)this.target[i]*=ratio;
      this.boxSize=box;boundsChanged=true;
    }
    for(const key of ['energyInput','energyGradient'])if(Number.isFinite(settings[key]))this[key]=settings[key];
    if(boundsChanged||wasDriven!==(this.energyGradient>0&&this.energyInput>0))this.makeBounds();
    this.appearanceDirty=true;
  }

  resetCamera(){
    this.target.fill(0);this.yaw=-.36;this.pitch=.23;this.distance=this.boxSize*1.855;
    this.cameraMode='orbit';this.autoRotate=false;this.stopMovement();this.onCameraChange?.();
  }
  cameraBasis(){
    const cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),cx=Math.cos(this.pitch),sx=Math.sin(this.pitch);
    return {right:[cy,0,sy],up:[sy*sx,cx,-cy*sx],forward:[sy*cx,-sx,-cy*cx]};
  }
  cameraEye(){
    const sy=Math.sin(this.yaw),cy=Math.cos(this.yaw),sx=Math.sin(this.pitch),cx=Math.cos(this.pitch);
    return [this.target[0]-sy*cx*this.distance,this.target[1]+sx*this.distance,this.target[2]+cy*cx*this.distance];
  }
  projectionScale(aspect){return 1.95*Math.min(1,aspect);}
  farPlane(){return Math.max(this.distance+this.boxSize*4,Math.hypot(...this.cameraEye())+this.boxSize*2);}
  projectPoint(position,rect=this.canvas.getBoundingClientRect()){
    const aspect=rect.width/rect.height,focal=this.projectionScale(aspect);
    const x=position[0]-this.target[0],y=position[1]-this.target[1],z=position[2]-this.target[2];
    const cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),cx=Math.cos(this.pitch),sx=Math.sin(this.pitch);
    const rx=cy*x+sy*z,rz=-sy*x+cy*z,ry=cx*y-sx*rz,depth=this.distance-(sx*y+cx*rz);
    const nx=rx*focal/aspect/depth,ny=ry*focal/depth;
    return {x:rect.left+(nx+1)*rect.width/2,y:rect.top+(1-ny)*rect.height/2,depth,
      visible:depth>=this.nearPlane&&depth<=this.farPlane()&&Math.abs(nx)<=1&&Math.abs(ny)<=1};
  }
  projectedPointSize(radius,depth,scale=this.particleScale,rect=this.canvas.getBoundingClientRect()){
    const ratio=this.canvas.height/Math.max(1,rect.height),focal=this.projectionScale(rect.width/rect.height);
    return Math.max(2,Math.min(this.maxPointSize,this.canvas.height*focal*radius*scale/Math.max(this.nearPlane,depth)))/ratio;
  }
  interruptAutoRotation(){
    if(this.autoRotate){this.autoRotate=false;this.onCameraChange?.();}
  }
  setCameraMode(mode){
    if(!['orbit','fly'].includes(mode))return false;
    if(mode!==this.cameraMode){this.cameraMode=mode;this.autoRotate=false;this.onCameraChange?.();}
    return true;
  }
  lookAround(yaw,pitch,manual=true){
    if(manual)this.interruptAutoRotation();
    const eye=this.cameraMode==='fly'?this.cameraEye():null;
    this.yaw+=yaw;this.pitch=Math.max(-Math.PI/2+.01,Math.min(Math.PI/2-.01,this.pitch+pitch));
    if(eye){
      const forward=this.cameraBasis().forward;
      for(let i=0;i<3;i++)this.target[i]=eye[i]+forward[i]*this.distance;
    }
  }
  zoom(delta){
    if(!Number.isFinite(delta))return;
    this.interruptAutoRotation();this.distance=Math.max(.05,Math.min(this.boxSize*8,this.distance+delta));
  }
  pan(dx,dy){
    if(!dx&&!dy)return;
    this.interruptAutoRotation();
    const rect=this.canvas.getBoundingClientRect(),basis=this.cameraBasis();
    const units=2*this.distance/(Math.max(1,rect.height)*this.projectionScale(rect.width/Math.max(1,rect.height)));
    for(let i=0;i<3;i++)this.target[i]+=(-basis.right[i]*dx+basis.up[i]*dy)*units;
  }
  panAndZoom(fromX,fromY,toX,toY,ratio){
    const rect=this.canvas.getBoundingClientRect(),basis=this.cameraBasis(),before=this.distance;
    this.zoom(before*(ratio-1));
    const units=2/(Math.max(1,rect.height)*this.projectionScale(rect.width/Math.max(1,rect.height)));
    const centerX=rect.left+rect.width/2,centerY=rect.top+rect.height/2;
    // Keep the world point under the gesture centroid fixed as its scale and
    // position change. This also prevents drift when touch events arrive singly.
    const x=((fromX-centerX)*before-(toX-centerX)*this.distance)*units;
    const y=((toY-centerY)*this.distance-(fromY-centerY)*before)*units;
    for(let i=0;i<3;i++)this.target[i]+=basis.right[i]*x+basis.up[i]*y;
  }
  startMovement(action){if(MOVE_ACTIONS.has(action))this.movementActions.add(action);}
  stopMovement(action){
    if(action!==undefined){this.movementActions.delete(action);return;}
    this.movementActions.clear();this.pressedKeys.clear();this.fastMove=false;this.precisionMove=false;
  }
  updateCamera(dt){
    if(!Number.isFinite(dt)||dt<=0)return;
    const keys=this.pressedKeys;
    const yaw=(Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')))*dt*1.4;
    const pitch=(Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp')))*dt*1.4;
    if(yaw||pitch)this.lookAround(yaw,pitch);
    const active=action=>this.movementActions.has(action)||keys.has(MOVE_CODES[action]);
    const forward=Number(active('forward'))-Number(active('back')),side=Number(active('right'))-Number(active('left')),up=Number(active('up'))-Number(active('down'));
    if(forward||side||up){
      this.interruptAutoRotation();
      const basis=this.cameraBasis(),direction=basis.forward.map((value,i)=>value*forward+basis.right[i]*side+(i===1?up:0));
      const length=Math.hypot(...direction);
      const base=Math.max(.25,Math.min(this.boxSize*.2,this.distance*.6));
      const speed=base*Math.max(0,Number.isFinite(this.movementSpeed)?this.movementSpeed:1)*(this.fastMove?4:1)*(this.precisionMove?.25:1);
      if(length)for(let i=0;i<3;i++)this.target[i]+=direction[i]*speed*dt/length;
    }
    if(this.autoRotate)this.lookAround(dt*.08,0,false);
  }
  focusSelected(){
    const id=this.selectedId;
    if(!Number.isInteger(id)||!this.frame||id<0||id>=this.frame.types.length)return false;
    for(let i=0;i<3;i++)this.target[i]=this.frame.positions[id*3+i];
    const radius=this.species[this.frame.types[id]]?.radius||.6;
    this.distance=Math.max(.5,radius*this.particleScale*8);this.autoRotate=false;this.stopMovement();this.onCameraChange?.();
    return true;
  }
  resize(){
    const dpr=Math.min(globalThis.devicePixelRatio||1,2);
    const width=Math.max(1,Math.round(this.canvas.clientWidth*dpr)),height=Math.max(1,Math.round(this.canvas.clientHeight*dpr));
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
  }

  makeBounds(){
    const data=[],half=this.boxSize/2;
    const driven=this.energyGradient>0&&this.energyInput>0;
    const wallColor=(a,b,neutral)=>driven&&a[0]===b[0]
      ? a[0]===half?[1,.64,.24]:a[0]===-half?[.31,.65,1]:neutral
      : neutral;
    const add=(a,b,color)=>data.push(...a,...color,0,...b,...color,0);
    for(let axis=0;axis<3;axis++)for(const s of [-half,half])for(const t of [-half,half]){
      const a=[s,t,-half],b=[s,t,half];
      if(axis===0){a.reverse();b.reverse();}
      if(axis===1){[a[1],a[2]]=[a[2],a[1]];[b[1],b[2]]=[b[2],b[1]];}
      add(a,b,wallColor(a,b,[.43,.46,.57]));
    }
    for(let i=0;i<=8;i++){
      const at=-half+this.boxSize*i/8;
      const a=[at,-half,-half],b=[at,-half,half];
      add(a,b,wallColor(a,b,[.27,.3,.39]));
      add([-half,-half,at],[half,-half,at],[.27,.3,.39]);
    }
    this.boundData=new Float32Array(data);this.boundsDirty=true;
  }

  update(frame){
    this.frame=frame;this.appearanceDirty=true;this.topologyCheckPending=true;
    if(this.selectedId!==null&&this.selectedId>=frame.types.length)this.select(null);
  }

  root(id){
    let current=id;
    while(this.parents[current]!==current){this.parents[current]=this.parents[this.parents[current]];current=this.parents[current];}
    return current;
  }

  ensureTopology(){
    if(!this.topologyCheckPending&&this.topologyValid)return;
    const frame=this.frame,n=frame.types.length,bonds=frame.bonds||[];
    const versioned=Number.isSafeInteger(frame.generation)&&Number.isSafeInteger(frame.topologyVersion);
    let same=this.topologyValid&&this.topologyParticles===n&&this.topologyInputLength===bonds.length;
    if(versioned)same&&=this.topologyGeneration===frame.generation&&this.topologyVersion===frame.topologyVersion;
    else if(same){
      same=this.bondCount*2===bonds.length;
      for(let i=0;same&&i<bonds.length;i++)same=this.bondIndices[i]===bonds[i];
    }
    this.topologyCheckPending=false;
    if(same)return;
    if(this.degrees.length<n){this.degrees=new Uint32Array(n);this.nodeIds=new Uint32Array(n);}
    if(this.bondIndices.length<bonds.length)this.bondIndices=new Uint32Array(bonds.length);
    this.degrees.fill(0,0,n);
    let count=0;
    for(let i=0;i+1<bonds.length;i+=2){
      const a=bonds[i],b=bonds[i+1];if(a<0||b<0||a>=n||b>=n)continue;
      this.bondIndices[count*2]=a;this.bondIndices[count*2+1]=b;count++;
      this.degrees[a]++;this.degrees[b]++;
    }
    let nodes=0;
    for(let i=0;i<n;i++)if(this.degrees[i])this.nodeIds[nodes++]=i;
    this.bondCount=count;this.nodeCount=nodes;this.bondVertexCount=count*6;
    this.topologyParticles=n;this.topologyInputLength=bonds.length;
    this.topologyGeneration=versioned?frame.generation:undefined;this.topologyVersion=versioned?frame.topologyVersion:undefined;
    this.topologyValid=true;this.clustersDirty=true;this.nodesStale=true;this.bondsStale=true;
  }

  ensureClusters(){
    if(!this.clustersDirty)return;
    const n=this.frame.types.length;
    if(this.parents.length<n)this.parents=new Int32Array(n);
    for(let i=0;i<n;i++)this.parents[i]=i;
    for(let i=0;i<this.bondCount*2;i+=2){
      const a=this.root(this.bondIndices[i]),b=this.root(this.bondIndices[i+1]);
      if(a!==b)this.parents[Math.max(a,b)]=Math.min(a,b);
    }
    for(let i=0;i<this.nodeCount;i++)this.root(this.nodeIds[i]);
    this.clustersDirty=false;
  }

  writePoint(data,offset,i){
    const frame=this.frame,p=i*3,type=frame.types[i],color=this.colors[type]||this.colors[0];
    data[offset]=frame.positions[p];data[offset+1]=frame.positions[p+1];data[offset+2]=frame.positions[p+2];
    let r=color[0],g=color[1],b=color[2];
    if(this.colorMode==='energy'){
      const t=Math.max(0,Math.min(1,(frame.energies?.[i]||0)/10));
      // Blue through violet/coral to amber; interpolation never crosses green.
      r=.4+.58*Math.min(1,t*1.5);g=.48-.2*Math.sin(t*Math.PI)+.2*t;b=.96-.67*t;
    }else if(this.colorMode==='cluster'){
      const root=this.parents[i],tint=this.degrees[i]?(this.clusterPalette[root] ||= clusterColor(root)):UNBONDED_COLOR;
      r=tint[0];g=tint[1];b=tint[2];
    }
    data[offset+3]=r;data[offset+4]=g;data[offset+5]=b;data[offset+6]=this.species[type]?.radius||.6;
  }

  prepareBonds(){
    const stride=this.instancing?14:66,needed=this.bondCount*stride;
    if(this.bondData.length<needed)this.bondData=new Float32Array(Math.max(needed,Math.ceil(this.bondData.length*1.5)));
    const data=this.bondData,points=this.pointData;
    let at=0;
    if(this.instancing){
      // Two endpoints, two colors and two radii per bond. A static six-vertex
      // ribbon supplies corners on the GPU instead of duplicating these values.
      for(let i=0;i<this.bondCount*2;i+=2){
        const a=this.bondIndices[i]*7,b=this.bondIndices[i+1]*7;
        for(let k=0;k<3;k++)data[at++]=points[a+k];
        for(let k=0;k<3;k++)data[at++]=points[b+k];
        for(let k=3;k<6;k++)data[at++]=points[a+k]*.65+.35;
        for(let k=3;k<6;k++)data[at++]=points[b+k]*.65+.35;
        data[at++]=points[a+6];data[at++]=points[b+6];
      }
    }else{
      const vertex=(from,to,side)=>{
        const a=from*7,b=to*7;
        for(let k=0;k<3;k++)data[at++]=points[a+k];
        for(let k=0;k<3;k++)data[at++]=points[b+k];
        for(let k=3;k<6;k++)data[at++]=points[a+k]*.65+.35;
        data[at++]=points[a+6];data[at++]=side;
      };
      for(let i=0;i<this.bondCount*2;i+=2){
        const a=this.bondIndices[i],b=this.bondIndices[i+1];
        vertex(a,b,1);vertex(b,a,-1);vertex(a,b,-1);
        vertex(a,b,-1);vertex(b,a,-1);vertex(b,a,1);
      }
    }
    this.bondDataLength=at;this.bondsStale=false;this.bondsUpload=true;
  }

  updateAppearance(){
    const frame=this.frame;if(!frame)return;
    const n=frame.types.length,particles=this.viewMode!=='bonds';
    if(this.appearanceDirty||this.renderColorMode!==this.colorMode){
      this.pointsStale=true;this.pointsComplete=false;this.nodesStale=true;this.bondsStale=true;
    }
    if(!particles||this.showBonds||this.colorMode==='cluster')this.ensureTopology();
    if(this.colorMode==='cluster')this.ensureClusters();
    if(this.pointsStale||(particles&&!this.pointsComplete)){
      if(this.pointData.length<n*7)this.pointData=new Float32Array(Math.max(n*7,Math.ceil(this.pointData.length*1.5)));
      if(particles){
        for(let i=0;i<n;i++)this.writePoint(this.pointData,i*7,i);
        this.pointsComplete=true;this.pointsUpload=true;
      }else{
        for(let at=0;at<this.nodeCount;at++){
          const i=this.nodeIds[at];this.writePoint(this.pointData,i*7,i);
        }
      }
      this.pointsStale=false;
    }
    if(!particles&&this.nodesStale){
      const needed=this.nodeCount*7;
      if(this.nodeData.length<needed)this.nodeData=new Float32Array(Math.max(needed,Math.ceil(this.nodeData.length*1.5)));
      for(let at=0;at<this.nodeCount;at++){
        const from=this.nodeIds[at]*7,to=at*7;
        for(let k=0;k<7;k++)this.nodeData[to+k]=this.pointData[from+k];
      }
      this.nodesStale=false;this.nodesUpload=true;
    }
    if(this.showBonds&&this.bondsStale)this.prepareBonds();
    this.pointCount=n;this.renderColorMode=this.colorMode;this.renderViewMode=this.viewMode;this.appearanceDirty=false;
  }

  select(id){
    const next=Number.isInteger(id)&&id>=0&&this.frame&&id<this.frame.types.length?id:null;
    if(this.selectedId===next)return;
    this.selectedId=next;this.onSelect?.(next);
  }

  pick(clientX,clientY){
    if(!this.frame)return null;
    if(this.viewMode==='bonds')this.ensureTopology();
    const rect=this.canvas.getBoundingClientRect(),aspect=rect.width/rect.height;
    const distance=this.distance,focal=this.projectionScale(aspect),far=this.farPlane();
    const cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),cx=Math.cos(this.pitch),sx=Math.sin(this.pitch),target=this.target;
    const pixelRatio=this.canvas.height/Math.max(1,rect.height),scale=this.particleScale*(this.viewMode==='bonds'?.33:1);
    let picked=null,nearestDepth=Infinity;
    for(let i=0;i<this.frame.types.length;i++){
      if(this.viewMode==='bonds'&&!this.degrees[i])continue;
      const p=i*3,x=this.frame.positions[p]-target[0],y=this.frame.positions[p+1]-target[1],z=this.frame.positions[p+2]-target[2];
      const rx=cy*x+sy*z,rz=-sy*x+cy*z,ry=cx*y-sx*rz,depth=distance-(sx*y+cx*rz);
      if(depth<this.nearPlane||depth>far||depth>=nearestDepth)continue;
      const nx=rx*focal/aspect/depth,ny=ry*focal/depth;
      if(Math.abs(nx)>1||Math.abs(ny)>1)continue;
      const px=rect.left+(nx+1)*rect.width/2,py=rect.top+(1-ny)*rect.height/2;
      const size=Math.max(2,Math.min(this.maxPointSize,this.canvas.height*focal*(this.species[this.frame.types[i]]?.radius||.6)*scale/depth))/pixelRatio;
      const hitRadius=Math.max(7,size/2+3);
      if((px-clientX)**2+(py-clientY)**2<=hitRadius**2){picked=i;nearestDepth=depth;}
    }
    return picked;
  }

  upload(buffer,data,length=data.length,usage=this.gl.DYNAMIC_DRAW){
    if(!length)return;
    const gl=this.gl,bytes=length*data.BYTES_PER_ELEMENT,capacity=this.bufferCapacities.get(buffer)||0;
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    if(capacity<bytes){
      const next=Math.max(bytes,Math.ceil(capacity*1.5/4)*4);
      gl.bufferData(gl.ARRAY_BUFFER,next,usage);this.bufferCapacities.set(buffer,next);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER,0,length===data.length?data:data.subarray(0,length));
  }

  enableAttributes(program){
    const gl=this.gl;
    for(let i=0;i<this.maxAttributes;i++){
      if(program.enabledAttributes.includes(i))gl.enableVertexAttribArray(i);else gl.disableVertexAttribArray(i);
      // Divisors are global WebGL state; a point draw following a ribbon draw
      // must return every attribute to per-vertex addressing.
      if(this.instancing)this.instancing.vertexAttribDivisorANGLE(i,0);
    }
  }

  useCamera(program,aspect,distance){
    const gl=this.gl,u=program.uniforms;
    gl.useProgram(program.program);
    gl.uniform2f(u.angles,this.yaw,this.pitch);gl.uniform3f(u.target,...this.target);
    gl.uniform1f(u.distance,distance);gl.uniform1f(u.aspect,aspect);gl.uniform1f(u.nearPlane,this.nearPlane);gl.uniform1f(u.farPlane,this.farPlane());
    gl.uniform1f(u.focalLength,this.projectionScale(aspect));gl.uniform1f(u.maxPointSize,this.maxPointSize);
  }

  draw(dt){
    const gl=this.gl;if(gl.isContextLost())return;
    this.updateCamera(dt);
    if(this.appearanceDirty||this.renderColorMode!==this.colorMode||this.renderViewMode!==this.viewMode||(this.showBonds&&this.bondsStale))this.updateAppearance();
    if(this.viewMode==='bonds'){
      if(this.nodesUpload){this.upload(this.nodeBuffer,this.nodeData,this.nodeCount*7);this.nodesUpload=false;}
    }else if(this.pointsUpload){this.upload(this.pointBuffer,this.pointData,this.pointCount*7);this.pointsUpload=false;}
    if(this.showBonds&&this.bondsUpload){this.upload(this.bondBuffer,this.bondData,this.bondDataLength);this.bondsUpload=false;}
    if(this.showBounds&&this.boundsDirty){this.upload(this.boundsBuffer,this.boundData);this.boundsDirty=false;}
    const width=this.canvas.width,height=this.canvas.height,aspect=width/height,distance=this.distance;
    const pixelRatio=height/Math.max(1,this.canvas.clientHeight);
    gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    const point=(buffer,count,style,opacity,scale=this.particleScale,extraPixels=0)=>{
      if(!count)return;
      const program=this.pointProgram,a=program.attributes,u=program.uniforms;
      this.useCamera(program,aspect,distance);this.enableAttributes(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      for(const [name,size,offset] of POINT_LAYOUT){
        gl.vertexAttribPointer(a[name],size,gl.FLOAT,false,28,offset);
      }
      gl.uniform1f(u.resolution,height);gl.uniform1f(u.boxSize,this.boxSize);gl.uniform1f(u.particleScale,scale);gl.uniform1f(u.extraPixels,extraPixels);
      gl.uniform1i(u.style,style);gl.uniform1f(u.opacity,opacity);gl.drawArrays(style===0?gl.LINES:gl.POINTS,0,count);
    };
    gl.depthMask(false);
    if(this.showBounds)point(this.boundsBuffer,this.boundData.length/7,0,.4);
    gl.depthMask(true);
    if(this.viewMode==='bonds')point(this.nodeBuffer,this.nodeCount,1,.95,this.particleScale*.33);
    else point(this.pointBuffer,this.pointCount,1,1);
    gl.depthMask(false);
    if(this.showBonds&&this.bondVertexCount){
      const program=this.bondProgram,a=program.attributes,u=program.uniforms;
      this.useCamera(program,aspect,distance);this.enableAttributes(program);gl.bindBuffer(gl.ARRAY_BUFFER,this.bondBuffer);
      if(this.instancing){
        for(const [name,size,offset] of INSTANCE_LAYOUT){
          gl.vertexAttribPointer(a[name],size,gl.FLOAT,false,56,offset);this.instancing.vertexAttribDivisorANGLE(a[name],1);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER,this.cornerBuffer);gl.vertexAttribPointer(a.corner,2,gl.FLOAT,false,8,0);
      }else{
        for(const [name,size,offset] of BOND_LAYOUT)gl.vertexAttribPointer(a[name],size,gl.FLOAT,false,44,offset);
      }
      const drawBonds=()=>this.instancing?this.instancing.drawArraysInstancedANGLE(gl.TRIANGLES,0,6,this.bondCount):gl.drawArrays(gl.TRIANGLES,0,this.bondVertexCount);
      gl.uniform2f(u.viewport,width,height);
      gl.uniform1f(u.particleScale,this.particleScale*(this.viewMode==='bonds'?.33:1));
      gl.uniform1f(u.width,Math.max(.7,this.bondWidth)*pixelRatio*2.2);gl.uniform1f(u.opacity,.13);drawBonds();
      gl.uniform1f(u.width,Math.max(.7,this.bondWidth)*pixelRatio);gl.uniform1f(u.opacity,.98);drawBonds();
    }
    gl.depthMask(true);
    if(Number.isInteger(this.selectedId)&&this.selectedId>=0&&this.selectedId<this.pointCount){
      this.writePoint(this.selectionData,0,this.selectedId);
      this.upload(this.selectionBuffer,this.selectionData);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
      point(this.selectionBuffer,1,2,1,this.particleScale,12*pixelRatio);gl.depthMask(true);
    }
  }
}
