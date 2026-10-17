const DEFAULT_SPECIES = [
  { color: '#f28b82', radius: .6 },
  { color: '#8aaaf5', radius: .55 },
  { color: '#c2a2ed', radius: .65 },
];
const UNBONDED_COLOR=[.39,.41,.47];
const POINT_LAYOUT=[['position',3,0],['color',3,12],['radius',1,24]];
const BOND_LAYOUT=[['position',3,0],['other',3,12],['color',3,24],['radius',1,36],['side',1,40]];

// Both programs use the same camera so picking, spheres and ribbons stay aligned.
const projection = `
uniform vec2 angles;
uniform float distance;
uniform float aspect;
uniform float farPlane;
vec3 cameraPosition(vec3 p){
  float cy=cos(angles.x),sy=sin(angles.x),cx=cos(angles.y),sx=sin(angles.y);
  p=vec3(cy*p.x+sy*p.z,p.y,-sy*p.x+cy*p.z);
  return vec3(p.x,cx*p.y-sx*p.z,sx*p.y+cx*p.z);
}
vec4 project(vec3 p){
  float depth=distance-p.z;
  return vec4(p.x*1.95/aspect,p.y*1.95,
    (farPlane+1.0)/(farPlane-1.0)*depth-2.0*farPlane/(farPlane-1.0),depth);
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
  gl_PointSize=clamp(resolution*1.95*radius*particleScale/max(1.0,distance-p.z),2.0,90.0)+extraPixels;
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
const bondVertex = `
attribute vec3 position;
attribute vec3 other;
attribute vec3 color;
attribute float radius;
attribute float side;
uniform vec2 viewport;
uniform float width;
uniform float particleScale;
varying vec3 tint;
${projection}
void main(){
  vec4 a=project(cameraPosition(position)),b=project(cameraPosition(other));
  vec2 delta=(b.xy/max(1.0,b.w)-a.xy/max(1.0,a.w))*viewport;
  float span=max(.0001,length(delta));
  vec2 normal=vec2(-delta.y,delta.x)/span;
  // End the bond at the visible particle surface instead of painting a stripe
  // across its center. Short projected bonds retain a small visible segment.
  float inset=min(span*.21,viewport.y*1.95*radius*particleScale/max(1.0,a.w)*.47);
  a.xy+=delta/span*inset*2.0/viewport*a.w;
  // WebGL line widths are commonly fixed to 1px. These triangles have an
  // explicit screen-space width, including on high density displays.
  a.xy+=normal*side*width/viewport*a.w;
  gl_Position=a;
  tint=color;
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
    this.pointProgram=this.createProgram(pointVertex,pointFragment,
      ['position','color','radius'],['angles','distance','aspect','farPlane','resolution','particleScale','extraPixels','boxSize','style','opacity']);
    this.bondProgram=this.createProgram(bondVertex,bondFragment,
      ['position','other','color','radius','side'],['angles','distance','aspect','farPlane','viewport','width','particleScale','opacity']);
    this.pointBuffer=gl.createBuffer();this.bondBuffer=gl.createBuffer();
    this.boundsBuffer=gl.createBuffer();this.nodeBuffer=gl.createBuffer();this.selectionBuffer=gl.createBuffer();
    this.boxSize=48;this.energyInput=0;this.energyGradient=0;
    this.species=DEFAULT_SPECIES;this.colors=DEFAULT_SPECIES.map(s=>hexColor(s.color,[.8,.65,.7]));
    this.showBonds=true;this.showBounds=true;this.autoRotate=false;
    this.viewMode='particles';this.colorMode='species';this.particleScale=.72;this.bondWidth=2.2;
    this.selectedId=null;this.onSelect=null;
    this.frame=null;this.pointData=new Float32Array(0);this.bondData=new Float32Array(0);this.nodeData=new Float32Array(0);
    this.selectionData=new Float32Array(7);this.parents=new Int32Array(0);this.degrees=new Uint16Array(0);this.clusterPalette=[];
    this.pointCount=0;this.bondVertexCount=0;this.nodeCount=0;this.appearanceDirty=false;this.geometryDirty=false;
    this.resetCamera();this.makeBounds();
    this.pointers=new Map();
    canvas.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      canvas.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false});
      if(this.pointers.size>1)for(const pointer of this.pointers.values())pointer.moved=true;
    });
    canvas.addEventListener('pointermove',event=>{
      const previous=this.pointers.get(event.pointerId);if(!previous)return;
      if(this.pointers.size===2){
        let other;for(const [id,pointer] of this.pointers)if(id!==event.pointerId)other=pointer;
        const before=Math.hypot(previous.x-other.x,previous.y-other.y),after=Math.hypot(event.clientX-other.x,event.clientY-other.y);
        this.zoom((before-after)*this.boxSize/400);
      }else{
        this.yaw+=(event.clientX-previous.x)*.006;
        this.pitch=Math.max(-1.45,Math.min(1.45,this.pitch+(event.clientY-previous.y)*.006));
      }
      previous.moved ||= Math.hypot(event.clientX-previous.startX,event.clientY-previous.startY)>5;
      previous.x=event.clientX;previous.y=event.clientY;
    });
    canvas.addEventListener('pointerup',event=>{
      const pointer=this.pointers.get(event.pointerId);
      if(pointer&&!pointer.moved)this.select(this.pick(event.clientX,event.clientY));
      this.pointers.delete(event.pointerId);
    });
    for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>this.pointers.delete(event.pointerId));
    canvas.addEventListener('wheel',event=>{event.preventDefault();this.zoom(event.deltaY*this.boxSize/1200);},{passive:false});
    canvas.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home','Escape'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      if(event.key==='ArrowLeft')this.yaw-=.1;if(event.key==='ArrowRight')this.yaw+=.1;
      if(event.key==='ArrowUp')this.pitch=Math.max(-1.45,this.pitch-.1);if(event.key==='ArrowDown')this.pitch=Math.min(1.45,this.pitch+.1);
      if(event.key==='+'||event.key==='=')this.zoom(-this.boxSize/12);if(event.key==='-')this.zoom(this.boxSize/12);
      if(event.key==='Home')this.resetCamera();if(event.key==='Escape')this.select(null);
    });
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
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
      this.distance*=box/this.boxSize;this.boxSize=box;boundsChanged=true;
    }
    for(const key of ['energyInput','energyGradient'])if(Number.isFinite(settings[key]))this[key]=settings[key];
    if(boundsChanged||wasDriven!==(this.energyGradient>0&&this.energyInput>0))this.makeBounds();
    this.appearanceDirty=true;
  }

  resetCamera(){this.yaw=-.36;this.pitch=.23;this.distance=this.boxSize*1.855;}
  zoom(delta){this.distance=Math.max(this.boxSize*1.05,Math.min(this.boxSize*4.5,this.distance+delta));}
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
    this.frame=frame;this.appearanceDirty=true;
    if(this.selectedId!==null&&this.selectedId>=frame.types.length)this.select(null);
  }

  root(id){
    let current=id;
    while(this.parents[current]!==current){this.parents[current]=this.parents[this.parents[current]];current=this.parents[current];}
    return current;
  }

  updateAppearance(){
    const frame=this.frame;if(!frame)return;
    const n=frame.types.length,positions=frame.positions,bonds=frame.bonds||[];
    if(this.pointData.length<n*7){this.pointData=new Float32Array(n*7);this.nodeData=new Float32Array(n*7);}
    if(this.parents.length<n){this.parents=new Int32Array(n);this.degrees=new Uint16Array(n);}
    this.degrees.fill(0,0,n);
    for(let i=0;i<n;i++)this.parents[i]=i;
    for(let b=0;b+1<bonds.length;b+=2){
      const a=bonds[b],c=bonds[b+1];if(a>=n||c>=n)continue;
      this.degrees[a]++;this.degrees[c]++;
      if(this.colorMode==='cluster'){
        const rootA=this.root(a),rootB=this.root(c);
        if(rootA!==rootB)this.parents[Math.max(rootA,rootB)]=Math.min(rootA,rootB);
      }
    }
    let nodes=0;
    for(let i=0;i<n;i++){
      const offset=i*7,type=frame.types[i],color=this.colors[type]||this.colors[0];
      this.pointData[offset]=positions[i*3];this.pointData[offset+1]=positions[i*3+1];this.pointData[offset+2]=positions[i*3+2];
      let r=color[0],g=color[1],b=color[2];
      if(this.colorMode==='energy'){
        const t=Math.max(0,Math.min(1,(frame.energies?.[i]||0)/10));
        // Blue through violet/coral to amber; interpolation never crosses green.
        r=.4+.58*Math.min(1,t*1.5);g=.48-.2*Math.sin(t*Math.PI)+.2*t;b=.96-.67*t;
      }else if(this.colorMode==='cluster'){
        const root=this.root(i),tint=this.degrees[i]?(this.clusterPalette[root] ||= clusterColor(root)):UNBONDED_COLOR;
        [r,g,b]=tint;
      }
      this.pointData[offset+3]=r;this.pointData[offset+4]=g;this.pointData[offset+5]=b;
      this.pointData[offset+6]=this.species[type]?.radius||.6;
      if(this.degrees[i]){
        const to=nodes++*7;
        for(let j=0;j<7;j++)this.nodeData[to+j]=this.pointData[offset+j];
      }
    }
    const needed=Math.floor(bonds.length/2)*66;
    if(this.bondData.length<needed)this.bondData=new Float32Array(Math.max(needed,Math.ceil(this.bondData.length*1.5)));
    let at=0;
    const vertex=(from,to,side)=>{
      const p=from*3,q=to*3,c=from*7+3;
      this.bondData[at++]=positions[p];this.bondData[at++]=positions[p+1];this.bondData[at++]=positions[p+2];
      this.bondData[at++]=positions[q];this.bondData[at++]=positions[q+1];this.bondData[at++]=positions[q+2];
      // A lighter bond remains recognizable between shaded particle surfaces.
      this.bondData[at++]=this.pointData[c]*.65+.35;this.bondData[at++]=this.pointData[c+1]*.65+.35;this.bondData[at++]=this.pointData[c+2]*.65+.35;
      this.bondData[at++]=this.pointData[from*7+6];
      this.bondData[at++]=side;
    };
    for(let i=0;i+1<bonds.length;i+=2){
      const a=bonds[i],b=bonds[i+1];if(a>=n||b>=n)continue;
      // Each endpoint points toward its partner, so its side reverses at B.
      vertex(a,b,1);vertex(b,a,-1);vertex(a,b,-1);
      vertex(a,b,-1);vertex(b,a,-1);vertex(b,a,1);
    }
    this.pointCount=n;this.nodeCount=nodes;this.bondVertexCount=at/11;
    this.renderColorMode=this.colorMode;this.appearanceDirty=false;this.geometryDirty=true;
  }

  select(id){
    const next=Number.isInteger(id)&&id>=0&&this.frame&&id<this.frame.types.length?id:null;
    if(this.selectedId===next)return;
    this.selectedId=next;this.onSelect?.(next);
  }

  pick(clientX,clientY){
    if(!this.frame)return null;
    if(this.appearanceDirty||this.renderColorMode!==this.colorMode)this.updateAppearance();
    const rect=this.canvas.getBoundingClientRect(),aspect=rect.width/rect.height;
    const distance=this.distance*Math.max(1,1/aspect),cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),cx=Math.cos(this.pitch),sx=Math.sin(this.pitch);
    let picked=null,nearestDepth=Infinity;
    for(let i=0;i<this.frame.types.length;i++){
      if(this.viewMode==='bonds'&&!this.degrees[i])continue;
      const p=i*3,x=this.frame.positions[p],y=this.frame.positions[p+1],z=this.frame.positions[p+2];
      const rx=cy*x+sy*z,rz=-sy*x+cy*z,ry=cx*y-sx*rz,depth=distance-(sx*y+cx*rz);
      if(depth<=1||depth>=nearestDepth)continue;
      const px=rect.left+(rx*1.95/aspect/depth+1)*rect.width/2,py=rect.top+(1-ry*1.95/depth)*rect.height/2;
      const size=rect.height*1.95*(this.species[this.frame.types[i]]?.radius||.6)*this.particleScale/depth;
      const hitRadius=Math.max(7,size/2+3);
      if((px-clientX)**2+(py-clientY)**2<=hitRadius**2){picked=i;nearestDepth=depth;}
    }
    return picked;
  }

  upload(buffer,data){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);}

  useCamera(program,aspect,distance){
    const gl=this.gl,u=program.uniforms;
    gl.useProgram(program.program);
    gl.uniform2f(u.angles,this.yaw,this.pitch);gl.uniform1f(u.distance,distance);gl.uniform1f(u.aspect,aspect);gl.uniform1f(u.farPlane,distance+this.boxSize*4);
  }

  draw(dt){
    const gl=this.gl;if(gl.isContextLost())return;
    if(this.autoRotate)this.yaw+=dt*.08;
    if(this.appearanceDirty||this.renderColorMode!==this.colorMode)this.updateAppearance();
    if(this.geometryDirty){
      this.upload(this.pointBuffer,this.pointData);this.upload(this.nodeBuffer,this.nodeData);this.upload(this.bondBuffer,this.bondData);this.geometryDirty=false;
    }
    if(this.boundsDirty){this.upload(this.boundsBuffer,this.boundData);this.boundsDirty=false;}
    const width=this.canvas.width,height=this.canvas.height,aspect=width/height,distance=this.distance*Math.max(1,1/aspect);
    const pixelRatio=height/Math.max(1,this.canvas.clientHeight);
    gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    const point=(buffer,count,style,opacity,scale=this.particleScale,extraPixels=0)=>{
      if(!count)return;
      const program=this.pointProgram,a=program.attributes,u=program.uniforms;
      this.useCamera(program,aspect,distance);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      for(const [name,size,offset] of POINT_LAYOUT){
        gl.enableVertexAttribArray(a[name]);gl.vertexAttribPointer(a[name],size,gl.FLOAT,false,28,offset);
      }
      // A previously enabled bond attribute must not read past a small point buffer.
      for(let i=0;i<this.maxAttributes;i++)if(!program.enabledAttributes.includes(i))gl.disableVertexAttribArray(i);
      gl.uniform1f(u.resolution,height);gl.uniform1f(u.boxSize,this.boxSize);gl.uniform1f(u.particleScale,scale);gl.uniform1f(u.extraPixels,extraPixels);
      gl.uniform1i(u.style,style);gl.uniform1f(u.opacity,opacity);gl.drawArrays(style===0?gl.LINES:gl.POINTS,0,count);
    };
    this.maxAttributes ||= gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    gl.depthMask(false);
    if(this.showBounds)point(this.boundsBuffer,this.boundData.length/7,0,.4);
    gl.depthMask(true);
    if(this.viewMode==='bonds')point(this.nodeBuffer,this.nodeCount,1,.95,this.particleScale*.33);
    else point(this.pointBuffer,this.pointCount,1,1);
    gl.depthMask(false);
    if(this.showBonds&&this.bondVertexCount){
      const program=this.bondProgram,a=program.attributes,u=program.uniforms;
      this.useCamera(program,aspect,distance);gl.bindBuffer(gl.ARRAY_BUFFER,this.bondBuffer);
      for(const [name,size,offset] of BOND_LAYOUT){
        gl.enableVertexAttribArray(a[name]);gl.vertexAttribPointer(a[name],size,gl.FLOAT,false,44,offset);
      }
      gl.uniform2f(u.viewport,width,height);
      gl.uniform1f(u.particleScale,this.particleScale*(this.viewMode==='bonds'?.33:1));
      gl.uniform1f(u.width,Math.max(.7,this.bondWidth)*pixelRatio*2.2);gl.uniform1f(u.opacity,.13);gl.drawArrays(gl.TRIANGLES,0,this.bondVertexCount);
      gl.uniform1f(u.width,Math.max(.7,this.bondWidth)*pixelRatio);gl.uniform1f(u.opacity,.98);gl.drawArrays(gl.TRIANGLES,0,this.bondVertexCount);
    }
    gl.depthMask(true);
    if(Number.isInteger(this.selectedId)&&this.selectedId>=0&&this.selectedId<this.pointCount){
      const from=this.selectedId*7;for(let i=0;i<7;i++)this.selectionData[i]=this.pointData[from+i];
      this.upload(this.selectionBuffer,this.selectionData);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
      point(this.selectionBuffer,1,2,1,this.particleScale,12*pixelRatio);gl.depthMask(true);
    }
  }
}
