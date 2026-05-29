const DS=(()=>{
const C={SUPABASE_URL:'',SUPABASE_ANON_KEY:''};if(window.__ENV__)Object.assign(C,window.__ENV__);
const BT={regular:{n:'The Reel',ac:.018,dr:.984,tu:.045,mx:1.2,col:0xb01818,wx:1},pontoon:{n:'Lilly Loch',ac:.012,dr:.988,tu:.03,mx:.8,col:0x4f6b2e,wx:.7},speedboat:{n:'The Fly',ac:.025,dr:.978,tu:.055,mx:1.8,col:0x12545c,wx:1.4}};
// Hero identity per boat — kit signature, voice palette, and HUD badge color.
// Voice lines lean on the Character Bible: Reel = bold/quotable, Fly = dry/short, Lilly = country direct.
const HERO={
  regular:{id:'reel',n:'The Reel',role:'Rescue · Control',kit:'Casting rod grapnel + heavy reel winch',badge:'#ef4444',col:'#fca5a5',voice:{start:"Line's tight. Somebody's coming home.",surge:'Bayou Bay paid for a show — keep it together.',rescue:'You can bite the boat — you ain’t getting the people.',evidence:'Got something. Bag it.'}},
  pontoon:{id:'lilly',n:'Lilly Loch',role:'Brawler · Traversal',kit:'Swamp strength + improvised dock-board shield',badge:'#10b981',col:'#a7f3d0',voice:{start:'Water already moved. We move with it.',surge:'Bless your heart, hold on.',rescue:'I got you. Easy, easy.',evidence:'Castor Bayou’s talking. We’re listening.'}},
  speedboat:{id:'fly',n:'The Fly',role:'Recon · Trap',kit:'Fly-line tripwires + hook cams + sonar pings',badge:'#3b82f6',col:'#93c5fd',voice:{start:'That wake has no boat. Move careful.',surge:'Surge. Brace.',rescue:'Civilian out. Clean.',evidence:'Tag it. We’ll read it back at the yard.'}}
};
const TI={1:{n:'Preventative',p:49},2:{n:'Comprehensive',p:99},3:{n:'Premium',p:199}};
let S={addr:'',email:'',bc:'pontoon',ti:2,lat:34.1751,lng:-83.996,on:false,score:0,t0:0,maxSpd:0,dist:0,near:0,lid:null,curl:null,played:false,phase:0,pc:0,hull:100,discount:0,outcome:'',civsSaved:0,civsTotal:0,evCollected:null,wx:{ws:3,wd:180,g:0,c:'Clear',t:72,v:10000}};
// Discount tiers earned by run outcome
const DISC={'FULL EXTRACTION':15,'CLEAN EXTRACTION':15,'CLOSE CALLS':10,'RECKLESS':5,'OVERRUN':0};
const $=id=>document.getElementById(id);
function show(id){['s1','s2','s3','s4','s5'].forEach(s=>$(s).classList.toggle('off',s!==id));
  // Hide touch controls when any card is showing
  const tEl=$('touch');if(tEl)tEl.style.display=(id===null&&/Mobi|Android/i.test(navigator.userAgent))?'block':'none'}

let scene,cam,ren,bMesh,waterGeo,waterOZ,stumps=[],aiB=[],civs=[],evidence=null;
// Evidence pool — one is rolled per run. Voice belongs to Lilly (country direct, swamp-sensitive).
const EV=[
  {n:'Drift bottle',line:'Paper inside reads "they listen." First piece for the Castor Bayou case file.'},
  {n:'Broken rod',line:'Snapped clean above the reel. Nothing on a Castor Bayou rod snaps that clean unless something pulled it under.'},
  {n:'Oil drum',line:'Faded corporate stencil under the rust. Quarantine Line traffic — exactly what Garbone warned about.'}
];
let dockPos=new THREE.Vector3(0,0,-120),spd=0,aV=0,prev=new THREE.Vector3();
let wps=[],wpI=0;
const keys={};
let tch={lY:0,rX:0};
let wakes=[],rainDrops=[],sonarRings=[],stumpHighlights=[];

function initEngine(){
  scene=new THREE.Scene();scene.background=new THREE.Color(0x071520);scene.fog=new THREE.Fog(0x0b1e30,80,400);
  cam=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,0.1,1000);cam.position.set(0,15,30);cam.lookAt(0,0,0);
  ren=new THREE.WebGLRenderer({antialias:true});ren.setSize(innerWidth,innerHeight);ren.setPixelRatio(Math.min(devicePixelRatio,2));
  ren.toneMapping=THREE.ACESFilmicToneMapping;ren.toneMappingExposure=1.2;
  ren.shadowMap.enabled=true;ren.shadowMap.type=THREE.PCFSoftShadowMap;
  document.body.insertBefore(ren.domElement,document.body.firstChild);
  // Richer lighting
  scene.add(new THREE.AmbientLight(0x304060,0.5));
  const sun=new THREE.DirectionalLight(0xffecd2,1.4);sun.position.set(80,120,60);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-200;sun.shadow.camera.right=200;sun.shadow.camera.top=200;sun.shadow.camera.bottom=-200;scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x6090b0,0x1a3020,0.4));
  // Subtle golden hour rim light
  const rim=new THREE.DirectionalLight(0xffaa55,0.3);rim.position.set(-60,30,-80);scene.add(rim);
  scene._sun=sun;scene._rim=rim;
  // Visible sun disc on the horizon — readable anchor in the sky
  const sunDisc=new THREE.Mesh(new THREE.SphereGeometry(9,20,20),new THREE.MeshBasicMaterial({color:0xffd28a,transparent:true,opacity:0.85}));sunDisc.position.set(120,55,-280);scene.add(sunDisc);
  const sunHalo=new THREE.Mesh(new THREE.SphereGeometry(16,16,16),new THREE.MeshBasicMaterial({color:0xffb060,transparent:true,opacity:0.18}));sunHalo.position.copy(sunDisc.position);scene.add(sunHalo);
  scene._sunDisc=sunDisc;scene._sunHalo=sunHalo;

  // Water — deeper blue-green, more reflective
  waterGeo=new THREE.PlaneGeometry(800,800,80,80);
  const wM=new THREE.MeshStandardMaterial({color:0x0b3038,roughness:0.15,metalness:0.75,transparent:true,opacity:0.94,envMapIntensity:1.2});
  waterOZ=new Float32Array(waterGeo.attributes.position.count);
  for(let i=0;i<waterGeo.attributes.position.count;i++)waterOZ[i]=waterGeo.attributes.position.getZ(i);
  const waterMesh=new THREE.Mesh(waterGeo,wM);waterMesh.rotation.x=-Math.PI/2;waterMesh.receiveShadow=true;scene.add(waterMesh);

  mkBoat('pontoon');
  mkDock();mkWorld();mkObstacles();mkAI();mkWaypoints();mkCivs();mkEvidence();

  document.addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='Space'&&S.on){e.preventDefault();fireSonar()}});document.addEventListener('keyup',e=>keys[e.code]=false);
  window.addEventListener('resize',()=>{cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();ren.setSize(innerWidth,innerHeight)});
  // Touch controls
  const isMob=/Mobi|Android/i.test(navigator.userAgent);
  if(isMob)$('touch').style.display='block';
  let lId=null,rId=null,lCy=0,rCx=0;
  const tz=$('touch');if(tz){
    const zones=tz.children;
    zones[0].addEventListener('touchstart',e=>{e.preventDefault();const t=e.changedTouches[0];lId=t.identifier;lCy=t.clientY},{passive:false});
    zones[1].addEventListener('touchstart',e=>{e.preventDefault();const t=e.changedTouches[0];rId=t.identifier;rCx=t.clientX},{passive:false});
    document.addEventListener('touchmove',e=>{for(const t of e.changedTouches){
      if(t.identifier===lId){const dy=-(t.clientY-lCy)/60;tch.lY=Math.max(-1,Math.min(1,dy));$('tkL').style.transform=`translate(-50%,${-50-dy*22}%)`}
      if(t.identifier===rId){const dx=(t.clientX-rCx)/60;tch.rX=Math.max(-1,Math.min(1,-dx));$('tkR').style.transform=`translate(${-50+dx*22}%,-50%)`}
    }},{passive:true});
    document.addEventListener('touchend',e=>{for(const t of e.changedTouches){if(t.identifier===lId){lId=null;tch.lY=0;$('tkL').style.transform='translate(-50%,-50%)'}if(t.identifier===rId){rId=null;tch.rX=0;$('tkR').style.transform='translate(-50%,-50%)'}}});
  }
  loop();
}

function mkDock(){
  const dg=new THREE.Group();
  // Main platform — planked look via multiple thin boxes
  for(let i=0;i<8;i++){const plank=new THREE.Mesh(new THREE.BoxGeometry(7.8,0.15,1.3),new THREE.MeshStandardMaterial({color:i%2?0x7a5c14:0x8B6914,roughness:0.85}));plank.position.set(0,0.35,-5.2+i*1.5);plank.castShadow=true;plank.receiveShadow=true;dg.add(plank)}
  // Support beams underneath
  for(let x=-3;x<=3;x+=2){const beam=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.4,12),new THREE.MeshStandardMaterial({color:0x5a4210}));beam.position.set(x,0.1,0);dg.add(beam)}
  // Posts with rope tops
  [[-3.5,-5.5],[3.5,-5.5],[-3.5,5.5],[3.5,5.5],[-3.5,0],[3.5,0]].forEach(([x,z])=>{
    const post=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.22,3.5,8),new THREE.MeshStandardMaterial({color:0x5a4210,roughness:0.9}));post.position.set(x,1.8,z);post.castShadow=true;dg.add(post);
    // Rope coil on top
    const coil=new THREE.Mesh(new THREE.TorusGeometry(0.3,0.06,6,12),new THREE.MeshStandardMaterial({color:0xa08850}));coil.position.set(x,3.1,z);coil.rotation.x=Math.PI/2;dg.add(coil)});
  // Bumpers
  [[-4,2],[4,2],[-4,-3],[4,-3]].forEach(([x,z])=>{const bmp=new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,1.2,8),new THREE.MeshStandardMaterial({color:0x2255aa}));bmp.position.set(x,0.6,z);dg.add(bmp)});
  // Dock light
  const dockLight=new THREE.PointLight(0xffeedd,0.8,25);dockLight.position.set(0,3.5,0);dg.add(dockLight);
  const lampPost=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,3,6),new THREE.MeshStandardMaterial({color:0x444444,metalness:0.8}));lampPost.position.set(0,1.8,0);dg.add(lampPost);
  const lampHead=new THREE.Mesh(new THREE.SphereGeometry(0.25,8,6),new THREE.MeshStandardMaterial({color:0xffeedd,emissive:0xffeedd,emissiveIntensity:0.6}));lampHead.position.set(0,3.4,0);dg.add(lampHead);

  dg.position.set(dockPos.x,0,dockPos.z);scene.add(dg);

  // Pin marker
  const pinG=new THREE.Group();
  const pin=new THREE.Mesh(new THREE.SphereGeometry(1.2,12,12),new THREE.MeshStandardMaterial({color:0xff2222,emissive:0xff0000,emissiveIntensity:0.6,metalness:0.3}));pin.position.y=10;pinG.add(pin);
  const pinP=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,10,6),new THREE.MeshStandardMaterial({color:0xcc0000,metalness:0.4}));pinP.position.y=5;pinG.add(pinP);
  const pinLight=new THREE.PointLight(0xff3333,1.5,35);pinLight.position.set(0,10,0);pinG.add(pinLight);
  // Beacon ring on water
  const beacon=new THREE.Mesh(new THREE.RingGeometry(10,11,32),new THREE.MeshBasicMaterial({color:0x10b981,transparent:true,opacity:0.18,side:THREE.DoubleSide}));beacon.rotation.x=-Math.PI/2;beacon.position.y=0.1;pinG.add(beacon);
  const bl=new THREE.PointLight(0x10b981,1.5,30);bl.position.set(0,2,0);pinG.add(bl);
  pinG.position.set(dockPos.x,0,dockPos.z);scene.add(pinG);
  scene._pinG=pinG;scene._beacon=beacon;
}

function mkWorld(){
  // Shores — organic shapes with varied heights
  for(let i=0;i<12;i++){
    const a=i/12*Math.PI*2+Math.random()*0.3,r=160+Math.random()*40;
    const w=20+Math.random()*35,h=2+Math.random()*4,d=12+Math.random()*18;
    const sh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(0.28+Math.random()*0.05,0.4+Math.random()*0.2,0.12+Math.random()*0.06),roughness:0.95}));
    sh.position.set(Math.cos(a)*r,h/2-1.5,Math.sin(a)*r);sh.rotation.y=a+Math.random()*0.3;sh.castShadow=true;sh.receiveShadow=true;scene.add(sh);
  }
  // Trees on shores
  for(let i=0;i<50;i++){
    const a=Math.random()*Math.PI*2,r=165+Math.random()*30;
    const g=new THREE.Group();
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.35,3+Math.random()*2,5),new THREE.MeshStandardMaterial({color:0x3a2a18}));trunk.position.y=2;g.add(trunk);
    const crown=new THREE.Mesh(new THREE.SphereGeometry(1.5+Math.random()*1.5,6,5),new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(0.3+Math.random()*0.08,0.5+Math.random()*0.3,0.1+Math.random()*0.08)}));
    crown.position.y=4+Math.random()*2;crown.castShadow=true;g.add(crown);
    g.position.set(Math.cos(a)*r,0,Math.sin(a)*r);scene.add(g);
  }
  // Buoys with lights
  const buoyCols=[0xef4444,0xf59e0b,0xef4444,0xf59e0b,0xef4444,0xf59e0b];
  for(let i=0;i<6;i++){
    const a=i/6*Math.PI*2,r=70+Math.random()*40;
    const buoy=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.7,2.2,8),new THREE.MeshStandardMaterial({color:buoyCols[i],emissive:buoyCols[i],emissiveIntensity:0.3}));
    buoy.position.set(Math.cos(a)*r,1,Math.sin(a)*r-60);scene.add(buoy);
    const bLight=new THREE.PointLight(buoyCols[i],0.5,12);bLight.position.set(Math.cos(a)*r,2.5,Math.sin(a)*r-60);scene.add(bLight);
  }
}

function mkObstacles(){
  // Stumps — sparse near start, dense in hazard zone, varied appearance
  for(let i=0;i<70;i++){
    const sx=(Math.random()-0.5)*220;let sz=-Math.random()*160-10;
    if(Math.abs(sz-dockPos.z)<15||Math.abs(sz)<12)continue;
    if(sz>-40&&Math.random()>0.25)continue;
    const h=0.8+Math.random()*2,r1=0.3+Math.random()*0.5,r2=r1+0.1+Math.random()*0.3;
    const s=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,6),new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(0.08,0.4+Math.random()*0.2,0.08+Math.random()*0.06),roughness:0.95}));
    s.position.set(sx,-0.3,sz);s.rotation.x=(Math.random()-0.5)*0.3;s.rotation.z=(Math.random()-0.5)*0.3;
    s.castShadow=true;scene.add(s);stumps.push(s);
  }
  // Floating debris
  for(let i=0;i<12;i++){
    const dx=(Math.random()-0.5)*180,dz=-20-Math.random()*100;
    const db=new THREE.Mesh(new THREE.BoxGeometry(0.8+Math.random()*0.6,0.2,0.6+Math.random()*0.8),new THREE.MeshStandardMaterial({color:0x2a1a0a,roughness:0.9}));
    db.position.set(dx,0.15,dz);db.rotation.y=Math.random()*Math.PI;scene.add(db);stumps.push(db);
  }
}

function mkAI(){
  [0x3388ee,0xee5588,0xff8833,0x8855ee].forEach((c,i)=>{
    const g=new THREE.Group();
    // Better AI boat shape
    const hull=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.6,3.5),new THREE.MeshStandardMaterial({color:c,roughness:0.3,metalness:0.2}));hull.position.y=0.3;g.add(hull);
    const cab=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.5,1.2),new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.5}));cab.position.set(0,0.7,-0.3);g.add(cab);
    const aiLight=new THREE.PointLight(c,0.3,8);aiLight.position.set(0,1.5,0);g.add(aiLight);
    const x=(i%2===0?-1:1)*(60+Math.random()*40);const z=-50-Math.random()*40;
    g.position.set(x,0.3,z);g.userData={ox:x,oz:z,spd:0.4+Math.random()*0.4,w:Math.random()*Math.PI*2,on:false};scene.add(g);aiB.push(g)});
}

function mkEvidence(){
  // One evidence prop somewhere in the shallows zone — a small glowing crate with a marker beam.
  const g=new THREE.Group();
  const crate=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.4,0.5),new THREE.MeshStandardMaterial({color:0xfbcf3b,emissive:0xfbcf3b,emissiveIntensity:0.4,roughness:0.5}));crate.position.y=0.25;g.add(crate);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,4,6),new THREE.MeshBasicMaterial({color:0xfbcf3b,transparent:true,opacity:0.5}));beam.position.y=2.4;g.add(beam);
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.8,1.0,18),new THREE.MeshBasicMaterial({color:0xfbcf3b,transparent:true,opacity:0.45,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=0.05;g.add(ring);
  const x=(Math.random()-0.5)*30,z=-60-Math.random()*30;
  g.position.set(x,0,z);g.userData={collected:false,ring,beam};scene.add(g);evidence=g;
}

function mkCivs(){
  // Three civilians between start and dock, spread along the route, away from the dense hazard cluster.
  const spots=[[-8,-25],[12,-50],[-3,-85]];
  spots.forEach(([x,z])=>{
    const g=new THREE.Group();
    // Inner-tube ring + a small head/torso so it reads as a person clinging to a float
    const tube=new THREE.Mesh(new THREE.TorusGeometry(0.55,0.18,8,16),new THREE.MeshStandardMaterial({color:0xff6b35,emissive:0xff6b35,emissiveIntensity:0.35,roughness:0.5}));tube.rotation.x=Math.PI/2;tube.position.y=0.2;g.add(tube);
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.18,8,6),new THREE.MeshStandardMaterial({color:0xd4a373,roughness:0.7}));head.position.y=0.55;g.add(head);
    const torso=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.3,0.25),new THREE.MeshStandardMaterial({color:0x2a4d6e,roughness:0.6}));torso.position.y=0.3;g.add(torso);
    // Pulsing call-for-help ring on the water
    const ring=new THREE.Mesh(new THREE.RingGeometry(0.9,1.1,18),new THREE.MeshBasicMaterial({color:0xff6b35,transparent:true,opacity:0.4,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=0.05;g.add(ring);
    g.position.set(x,0,z);g.userData={saved:false,ring};scene.add(g);civs.push(g);
  });
}

function mkWaypoints(){
  [[0,0,0],[-15,0,-18],[10,0,-38],[-5,0,-55],[0,0,-75]].forEach(([x,y,z])=>{
    const r=new THREE.Mesh(new THREE.RingGeometry(3,4,24),new THREE.MeshBasicMaterial({color:0xe8590c,transparent:true,opacity:0.35,side:THREE.DoubleSide}));
    r.rotation.x=-Math.PI/2;r.position.set(x,0.15,z);r.visible=false;scene.add(r);wps.push(r);
    // Inner glow ring
    const inner=new THREE.Mesh(new THREE.RingGeometry(1.5,2,24),new THREE.MeshBasicMaterial({color:0xfb923c,transparent:true,opacity:0.2,side:THREE.DoubleSide}));
    inner.rotation.x=-Math.PI/2;inner.position.set(x,0.18,z);inner.visible=false;scene.add(inner);
    r.userData.inner=inner;
  });
}

function mkBoat(cls){if(bMesh)scene.remove(bMesh);const t=BT[cls];bMesh=new THREE.Group();
  // Hull — tapered bow using scaled boxes
  const hullMain=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.9,4.5),new THREE.MeshStandardMaterial({color:t.col,roughness:0.35,metalness:0.15}));hullMain.position.y=0.45;hullMain.castShadow=true;bMesh.add(hullMain);
  // Bow taper
  const bow=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.7,1.5),new THREE.MeshStandardMaterial({color:t.col,roughness:0.35,metalness:0.15}));bow.position.set(0,0.4,3.2);bow.castShadow=true;bMesh.add(bow);
  const bowTip=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.5,0.8),new THREE.MeshStandardMaterial({color:t.col,roughness:0.35}));bowTip.position.set(0,0.35,4);bMesh.add(bowTip);
  // Stern
  const stern=new THREE.Mesh(new THREE.BoxGeometry(2,0.7,0.6),new THREE.MeshStandardMaterial({color:t.col,roughness:0.4}));stern.position.set(0,0.4,-2.5);bMesh.add(stern);
  // Deck stripe
  const stripe=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.04,4.8),new THREE.MeshStandardMaterial({color:0xe8590c,emissive:0xe8590c,emissiveIntensity:0.15}));stripe.position.y=0.92;bMesh.add(stripe);
  // Cabin
  const cab=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.9,2.2),new THREE.MeshStandardMaterial({color:0xf5f5f0,roughness:0.6}));cab.position.set(0,1.4,-0.3);cab.castShadow=true;bMesh.add(cab);
  // Windshield
  const ws=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.6,0.08),new THREE.MeshStandardMaterial({color:0x88ddff,transparent:true,opacity:0.45,metalness:0.9,roughness:0.1}));ws.position.set(0,1.8,0.8);ws.rotation.x=-0.25;bMesh.add(ws);
  // Console
  const console=new THREE.Mesh(new THREE.BoxGeometry(1,0.4,0.5),new THREE.MeshStandardMaterial({color:0x1a1a2e,metalness:0.6}));console.position.set(0,1.6,0.3);bMesh.add(console);
  // Motor
  const motor=new THREE.Mesh(new THREE.BoxGeometry(0.7,1.2,0.9),new THREE.MeshStandardMaterial({color:0x111118,metalness:0.7,roughness:0.3}));motor.position.set(0,0.2,-2.8);bMesh.add(motor);
  const motorCowl=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.3,0.5),new THREE.MeshStandardMaterial({color:0x222230}));motorCowl.position.set(0,0.9,-2.8);bMesh.add(motorCowl);
  // Railing posts
  [[-1.1,1],[1.1,1],[-1.1,-1],[1.1,-1]].forEach(([x,z])=>{const rail=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.6,4),new THREE.MeshStandardMaterial({color:0xcccccc,metalness:0.8}));rail.position.set(x,1.2,z);bMesh.add(rail)});
  // Nav lights
  const pL=new THREE.PointLight(0xff0000,0.5,8);pL.position.set(-1.2,1.3,2.5);bMesh.add(pL);
  const pR=new THREE.PointLight(0x00ff00,0.5,8);pR.position.set(1.2,1.3,2.5);bMesh.add(pR);
  // Headlight
  const hl=new THREE.SpotLight(0xffeedd,0.6,50,Math.PI*0.15,0.5);hl.position.set(0,1.8,3.5);const hlTarget=new THREE.Object3D();hlTarget.position.set(0,0,15);bMesh.add(hlTarget);hl.target=hlTarget;bMesh.add(hl);bMesh.add(hlTarget);
  // Foam ring under the boat — scales with speed for hull-water contact read
  const foam=new THREE.Mesh(new THREE.RingGeometry(2.4,3.6,28),new THREE.MeshBasicMaterial({color:0xeaf4f0,transparent:true,opacity:0.35,side:THREE.DoubleSide}));foam.rotation.x=-Math.PI/2;foam.position.y=-0.18;bMesh.add(foam);bMesh.userData.foam=foam;
  bMesh.position.set(0,0.3,20);scene.add(bMesh)}

// === WAKE PARTICLES ===
const wakeMat=new THREE.MeshBasicMaterial({color:0xaaddcc,transparent:true,opacity:0.4});
const wakeGeo=new THREE.SphereGeometry(0.18,4,4);
const sprayMat=new THREE.MeshBasicMaterial({color:0xddeeff,transparent:true,opacity:0.5});
const sprayGeo=new THREE.SphereGeometry(0.12,4,3);

function spawnWake(){
  if(wakes.length>150||Math.abs(spd)<0.1)return;
  const cnt=Math.ceil(Math.abs(spd)*5);
  for(let i=0;i<cnt;i++){
    const p=new THREE.Mesh(wakeGeo,wakeMat.clone());
    const local=new THREE.Vector3((Math.random()-0.5)*2,0.2,-3.5-Math.random());
    local.applyQuaternion(bMesh.quaternion);p.position.copy(bMesh.position).add(local);
    p.userData={life:1,decay:0.015+Math.random()*0.015,vy:0.015+Math.random()*0.02,vx:(Math.random()-0.5)*0.04,vz:(Math.random()-0.5)*0.04};
    scene.add(p);wakes.push(p);
  }
  // Bow spray at high speed
  if(Math.abs(spd)>0.5){
    for(let i=0;i<4;i++){
      const p=new THREE.Mesh(sprayGeo,sprayMat.clone());
      const local=new THREE.Vector3((Math.random()-0.5)*1.2,0.4,4+Math.random()*0.5);
      local.applyQuaternion(bMesh.quaternion);p.position.copy(bMesh.position).add(local);
      p.userData={life:1,decay:0.025+Math.random()*0.02,vy:0.04+Math.random()*0.03,vx:(Math.random()-0.5)*0.06,vz:(Math.random()-0.5)*0.06};
      scene.add(p);wakes.push(p);
    }
  }
}

function tickWakes(){
  for(let i=wakes.length-1;i>=0;i--){
    const p=wakes[i],u=p.userData;u.life-=u.decay;
    if(u.life<=0){scene.remove(p);p.geometry.dispose();p.material.dispose();wakes.splice(i,1);continue}
    p.position.y+=u.vy;p.position.x+=u.vx;p.position.z+=u.vz;
    p.scale.multiplyScalar(1.015);p.material.opacity=u.life*0.4;
  }
}

// === SONAR PING ===
function fireSonar(){
  if(!S.on)return false;
  const now=Date.now()*0.001;
  if(S.sonarReady&&now<S.sonarReady)return false;
  S.sonarReady=now+3;
  const origin=bMesh.position.clone();origin.y=0.2;
  // Expanding ring on the water — reuse wake disposal pattern
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.4,0.6,32),new THREE.MeshBasicMaterial({color:0x60d0ff,transparent:true,opacity:0.85,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2;ring.position.copy(origin);scene.add(ring);
  sonarRings.push({m:ring,t0:now});
  // Highlight every stump within 25u for ~1.5s
  for(const s of stumps){if(s.position.distanceTo(origin)>25)continue;
    const h=new THREE.Mesh(new THREE.RingGeometry(1.2,1.5,18),new THREE.MeshBasicMaterial({color:0xfb923c,transparent:true,opacity:0.65,side:THREE.DoubleSide}));
    h.rotation.x=-Math.PI/2;h.position.set(s.position.x,0.12,s.position.z);scene.add(h);
    stumpHighlights.push({m:h,t0:now});
  }
  return true;
}
function tickSonar(){
  const now=Date.now()*0.001;
  for(let i=sonarRings.length-1;i>=0;i--){const r=sonarRings[i],age=now-r.t0;if(age>1.5){scene.remove(r.m);r.m.geometry.dispose();r.m.material.dispose();sonarRings.splice(i,1);continue}const sc=1+age*22;r.m.scale.set(sc,sc,sc);r.m.material.opacity=Math.max(0,0.85-age/1.5)}
  for(let i=stumpHighlights.length-1;i>=0;i--){const h=stumpHighlights[i],age=now-h.t0;if(age>1.5){scene.remove(h.m);h.m.geometry.dispose();h.m.material.dispose();stumpHighlights.splice(i,1);continue}h.m.material.opacity=Math.max(0,0.65-age/1.5)}
  // Update HUD readiness pill
  const sp=$('h-sonar');if(sp){const ready=!S.sonarReady||now>=S.sonarReady;sp.textContent=ready?'READY':Math.max(0,(S.sonarReady-now)).toFixed(1)+'s';sp.style.color=ready?'#60d0ff':'#475569'}
}

// === WEATHER VISUALS ===
function applyWeatherVisuals(){
  const w=S.wx;
  // Fog density based on visibility
  const vis=Math.max(w.v||10000,1000);
  scene.fog.near=Math.min(vis*0.008,80);scene.fog.far=Math.min(vis*0.04,400);
  // Sky/fog/sun color shift for conditions
  if(w.c==='Rain'||w.c==='Drizzle'){
    scene.background.set(0x0a1218);scene.fog.color.set(0x0a1218);
    if(scene._sunDisc){scene._sunDisc.material.color.set(0x7a8090);scene._sunDisc.material.opacity=0.35}
    if(scene._sunHalo)scene._sunHalo.material.color.set(0x6070a0);
    if(scene._sun)scene._sun.intensity=0.8;
  }else if(w.c==='Clouds'||w.c==='Overcast'){
    scene.background.set(0x0c1822);scene.fog.color.set(0x0c1822);
    if(scene._sunDisc){scene._sunDisc.material.color.set(0xccc0a0);scene._sunDisc.material.opacity=0.55}
    if(scene._sunHalo)scene._sunHalo.material.color.set(0xb09870);
    if(scene._sun)scene._sun.intensity=1.0;
  }else{
    scene.background.set(0x071520);scene.fog.color.set(0x0b1e30);
    if(scene._sunDisc){scene._sunDisc.material.color.set(0xffd28a);scene._sunDisc.material.opacity=0.85}
    if(scene._sunHalo)scene._sunHalo.material.color.set(0xffb060);
    if(scene._sun)scene._sun.intensity=1.4;
  }
  // Spawn rain particles if raining
  if((w.c==='Rain'||w.c==='Drizzle')&&rainDrops.length===0){
    const rainGeo=new THREE.BufferGeometry();
    const rainCount=200;const rainPos=new Float32Array(rainCount*3);
    for(let i=0;i<rainCount;i++){rainPos[i*3]=(Math.random()-0.5)*200;rainPos[i*3+1]=Math.random()*40;rainPos[i*3+2]=(Math.random()-0.5)*200}
    rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));
    const rainMat=new THREE.PointsMaterial({color:0x8899bb,size:0.15,transparent:true,opacity:0.5});
    const rain=new THREE.Points(rainGeo,rainMat);scene.add(rain);rainDrops.push(rain);
  }
}

function tickRain(){
  rainDrops.forEach(rain=>{
    const pos=rain.geometry.attributes.position;
    for(let i=0;i<pos.count;i++){
      pos.setY(i,pos.getY(i)-0.3-S.wx.ws*0.02);
      if(pos.getY(i)<0)pos.setY(i,30+Math.random()*10);
      // Wind drift
      pos.setX(i,pos.getX(i)+Math.sin(S.wx.wd*Math.PI/180)*0.02);
    }
    pos.needsUpdate=true;
  });
}

// === 3-PHASE MISSION ===
const PH=[{n:'APPROACH',d:'Follow the rescue markers',check:()=>wpI>=4},{n:'THE SHALLOWS',d:'Avoid the debris — watch the water',check:()=>bMesh.position.distanceTo(dockPos)<55},{n:'EXTRACTION',d:'Slow down — bring them in',check:()=>bMesh.position.distanceTo(dockPos)<8}];
function setPh(p){S.phase=p;if(p>2)return;$('pn').textContent=PH[p].n;$('pd').textContent=PH[p].d;$('pfill').style.width=((p+1)/3*100)+'%';
  if(p===0){wpI=0;wps.forEach((w,i)=>{w.visible=i===0;if(w.userData.inner)w.userData.inner.visible=i===0})}
  if(p===1){aiB.forEach(a=>a.userData.on=true);$('ww').style.display='block';setTimeout(()=>$('ww').style.display='none',4000);wps.forEach(w=>{w.visible=false;if(w.userData.inner)w.userData.inner.visible=false});S.pc=1}
  if(p===2){$('nfo').textContent='SLOW DOWN — Extraction';$('nfo').style.color='#f59e0b';S.pc=2}}

function tickPh(){const d=bMesh.position.distanceTo(dockPos),p=S.phase;
  if(p===0&&wpI<wps.length){const w=wps[wpI];if(w.visible){w.material.opacity=0.25+Math.sin(Date.now()*0.005)*0.15;if(w.userData.inner)w.userData.inner.material.opacity=0.15+Math.sin(Date.now()*0.008)*0.1;if(bMesh.position.distanceTo(w.position)<6){w.visible=false;if(w.userData.inner)w.userData.inner.visible=false;S.score+=50;wpI++;if(wpI<wps.length){wps[wpI].visible=true;if(wps[wpI].userData.inner)wps[wpI].userData.inner.visible=true}}}}
  if(p<2&&PH[p].check())setPh(p+1);
  if(p>=1){const t=Date.now()*0.001;aiB.forEach(a=>{if(!a.userData.on)return;a.position.x=a.userData.ox+Math.sin(t*0.6+a.userData.w)*50;a.position.z=a.userData.oz+Math.cos(t*0.4+a.userData.w)*10;a.position.y=0.3+Math.sin(t*2+a.userData.w)*0.15;if(bMesh.position.distanceTo(a.position)<4)S.near+=2})}
  if(p===2&&Math.abs(spd)>0.4)S.score=Math.max(0,S.score-2)}

// === RENDER ===
function loop(){requestAnimationFrame(loop);const t=Date.now()*0.001;
  const wA=0.25+S.wx.ws*0.04;const wp=waterGeo.attributes.position;
  for(let i=0;i<wp.count;i++){const x=wp.getX(i),y=wp.getY(i);wp.setZ(i,waterOZ[i]+Math.sin(x*0.05+t)*wA+Math.cos(y*0.07+t*0.8)*(wA*0.6))}
  wp.needsUpdate=true;waterGeo.computeVertexNormals();
  // Pin bob
  if(scene._pinG)scene._pinG.position.y=Math.sin(t*1.2)*0.4;
  if(scene._beacon)scene._beacon.material.opacity=0.14+Math.sin(t*2)*0.06;
  // Foam ring grows with speed and pulses to read as turbulence
  if(bMesh&&bMesh.userData.foam){const f=bMesh.userData.foam;const sp=Math.abs(spd);const sc=1+sp*1.2;f.scale.set(sc,sc,sc);f.material.opacity=0.25+sp*0.5+Math.sin(t*4)*0.05}
  // Sun halo pulse
  if(scene._sunHalo)scene._sunHalo.material.opacity=0.15+Math.sin(t*0.6)*0.05;

  if(S.on){const bt=BT[S.bc],wxP=1-Math.min(S.wx.ws*S.wx.ws*0.003*bt.wx,0.4);
    // Hull damage cripples handling when below 30%
    const hullP=S.hull<30?0.55:(S.hull<60?0.85:1);
    if(keys.ArrowUp||keys.KeyW||tch.lY>0.1)spd=Math.min(spd+bt.ac*wxP*hullP*(keys.ArrowUp||keys.KeyW?1:tch.lY),bt.mx*hullP);if(keys.ArrowDown||keys.KeyS||tch.lY<-0.1)spd-=bt.ac*0.5;spd*=bt.dr;
    if(Math.abs(spd)>0.03){if(keys.ArrowLeft||keys.KeyA||tch.rX>0.1)aV+=bt.tu*wxP*hullP*(keys.ArrowLeft||keys.KeyA?1:tch.rX);if(keys.ArrowRight||keys.KeyD||tch.rX<-0.1)aV-=bt.tu*wxP*hullP*(keys.ArrowRight||keys.KeyD?1:Math.abs(tch.rX))}
    aV*=0.88;bMesh.rotation.y+=aV;
    const dir=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),bMesh.rotation.y);prev.copy(bMesh.position);
    bMesh.position.addScaledVector(dir,spd);bMesh.position.y=0.3+Math.sin(t*2.2)*0.2+Math.sin(t*1.3+0.5)*0.1;bMesh.rotation.z=-aV*2.5;bMesh.rotation.x=spd*0.05;
    const wr=S.wx.wd*Math.PI/180;bMesh.position.x+=Math.sin(wr)*S.wx.ws*0.0008*bt.wx;bMesh.position.z+=Math.cos(wr)*S.wx.ws*0.0008*bt.wx;
    // Blackwater surge — only in THE SHALLOWS, every ~4-7s, shoves the boat sideways
    if(S.phase>=1&&t-S.lastSurge>4+(S.surgeRand||3)){S.lastSurge=t;S.surgeRand=Math.random()*3;const sa=Math.random()*Math.PI*2;bMesh.position.x+=Math.cos(sa)*2;bMesh.position.z+=Math.sin(sa)*2;$('ww').textContent='BLACKWATER SURGE';$('ww').style.display='block';setTimeout(()=>{if($('ww').textContent==='BLACKWATER SURGE')$('ww').style.display='none'},1400)}
    S.dist+=bMesh.position.distanceTo(prev);const as=Math.abs(spd*40);if(as>S.maxSpd)S.maxSpd=as;
    const dd=bMesh.position.distanceTo(dockPos);if(dd<150)S.score+=Math.max(0,Math.round(as*0.3));
    $('h-spd').textContent=as.toFixed(1)+' kn';$('h-dst').textContent=dd.toFixed(0)+'m';
    const hd=((bMesh.rotation.y*180/Math.PI%360)+360)%360;$('h-hdg').textContent=['N','NE','E','SE','S','SW','W','NW'][Math.round(hd/45)%8];$('h-scr').textContent=S.score;
    // Hull HUD + color states
    const hh=$('h-hull');if(hh){hh.textContent=Math.round(S.hull)+'%';hh.style.color=S.hull<30?'#ef4444':(S.hull<60?'#f59e0b':'#fb923c')}
    for(const s of stumps){const d=bMesh.position.distanceTo(s.position);if(d<2.5){endGame(false);return}if(d<4){S.hull=Math.max(0,S.hull-0.35);S.near++}else if(d<6){S.near++}}
    if(S.hull<=0){endGame(false);return}
    // Evidence pickup — drive over to collect, any speed.
    if(evidence&&!evidence.userData.collected){
      evidence.position.y=Math.sin(t*1.4)*0.15;
      evidence.rotation.y=t*0.6;
      if(evidence.userData.ring)evidence.userData.ring.material.opacity=0.35+Math.sin(t*3)*0.2;
      if(bMesh.position.distanceTo(evidence.position)<2){
        evidence.userData.collected=true;evidence.visible=false;
        S.evCollected=EV[Math.floor(Math.random()*EV.length)];S.score+=75;
        $('h-ev').textContent='1/1';$('h-ev').style.color='#fbcf3b';
        $('ww').textContent='EVIDENCE COLLECTED';$('ww').style.display='block';setTimeout(()=>{if($('ww').textContent==='EVIDENCE COLLECTED')$('ww').style.display='none'},1400);
      }
    }
    // Civilian pickups — must approach slowly. Too-fast pass-by flashes a warning and the civilian remains in danger.
    for(const c of civs){if(c.userData.saved)continue;
      c.position.y=Math.sin(t*1.8+c.position.x)*0.12;
      if(c.userData.ring)c.userData.ring.material.opacity=0.3+Math.sin(t*3+c.position.x)*0.2;
      const dc=bMesh.position.distanceTo(c.position);
      if(dc<3){
        if(Math.abs(spd)<0.4){
          c.userData.saved=true;c.visible=false;S.civsSaved++;S.score+=100;S.hull=Math.min(100,S.hull+0.5);
          $('h-civ').textContent=S.civsSaved+'/'+S.civsTotal;
          $('ww').textContent='CIVILIAN EXTRACTED';$('ww').style.display='block';setTimeout(()=>{if($('ww').textContent==='CIVILIAN EXTRACTED')$('ww').style.display='none'},1400);
        }else if(dc<2.2&&$('ww').textContent!=='TOO FAST FOR PICKUP'){
          $('ww').textContent='TOO FAST FOR PICKUP';$('ww').style.display='block';setTimeout(()=>{if($('ww').textContent==='TOO FAST FOR PICKUP')$('ww').style.display='none'},1200);
        }
      }
    }
    spawnWake();tickWakes();tickRain();tickSonar();
    tickPh();if(dd<8){S.pc=3;endGame(true)}
    const bh=new THREE.Vector3(0,7+Math.abs(spd)*3,-14);bh.applyAxisAngle(new THREE.Vector3(0,1,0),bMesh.rotation.y);bh.add(bMesh.position);cam.position.lerp(bh,0.1);cam.lookAt(bMesh.position.x,bMesh.position.y+1,bMesh.position.z);
  }else{
    // Cinematic idle — slow low-altitude sweep across the hazard zone
    const tt=t*0.08;
    cam.position.x=Math.sin(tt)*55;cam.position.z=Math.cos(tt)*55-30;cam.position.y=6+Math.sin(t*0.25)*3;
    cam.lookAt(Math.sin(tt+0.6)*20,2,-50);
    // One patrol boat drifts in the distance during idle so something is alive
    if(aiB[0]){const p=aiB[0];p.position.x=Math.sin(t*0.3)*70;p.position.z=-90+Math.cos(t*0.2)*20;p.position.y=0.3+Math.sin(t*1.5)*0.2;p.rotation.y=t*0.3+Math.PI*0.5}
  }
  ren.render(scene,cam)}

function startGame(){S.on=true;S.score=0;S.t0=Date.now();S.maxSpd=0;S.dist=0;S.near=0;S.pc=0;S.hull=100;S.lastSurge=Date.now()*0.001;S.surgeRand=3;S.civsSaved=0;S.civsTotal=civs.length;S.sonarReady=0;S.evCollected=null;
  civs.forEach(c=>{c.userData.saved=false;c.visible=true});
  if(evidence){evidence.userData.collected=false;evidence.visible=true}
  $('h-civ').textContent='0/'+civs.length;$('h-ev').textContent='0/1';$('h-ev').style.color='#475569';
  spd=0;aV=0;
  bMesh.position.set(0,0.3,25);bMesh.rotation.set(0,Math.PI,0);prev.copy(bMesh.position);
  cam.position.set(0, 6, 38);
  cam.lookAt(0, 0, 15);
  $('hud').style.display='flex';$('wxb').style.display='block';$('nfo').style.display='block';$('phud').style.display='block';
  $('nfo').textContent='WASD / Arrows · Follow the rescue markers';$('nfo').style.color='#475569';setPh(0);show(null);
  // show(null) now handles touch display for mobile
}

// === RESULT → SALES BRIDGE ===
function endGame(won){S.on=false;S.played=true;$('hud').style.display='none';$('nfo').style.display='none';$('phud').style.display='none';$('ww').style.display='none';aiB.forEach(a=>a.userData.on=false);
  // Clean wakes
  wakes.forEach(p=>{scene.remove(p);p.geometry.dispose();p.material.dispose()});wakes=[];
  const el=(Date.now()-S.t0)/1000;if(won)S.score+=Math.max(0,Math.round(500-el*3));if(won&&Math.abs(spd)<0.3)S.score+=200;
  $('rt').textContent=won?'Survivors Extracted':'Dragged Under';$('r-scr').textContent=S.score;$('r-time').textContent=el.toFixed(1)+'s';$('r-spd').textContent=S.maxSpd.toFixed(1)+' kn';$('r-near').textContent=Math.min(S.near,99);$('r-ph').textContent=S.pc+'/3';$('f-scr').textContent=S.score;
  const rh=$('r-hull');if(rh){rh.textContent=Math.round(S.hull)+'%';rh.className='sv '+(S.hull<30?'r':S.hull<60?'y':'g')}
  let rl,rm,rc;const nr=S.near/Math.max(el,1);
  if(!won){rl='OVERRUN';rm='The water took you. Whatever is rising below the surface does not stop — and it is spreading to every waterway it can reach.';rc='rgba(239,68,68,0.08)'}
  else if(S.near>15||nr>0.5){rl='CLOSE CALLS';rm='Too many near-misses out there. Debris, blackwater, and things moving under the hull — every run into The Depth gets more dangerous than the last.';rc='rgba(245,158,11,0.08)'}
  else if(S.maxSpd>25){rl='RECKLESS';rm='You ran it hot. Speed gets you to the survivors faster, but the water is unforgiving — one wrong read and The Depth takes the whole crew.';rc='rgba(245,158,11,0.08)'}
  else{rl='CLEAN EXTRACTION';rm='Flawless run. You brought them home before the water closed in. The Depth holds the line — so others can survive.';rc='rgba(16,185,129,0.08)'}
  // Outcome upgrade: full civilian extraction
  if(won&&S.civsTotal>0&&S.civsSaved===S.civsTotal&&rl==='CLEAN EXTRACTION'){rl='FULL EXTRACTION';rm='Every civilian out. Dock secured. Castor Bayou will remember this run for a long time.'}
  const rcv=$('r-civ');if(rcv){rcv.textContent=S.civsSaved+'/'+S.civsTotal;rcv.className='sv '+(S.civsSaved===S.civsTotal?'g':S.civsSaved>0?'y':'r')}
  // Evidence reveal — show flavor line only if collected; otherwise hide the block
  const evWrap=$('r-ev-wrap'),evName=$('r-ev-name'),evLine=$('r-ev-line');
  if(evWrap){if(S.evCollected){evWrap.style.display='block';evName.textContent=S.evCollected.n;evLine.textContent=S.evCollected.line}else{evWrap.style.display='none'}}
  $('rm').textContent=won?'You held the line this time. The water remembers.':'The lake hazards are real — and something below the waterline is awake.';
  const rcd=$('rc');rcd.style.background=rc;rcd.style.borderColor=rc.replace('0.08','0.15');rcd.style.border='1px solid '+rc.replace('0.08','0.2');
  $('rlbl').textContent=rl;$('rmsg').textContent=rm;$('rlbl').style.color=rl==='CLEAN EXTRACTION'?'#10b981':'#f87171';$('rmsg').style.color=rl==='CLEAN EXTRACTION'?'#a7f3d0':'#fecaca';
  // Tiered discount earned from run quality
  S.outcome=rl;S.discount=DISC[rl]||0;
  paintDiscount();
  saveData(won);show('s5')}

// Paint the dynamic discount across s5 (result) and s3 (plans)
function paintDiscount(){
  const d=S.discount;
  const r5badge=$('r-disc-badge'),r5text=$('r-disc-text'),r5btn=$('r-disc-btn'),r5wrap=$('r-disc-wrap');
  const tdbadge=$('td-badge'),tdtext=$('td-text'),tdwrap=$('td');
  if(d>0){
    if(r5wrap){r5wrap.style.display='block';r5badge.textContent=d+'% OFF';r5text.innerHTML='earned through your run — applied to your first month';r5btn.textContent='View Plans — '+d+'% Off Applied'}
    if(tdbadge){tdbadge.textContent=d+'% OFF';tdtext.innerHTML='first month — earned through your '+S.outcome.toLowerCase()+' run';tdwrap.classList.remove('off')}
  }else{
    // OVERRUN — no discount earned, but still let them see plans
    if(r5wrap){r5wrap.style.display='block';r5badge.textContent='NO DISCOUNT';r5text.innerHTML='The Depth took you. Run it clean to unlock <strong>up to 15% off</strong>.';r5btn.textContent='View Protection Plans'}
    if(tdwrap)tdwrap.classList.add('off');
  }
}

// === SERVICES ===
async function fetchWx(){try{const r=await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${S.lat}&lon=${S.lng}&appid=demo&units=imperial`);if(!r.ok)throw 0;const d=await r.json();S.wx={ws:d.wind?.speed||3,wd:d.wind?.deg||180,g:d.wind?.gust||0,c:d.weather?.[0]?.main||'Clear',t:Math.round(d.main?.temp||72),v:d.visibility||10000}}catch(e){S.wx={ws:3+Math.random()*7,wd:Math.round(Math.random()*360),g:5+Math.random()*5,c:['Clear','Clouds','Overcast'][Math.floor(Math.random()*3)],t:Math.round(65+Math.random()*20),v:5000+Math.random()*5000}}$('wx-c').textContent=`${S.wx.c} ${S.wx.t}°F`;$('wx-w').textContent=`Wind ${S.wx.ws.toFixed(1)}mph`;applyWeatherVisuals()}
async function geocode(a){try{const r=await fetch('/api/geocode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:a})});if(r.ok){const d=await r.json();if(d.lat&&d.lng)return{lat:d.lat,lng:d.lng}}return null}catch(e){return null}}
async function saveData(w){if(!C.SUPABASE_URL||!C.SUPABASE_ANON_KEY)return;try{await fetch(`${C.SUPABASE_URL}/rest/v1/analytics_events`,{method:'POST',headers:{apikey:C.SUPABASE_ANON_KEY,Authorization:`Bearer ${C.SUPABASE_ANON_KEY}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({event_type:'sim_complete',payload:{email:S.email,bc:S.bc,score:S.score,won:w,phases:S.pc,near:S.near,maxSpd:S.maxSpd,wx:S.wx,addr:S.addr}})})}catch(e){}}
async function saveLead(){if(!C.SUPABASE_URL||!C.SUPABASE_ANON_KEY)return;try{const r=await fetch(`${C.SUPABASE_URL}/rest/v1/leads`,{method:'POST',headers:{apikey:C.SUPABASE_ANON_KEY,Authorization:`Bearer ${C.SUPABASE_ANON_KEY}`,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({email:S.email,address:S.addr,lat:S.lat,lng:S.lng,dock_type:'fixed',status:'new'})});if(r.ok){const d=await r.json();S.lid=(Array.isArray(d)?d[0]:d).id}}catch(e){}}

// === ACTIONS ===
function setStep(n){for(let i=1;i<=5;i++){const d=$('st'+i);d.classList.remove('done','active');if(i<n)d.classList.add('done');else if(i===n)d.classList.add('active')}}
function val(){S.addr=$('f-addr').value.trim();S.email=$('f-email').value.trim();if(!S.addr||!S.email){alert('Enter address and email.');return false}if(!S.email.includes('@')){alert('Valid email required.');return false}return true}
async function launch(){if(!val())return;show('s2');setStep(1);$('lt').textContent='Validating Address';$('lm').textContent=S.addr;$('skip-btn').style.display='none';
  try{
    await new Promise(r=>setTimeout(r,300));setStep(2);$('lt').textContent='Locating Waterway';$('lm').textContent='Geocoding your coordinates...';
    const c=await geocode(S.addr);if(c){S.lat=c.lat;S.lng=c.lng}
    setStep(3);$('lt').textContent='Reading Conditions';$('lm').textContent='Fetching live weather...';await fetchWx();
    setStep(4);$('lt').textContent='Enlisting';$('lm').textContent='Logging your run...';$('skip-btn').style.display='block';await saveLead();
    setStep(5);$('lt').textContent='Deploying';$('lm').textContent='Building the op...';await new Promise(r=>setTimeout(r,400));
    startGame();setTimeout(()=>{if(S.on)endGame(false)},90000)
  }catch(e){alert('Error: '+e.message);show('s1')}}
async function skip(){if(!val())return;show('s2');setStep(1);$('lt').textContent='Processing';$('lm').textContent='Analyzing...';$('skip-btn').style.display='none';
  try{
    setStep(2);const c=await geocode(S.addr);if(c){S.lat=c.lat;S.lng=c.lng}
    setStep(3);$('lm').textContent='Fetching conditions...';await fetchWx();
    setStep(4);$('lm').textContent='Registering...';await saveLead();
    setStep(5);await new Promise(r=>setTimeout(r,300));
    $('td').classList.add('off');$('pft').classList.remove('off');$('f-scr').textContent='—';show('s3')
  }catch(e){alert('Error: '+e.message);show('s1')}}
function skipFromLoad(){$('td').classList.add('off');$('pft').classList.remove('off');$('f-scr').textContent='—';show('s3')}
function playFromTier(){startGame();setTimeout(()=>{if(S.on)endGame(false)},90000)}
function showTiers(){if(S.discount>0){$('td').classList.remove('off');$('pft').classList.add('off');paintDiscount()}else if(S.played){$('td').classList.add('off');$('pft').classList.remove('off');$('pft').textContent='Try Again — Earn Up To 15% Off'}else{$('td').classList.add('off');$('pft').classList.remove('off')}show('s3')}
function replay(){startGame();setTimeout(()=>{if(S.on)endGame(false)},90000)}
function boat(c){S.bc=c;document.querySelectorAll('.bo').forEach(el=>{el.classList.toggle('on',el.dataset.b===c);if(el.dataset.b===c){el.style.borderColor=HERO[c].badge;el.style.background=HERO[c].badge+'14'}else{el.style.borderColor='';el.style.background=''}});mkBoat(c);const hb=$('h-hero');if(hb){const h=HERO[c];hb.textContent=h.n.toUpperCase();hb.style.color=h.badge}}
function tier(t){S.ti=t;document.querySelectorAll('.to').forEach(el=>el.classList.toggle('on',parseInt(el.dataset.t)===t))}
async function quote(){const t=TI[S.ti];show('s2');setStep(1);$('lt').textContent='Generating Plan';$('lm').textContent='Building quote...';
  const d=S.discount||0;const price=Math.round(t.p*(1-d/100));
  if(C.SUPABASE_URL&&C.SUPABASE_ANON_KEY){try{setStep(3);
    const r=await fetch(`${C.SUPABASE_URL}/functions/v1/process-lead`,{method:'POST',headers:{Authorization:`Bearer ${C.SUPABASE_ANON_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({lead_id:S.lid,email:S.email,address:S.addr,dock_type:'fixed',daas_tier:S.ti,monthly_price:price,discount_pct:d,run_outcome:S.outcome||''})});
    if(r.ok){const j=await r.json();if(j.checkout_url)S.curl=j.checkout_url}
    setStep(5)}catch(e){console.warn('Quote pipeline:',e)}}
  $('ok-t').textContent=t.n;$('ok-p').textContent=d>0?`$${price}/mo (first month, ${d}% off)`:`$${t.p}/mo`;
  // Waterway risk signal — wind + visibility + outcome
  const rsk=$('ok-risk');if(rsk){const parts=[];if(S.wx.ws>10)parts.push('high wind');if(S.wx.v<5000)parts.push('low visibility');if(S.outcome==='OVERRUN'||S.outcome==='CLOSE CALLS')parts.push('debris risk');rsk.textContent=parts.length?'Conditions on your waterway: '+parts.join(' · '):'Your waterway is running clean today.'}
  show('s4')}
function pay(){if(S.curl)window.open(S.curl,'_blank');else alert('Demo — Stripe activates with keys.')}
function reset(){S.on=false;S.played=false;$('hud').style.display='none';$('wxb').style.display='none';$('nfo').style.display='none';$('phud').style.display='none';$('ww').style.display='none';$('f-addr').value='';$('f-email').value='';aiB.forEach(a=>a.userData.on=false);show('s1')}

initEngine();
return{launch,skip,skipFromLoad,playFromTier,boat,tier,quote,pay,reset,showTiers,replay,ping:fireSonar};
})();

