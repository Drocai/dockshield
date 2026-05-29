const DS=(()=>{
// === GAME_MODE flag ===
// 'game'     : live free-roam mode — funnel UI suppressed, no email gate, no discount bridge.
// 'business' : legacy marketing demo — restores the email/address form, tier plans, discount banners,
//              and Supabase saveLead/saveData/quote/pay pipeline. Kept intact for future reskin into
//              in-game economy / promotional drops / tier cosmetics.
// Flipping this constant fully restores the sales bridge — no business-mode code is deleted, only
// gated on the way in.
const GAME_MODE=(window.__ENV__&&window.__ENV__.GAME_MODE)||'game';
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

let scene,cam,ren,bMesh,waterGeo,waterOZ,stumps=[],aiB=[],civs=[],evidence=null,dropPoints=[];
// Drop point types -> mini-game key, marker color, label, expected mini-game opener function name.
const DP_TYPES=[
  {k:'battle',  col:0xef4444,n:'AMBUSH SIGNAL',  open:'openBattle'},
  {k:'puzzle',  col:0xfbcf3b,n:'CIPHER FLOAT',   open:'openPuzzle'},
  {k:'runner',  col:0x60d0ff,n:'DOCK COLLAPSE',  open:'openRunner'},
  {k:'tetris',  col:0x10b981,n:'TACKLE BOX',     open:'openTetris'}
];
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
// === MINI-GAME SLOTS ===
// Each mini-game key has an opener that pauses S.on while the overlay is up and a finish() helper
// that re-arms the world. Battle/puzzle/runner/tetris bodies land in the next commits; the slots
// are wired now so the drop-point spawner can target them.
let miniActive=false;
const mini={
  finish(dp,score,radioLine,who){
    if(score)S.score+=score;
    if(radioLine)radio(radioLine,who||'self');
    miniActive=false;S.on=true;
    const el=$('mini');if(el)el.style.display='none';
    if(dp)clearDropPoint(dp);
  },
  // === TETRIS: "stack the catch" — falling fish-shaped pieces on a 10x16 grid ===
  openTetris(dp){
    miniActive=true;S.on=false;
    const card=$('mini-card'),el=$('mini');
    const COLS=10,ROWS=16,CELL=20;
    const W=COLS*CELL,H=ROWS*CELL;
    card.innerHTML=`
      <div class="m-kicker" style="color:#10b981">Tackle Box · ${dp.userData.type.n}</div>
      <div class="m-title">Stack the catch.</div>
      <div class="m-sub">Pack the tackle box. Clear lines. Don’t stack out.</div>
      <canvas id="m-tcv" width="${W}" height="${H}"></canvas>
      <div class="sb"><div class="sr"><span class="sl">Lines</span><span class="sv g" id="m-tlines">0</span></div><div class="sr"><span class="sl">Score</span><span class="sv b" id="m-tscr">0</span></div></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px">
        <button class="btn bx" id="m-tl">◀</button>
        <button class="btn bx" id="m-tr">▶</button>
        <button class="btn bx" id="m-trot">↻</button>
        <button class="btn bx" id="m-td">▼</button>
      </div>
      <button class="btn bx" id="m-tquit" style="margin-top:8px">Bail Out</button>`;
    const cv=$('m-tcv'),ctx=cv.getContext('2d');
    // 7 standard tetrominoes
    const PIECES=[
      {c:'#60d0ff',s:[[1,1,1,1]]},                     // I
      {c:'#fbcf3b',s:[[1,1],[1,1]]},                   // O
      {c:'#a78bfa',s:[[0,1,0],[1,1,1]]},               // T
      {c:'#10b981',s:[[0,1,1],[1,1,0]]},               // S
      {c:'#ef4444',s:[[1,1,0],[0,1,1]]},               // Z
      {c:'#3b82f6',s:[[1,0,0],[1,1,1]]},               // J
      {c:'#f59e0b',s:[[0,0,1],[1,1,1]]}                // L
    ];
    const G={grid:Array.from({length:ROWS},()=>Array(COLS).fill(0)),lines:0,score:0,alive:true};
    const newPiece=()=>{
      const p=PIECES[Math.floor(Math.random()*PIECES.length)];
      G.cur={shape:p.s.map(r=>r.slice()),color:p.c,x:Math.floor(COLS/2)-Math.floor(p.s[0].length/2),y:0};
      if(collides(G.cur,0,0)){G.alive=false;end()}
    };
    const collides=(p,dx,dy)=>{
      for(let r=0;r<p.shape.length;r++)for(let c=0;c<p.shape[r].length;c++){
        if(!p.shape[r][c])continue;
        const ny=p.y+r+dy,nx=p.x+c+dx;
        if(nx<0||nx>=COLS||ny>=ROWS)return true;
        if(ny>=0&&G.grid[ny][nx])return true;
      }
      return false;
    };
    const lock=()=>{
      G.cur.shape.forEach((row,r)=>row.forEach((v,c)=>{if(v&&G.cur.y+r>=0)G.grid[G.cur.y+r][G.cur.x+c]=G.cur.color}));
      // Clear lines
      let cleared=0;
      for(let r=ROWS-1;r>=0;r--){if(G.grid[r].every(v=>v)){G.grid.splice(r,1);G.grid.unshift(Array(COLS).fill(0));cleared++;r++}}
      if(cleared){G.lines+=cleared;G.score+=[0,40,100,300,1200][cleared]}
      newPiece();
    };
    const rotate=()=>{
      const r=G.cur.shape;const n=r[0].map((_,i)=>r.map(row=>row[i]).reverse());
      const old=G.cur.shape;G.cur.shape=n;if(collides(G.cur,0,0))G.cur.shape=old;
    };
    const move=dx=>{if(!collides(G.cur,dx,0))G.cur.x+=dx};
    const drop=()=>{
      if(!collides(G.cur,0,1))G.cur.y++;
      else lock();
    };
    const render=()=>{
      ctx.fillStyle='#02060f';ctx.fillRect(0,0,W,H);
      // grid lines
      ctx.strokeStyle='rgba(251,146,60,0.06)';for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)ctx.strokeRect(c*CELL,r*CELL,CELL,CELL);
      // locked cells
      for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){if(G.grid[r][c]){ctx.fillStyle=G.grid[r][c];ctx.fillRect(c*CELL+1,r*CELL+1,CELL-2,CELL-2)}}
      // current piece
      if(G.cur){ctx.fillStyle=G.cur.color;G.cur.shape.forEach((row,r)=>row.forEach((v,c)=>{if(v)ctx.fillRect((G.cur.x+c)*CELL+1,(G.cur.y+r)*CELL+1,CELL-2,CELL-2)}))}
      $('m-tlines').textContent=G.lines;$('m-tscr').textContent=G.score;
    };
    const tick=()=>{
      if(!G.alive)return;
      drop();render();
      G.timer=setTimeout(tick,Math.max(200,520-G.lines*22));
    };
    const end=()=>{
      if(G.timer)clearTimeout(G.timer);document.removeEventListener('keydown',keyHandler);
      const line=G.lines>=4?'Tackle box packed. Clean.':G.lines>0?'Packed enough to ride out.':'Box overflowed. Bait’s lost.';
      mini.finish(dp,G.score+G.lines*25,line,G.lines>=4?'lilly':'self');
    };
    const keyHandler=e=>{
      if(!miniActive)return;
      if(e.code==='ArrowLeft'){e.preventDefault();move(-1);render()}
      if(e.code==='ArrowRight'){e.preventDefault();move(1);render()}
      if(e.code==='ArrowUp'){e.preventDefault();rotate();render()}
      if(e.code==='ArrowDown'){e.preventDefault();drop();render()}
    };
    document.addEventListener('keydown',keyHandler);
    $('m-tl').onclick=()=>{move(-1);render()};
    $('m-tr').onclick=()=>{move(1);render()};
    $('m-trot').onclick=()=>{rotate();render()};
    $('m-td').onclick=()=>{drop();render()};
    $('m-tquit').onclick=()=>{G.alive=false;end()};
    newPiece();render();
    el.style.display='flex';tick();
    radio('Tackle box overflowing. Pack it down.','self');
  },
  // === RUNNER: side-scrolling "dock collapse" — Lilly running across breaking planks ===
  openRunner(dp){
    miniActive=true;S.on=false;
    const card=$('mini-card'),el=$('mini');
    const W=440,H=200;
    card.innerHTML=`
      <div class="m-kicker" style="color:#60d0ff">Dock Collapse · ${dp.userData.type.n}</div>
      <div class="m-title">Run.</div>
      <div class="m-sub">Planks falling behind you. Tap / Space to jump. Don’t stop. Don’t look back.</div>
      <canvas id="m-rcv" width="${W}" height="${H}"></canvas>
      <div class="sb"><div class="sr"><span class="sl">Distance</span><span class="sv b" id="m-rdist">0m</span></div></div>
      <button class="btn bx" id="m-rquit">Bail Out</button>`;
    const cv=$('m-rcv'),ctx=cv.getContext('2d');
    // Game state
    const G={x:60,y:H-40,vy:0,grounded:true,dist:0,alive:true,speed:3,obstacles:[],t0:Date.now()};
    const jump=()=>{if(G.grounded&&G.alive){G.vy=-9;G.grounded=false}};
    // Spawn obstacles (gap between planks) at random intervals
    const spawn=()=>{
      const gap=60+Math.random()*30;G.obstacles.push({x:W+10,w:gap});
      const nextIn=900+Math.random()*1200;
      G.spawnTimer=setTimeout(spawn,nextIn);
    };
    G.spawnTimer=setTimeout(spawn,800);
    const tick=()=>{
      if(!G.alive){return}
      // Physics
      G.vy+=0.5;G.y+=G.vy;if(G.y>=H-40){G.y=H-40;G.vy=0;G.grounded=true}
      G.dist+=G.speed;G.speed=Math.min(7,3+G.dist/2000);
      // Move obstacles + collision
      for(let i=G.obstacles.length-1;i>=0;i--){
        const o=G.obstacles[i];o.x-=G.speed;
        // Player is at x=60-78, y=(H-40)-32 .. (H-40)+10
        const inX=(60+18>o.x)&&(60<o.x+o.w);
        const onGround=G.y>=H-44;
        if(inX&&onGround){G.alive=false;end();return}
        if(o.x<-60)G.obstacles.splice(i,1);
      }
      // Render
      ctx.fillStyle='#02060f';ctx.fillRect(0,0,W,H);
      // sky band
      const grd=ctx.createLinearGradient(0,0,0,H);grd.addColorStop(0,'#0c1822');grd.addColorStop(1,'#02060f');ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);
      // dock baseline + planks
      ctx.fillStyle='#5a4210';ctx.fillRect(0,H-30,W,30);
      ctx.fillStyle='#8B6914';for(let x=-G.dist%40;x<W;x+=40)ctx.fillRect(x,H-30,36,4);
      // gaps
      ctx.fillStyle='#02060f';G.obstacles.forEach(o=>ctx.fillRect(o.x,H-30,o.w,30));
      // Lilly figure (simple stick)
      ctx.fillStyle='#10b981';ctx.fillRect(60,G.y-20,18,28);
      ctx.fillStyle='#d4a373';ctx.beginPath();ctx.arc(69,G.y-26,7,0,Math.PI*2);ctx.fill();
      // HUD overlay
      $('m-rdist').textContent=Math.round(G.dist/10)+'m';
      G.raf=requestAnimationFrame(tick);
    };
    const end=()=>{
      if(G.spawnTimer)clearTimeout(G.spawnTimer);if(G.raf)cancelAnimationFrame(G.raf);
      cv.onclick=null;document.removeEventListener('keydown',keyHandler);
      const dist=Math.round(G.dist/10),score=Math.min(400,dist*2);
      const line=dist>200?'You outran it. Barely.':'The dock took it. Hull held.';
      mini.finish(dp,score,line,'lilly');
    };
    const keyHandler=e=>{if(e.code==='Space'){e.preventDefault();jump()}};
    document.addEventListener('keydown',keyHandler);
    cv.onclick=jump;cv.ontouchstart=e=>{e.preventDefault();jump()};
    $('m-rquit').onclick=()=>{G.alive=false;end()};
    el.style.display='flex';tick();
    radio('Dock’s coming apart. Move.','self');
  },
  // === PUZZLE: 3-question lore quiz drawn from Castor Bayou canon ===
  openPuzzle(dp){
    miniActive=true;S.on=false;
    const card=$('mini-card'),el=$('mini');
    // Question pool — canon-correct answer is always index 0; shuffled at render time.
    const POOL=[
      {q:'Why does the Garbone bait shop owner warn divers away from the Deep Dock?',a:['A cleanup crew went down there and never surfaced.','Bass season is closed and you’ll catch a fine.','The dock’s wood is rotten and unsafe.']},
      {q:'What lies below the surface of the Sunk Road?',a:['A former roadway flooded after a dam failure — headlights still appear at night.','A cypress grove planted as a memorial.','A submarine training course from the 60s.']},
      {q:'What is happening at the Quarantine Line?',a:['Corporate security blocks a contaminated canal full of fused barrels.','Tournament fishing checkpoint with weigh-in scales.','State park boundary with a no-wake zone.']},
      {q:'Why does Lilly Loch transform?',a:['The bayou pressure rises and her body answers it.','She’s testing prototype superhero suits one at a time.','A fishing accident exposed her to a chemical spill.']},
      {q:'What is the Flooded Chapel known for?',a:['It holds evidence that Bayou Bay has had cycles of water events before.','It was relocated and rebuilt on the new shoreline.','It’s a popular spot for sunrise weddings.']}
    ];
    const picks=[...POOL].sort(()=>Math.random()-0.5).slice(0,3);
    // Shuffle each question's answers but track the canon-correct index.
    const qs=picks.map(p=>{const order=p.a.map((a,i)=>({a,correct:i===0})).sort(()=>Math.random()-0.5);return{q:p.q,answers:order}});
    let i=0,right=0;
    const render=()=>{
      const cur=qs[i];
      card.innerHTML=`
        <div class="m-kicker" style="color:#fbcf3b">Cipher Float · ${dp.userData.type.n}</div>
        <div class="m-title">${i+1}/3 · Read the water.</div>
        <div class="m-sub">${cur.q}</div>
        <div class="q-opts">
          ${cur.answers.map((o,k)=>`<button class="q-opt" data-k="${k}">${o.a}</button>`).join('')}
        </div>
        <div class="sb"><div class="sr"><span class="sl">Correct so far</span><span class="sv g">${right}/3</span></div></div>`;
      card.querySelectorAll('.q-opt').forEach(b=>b.onclick=()=>pick(parseInt(b.dataset.k)));
    };
    const pick=k=>{
      const cur=qs[i];
      if(cur.answers[k].correct){right++;radio('Right read. That tracks with the case file.','lilly')}
      else radio('Wrong thread. Disinformation’s easy bait out here.','fly');
      i++;
      if(i>=qs.length){
        const score=right===3?225:right*60;
        const line=right===3?'Three for three. Castor Bayou opens up a little more.':right>0?'Some of it landed. The water remembers the rest.':'All bait, no catch. Don’t trust the easy answer here.';
        mini.finish(dp,score,line,right===3?'lilly':'fly');
      }else render();
    };
    el.style.display='flex';render();
    radio('Cipher float in the shallows — three reads.','self');
  },
  // === BATTLE: surfaced cryptid combat using sonar pings ===
  // The player has been ambushed by something that surfaced at this drop point. Each PING button
  // press deals damage. Cryptid bites back on a timer reducing player hull. Win at 5 hits.
  openBattle(dp){
    miniActive=true;S.on=false;
    const card=$('mini-card'),el=$('mini');
    let hits=0,need=5,creatureHp=100,playerHull=Math.round(S.hull),lastBite=Date.now();
    const render=()=>{
      card.innerHTML=`
        <div class="m-kicker" style="color:#ef4444">Ambush · ${dp.userData.type.n}</div>
        <div class="m-title">Something came up.</div>
        <div class="m-sub">It surfaced under the boat. Light it up with the sonar before it tears through the hull.</div>
        <div class="sb"><div class="sr"><span class="sl">Creature</span><span class="sv r">${creatureHp}%</span></div><div class="sr"><span class="sl">Your Hull</span><span class="sv ${playerHull<30?'r':playerHull<60?'y':'g'}">${playerHull}%</span></div><div class="sr"><span class="sl">Hits</span><span class="sv b">${hits}/${need}</span></div></div>
        <button class="btn bp" id="m-ping" style="background:linear-gradient(135deg,#60d0ff,#3b82f6);box-shadow:0 4px 16px rgba(96,208,255,0.4)">Fire Sonar (Space)</button>
        <button class="btn bx" id="m-flee">Fall Back</button>`;
      $('m-ping').onclick=fire;$('m-flee').onclick=flee;
    };
    const fire=()=>{
      if(creatureHp<=0)return;
      creatureHp=Math.max(0,creatureHp-22);hits++;
      if(creatureHp<=0){win();return}
      render();
    };
    const flee=()=>{
      // Falling back costs hull (the creature got a parting shot) but ends the mission alive.
      S.hull=Math.max(1,S.hull-15);
      mini.finish(dp,25,'Pulled back. It’s still down there.',S.bc==='speedboat'?'fly':'self');
    };
    const win=()=>{
      S.hull=Math.min(100,Math.max(1,playerHull));  // apply remaining hull from battle state
      mini.finish(dp,250,'Hit clean. It went back under — for now.','reel');
    };
    const lose=()=>{
      mini.finish(dp,0,'It dragged us under. Hull breach.','reel');
      S.hull=0;
    };
    // Bite tick: every 3s the creature damages the player's battle-state hull. Player hull persists.
    const biteTimer=setInterval(()=>{
      if(!miniActive||creatureHp<=0){clearInterval(biteTimer);return}
      playerHull=Math.max(0,playerHull-8);S.hull=playerHull;
      if(playerHull<=0){clearInterval(biteTimer);lose();return}
      render();
    },3000);
    // Spacebar also fires while the overlay is up
    const keyHandler=e=>{if(e.code==='Space'&&miniActive&&dp.userData.type.k==='battle'){e.preventDefault();fire()}};
    document.addEventListener('keydown',keyHandler);
    // Clean up the keyhandler when this mini ends.
    const origFinish=mini.finish;
    mini.finish=function(...args){document.removeEventListener('keydown',keyHandler);clearInterval(biteTimer);mini.finish=origFinish;return origFinish.apply(this,args)};
    el.style.display='flex';render();
    radio('Surfaced contact. Fire on it.','fly');
  }
};

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
  // Free-roam world: 1200×1200 water plane (was 800×800) so there's room to actually drive.
  waterGeo=new THREE.PlaneGeometry(1200,1200,96,96);
  const wM=new THREE.MeshStandardMaterial({color:0x0b3038,roughness:0.15,metalness:0.75,transparent:true,opacity:0.94,envMapIntensity:1.2});
  waterOZ=new Float32Array(waterGeo.attributes.position.count);
  for(let i=0;i<waterGeo.attributes.position.count;i++)waterOZ[i]=waterGeo.attributes.position.getZ(i);
  const waterMesh=new THREE.Mesh(waterGeo,wM);waterMesh.rotation.x=-Math.PI/2;waterMesh.receiveShadow=true;scene.add(waterMesh);

  mkBoat('pontoon');
  mkDock();mkWorld();mkObstacles();mkAI();mkWaypoints();mkCivs();mkEvidence();mkCryptid();mkMist();
  if(GAME_MODE==='game')mkDropPoints();

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

// === DROP POINTS — randomly spawned mini-game anchors ===
// Spawns 3 simultaneous drop points across the larger world; cleared drop points respawn at a
// fresh random position with a fresh random type after a short delay.
function mkDropPoint(type){
  const g=new THREE.Group();
  // Beacon column - thinner version of the dock pin marker, color-coded by type
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,12,8),new THREE.MeshBasicMaterial({color:type.col,transparent:true,opacity:0.55}));beam.position.y=6;g.add(beam);
  const tip=new THREE.Mesh(new THREE.SphereGeometry(1,12,12),new THREE.MeshStandardMaterial({color:type.col,emissive:type.col,emissiveIntensity:0.7}));tip.position.y=10;g.add(tip);
  // Beacon ring on the water — same pattern as dock beacon
  const ring=new THREE.Mesh(new THREE.RingGeometry(4,5,32),new THREE.MeshBasicMaterial({color:type.col,transparent:true,opacity:0.35,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=0.1;g.add(ring);
  // Soft point light so it reads on dark water
  const lt=new THREE.PointLight(type.col,1.2,28);lt.position.y=2;g.add(lt);
  g.userData={type,ring,active:true};
  return g;
}
function spawnDropPoint(){
  const type=DP_TYPES[Math.floor(Math.random()*DP_TYPES.length)];
  // Random position in the playable ring (radius 40-110 from origin, avoiding shores beyond ~140).
  let x,z,tries=0;
  do{const a=Math.random()*Math.PI*2,r=40+Math.random()*70;x=Math.cos(a)*r;z=Math.sin(a)*r;tries++}
  while(tries<10&&dropPoints.some(d=>d.position.distanceTo(new THREE.Vector3(x,0,z))<30));
  const dp=mkDropPoint(type);dp.position.set(x,0,z);scene.add(dp);dropPoints.push(dp);
}
function mkDropPoints(){for(let i=0;i<3;i++)spawnDropPoint()}
function tickDropPoints(t){
  for(let i=dropPoints.length-1;i>=0;i--){
    const dp=dropPoints[i],u=dp.userData;
    if(!u.active)continue;
    // Animate ring opacity + tip bob
    if(u.ring)u.ring.material.opacity=0.25+Math.sin(t*2+i)*0.15;
    dp.children[1].position.y=10+Math.sin(t*1.5+i)*0.4;
    // Proximity trigger
    if(S.on&&!miniActive&&bMesh.position.distanceTo(dp.position)<5){
      u.active=false;
      // Hide the marker while the mini-game is open; respawn after the mini-game resolves.
      dp.visible=false;
      const fn=mini[u.type.open];
      if(typeof fn==='function')fn(dp);else{
        // Mini-game not built yet — placeholder: just clear it + radio + respawn.
        radio('Drop point "'+u.type.n+'" reached — mini-game placeholder.','fly');
        S.score+=50;clearDropPoint(dp);
      }
    }
  }
}
function clearDropPoint(dp){
  // Remove the resolved drop point and spawn a replacement at a new random spot.
  scene.remove(dp);const idx=dropPoints.indexOf(dp);if(idx>=0)dropPoints.splice(idx,1);
  setTimeout(()=>{if(S.on&&dropPoints.length<3)spawnDropPoint()},2000);
}

function mkMist(){
  // Low atmospheric mist over the water — Points cloud, slow rotation.
  const cnt=400;const pos=new Float32Array(cnt*3);
  for(let i=0;i<cnt;i++){const a=Math.random()*Math.PI*2,r=20+Math.random()*220;pos[i*3]=Math.cos(a)*r;pos[i*3+1]=0.4+Math.random()*1.6;pos[i*3+2]=Math.sin(a)*r}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const m=new THREE.PointsMaterial({color:0xb0c4d0,size:0.8,transparent:true,opacity:0.18,depthWrite:false});
  const mist=new THREE.Points(g,m);scene.add(mist);scene._mist=mist;
}

function drawMinimap(){
  const c=$('mm-canvas');if(!c)return;
  const ctx=c.getContext('2d'),W=c.width,H=c.height,scl=0.42;  // scale: world u -> px
  ctx.clearRect(0,0,W,H);
  // ring background
  ctx.fillStyle='rgba(3,7,18,0.7)';ctx.beginPath();ctx.arc(W/2,H/2,W/2-1,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='rgba(251,146,60,0.3)';ctx.lineWidth=1;ctx.stroke();
  // origin (dock)
  ctx.fillStyle='#fb923c';ctx.fillRect(W/2-2,H/2-2,4,4);
  // boat dot
  const bx=W/2+bMesh.position.x*scl,bz=H/2+bMesh.position.z*scl;
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(bx,bz,3,0,Math.PI*2);ctx.fill();
  // heading line
  const hx=bx+Math.sin(bMesh.rotation.y)*-8,hz=bz+Math.cos(bMesh.rotation.y)*-8;
  ctx.strokeStyle='#fb923c';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(bx,bz);ctx.lineTo(hx,hz);ctx.stroke();
  // drop points
  dropPoints.forEach(dp=>{if(!dp.userData.active)return;const dx=W/2+dp.position.x*scl,dz=H/2+dp.position.z*scl;ctx.fillStyle='#'+dp.userData.type.col.toString(16).padStart(6,'0');ctx.beginPath();ctx.arc(dx,dz,3,0,Math.PI*2);ctx.fill()});
}

function mkCryptid(){
  // Dark elongated silhouette under the water. No collision, no damage — pure flavor.
  // Three stacked tapered cylinders read as a long fish-like form.
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CylinderGeometry(0.4,1.2,6,8),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.35}));body.rotation.z=Math.PI/2;body.position.y=-0.4;g.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.9,8,6),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.4}));head.position.set(3,-0.4,0);g.add(head);
  const tail=new THREE.Mesh(new THREE.ConeGeometry(0.8,2.5,6),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.3}));tail.rotation.z=-Math.PI/2;tail.position.set(-3.5,-0.4,0);g.add(tail);
  g.visible=false;scene.add(g);scene._cryptid=g;
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
  let pinged=0;
  for(const s of stumps){if(s.position.distanceTo(origin)>25)continue;
    const h=new THREE.Mesh(new THREE.RingGeometry(1.2,1.5,18),new THREE.MeshBasicMaterial({color:0xfb923c,transparent:true,opacity:0.65,side:THREE.DoubleSide}));
    h.rotation.x=-Math.PI/2;h.position.set(s.position.x,0.12,s.position.z);scene.add(h);
    stumpHighlights.push({m:h,t0:now});pinged++;
  }
  radio(pinged>0?'Ping out. '+pinged+' hits in the ring.':'Ping out. Water reads clean — for now.','fly');
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

// === RADIO CHATTER ===
// Single-line overlay, fades after ~4s. Voice picks the right hero based on `who`:
// 'self' = the player's selected hero; otherwise a fixed role for that beat.
function radio(text,who='self'){
  const el=$('radio');if(!el)return;
  let hero;
  if(who==='self')hero=HERO[S.bc];
  else if(who==='reel')hero=HERO.regular;
  else if(who==='lilly')hero=HERO.pontoon;
  else if(who==='fly')hero=HERO.speedboat;
  else hero=HERO[S.bc];
  el.style.borderLeftColor=hero.badge;
  el.querySelector('.r-who').textContent=hero.n;
  el.querySelector('.r-who').style.color=hero.badge;
  el.querySelector('.r-line').textContent=text;
  el.style.display='block';el.style.opacity='1';
  clearTimeout(radio._t);radio._t=setTimeout(()=>{el.style.opacity='0';setTimeout(()=>{if(el.style.opacity==='0')el.style.display='none'},400)},4000);
}

// === 3-PHASE MISSION ===
const PH=[{n:'APPROACH',d:'Follow the rescue markers',check:()=>wpI>=4},{n:'THE SHALLOWS',d:'Avoid the debris — watch the water',check:()=>bMesh.position.distanceTo(dockPos)<55},{n:'EXTRACTION',d:'Slow down — bring them in',check:()=>bMesh.position.distanceTo(dockPos)<8}];
function setPh(p){S.phase=p;if(p>2)return;$('pn').textContent=PH[p].n;$('pd').textContent=PH[p].d;$('pfill').style.width=((p+1)/3*100)+'%';
  if(p===0){wpI=0;wps.forEach((w,i)=>{w.visible=i===0;if(w.userData.inner)w.userData.inner.visible=i===0});radio(HERO[S.bc].voice.start)}
  if(p===1){aiB.forEach(a=>a.userData.on=true);$('ww').style.display='block';setTimeout(()=>$('ww').style.display='none',4000);wps.forEach(w=>{w.visible=false;if(w.userData.inner)w.userData.inner.visible=false});S.pc=1;radio('Phase two. Shallows live. Stay sharp.','fly')}
  if(p===2){$('nfo').textContent='SLOW DOWN — Extraction';$('nfo').style.color='#f59e0b';S.pc=2;radio('Phase three. Bring them in slow.','fly')}}

function tickPh(){const d=bMesh.position.distanceTo(dockPos),p=S.phase;
  if(p===0&&wpI<wps.length){const w=wps[wpI];if(w.visible){w.material.opacity=0.25+Math.sin(Date.now()*0.005)*0.15;if(w.userData.inner)w.userData.inner.material.opacity=0.15+Math.sin(Date.now()*0.008)*0.1;if(bMesh.position.distanceTo(w.position)<6){w.visible=false;if(w.userData.inner)w.userData.inner.visible=false;S.score+=50;wpI++;if(wpI<wps.length){wps[wpI].visible=true;if(wps[wpI].userData.inner)wps[wpI].userData.inner.visible=true}}}}
  if(p<2&&PH[p].check())setPh(p+1);
  if(p>=1)tickAI();
  if(p===2&&Math.abs(spd)>0.4)S.score=Math.max(0,S.score-2)}
// Roaming AI boat motion — shared by business phases and free-roam.
function tickAI(){const t=Date.now()*0.001;aiB.forEach(a=>{if(!a.userData.on)return;a.position.x=a.userData.ox+Math.sin(t*0.6+a.userData.w)*50;a.position.z=a.userData.oz+Math.cos(t*0.4+a.userData.w)*10;a.position.y=0.3+Math.sin(t*2+a.userData.w)*0.15;if(bMesh.position.distanceTo(a.position)<4)S.near+=2})}

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
  // Day/night cycle — 6-minute loop. Sun position arcs, sun color warms/cools, sky tints.
  if(scene._sunDisc&&scene._sun){
    const cyc=(t%360)/360,ang=cyc*Math.PI*2;
    const sunY=Math.sin(ang)*60+30;const sunX=Math.cos(ang)*120;
    scene._sunDisc.position.set(sunX,sunY,-280);if(scene._sunHalo)scene._sunHalo.position.copy(scene._sunDisc.position);
    // Cool when low (night-ish), warm at midday.
    const dayness=Math.max(0,Math.sin(ang));
    scene._sun.intensity=0.4+dayness*1.0;
    if(S.wx.c==='Clear'){scene.background.r=0.027+dayness*0.020;scene.background.g=0.082+dayness*0.030;scene.background.b=0.125+dayness*0.030}
  }
  // Atmospheric mist drift — Points cloud spawned in mkMist(), shifts on the wind.
  if(scene._mist){const m=scene._mist;m.rotation.y=t*0.01;m.position.y=2+Math.sin(t*0.2)*0.4}
  // Minimap update
  if(S.on&&$('mm-canvas')){drawMinimap()}
  // Cryptid drift — phase >=1 only, slow sinusoidal pass under the water
  if(scene._cryptid&&S.on&&S.phase>=1){
    const c=scene._cryptid;c.visible=true;
    const ct=t*0.18;
    c.position.set(Math.sin(ct)*30,-1.2+Math.sin(t*0.5)*0.15,-40+Math.cos(ct*0.7)*25);
    c.rotation.y=ct+Math.PI*0.5;
  }else if(scene._cryptid){scene._cryptid.visible=false}
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
    if(S.phase>=1&&t-S.lastSurge>4+(S.surgeRand||3)){S.lastSurge=t;S.surgeRand=Math.random()*3;const sa=Math.random()*Math.PI*2;bMesh.position.x+=Math.cos(sa)*2;bMesh.position.z+=Math.sin(sa)*2;$('ww').textContent='BLACKWATER SURGE';$('ww').style.display='block';setTimeout(()=>{if($('ww').textContent==='BLACKWATER SURGE')$('ww').style.display='none'},1400);radio(HERO[S.bc].voice.surge,'reel')}
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
        radio(HERO[S.bc].voice.evidence);
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
          if(S.civsSaved===1)radio(HERO[S.bc].voice.rescue);
        }else if(dc<2.2&&$('ww').textContent!=='TOO FAST FOR PICKUP'){
          $('ww').textContent='TOO FAST FOR PICKUP';$('ww').style.display='block';setTimeout(()=>{if($('ww').textContent==='TOO FAST FOR PICKUP')$('ww').style.display='none'},1200);
        }
      }
    }
    spawnWake();tickWakes();tickRain();tickSonar();
    if(GAME_MODE==='game'){tickDropPoints(t);tickAI()}
    // Business mode: reaching the dock wins the run. Game mode: dock is just a POI;
    // runs end on hull=0 (sink) or player-triggered "End Run".
    if(GAME_MODE==='business'){tickPh();if(dd<8){S.pc=3;endGame(true)}}
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
  // Phase HUD is business-mode only — the free-roam world has no APPROACH/SHALLOWS/EXTRACTION arc.
  $('hud').style.display='flex';$('wxb').style.display='block';$('nfo').style.display='block';if(GAME_MODE==='business')$('phud').style.display='block';
  // Minimap visible only in game mode (free-roam navigation aid).
  const mm=$('minimap');if(mm)mm.style.display=GAME_MODE==='game'?'block':'none';
  // Game-mode "End Run" button so the player can choose to end and see the recap.
  const er=$('end-run');if(er)er.style.display=GAME_MODE==='game'?'block':'none';
  $('nfo').textContent=GAME_MODE==='game'?'WASD / Arrows · Space = Sonar Ping · Drive to a beacon to start a mission':'WASD / Arrows · Space = Sonar Ping · Follow the rescue markers';$('nfo').style.color='#475569';
  if(GAME_MODE==='business')setPh(0);
  else{
    // Free-roam: no phase arc, but the hazards that were gated on phase>=1 (cryptid, blackwater
    // surge, roaming AI boats) should be live for the whole run. Activate them directly.
    S.phase=1;aiB.forEach(a=>a.userData.on=true);radio(HERO[S.bc].voice.start);
  }
  show(null);
  // show(null) now handles touch display for mobile
}

// === RESULT → SALES BRIDGE ===
function endGame(won){S.on=false;S.played=true;$('hud').style.display='none';$('nfo').style.display='none';$('phud').style.display='none';$('ww').style.display='none';const er=$('end-run');if(er)er.style.display='none';const mm=$('minimap');if(mm)mm.style.display='none';aiB.forEach(a=>a.userData.on=false);
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
  // Business-mode pipeline: paint the discount banner + send the analytics_events row.
  // In game mode, s5 still shows score/civilians/evidence but no discount/plans bridge.
  if(GAME_MODE==='business'){paintDiscount();saveData(won)}
  show('s5')}

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
    setStep(4);$('lt').textContent='Enlisting';$('lm').textContent='Logging your run...';$('skip-btn').style.display='block';if(GAME_MODE==='business')await saveLead();
    setStep(5);$('lt').textContent='Deploying';$('lm').textContent='Building the op...';await new Promise(r=>setTimeout(r,400));
    startGame();if(GAME_MODE==='business')setTimeout(()=>{if(S.on)endGame(false)},90000)
  }catch(e){alert('Error: '+e.message);show('s1')}}
async function skip(){if(!val())return;show('s2');setStep(1);$('lt').textContent='Processing';$('lm').textContent='Analyzing...';$('skip-btn').style.display='none';
  try{
    setStep(2);const c=await geocode(S.addr);if(c){S.lat=c.lat;S.lng=c.lng}
    setStep(3);$('lm').textContent='Fetching conditions...';await fetchWx();
    setStep(4);$('lm').textContent='Registering...';if(GAME_MODE==='business')await saveLead();
    setStep(5);await new Promise(r=>setTimeout(r,300));
    $('td').classList.add('off');$('pft').classList.remove('off');$('f-scr').textContent='—';show('s3')
  }catch(e){alert('Error: '+e.message);show('s1')}}
function skipFromLoad(){$('td').classList.add('off');$('pft').classList.remove('off');$('f-scr').textContent='—';show('s3')}
function playFromTier(){startGame();if(GAME_MODE==='business')setTimeout(()=>{if(S.on)endGame(false)},90000)}
function showTiers(){if(S.discount>0){$('td').classList.remove('off');$('pft').classList.add('off');paintDiscount()}else if(S.played){$('td').classList.add('off');$('pft').classList.remove('off');$('pft').textContent='Try Again — Earn Up To 15% Off'}else{$('td').classList.add('off');$('pft').classList.remove('off')}show('s3')}
function replay(){startGame();if(GAME_MODE==='business')setTimeout(()=>{if(S.on)endGame(false)},90000)}
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
  const rsk=$('ok-risk');if(rsk){const parts=[];if(S.wx.ws>10)parts.push('high wind');if(S.wx.v<5000)parts.push('low visibility');if(S.outcome==='OVERRUN'||S.outcome==='CLOSE CALLS')parts.push('debris risk');rsk.textContent=parts.length?'Conditions on Castor Bayou: '+parts.join(' · '):'Castor Bayou is running clean today.'}
  show('s4')}
function pay(){if(S.curl)window.open(S.curl,'_blank');else alert('Demo — Stripe activates with keys.')}
function reset(){S.on=false;S.played=false;$('hud').style.display='none';$('wxb').style.display='none';$('nfo').style.display='none';$('phud').style.display='none';$('ww').style.display='none';if($('f-addr'))$('f-addr').value='';if($('f-email'))$('f-email').value='';aiB.forEach(a=>a.userData.on=false);show('s1');
  // Reset game-mode question state so the entry flow starts fresh on each "New Run".
  if(GAME_MODE==='game'){$('op-grid').style.display='grid';$('op-label').style.display='block';$('begin-btn').style.display='block';$('q-1').style.display='none';$('q-2').style.display='none';S.lore={}}}

// === GAME-MODE ENTRY: hero pick → Q1 → Q2 → free-roam ===
// No email, no address. The two questions tag S.lore so radio chatter can reference them later;
// they don't override the hero pick (player keeps the operative they selected).
function beginRun(){
  if(!S.lore)S.lore={};
  $('op-grid').style.display='none';$('op-label').style.display='none';$('begin-btn').style.display='none';
  $('s1-sub').textContent='Two reads before we shove off. Answer fast — the water doesn’t wait.';
  $('q-1').style.display='block';
}
function qAns(n,h,tag){
  if(!S.lore)S.lore={};
  S.lore['q'+n]={hero:h,tag};
  if(n===1){$('q-1').style.display='none';$('q-2').style.display='block'}
  else{$('q-2').style.display='none';launchGame()}
}
function launchGame(){
  // Game-mode entry bypasses the form/geocode/weather pipeline. Weather still gets a randomized
  // fallback through fetchWx (its catch path). Lat/lng stay at the default constants.
  S.addr='Castor Bayou';S.email='';
  fetchWx().finally(()=>startGame());
}

// Tag body with the active game mode so CSS can hide/show funnel UI without touching every site.
document.body.classList.add('mode-'+GAME_MODE);
initEngine();
function endRun(){if(S.on)endGame(S.hull>0)}
// QA hook (only active with ?qa=1) — force-opens a mini-game with a synthetic drop point so the
// headless smoke + screenshot pass can exercise each overlay without driving to a random beacon.
function qaOpen(kind){
  if(new URLSearchParams(location.search).get('qa')!=='1')return false;
  const type=DP_TYPES.find(d=>d.k===kind);if(!type)return false;
  const dp=mkDropPoint(type);dp.position.set(9999,0,9999);scene.add(dp);dropPoints.push(dp);
  const fn=mini[type.open];if(typeof fn==='function'){fn(dp);return true}return false;
}
return{launch,skip,skipFromLoad,playFromTier,boat,tier,quote,pay,reset,showTiers,replay,ping:fireSonar,beginRun,qAns,launchGame,endRun,qaOpen,mode:GAME_MODE};
})();

