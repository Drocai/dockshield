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
// === PERSISTENCE ===
// Trophy catalog, evidence case file, best score, and the mute pref persist to localStorage so the
// Pokemon-style collection survives reloads, not just same-tab sessions. Guarded for private-mode
// browsers where localStorage throws.
const SAVE_KEY='dockshield_save_v1';
const evidenceCatalog=new Set();
const fishCatalog=new Set();
let bestScore=0,muted=false,bait=0,achievements=new Set();
// Active buffs (consumable items from the tackle shop). Persists across runs until consumed.
let buffs={rareLine:0,sonarBank:0,scoutPing:0};
function loadSave(){
  try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)return;const d=JSON.parse(raw);
    (d.fish||[]).forEach(n=>fishCatalog.add(n));(d.evidence||[]).forEach(n=>evidenceCatalog.add(n));
    (d.ach||[]).forEach(n=>achievements.add(n));
    bestScore=d.best||0;muted=!!d.muted;bait=d.bait||0;
    if(d.buffs)Object.assign(buffs,d.buffs);
  }catch(e){}
}
function persist(){
  try{localStorage.setItem(SAVE_KEY,JSON.stringify({fish:[...fishCatalog],evidence:[...evidenceCatalog],ach:[...achievements],best:bestScore,muted,bait,buffs}))}catch(e){}
}
loadSave();
// Fish species pool with rarity weights, score values, and lore flavor. Higher 'w' = more common.
// Spots on the lake bias which species roll — see FISH_SPOTS below.
const FISH=[
  // common
  {n:'Bluegill',     r:'common',  w:24, s:8,  e:'🐟', f:'Easy money — fries up clean.'},
  {n:'Crappie',      r:'common',  w:20, s:10, e:'🐟', f:'Schools where the shadows fall.'},
  {n:'Channel cat',  r:'common',  w:16, s:14, e:'🐡', f:'Bottom feeder. Big enough.'},
  // uncommon
  {n:'Largemouth bass', r:'uncommon', w:12, s:25, e:'🎣', f:'The Reel would already be on camera.'},
  {n:'Striper',      r:'uncommon', w:10, s:30, e:'🐠', f:'Fights like it owes you money.'},
  {n:'Spotted gar',  r:'uncommon', w:8,  s:35, e:'🦈', f:'Teeth older than the marina.'},
  // rare
  {n:'Bowfin',       r:'rare',    w:5,  s:65, e:'🐉', f:'Living fossil. Lillyloved them as a kid.'},
  {n:'Alligator gar',r:'rare',    w:4,  s:90, e:'🐊', f:'Folks say they used to be bigger. They’re right.'},
  {n:'Mud carp',     r:'rare',    w:3,  s:110,e:'🪲', f:'The Quarantine Line outflow grew these.'},
  // legendary (Castor Bayou specials)
  {n:'Albino bream', r:'legendary', w:1.2, s:280, e:'👻', f:'White as wet paper. Found near the Flooded Chapel.'},
  {n:'Three-eyed pike',r:'legendary', w:0.9, s:420, e:'🐲', f:'Pulled from the Sunk Road waters. Lilly looked at it too long.'},
  {n:'Deep-Dock catch',r:'legendary',w:0.4,s:850, e:'🌑', f:'Doesn’t look right. Something else is on the line below this one.'}
];
const RARE_COLOR={common:'#94a3b8',uncommon:'#fbcf3b',rare:'#a78bfa',legendary:'#10b981'};
// Special spots that bias the fish roll. Within radius r of (x,z), 'bias' species get a 3x weight.
const FISH_SPOTS=[
  {n:'Sunk Road shallows',  x:-80, z:30,  r:25, bias:['Three-eyed pike','Bowfin','Spotted gar']},
  {n:'Flooded Chapel pool', x:90,  z:55,  r:25, bias:['Albino bream','Bowfin']},
  {n:'Quarantine outflow',  x:60,  z:-60, r:20, bias:['Mud carp','Alligator gar']},
  {n:'Deep Dock fringe',    x:-50, z:-105,r:18, bias:['Deep-Dock catch','Alligator gar']}
];
// Pull the active fishing spot (or null if just on open water).
function fishingSpot(pos){return FISH_SPOTS.find(s=>Math.hypot(pos.x-s.x,pos.z-s.z)<=s.r)||null}
// Weighted roll, optionally with a 3x bonus on bias species.
function rollFish(spot){
  // Foul weather stirs the deep — Rain/Drizzle nudge rare + legendary odds up (×2.2). Tournament
  // Line shop buff multiplies rare+legendary weight again (×3) for the next 5 casts.
  const stormy=S.wx&&(S.wx.c==='Rain'||S.wx.c==='Drizzle');
  const tourney=buffs.rareLine>0;
  let pool=FISH.map(f=>{let w=f.w;if(spot&&spot.bias.includes(f.n))w*=3;if(stormy&&(f.r==='rare'||f.r==='legendary'))w*=2.2;if(tourney&&(f.r==='rare'||f.r==='legendary'))w*=3;return {...f,w}});
  if(tourney){buffs.rareLine--;persist()}
  const total=pool.reduce((a,b)=>a+b.w,0);let r=Math.random()*total;
  for(const f of pool){r-=f.w;if(r<=0)return f}return pool[0];
}
// Run-scoped catch log so s5 can summarize the haul.
let runCatches=[];
// Hero identity per boat — kit signature, voice palette, and HUD badge color.
// Voice lines lean on the Character Bible: Reel = bold/quotable, Fly = dry/short, Lilly = country direct.
const HERO={
  regular:{id:'reel',n:'The Reel',role:'Rescue · Control',kit:'Casting rod grapnel + heavy reel winch',badge:'#ef4444',col:'#fca5a5',voice:{start:"Line's tight. Somebody's coming home.",surge:'Bayou Bay paid for a show — keep it together.',rescue:'You can bite the boat — you ain’t getting the people.',evidence:'Got something. Bag it.'}},
  pontoon:{id:'lilly',n:'Lilly Loch',role:'Brawler · Traversal',kit:'Swamp strength + improvised dock-board shield',badge:'#10b981',col:'#a7f3d0',voice:{start:'Water already moved. We move with it.',surge:'Bless your heart, hold on.',rescue:'I got you. Easy, easy.',evidence:'Castor Bayou’s talking. We’re listening.'}},
  speedboat:{id:'fly',n:'The Fly',role:'Recon · Trap',kit:'Fly-line tripwires + hook cams + sonar pings',badge:'#3b82f6',col:'#93c5fd',voice:{start:'That wake has no boat. Move careful.',surge:'Surge. Brace.',rescue:'Civilian out. Clean.',evidence:'Tag it. We’ll read it back at the yard.'}}
};
const TI={1:{n:'Preventative',p:49},2:{n:'Comprehensive',p:99},3:{n:'Premium',p:199}};
let S={addr:'',email:'',bc:'pontoon',ti:2,lat:34.1751,lng:-83.996,on:false,score:0,t0:0,maxSpd:0,dist:0,near:0,lid:null,curl:null,played:false,phase:0,pc:0,hull:100,discount:0,outcome:'',civsSaved:0,civsTotal:0,evCollected:null,missionsCleared:0,wx:{ws:3,wd:180,g:0,c:'Clear',t:72,v:10000}};
// Discount tiers earned by run outcome
const DISC={'FULL EXTRACTION':15,'CLEAN EXTRACTION':15,'CLOSE CALLS':10,'RECKLESS':5,'OVERRUN':0};
const $=id=>document.getElementById(id);
function show(id){['s1','s2','s3','s4','s5'].forEach(s=>$(s).classList.toggle('off',s!==id));
  // Hide touch controls when any card is showing
  const tEl=$('touch');if(tEl)tEl.style.display=(id===null&&/Mobi|Android/i.test(navigator.userAgent))?'block':'none'}

let scene,cam,ren,bMesh,waterGeo,waterOZ,stumps=[],aiB=[],civs=[],evidence=null,dropPoints=[];
// Drop point types -> mini-game key, marker color, label, expected mini-game opener function name.
// Special boss drop type — never spawned randomly; only by spawnDeepDock() once unlock fires.
const DP_BOSS={k:'boss',col:0x9333ea,n:'THE DEPTH RISES',open:'openBoss'};
const DP_TYPES=[
  {k:'battle',  col:0xef4444,n:'AMBUSH SIGNAL',  open:'openBattle'},
  {k:'puzzle',  col:0xfbcf3b,n:'CIPHER FLOAT',   open:'openPuzzle'},
  {k:'runner',  col:0x60d0ff,n:'DOCK COLLAPSE',  open:'openRunner'},
  {k:'tetris',  col:0x10b981,n:'TACKLE BOX',     open:'openTetris'},
  {k:'rescue',  col:0xff6b35,n:'DOCK RESCUE',    open:'openDockRescue'},
  {k:'clicker', col:0xa78bfa,n:'BAITWELL HAUL',  open:'openClicker'}
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
  // Each mini-game registers its tear-down hooks here (event listeners, intervals, RAFs).
  // mini.finish() drains them in a single sweep, regardless of which exit path fires.
  _teardowns:[],
  addTeardown(fn){this._teardowns.push(fn)},
  finish(dp,score,radioLine,who){
    // Drain per-mini-game teardown hooks first so listeners/timers don't outlive the overlay.
    this._teardowns.splice(0).forEach(fn=>{try{fn()}catch(e){}});
    if(score)S.score+=score;
    if(radioLine)radio(radioLine,who||'self');
    sfx(score>0?'win':'click');
    miniActive=false;S.on=true;
    S.missionsCleared=(S.missionsCleared||0)+1;
    if(S.missionsCleared>=5)onUnlock('five_missions');
    const el=$('mini');if(el){el.style.display='none';const card=$('mini-card');if(card)card.innerHTML=''}
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
    mini.addTeardown(()=>{if(G.timer)clearTimeout(G.timer);G.alive=false;document.removeEventListener('keydown',keyHandler)});
    $('m-tl').onclick=()=>{move(-1);render()};
    $('m-tr').onclick=()=>{move(1);render()};
    $('m-trot').onclick=()=>{rotate();render()};
    $('m-td').onclick=()=>{drop();render()};
    $('m-tquit').onclick=()=>{G.alive=false;end()};
    newPiece();render();
    el.style.display='flex';tick();
    radio('Tackle box overflowing. Pack it down.','self');
  },
  // === DOCK RESCUE: clicker repair — pier integrity is draining, tap to shore it up ===
  // === DEEP DOCK BOSS: three-phase encounter against the thing under the Deep Dock ===
  // Phase 1 (SHELL): sonar 6 times to crack the shell. Each ping +1 hit; window is short.
  // Phase 2 (LURE): tap the surfacing weak point in the right window — too early misses, too late
  //                 the creature breaches and bites for -25 hull.
  // Phase 3 (LINE): hold the harpoon line as it drags. A bar drifts; release at peak tension.
  // Win = +1500 score, +120 bait, unlock 'deep_dock', clears the special drop point. Lose = sink.
  openBoss(dp){
    miniActive=true;S.on=false;
    const card=$('mini-card'),el=$('mini');
    let phase=1,hits=0,need=6,playerHull=Math.round(S.hull),lureWindow=null,tension=0,won=null;
    const render=()=>{
      const hullCol=playerHull<30?'#ef4444':playerHull<60?'#f59e0b':'#10b981';
      const phName={1:'PHASE 1 · SHELL',2:'PHASE 2 · LURE',3:'PHASE 3 · LINE'}[phase];
      let body='';
      if(phase===1){
        body=`<div class="sb"><div class="sr"><span class="sl">Shell hits</span><span class="sv y">${hits} / ${need}</span></div><div class="sr"><span class="sl">Your Hull</span><span class="sv" style="color:${hullCol}">${playerHull}%</span></div></div>
          <button class="btn bp" id="m-b-ping" style="background:linear-gradient(135deg,#60d0ff,#3b82f6);box-shadow:0 4px 16px rgba(96,208,255,0.4)">Fire Sonar (Space)</button>`;
      }else if(phase===2){
        body=`<div class="m-sub" style="color:#fbcf3b">Weak point cycles. Strike when the bar is gold — not red.</div>
          <div style="height:22px;border-radius:6px;background:rgba(3,7,18,0.5);position:relative;overflow:hidden;margin:8px 0"><div id="m-b-bar" style="position:absolute;top:0;bottom:0;left:0;width:0%;background:linear-gradient(90deg,#ef4444,#fbcf3b,#10b981,#fbcf3b,#ef4444);transition:width 0.05s linear"></div></div>
          <button class="btn bp" id="m-b-strike" style="background:linear-gradient(135deg,#ef4444,#9333ea);box-shadow:0 4px 16px rgba(147,51,234,0.4)">STRIKE</button>`;
      }else{
        body=`<div class="m-sub" style="color:#fbcf3b">Bar climbs as you reel. Release at peak — not too soon, not after the spike.</div>
          <div style="height:22px;border-radius:6px;background:rgba(3,7,18,0.5);overflow:hidden;margin:8px 0"><div id="m-b-bar" style="height:100%;width:${tension*100}%;background:linear-gradient(90deg,#3b82f6,#10b981,#fbcf3b,#ef4444);transition:width 0.05s linear"></div></div>
          <button class="btn bp" id="m-b-release" style="background:linear-gradient(135deg,#10b981,#059669);box-shadow:0 4px 16px rgba(16,185,129,0.4)">RELEASE</button>`;
      }
      card.innerHTML=`<div class="m-kicker" style="color:#9333ea">${dp.userData.type.n} · ${phName}</div><div class="m-title">${phase===1?'Crack the shell.':phase===2?'Catch the breach.':'Bring it up.'}</div>${body}<button class="btn bx" id="m-b-flee" style="margin-top:8px">Cut Line (-30 hull)</button>`;
      if(phase===1)$('m-b-ping').onclick=()=>{hits++;sfx('ping');if(hits>=need){phase=2;startLure()}render()};
      if(phase===2)$('m-b-strike').onclick=strike;
      if(phase===3)$('m-b-release').onclick=release;
      $('m-b-flee').onclick=flee;
    };
    const startLure=()=>{
      let t=0;lureWindow=setInterval(()=>{t=(t+0.07)%1;const bar=$('m-b-bar');if(bar)bar.style.width=(t*100)+'%'},60);
      mini.addTeardown(()=>clearInterval(lureWindow));
    };
    const strike=()=>{
      const bar=$('m-b-bar'),pct=bar?parseFloat(bar.style.width):0;
      clearInterval(lureWindow);
      // Gold band ~40-60%.
      if(pct>=38&&pct<=62){phase=3;tension=0;startReel();render();return}
      playerHull=Math.max(0,playerHull-25);S.hull=playerHull;sfx('hit');flashDamage(0.8);
      if(playerHull<=0){lose();return}
      // Missed → back to phase 1, need one more hit
      phase=1;need=Math.min(8,need+1);render();
    };
    const startReel=()=>{
      lureWindow=setInterval(()=>{tension=Math.min(1,tension+0.012);const bar=$('m-b-bar');if(bar)bar.style.width=(tension*100)+'%';if(tension>=1){clearInterval(lureWindow);phase=3;render()}},50);
      mini.addTeardown(()=>clearInterval(lureWindow));
    };
    const release=()=>{
      clearInterval(lureWindow);
      // Peak band 78-92%.
      if(tension>=0.78&&tension<=0.92){win();return}
      playerHull=Math.max(0,playerHull-20);S.hull=playerHull;sfx('hit');flashDamage(0.6);
      if(playerHull<=0){lose();return}
      tension=0;phase=3;startReel();render();
    };
    const flee=()=>{S.hull=Math.max(1,S.hull-30);mini.finish(dp,80,'Cut the line. It’s still down there. Bigger now.','fly')};
    const win=()=>{S.hull=Math.min(100,Math.max(1,playerHull));bait+=120;persist();onUnlock('deep_dock');mini.finish(dp,1500,'The Depth went still. The water remembers what you did down there.','lilly')};
    const lose=()=>{mini.finish(dp,0,'It pulled the hull under. Castor Bayou keeps another secret.','reel');S.hull=0};
    // Spacebar fires the phase-1 ping
    const keyHandler=e=>{if(e.code==='Space'&&miniActive&&phase===1){e.preventDefault();const b=$('m-b-ping');if(b)b.click()}};
    document.addEventListener('keydown',keyHandler);
    mini.addTeardown(()=>document.removeEventListener('keydown',keyHandler));
    el.style.display='flex';render();
    radio('Contact. Big one. Hold the line.','reel');
    sfx('legendary');
  },
  // Each tap adds +6 integrity; integrity also drops -1.4/tick on a 400ms timer. Win at 100,
  // lose if it hits 0. Home-dock rescues land here when the player supplied an address.
  openDockRescue(dp){
    miniActive=true;S.on=false;
    const card=$('mini-card'),el=$('mini');
    let hp=42,won=null,clicks=0;
    const isHome=dp&&dp.userData.isHome;
    const render=()=>{
      const barCol=hp<25?'#ef4444':hp<60?'#f59e0b':'#10b981';
      card.innerHTML=`
        <div class="m-kicker" style="color:#ff6b35">${isHome?'YOUR HOME DOCK':'DOCK RESCUE'} · ${dp.userData.type.n}</div>
        <div class="m-title">${isHome?'Your dock is failing.':'A neighbor’s dock is going under.'}</div>
        <div class="m-sub">${isHome?'You pinned this spot from the address you gave us. Hold the boards together.':'Pier integrity bleeding. Pound it back up before the water claims it.'}</div>
        <div class="sb"><div class="sr"><span class="sl">Integrity</span><span class="sv" style="color:${barCol}">${Math.round(hp)}%</span></div><div class="sr"><span class="sl">Hammer strikes</span><span class="sv b">${clicks}</span></div></div>
        <div style="height:14px;background:rgba(3,7,18,0.5);border-radius:6px;overflow:hidden;margin:8px 0"><div id="m-dr-bar" style="height:100%;background:${barCol};width:${hp}%;transition:width 0.18s,background 0.3s"></div></div>
        <button class="btn bp" id="m-dr-hit" style="background:linear-gradient(135deg,#ff6b35,#e8590c);box-shadow:0 4px 16px rgba(255,107,53,0.4)">SHORE IT UP</button>
        <button class="btn bx" id="m-dr-bail">Walk Away</button>`;
      $('m-dr-hit').onclick=hit;$('m-dr-bail').onclick=bail;
    };
    const hit=()=>{if(won!==null)return;clicks++;hp=Math.min(100,hp+6);if(hp>=100){won=true;done()}else render()};
    const bail=()=>{if(won===null){won=false;done(true)}};
    const done=(bailed)=>{
      const score=won?(isHome?350:200)+clicks*3:bailed?0:0;
      if(won&&isHome)onUnlock('home_repaired');
      const line=won?(isHome?'Your dock holds. The water moves on.':'Pier locked down. Neighbor owes you.'):
                bailed?'Walked off. The water took the rest.':'Couldn’t hold it. The boards went under.';
      if(won)S.hull=Math.min(100,S.hull+10);  // reward the player's hull for a clean repair
      mini.finish(dp,score,line,won?'lilly':'fly');
    };
    const drainT=setInterval(()=>{if(won!==null)return;hp=Math.max(0,hp-1.4);if(hp<=0){won=false;done()}else{const bar=$('m-dr-bar');if(bar)bar.style.width=hp+'%';const intEl=card.querySelector('.sv');if(intEl)intEl.textContent=Math.round(hp)+'%'}},400);
    mini.addTeardown(()=>clearInterval(drainT));
    el.style.display='flex';render();
    radio(isHome?'Your dock’s on fire — we’re there.':'Dock failing on the map. Move.','reel');
  },
  // === CLICKER (Baitwell Haul): chill 12-second click frenzy + payout ===
  // Tap to haul fish out of the baitwell. 12s timer. Final score = catches * 8 + rare-roll bonus.
  // Players can also see this as the "easy fun" loop the user asked for — no fail state.
  openClicker(dp){
    miniActive=true;S.on=false;
    const card=$('mini-card'),el=$('mini');
    let catches=0,bonus=0,t=12,done=false;
    const RARE=['Channel cat','Spotted gar','Bowfin','Mud carp','Albino bream','Three-eyed pike'];
    const rares=[];
    const render=()=>{
      card.innerHTML=`
        <div class="m-kicker" style="color:#a78bfa">${dp.userData.type.n}</div>
        <div class="m-title">Baitwell haul.</div>
        <div class="m-sub">Tap fast — the baitwell’s overflowing. ${t}s left. Some hauls turn up things you don’t recognize.</div>
        <div class="sb"><div class="sr"><span class="sl">Catches</span><span class="sv g">${catches}</span></div><div class="sr"><span class="sl">Rare finds</span><span class="sv y">${rares.length}</span></div><div class="sr"><span class="sl">Time</span><span class="sv b">${t}s</span></div></div>
        <button class="btn bp" id="m-c-hit" style="background:linear-gradient(135deg,#a78bfa,#7c3aed);box-shadow:0 4px 16px rgba(167,139,250,0.4);padding:18px;font-size:15px">HAUL</button>
        ${rares.length?'<div style="font:11px \'JetBrains Mono\',monospace;color:#fde68a;margin-top:6px;line-height:1.6">'+rares.map(r=>'· '+r).join('<br>')+'</div>':''}`;
      $('m-c-hit').onclick=hit;
    };
    const hit=()=>{if(done)return;catches++;
      // 1 in 12 chance per click for a rare drop; each rare = +60 bonus + collection note.
      if(Math.random()<0.08){const r=RARE[Math.floor(Math.random()*RARE.length)];rares.push(r);bonus+=60;fishCatalog.add(r);persist()}
      render();
    };
    const tick=setInterval(()=>{if(done)return;t--;if(t<=0){done=true;clearInterval(tick);const score=catches*8+bonus;
      const line=rares.length>=2?'Whatever’s in this baitwell is not from this lake.':catches>40?'You ripped the baitwell. Good haul.':'Easy haul.';
      mini.finish(dp,score,line,'lilly')}else render()},1000);
    mini.addTeardown(()=>clearInterval(tick));
    el.style.display='flex';render();
    radio('Baitwell’s alive. Pull what you can.','self');
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
    // Starting speed ramps with missions cleared this run so each subsequent runner is harder.
    const startSpd=Math.min(5,3+0.4*(S.missionsCleared||0));
    const G={x:60,y:H-40,vy:0,grounded:true,dist:0,alive:true,speed:startSpd,obstacles:[],t0:Date.now()};
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
      const dist=Math.round(G.dist/10),score=Math.min(400,dist*2);
      const line=dist>200?'You outran it. Barely.':'The dock took it. Hull held.';
      mini.finish(dp,score,line,'lilly');
    };
    const keyHandler=e=>{if(e.code==='Space'){e.preventDefault();jump()}};
    document.addEventListener('keydown',keyHandler);
    cv.onclick=jump;cv.ontouchstart=e=>{e.preventDefault();jump()};
    // Teardown — drained by mini.finish() on any exit path.
    mini.addTeardown(()=>{if(G.spawnTimer)clearTimeout(G.spawnTimer);if(G.raf)cancelAnimationFrame(G.raf);G.alive=false;cv.onclick=null;cv.ontouchstart=null;document.removeEventListener('keydown',keyHandler)});
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
    // Register teardown — drained by mini.finish() regardless of exit path. No wrapper chain.
    mini.addTeardown(()=>document.removeEventListener('keydown',keyHandler));
    mini.addTeardown(()=>clearInterval(biteTimer));
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
  mkDock();mkWorld();mkObstacles();mkAI();mkWaypoints();mkCivs();mkEvidence();mkCryptid();mkMist();mkPOIs();
  // Drop points are spawned by resetDropPoints() inside startGame() so each new run gets a fresh
  // set instead of inheriting whatever the previous run left mid-respawn.

  document.addEventListener('keydown',e=>{
    keys[e.code]=true;
    if(e.code==='Space'&&S.on&&!miniActive){e.preventDefault();fireSonar()}
    if(e.code==='KeyF'&&S.on&&GAME_MODE==='game'){e.preventDefault();castLine()}
    // Escape routes by context: catch dialog -> closeCatch, trophy peek -> closePeek, otherwise
    // bail the open mini-game. Each path is distinct so Escape never corrupts drop-point state.
    if(e.code==='Escape'&&miniActive){e.preventDefault();
      if(_catchOpen){if(!_catchBusy){_catchBusy=true;closeCatch('Threw it back.')}}
      else if(_peekOpen)closePeek();
      else{const dp=dropPoints.find(d=>!d.userData.active);mini.finish(dp,0,'Bailed out. Drop point still flagged.','self')}
    }
  });document.addEventListener('keyup',e=>keys[e.code]=false);
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

// === WORLD POIs ===
// Visible landmarks at the named locations from the canon. Each is a small dock + light pole so
// players can navigate to them as landmarks. They are NOT drop points — that drop-point system
// stays separate and random.
function mkPOIs(){
  if(GAME_MODE!=='game')return;
  POIS.forEach(p=>{
    if(p.n==='Castor Marina')return;  // marina is the existing main dock
    const g=new THREE.Group();
    // Small platform
    const plat=new THREE.Mesh(new THREE.BoxGeometry(3,0.18,3),new THREE.MeshStandardMaterial({color:0x6a4f1a,roughness:0.85}));plat.position.y=0.3;g.add(plat);
    // Single lamp post
    const post=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,2.6,6),new THREE.MeshStandardMaterial({color:0x444444,metalness:0.7}));post.position.y=1.6;g.add(post);
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.22,8,6),new THREE.MeshStandardMaterial({color:p.c,emissive:p.c,emissiveIntensity:0.6}));head.position.y=2.95;g.add(head);
    const lt=new THREE.PointLight(parseInt(p.c.replace('#',''),16),0.6,18);lt.position.y=2.95;g.add(lt);
    g.position.set(p.x,0,p.z);scene.add(g);
  });
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
// Deep Dock boss unlock: spawns at the Deep Dock POI when the player has cleared 3+ missions in
// the current run AND has either logged the Deep-Dock catch trophy, has 3+ rares total, or is
// inside a stormy weather window. Spawns at most once per run.
function maybeSpawnBoss(){
  if(S.bossSpawned||GAME_MODE!=='game')return;
  if((S.missionsCleared||0)<3)return;
  const trigger=fishCatalog.has('Deep-Dock catch')||(S.wx&&(S.wx.c==='Rain'||S.wx.c==='Drizzle'))||trophyFish().length>=3;
  if(!trigger)return;
  S.bossSpawned=true;
  const dp=mkDropPoint(DP_BOSS);
  // Boss anchors at the Deep Dock POI (canon location).
  const dd=POIS.find(p=>p.n==='Deep Dock')||{x:-50,z:-105};
  dp.position.set(dd.x,0,dd.z);dp.userData.isBoss=true;scene.add(dp);dropPoints.push(dp);
  radio('Boss flare just lit up the Deep Dock. Move when you’re ready.','fly');
  sfx('legendary');
}
function tickDropPoints(t){
  maybeSpawnBoss();
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
// Tracks the pending respawn timer so a mid-run reset() can cancel it cleanly.
let _dpRespawnT=null;
function clearDropPoint(dp){
  // Remove the resolved drop point and spawn a replacement at a new random spot.
  scene.remove(dp);const idx=dropPoints.indexOf(dp);if(idx>=0)dropPoints.splice(idx,1);
  _dpRespawnT=setTimeout(()=>{_dpRespawnT=null;if(S.on&&GAME_MODE==='game'&&dropPoints.length<3)spawnDropPoint()},2000);
}
// Hard reset for the drop-point system — called by startGame() so a new run doesn't inherit
// markers from the previous run.
function resetDropPoints(){
  if(_dpRespawnT){clearTimeout(_dpRespawnT);_dpRespawnT=null}
  dropPoints.slice().forEach(dp=>{scene.remove(dp)});dropPoints.length=0;
  if(GAME_MODE!=='game')return;
  // Home dock from the address field — always a 'rescue' drop point at the deterministic spot.
  const home=S.homeAddr?addrToPos(S.homeAddr):null;
  if(home){
    const type=DP_TYPES.find(d=>d.k==='rescue');
    const dp=mkDropPoint(type);dp.position.set(home.x,0,home.z);dp.userData.isHome=true;scene.add(dp);dropPoints.push(dp);
    // Prefer the geocoded formatted name (truncated) over the raw user input — looks legit on the radio.
    const nm=S.homeLoc&&S.homeLoc.formatted?S.homeLoc.formatted.split(',').slice(0,2).join(',').trim():S.homeAddr;
    radio('Home dock pinned at '+nm+'. Marked on the map.','self');
  }
  // Fill the remaining slots with random drops so total active is 3.
  for(let i=dropPoints.length;i<3;i++)spawnDropPoint();
}

function mkMist(){
  // Low atmospheric mist over the water — Points cloud, slow rotation.
  const cnt=400;const pos=new Float32Array(cnt*3);
  for(let i=0;i<cnt;i++){const a=Math.random()*Math.PI*2,r=20+Math.random()*220;pos[i*3]=Math.cos(a)*r;pos[i*3+1]=0.4+Math.random()*1.6;pos[i*3+2]=Math.sin(a)*r}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const m=new THREE.PointsMaterial({color:0xb0c4d0,size:0.8,transparent:true,opacity:0.18,depthWrite:false});
  const mist=new THREE.Points(g,m);scene.add(mist);scene._mist=mist;
}

// Named world POIs — pulled from the Castor Bayou canon (04_World_Locations). Visible on the
// minimap as small labeled dots so players can mentally chart the lake.
const POIS=[
  {n:'Castor Marina',x:0,z:-120,c:'#fb923c'},
  {n:'Sunk Road',x:-80,z:30,c:'#94a3b8'},
  {n:'Flooded Chapel',x:90,z:55,c:'#a78bfa'},
  {n:'Quarantine Line',x:60,z:-60,c:'#f59e0b'},
  {n:'Deep Dock',x:-50,z:-105,c:'#ef4444'}
];
function drawMinimap(){
  const c=$('mm-canvas');if(!c)return;
  const ctx=c.getContext('2d'),W=c.width,H=c.height,scl=0.42;  // scale: world u -> px
  ctx.clearRect(0,0,W,H);
  // ring background
  ctx.fillStyle='rgba(3,7,18,0.7)';ctx.beginPath();ctx.arc(W/2,H/2,W/2-1,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='rgba(251,146,60,0.3)';ctx.lineWidth=1;ctx.stroke();
  // Clip everything below to the dial so nothing (boat, drop points, POIs) bleeds past the rim
  // once the player drives out near the world edge.
  ctx.save();ctx.beginPath();ctx.arc(W/2,H/2,W/2-1,0,Math.PI*2);ctx.clip();
  // Project world coords to minimap px, clamping anything beyond the dial radius to the rim so it
  // still reads as a direction marker instead of disappearing.
  const R=W/2-4;
  const proj=(wx,wz)=>{let px=wx*scl,pz=wz*scl;const d=Math.hypot(px,pz);if(d>R){px=px/d*R;pz=pz/d*R}return[W/2+px,H/2+pz]};
  // POIs first (drawn under everything else)
  POIS.forEach(p=>{const[px,pz]=proj(p.x,p.z);ctx.fillStyle=p.c;ctx.globalAlpha=0.55;ctx.fillRect(px-1.5,pz-1.5,3,3);ctx.globalAlpha=1});
  // origin (dock)
  ctx.fillStyle='#fb923c';ctx.fillRect(W/2-2,H/2-2,4,4);
  // Sonar range overlay — only while a ping is still in flight (within 1.5s of fire).
  const now=Date.now()*0.001;
  if(S.lastPing&&now-S.lastPing<1.5){const age=now-S.lastPing,[bx2,bz2]=proj(bMesh.position.x,bMesh.position.z);ctx.strokeStyle='#60d0ff';ctx.globalAlpha=Math.max(0,1-age/1.5)*0.6;ctx.lineWidth=1;ctx.beginPath();ctx.arc(bx2,bz2,25*scl*(0.4+age*0.7),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1}
  // boat dot
  const[bx,bz]=proj(bMesh.position.x,bMesh.position.z);
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(bx,bz,3,0,Math.PI*2);ctx.fill();
  // heading line
  const hx=bx+Math.sin(bMesh.rotation.y)*-8,hz=bz+Math.cos(bMesh.rotation.y)*-8;
  ctx.strokeStyle='#fb923c';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(bx,bz);ctx.lineTo(hx,hz);ctx.stroke();
  // drop points
  dropPoints.forEach(dp=>{if(!dp.userData.active||dp.userData.qa)return;const[dx,dz]=proj(dp.position.x,dp.position.z);ctx.fillStyle='#'+dp.userData.type.col.toString(16).padStart(6,'0');ctx.beginPath();ctx.arc(dx,dz,3,0,Math.PI*2);ctx.fill()});
  // Sonar reveal: for ~4s after a ping, surviving civilians (orange) + uncollected evidence (gold)
  // blip on the minimap so the ping is a real recon tool, not just a debris highlighter.
  // Scout Flare buff: 30s sustained reveal overrides the ping window.
  const flareLive=(buffs.scoutPing||0)>Date.now()*0.001;
  if(flareLive||(S.pingReveal&&Date.now()*0.001<S.pingReveal)){
    civs.forEach(c=>{if(c.userData.saved)return;const[cx,cz]=proj(c.position.x,c.position.z);ctx.fillStyle='#ff6b35';ctx.beginPath();ctx.arc(cx,cz,2,0,Math.PI*2);ctx.fill()});
    if(evidence&&!evidence.userData.collected){const[ex,ez]=proj(evidence.position.x,evidence.position.z);ctx.fillStyle='#fbcf3b';ctx.fillRect(ex-2,ez-2,4,4)}
  }
  ctx.restore();
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
  // Civilian positions: in business mode they line up along the dock-approach corridor.
  // In game mode they spread across the larger world so they're findable anywhere.
  const spots=GAME_MODE==='game'
    ? [[-65,-40],[40,-25],[-30,-95],[80,-70],[-90,15],[55,-130],[-15,40]]
    : [[-8,-25],[12,-50],[-3,-85]];
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
  // Sonar Bank buff: each press spends one banked ping with no 3s wait. Falls through to the
  // standard cooldown gate if the bank is empty.
  if(buffs.sonarBank>0){buffs.sonarBank--;persist()}
  else if(S.sonarReady&&now<S.sonarReady)return false;
  else S.sonarReady=now+3;
  S.lastPing=now;sfx('ping');S.pingReveal=now+4;
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
// Queued single-line overlay. Rapid radio() calls no longer overwrite mid-sentence — they line up
// and play in order, each holding the overlay ~3.2s with a 200ms hand-off between lines.
const _radioQ=[];let _radioBusy=false;
function _drainRadio(){
  if(_radioBusy||!_radioQ.length)return;
  const {text,who}=_radioQ.shift();
  const el=$('radio');if(!el){_drainRadio();return}
  let hero;if(who==='reel')hero=HERO.regular;else if(who==='lilly')hero=HERO.pontoon;else if(who==='fly')hero=HERO.speedboat;else hero=HERO[S.bc];
  el.style.borderLeftColor=hero.badge;
  el.querySelector('.r-who').textContent=hero.n;
  el.querySelector('.r-who').style.color=hero.badge;
  el.querySelector('.r-line').textContent=text;
  el.style.display='block';el.style.opacity='1';
  _radioBusy=true;
  setTimeout(()=>{el.style.opacity='0';setTimeout(()=>{
    if(el.style.opacity==='0')el.style.display='none';
    _radioBusy=false;_drainRadio();
  },400)},3200);
}
function radio(text,who='self'){if(!text)return;_radioQ.push({text,who});if(_radioQ.length>4)_radioQ.splice(0,_radioQ.length-4);_drainRadio()}

// === FREE-ROAM FISHING ===
// When the boat is stopped (or near-stopped) in game mode, F (or the FISH touch button) casts.
// 2.5s cast animation, then a weighted fish roll biased by which named spot the boat is in.
// Players can keep the catch (+score, +trophy) or release (+small bonus). Persistent fishCatalog.
let _castInFlight=false,_castAnim=null,_castRing=null,_catchOpen=false,_catchBusy=false,_wxTimer=null;
function cancelCast(){
  // Hard-stop any in-flight cast: clear the animation interval and dispose the ring mesh.
  if(_castAnim){clearInterval(_castAnim);_castAnim=null}
  if(_castRing){scene.remove(_castRing);_castRing.geometry.dispose();_castRing.material.dispose();_castRing=null}
  _castInFlight=false;
}
function castLine(){
  if(!S.on||GAME_MODE!=='game'||miniActive||_catchOpen)return false;
  if(Math.abs(spd)>0.15){radio('Boat needs to be stopped to cast.','self');return false}
  if(_castInFlight)return false;
  // Don't start a cast right on top of a beacon — the proximity trigger would open the mission and
  // cancel the cast anyway. Tell the player to back off the marker.
  if(dropPoints.some(d=>d.userData.active&&!d.userData.qa&&bMesh.position.distanceTo(d.position)<7)){radio('Too close to a beacon to fish. Pull off it first.','self');return false}
  _castInFlight=true;
  const spot=fishingSpot(bMesh.position);
  radio(spot?`Casting in ${spot.n}. Something’s rolling on it.`:'Line in the water.','self');sfx('cast');
  // Visual: shrinking ring on the water at the boat's bow. Disposes when cast resolves.
  const ringMesh=new THREE.Mesh(new THREE.RingGeometry(1,1.2,24),new THREE.MeshBasicMaterial({color:0xfbcf3b,transparent:true,opacity:0.7,side:THREE.DoubleSide}));
  ringMesh.rotation.x=-Math.PI/2;ringMesh.position.copy(bMesh.position);ringMesh.position.y=0.12;
  // Offset ahead of the bow
  const fwd=new THREE.Vector3(0,0,3).applyQuaternion(bMesh.quaternion);ringMesh.position.add(fwd);
  scene.add(ringMesh);_castRing=ringMesh;
  const t0=Date.now();
  _castAnim=setInterval(()=>{
    // If the run ended while the line was out, bail without popping a dialog over the result screen.
    if(!S.on){cancelCast();return}
    const age=(Date.now()-t0)/2500;
    if(age>=1){clearInterval(_castAnim);_castAnim=null;scene.remove(ringMesh);ringMesh.geometry.dispose();ringMesh.material.dispose();_castRing=null;_castInFlight=false;resolveCast(spot);return}
    const sc=1+age*4;ringMesh.scale.set(sc,sc,sc);ringMesh.material.opacity=0.7*(1-age);
  },50);
}
function resolveCast(spot){
  if(!S.on||miniActive)return;  // run ended or a mini-game opened during the cast — drop it silently
  const fish=rollFish(spot);
  runCatches.push(fish);
  // Every species caught enters the catalog (drives the Fish Codex completion). The Trophy Board
  // showcase filters this to rare/legendary at render time.
  if(!fishCatalog.has(fish.n)){fishCatalog.add(fish.n);persist();if(fishCatalog.size>=6)onUnlock('codex_half');if(fishCatalog.size>=FISH.length)onUnlock('codex_full')}
  sfx(fish.r==='legendary'?'legendary':'catch');
  showCatchDialog(fish,spot);
}
function showCatchDialog(fish,spot){
  // Catch dialog reuses the #mini overlay. _catchOpen distinguishes it from a real mini-game so the
  // global Escape handler routes to closeCatch (not mini.finish, which would corrupt drop points).
  const card=$('mini-card'),el=$('mini');if(!card||!el)return;
  miniActive=true;S.on=false;_catchOpen=true;_catchBusy=false;
  card.innerHTML=`
    <div class="m-kicker" style="color:${RARE_COLOR[fish.r]}">${spot?spot.n:'Open water'} · ${fish.r.toUpperCase()}</div>
    <div class="m-title" style="font-size:30px;display:flex;gap:10px;align-items:center;justify-content:center">${fish.e}<span>${fish.n}</span></div>
    <div class="m-sub" style="text-align:center;font-style:italic;color:${RARE_COLOR[fish.r]}">${fish.f}</div>
    <div class="sb"><div class="sr"><span class="sl">Score if kept</span><span class="sv g">+${fish.s}</span></div><div class="sr"><span class="sl">Score if released</span><span class="sv b">+${Math.round(fish.s*0.2)}</span></div><div class="sr"><span class="sl">Trophy</span><span class="sv ${fish.r==='legendary'||fish.r==='rare'?'g':'y'}">${fish.r==='legendary'||fish.r==='rare'?'YES':'no'}</span></div></div>
    <button class="btn bp" id="m-k">Keep</button>
    <button class="btn bx" id="m-r">Release (heals hull +1)</button>`;
  // Keep adds bait currency = score * BAIT_RATE[rarity]; Release converts ~25% to bait + a hull tick.
  const baitFor={common:0.6,uncommon:0.9,rare:1.6,legendary:3.2};
  const keepBait=Math.max(1,Math.round(fish.s*(baitFor[fish.r]||1)*0.35));
  const releaseBait=Math.max(1,Math.round(keepBait*0.25));
  $('m-k').onclick=()=>{if(_catchBusy)return;_catchBusy=true;S.score+=fish.s;bait+=keepBait;persist();onUnlock('first_catch');if(fish.r==='legendary')onUnlock('legendary_landed');if(bait>=500)onUnlock('bait_baron');closeCatch(`${fish.n}. ${fish.s} on the line. +${keepBait} bait.`)};
  $('m-r').onclick=()=>{if(_catchBusy)return;_catchBusy=true;S.score+=Math.round(fish.s*0.2);S.hull=Math.min(100,S.hull+1);bait+=releaseBait;persist();onUnlock('first_release');closeCatch(`Released. ${fish.n} goes back. +${releaseBait} bait, +1 hull.`)};
  el.style.display='flex';
}
function closeCatch(msg){
  const el=$('mini'),card=$('mini-card');
  if(card)card.innerHTML='';if(el)el.style.display='none';
  miniActive=false;_catchOpen=false;
  // Only resume the world if the run is actually still live (guard against a dialog that somehow
  // outlived endGame).
  if(S.played&&!$('s5').classList.contains('off')){/* run already ended — stay on result screen */}
  else S.on=true;
  radio(msg,'lilly');
}

// === AUDIO (WebAudio SFX) ===
// Tiny oscillator-based blips, lazily created on first sound (browsers require a user gesture to
// start an AudioContext). Muted state persists. Each cue is a short freq sweep — no asset loading.
let _audioCtx=null,_sndGate={};
function sfx(type){
  if(muted)return;
  try{if(!_audioCtx)_audioCtx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return}
  const ctx=_audioCtx,now=ctx.currentTime;
  // rate-limit per type so rapid triggers (e.g. clicker) don't machine-gun
  if(_sndGate[type]&&now<_sndGate[type])return;_sndGate[type]=now+0.04;
  const spec={cast:[300,520,.12,'sine'],catch:[440,760,.16,'triangle'],ping:[680,1150,.14,'sine'],rescue:[460,720,.18,'triangle'],win:[520,880,.22,'triangle'],hit:[150,60,.18,'square'],click:[300,360,.05,'square'],legendary:[300,1400,.5,'sawtooth']}[type]||[300,360,.08,'sine'];
  const o=ctx.createOscillator(),g=ctx.createGain();o.type=spec[3];
  o.frequency.setValueAtTime(spec[0],now);o.frequency.exponentialRampToValueAtTime(Math.max(30,spec[1]),now+spec[2]);
  g.gain.setValueAtTime(0.0001,now);g.gain.linearRampToValueAtTime(0.06,now+0.01);g.gain.exponentialRampToValueAtTime(0.0001,now+spec[2]);
  o.connect(g);g.connect(ctx.destination);o.start(now);o.stop(now+spec[2]+0.03);
}
function toggleMute(){muted=!muted;persist();const b=$('mute-btn');if(b)b.textContent=muted?'🔇 Sound Off':'🔊 Sound On';if(!muted)sfx('click')}
// === ACHIEVEMENT TRIGGER ===
// Centralized unlock hook. Real definitions + toast UI land in the achievements commit; this stub
// keeps callsites stable. ACH map declared near here so every check route through this fn.
const ACH={
  first_catch:{n:'First Cast',d:'Landed your first fish.'},
  first_release:{n:'Steward',d:'Released a fish back into Castor Bayou.'},
  legendary_landed:{n:'Castor Legend',d:'Landed a legendary species.'},
  five_missions:{n:'Operator',d:'Cleared 5 missions in a single run.'},
  full_extraction:{n:'Lifeguard',d:'Got every civilian out alive.'},
  home_repaired:{n:'It Holds',d:'Saved your own home dock.'},
  deep_dock:{n:'Into The Depth',d:'Faced the thing under the Deep Dock.'},
  codex_half:{n:'Field Naturalist',d:'Logged 6 species in the Fish Codex.'},
  codex_full:{n:'Castor Compendium',d:'Logged all 12 species.'},
  bait_baron:{n:'Bait Baron',d:'Banked 500 bait at once.'}
};
function onUnlock(id){
  if(!ACH[id]||achievements.has(id))return;
  achievements.add(id);persist();showAchToast(ACH[id]);sfx('win');
}
function showAchToast(a){
  const t=$('ach-toast');if(!t)return;
  t.innerHTML=`<div style="font:700 9px 'JetBrains Mono',monospace;letter-spacing:1.5px;color:#fbcf3b">ACHIEVEMENT</div><div style="font:700 14px 'DM Sans',sans-serif;margin-top:2px">${a.n}</div><div style="font-size:11px;color:#94a3b8;margin-top:2px">${a.d}</div>`;
  t.style.display='block';t.style.opacity='1';
  clearTimeout(showAchToast._t);showAchToast._t=setTimeout(()=>{t.style.opacity='0';setTimeout(()=>{if(t.style.opacity==='0')t.style.display='none'},400)},3800);
}

// === HULL-DAMAGE VISUAL FEEDBACK ===
// Brief red vignette pulse — drained on a short timer so rapid hits stack into a sustained flash
// instead of a strobe. Intensity 0..1.
let _dmgFade=null;
function flashDamage(intensity){
  const el=$('dmg-flash');if(!el)return;
  el.style.opacity=Math.min(0.85,intensity).toFixed(2);
  clearTimeout(_dmgFade);_dmgFade=setTimeout(()=>{el.style.opacity='0'},220);
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
    if(S.wx.c==='Clear'){scene.background.r=0.027+dayness*0.020;scene.background.g=0.082+dayness*0.030;scene.background.b=0.125+dayness*0.030;
      // Keep fog tracking the sky so the horizon doesn't read as a fixed band at night.
      if(scene.fog)scene.fog.color.lerp(scene.background,0.05)}
  }
  // Atmospheric mist drift — Points cloud spawned in mkMist(), shifts on the wind.
  if(scene._mist){const m=scene._mist;m.rotation.y=t*0.01;m.position.y=2+Math.sin(t*0.2)*0.4}
  // Minimap update
  if(S.on&&$('mm-canvas')){drawMinimap()}
  // Named fishing-spot indicator — fades in when the boat enters a spot's radius.
  if(S.on&&GAME_MODE==='game'){const sp=fishingSpot(bMesh.position),tag=$('spot-tag');if(tag){if(sp){tag.textContent='~ '+sp.n+' ~';tag.style.display='block'}else tag.style.display='none'}}
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
    // While a cast is in flight the helm is locked — you can't drive off your own line. The boat
    // coasts to a stop via drag. (castLine already requires near-zero speed to start.)
    const frozen=_castInFlight;
    if(!frozen&&(keys.ArrowUp||keys.KeyW||tch.lY>0.1))spd=Math.min(spd+bt.ac*wxP*hullP*(keys.ArrowUp||keys.KeyW?1:tch.lY),bt.mx*hullP);
    // Reverse capped at -bt.mx*0.5 — the boat can back up but can't outrun itself in reverse.
    if(!frozen&&(keys.ArrowDown||keys.KeyS||tch.lY<-0.1))spd=Math.max(spd-bt.ac*0.5,-bt.mx*0.5*hullP);
    spd*=bt.dr;
    if(!frozen&&Math.abs(spd)>0.03){if(keys.ArrowLeft||keys.KeyA||tch.rX>0.1)aV+=bt.tu*wxP*hullP*(keys.ArrowLeft||keys.KeyA?1:tch.rX);if(keys.ArrowRight||keys.KeyD||tch.rX<-0.1)aV-=bt.tu*wxP*hullP*(keys.ArrowRight||keys.KeyD?1:Math.abs(tch.rX))}
    aV*=0.88;bMesh.rotation.y+=aV;
    const dir=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),bMesh.rotation.y);prev.copy(bMesh.position);
    bMesh.position.addScaledVector(dir,spd);bMesh.position.y=0.3+Math.sin(t*2.2)*0.2+Math.sin(t*1.3+0.5)*0.1;bMesh.rotation.z=-aV*2.5;bMesh.rotation.x=spd*0.05;
    const wr=S.wx.wd*Math.PI/180;bMesh.position.x+=Math.sin(wr)*S.wx.ws*0.0008*bt.wx;bMesh.position.z+=Math.cos(wr)*S.wx.ws*0.0008*bt.wx;
    // Blackwater surge — only in THE SHALLOWS, every ~4-7s, shoves the boat sideways
    if(S.phase>=1&&t-S.lastSurge>4+(S.surgeRand||3)){S.lastSurge=t;S.surgeRand=Math.random()*3;const sa=Math.random()*Math.PI*2;bMesh.position.x+=Math.cos(sa)*2;bMesh.position.z+=Math.sin(sa)*2;$('ww').textContent='BLACKWATER SURGE';$('ww').style.display='block';setTimeout(()=>{if($('ww').textContent==='BLACKWATER SURGE')$('ww').style.display='none'},1400);radio(HERO[S.bc].voice.surge,'reel')}
    S.dist+=bMesh.position.distanceTo(prev);const as=Math.abs(spd*40);if(as>S.maxSpd)S.maxSpd=as;
    const dd=bMesh.position.distanceTo(dockPos);
    // Score formula: business mode rewards staying near the dock corridor; game mode rewards
    // total distance traveled (S.dist already accumulates each frame's movement).
    if(GAME_MODE==='business'){if(dd<150)S.score+=Math.max(0,Math.round(as*0.3))}
    else{S.score+=Math.max(0,Math.round(as*0.15))}
    $('h-spd').textContent=as.toFixed(1)+' kn';
    // Distance HUD: business mode shows distance to the dock objective; free-roam shows distance
    // to the nearest active beacon (or "—" if none) since the dock isn't the goal.
    if(GAME_MODE==='game'){let nd=Infinity;for(const d of dropPoints){if(!d.userData.active||d.userData.qa)continue;const dist=bMesh.position.distanceTo(d.position);if(dist<nd)nd=dist}$('h-dst').textContent=nd===Infinity?'—':nd.toFixed(0)+'m';const dl=$('h-dst').previousElementSibling;if(dl&&dl.textContent!=='Beacon')dl.textContent='Beacon'}
    else $('h-dst').textContent=dd.toFixed(0)+'m';
    const hd=((bMesh.rotation.y*180/Math.PI%360)+360)%360;$('h-hdg').textContent=['N','NE','E','SE','S','SW','W','NW'][Math.round(hd/45)%8];$('h-scr').textContent=S.score;
    const hb=$('h-bait');if(hb)hb.textContent=bait;
    // Hull HUD + color states
    const hh=$('h-hull');if(hh){hh.textContent=Math.round(S.hull)+'%';hh.style.color=S.hull<30?'#ef4444':(S.hull<60?'#f59e0b':'#fb923c')}
    for(const s of stumps){const d=bMesh.position.distanceTo(s.position);if(d<2.5){flashDamage(1);endGame(false);return}if(d<4){S.hull=Math.max(0,S.hull-0.35);S.near++;if(S.hull%5<0.4)flashDamage(0.35)}else if(d<6){S.near++}}
    if(S.hull<=0){endGame(false);return}
    // Evidence pickup — drive over to collect, any speed.
    if(evidence&&!evidence.userData.collected){
      evidence.position.y=Math.sin(t*1.4)*0.15;
      evidence.rotation.y=t*0.6;
      if(evidence.userData.ring)evidence.userData.ring.material.opacity=0.35+Math.sin(t*3)*0.2;
      if(bMesh.position.distanceTo(evidence.position)<2){
        evidence.userData.collected=true;evidence.visible=false;
        // Prefer evidence the player hasn't seen yet so the catalog actually grows.
        const fresh=EV.filter(e=>!evidenceCatalog.has(e.n));
        S.evCollected=(fresh.length?fresh:EV)[Math.floor(Math.random()*((fresh.length?fresh:EV).length))];
        evidenceCatalog.add(S.evCollected.n);persist();S.score+=75;
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
          c.userData.saved=true;c.visible=false;S.civsSaved++;S.score+=100;S.hull=Math.min(100,S.hull+0.5);sfx('rescue');
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

function startGame(){S.on=true;S.score=0;S.t0=Date.now();S.maxSpd=0;S.dist=0;S.near=0;S.pc=0;S.hull=100;S.lastSurge=Date.now()*0.001;S.surgeRand=3;S.civsSaved=0;S.civsTotal=civs.length;S.sonarReady=0;S.evCollected=null;S.missionsCleared=0;runCatches=[];
  // Overlay + chatter hygiene: any dialog/peek/cast left over from a prior run or the menu is
  // force-cleared so the new run starts with no stranded overlay state and no queued radio lines.
  cancelCast();_catchOpen=false;_catchBusy=false;_peekOpen=false;miniActive=false;_radioQ.length=0;_radioBusy=false;
  {const me=$('mini');if(me)me.style.display='none';const mc=$('mini-card');if(mc)mc.innerHTML='';const re=$('radio');if(re)re.style.display='none'}
  // HUD pills + dmg flash reset to clean slate each run.
  const hs=$('h-sonar');if(hs){hs.textContent='READY';hs.style.color='#60d0ff'}
  const hh=$('h-hull');if(hh){hh.textContent='100%';hh.style.color='#fb923c'}
  const df=$('dmg-flash');if(df)df.style.opacity='0';
  // Drop points wipe + respawn so a new run doesn't inherit prior markers / pending timers.
  resetDropPoints();
  civs.forEach(c=>{c.userData.saved=false;c.visible=true});
  if(evidence){evidence.userData.collected=false;evidence.visible=true;
    // Re-roll the evidence position each run so it isn't the same fixed crate every time. Free-roam
    // spreads it across the world; business keeps it in the original shallows corridor.
    if(GAME_MODE==='game'){const a=Math.random()*Math.PI*2,r=45+Math.random()*65;evidence.position.set(Math.cos(a)*r,0,Math.sin(a)*r)}
    else evidence.position.set((Math.random()-0.5)*30,0,-60-Math.random()*30)}
  $('h-civ').textContent='0/'+civs.length;$('h-ev').textContent='0/1';$('h-ev').style.color='#475569';
  // Bait pill mirrors the persistent balance and updates each frame in the loop.
  const hb=$('h-bait');if(hb)hb.textContent=bait;
  S.bossSpawned=false;
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
  $('nfo').textContent=GAME_MODE==='game'?'WASD/Arrows · Space=Sonar · F=Cast (when stopped) · Drive to a beacon to start a mission':'WASD / Arrows · Space = Sonar Ping · Follow the rescue markers';$('nfo').style.color='#475569';
  // Free-roam weather drifts: refetch + re-apply visuals every 45s so a long session sees the
  // sky/wind/rain actually change instead of being frozen at the launch reading.
  if(_wxTimer)clearInterval(_wxTimer);
  if(GAME_MODE==='game')_wxTimer=setInterval(()=>{if(S.on)fetchWx();else{clearInterval(_wxTimer);_wxTimer=null}},45000);
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
function endGame(won){S.on=false;S.played=true;$('hud').style.display='none';$('nfo').style.display='none';$('phud').style.display='none';$('ww').style.display='none';const er=$('end-run');if(er)er.style.display='none';const mm=$('minimap');if(mm)mm.style.display='none';const sp=$('spot-tag');if(sp)sp.style.display='none';aiB.forEach(a=>a.userData.on=false);
  // Tear down any in-flight cast / open catch dialog so it can't pop over the result screen.
  cancelCast();if(_catchOpen){_catchOpen=false;miniActive=false;const me=$('mini');if(me)me.style.display='none';const mc=$('mini-card');if(mc)mc.innerHTML=''}
  if(_wxTimer){clearInterval(_wxTimer);_wxTimer=null}
  // Clean wakes
  wakes.forEach(p=>{scene.remove(p);p.geometry.dispose();p.material.dispose()});wakes=[];
  const el=(Date.now()-S.t0)/1000;if(won)S.score+=Math.max(0,Math.round(500-el*3));if(won&&Math.abs(spd)<0.3)S.score+=200;
  // Result title differs by mode: free-roam celebrates the missions/exploration, business celebrates dock-reach.
  if(GAME_MODE==='game'){$('rt').textContent=won?'Pulled Off The Run':'Hull Went Under'}
  else $('rt').textContent=won?'Survivors Extracted':'Dragged Under';
  $('r-scr').textContent=S.score;$('r-time').textContent=el.toFixed(1)+'s';$('r-spd').textContent=S.maxSpd.toFixed(1)+' kn';$('r-near').textContent=Math.min(S.near,99);$('f-scr').textContent=S.score;
  // Phases row repurposes as "Missions" in game mode.
  const phEl=$('r-ph'),phLbl=phEl?phEl.previousElementSibling:null;
  if(phEl){if(GAME_MODE==='game'){phEl.textContent=(S.missionsCleared||0)+' cleared';if(phLbl)phLbl.textContent='Missions'}else{phEl.textContent=S.pc+'/3';if(phLbl)phLbl.textContent='Phases'}}
  const rh=$('r-hull');if(rh){rh.textContent=Math.round(S.hull)+'%';rh.className='sv '+(S.hull<30?'r':S.hull<60?'y':'g')}
  let rl,rm,rc;const nr=S.near/Math.max(el,1);
  if(GAME_MODE==='game'){
    // Free-roam outcome bands tuned to missions cleared + hull preserved + civilians saved.
    const cleared=S.missionsCleared||0;
    if(!won){rl='WRECKED';rm='The hull went under and Castor Bayou closed up over it. The Depth keeps its score.';rc='rgba(239,68,68,0.08)'}
    else if(cleared>=4){rl='LEGEND OF THE DEPTH';rm='Four missions clean. The town will start telling stories about this run.';rc='rgba(16,185,129,0.08)'}
    else if(cleared>=2){rl='OPERATOR';rm='You worked the map. The Depth holds the line a little tighter because you rode out.';rc='rgba(16,185,129,0.08)'}
    else if(S.civsSaved>=3){rl='LIFEGUARD';rm='You pulled people out. Castor Bayou owes you one — and remembers.';rc='rgba(16,185,129,0.08)'}
    else{rl='EXPLORER';rm='You read the water and came home. Plenty of Castor Bayou left to chart.';rc='rgba(96,208,255,0.08)'}
  }else{
    if(!won){rl='OVERRUN';rm='The water took you. Whatever is rising below the surface does not stop — and it is spreading to every waterway it can reach.';rc='rgba(239,68,68,0.08)'}
    else if(S.near>15||nr>0.5){rl='CLOSE CALLS';rm='Too many near-misses out there. Debris, blackwater, and things moving under the hull — every run into The Depth gets more dangerous than the last.';rc='rgba(245,158,11,0.08)'}
    else if(S.maxSpd>25){rl='RECKLESS';rm='You ran it hot. Speed gets you to the survivors faster, but the water is unforgiving — one wrong read and The Depth takes the whole crew.';rc='rgba(245,158,11,0.08)'}
    else{rl='CLEAN EXTRACTION';rm='Flawless run. You brought them home before the water closed in. The Depth holds the line — so others can survive.';rc='rgba(16,185,129,0.08)'}
  }
  // Outcome upgrade: full civilian extraction
  if(won&&S.civsTotal>0&&S.civsSaved===S.civsTotal&&rl==='CLEAN EXTRACTION'){rl='FULL EXTRACTION';rm='Every civilian out. Dock secured. Castor Bayou will remember this run for a long time.'}
  if(won&&S.civsTotal>0&&S.civsSaved===S.civsTotal)onUnlock('full_extraction');
  const rcv=$('r-civ');if(rcv){rcv.textContent=S.civsSaved+'/'+S.civsTotal;rcv.className='sv '+(S.civsSaved===S.civsTotal?'g':S.civsSaved>0?'y':'r')}
  // Evidence reveal — show flavor line only if collected; otherwise hide the block
  const evWrap=$('r-ev-wrap'),evName=$('r-ev-name'),evLine=$('r-ev-line');
  if(evWrap){if(S.evCollected){evWrap.style.display='block';evName.textContent=S.evCollected.n;evLine.textContent=S.evCollected.line}else{evWrap.style.display='none'}}
  // Run-haul summary by rarity, only painted in game mode and only if anything was caught.
  const haulWrap=$('r-haul-wrap'),haulTotal=$('r-haul-total'),haulDetail=$('r-haul-detail');
  if(haulWrap&&GAME_MODE==='game'&&runCatches.length>0){
    const byR={common:0,uncommon:0,rare:0,legendary:0};runCatches.forEach(f=>byR[f.r]++);
    haulWrap.style.display='block';haulTotal.textContent=runCatches.length+' caught';
    haulDetail.innerHTML=['legendary','rare','uncommon','common'].filter(r=>byR[r]>0).map(r=>`<span style="color:${RARE_COLOR[r]};text-transform:uppercase;letter-spacing:1px">${r}</span> · ${byR[r]}`).join(' &nbsp; ');
  }else if(haulWrap)haulWrap.style.display='none';
  // Persistent trophy board (rare + legendary uniques across all runs).
  const trWrap=$('r-trophy-wrap'),trCount=$('r-trophy-count'),trList=$('r-trophy-list');
  const trophies=trophyFish();
  if(trWrap&&GAME_MODE==='game'&&trophies.length>0){
    trWrap.style.display='block';trCount.textContent=trophies.length;
    trList.innerHTML=trophies.map(f=>`<span style="background:rgba(8,18,38,0.6);border:1px solid ${RARE_COLOR[f.r]};border-radius:6px;padding:3px 7px;color:${RARE_COLOR[f.r]}">${f.e} ${f.n}</span>`).join('');
  }else if(trWrap)trWrap.style.display='none';
  $('rm').textContent=won?'You held the line this time. The water remembers.':'The lake hazards are real — and something below the waterline is awake.';
  const rcd=$('rc');rcd.style.background=rc;rcd.style.borderColor=rc.replace('0.08','0.15');rcd.style.border='1px solid '+rc.replace('0.08','0.2');
  $('rlbl').textContent=rl;$('rmsg').textContent=rm;$('rlbl').style.color=rl==='CLEAN EXTRACTION'?'#10b981':'#f87171';$('rmsg').style.color=rl==='CLEAN EXTRACTION'?'#a7f3d0':'#fecaca';
  // Score-tier medal — game mode only. Thresholds tuned to a mix of mission play + free-roam exploration.
  const medalEl=$('r-medal'),medalIcon=$('r-medal-icon'),medalTier=$('r-medal-tier');
  if(medalEl&&GAME_MODE==='game'){
    const s=S.score;
    let icon,tier,col;
    if(s>=4000){icon='🏆';tier='GOLD · LEGEND';col='#fbcf3b'}
    else if(s>=2000){icon='🥈';tier='SILVER · OPERATOR';col='#cbd5e1'}
    else if(s>=800){icon='🥉';tier='BRONZE · RIDER';col='#d97706'}
    else{icon='🐟';tier='ROOKIE';col='#94a3b8'}
    medalEl.style.display='block';medalIcon.textContent=icon;medalTier.textContent=tier;medalTier.style.color=col;
  }else if(medalEl)medalEl.style.display='none';
  // Tiered discount earned from run quality
  S.outcome=rl;S.discount=DISC[rl]||0;
  // Business-mode pipeline: paint the discount banner + send the analytics_events row.
  // In game mode, s5 still shows score/civilians/evidence but no discount/plans bridge.
  if(GAME_MODE==='business'){paintDiscount();saveData(won)}
  // New best-score tracking (game mode) — persisted + surfaced on the recap.
  if(GAME_MODE==='game'){const nb=S.score>bestScore;if(nb)bestScore=S.score;persist();const be=$('r-best');if(be){be.textContent=(nb?'NEW BEST · ':'Best · ')+bestScore;be.style.color=nb?'#10b981':'#94a3b8'}}
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
async function saveData(w){
  if(!C.SUPABASE_URL||!C.SUPABASE_ANON_KEY)return;
  // Payload now reflects whichever mode the run was in — game mode adds missionsCleared and
  // civsSaved; business mode keeps its original fields. Empty strings stay empty (not undefined).
  const payload={email:S.email||'',bc:S.bc,score:S.score,won:w,phases:S.pc,near:S.near,maxSpd:S.maxSpd,wx:S.wx,addr:S.addr||'',mode:GAME_MODE,missionsCleared:S.missionsCleared||0,civsSaved:S.civsSaved||0,outcome:S.outcome||''};
  try{await fetch(`${C.SUPABASE_URL}/rest/v1/analytics_events`,{method:'POST',headers:{apikey:C.SUPABASE_ANON_KEY,Authorization:`Bearer ${C.SUPABASE_ANON_KEY}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({event_type:'sim_complete',payload})})}catch(e){}
}
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
  if(GAME_MODE==='game'){$('op-grid').style.display='grid';$('op-label').style.display='block';$('begin-btn').style.display='block';$('q-1').style.display='none';$('q-2').style.display='none';const hd=$('home-dock-wrap');if(hd)hd.style.display='block';S.lore={};refreshTrophyPeek()}}

// === GAME-MODE ENTRY: hero pick → Q1 → Q2 → free-roam ===
// No email, no address. The two questions tag S.lore so radio chatter can reference them later;
// they don't override the hero pick (player keeps the operative they selected).
function beginRun(){
  if(!S.lore)S.lore={};
  // Capture optional home dock address — used in launchGame() to spawn a personal rescue
  // mission at a deterministic spot derived from the address text.
  const hd=$('f-home-addr');S.homeAddr=hd?hd.value.trim():'';
  $('op-grid').style.display='none';$('op-label').style.display='none';$('begin-btn').style.display='none';
  const wrap=$('home-dock-wrap');if(wrap)wrap.style.display='none';
  $('s1-sub').textContent='Two reads before we shove off. Answer fast — the water doesn’t wait.';
  $('q-1').style.display='block';
}
// Deterministic position from address text — same address always lands at the same spot, but
// different addresses spread across the playable ring. No real geocode call needed.
function addrToPos(addr){
  // Prefer real geocoded coordinates if /api/geocode returned them — pack lat/lng into the same
  // playable ring so the spot is reproducible across sessions for a given address. Fallback to a
  // hash of the raw string for offline / 4xx cases.
  if(S.homeLoc){
    // Hash the lat/lng pair so two near-by addresses still scatter. lat ~ -90..90, lng ~ -180..180.
    const seed=Math.round(S.homeLoc.lat*1000)*7919+Math.round(S.homeLoc.lng*1000);
    const ang=(Math.abs(seed)%360)*Math.PI/180,r=70+(Math.abs(seed>>3)%50);
    return {x:Math.cos(ang)*r,z:Math.sin(ang)*r};
  }
  if(!addr)return null;
  let h=0;for(let i=0;i<addr.length;i++){h=((h<<5)-h+addr.charCodeAt(i))|0}
  const ang=(Math.abs(h)%360)*Math.PI/180,r=70+(Math.abs(h>>3)%50);
  return {x:Math.cos(ang)*r,z:Math.sin(ang)*r};
}
function qAns(n,h,tag){
  if(!S.lore)S.lore={};
  S.lore['q'+n]={hero:h,tag};
  if(n===1){$('q-1').style.display='none';$('q-2').style.display='block'}
  else{$('q-2').style.display='none';launchGame()}
}
async function launchGame(){
  // Game-mode entry: if the player supplied a Home Dock address, hit the /api/geocode route to
  // get real lat/lng + a formatted name. Weather then uses the geocoded lat/lng (OpenWeatherMap
  // demo key still falls back to random in fetchWx's catch). S.homeLoc stores the canonical
  // location object so the radio + boss-arena prompts can reference it.
  S.addr='Castor Bayou';S.email='';S.homeLoc=null;
  if(S.homeAddr){
    try{
      const r=await fetch('/api/geocode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:S.homeAddr})});
      if(r.ok){const d=await r.json();if(d.lat&&d.lng){S.lat=d.lat;S.lng=d.lng;S.homeLoc={lat:d.lat,lng:d.lng,formatted:d.formatted||S.homeAddr,confidence:d.confidence||'fallback'}}}
    }catch(e){}
  }
  fetchWx().finally(()=>startGame());
}

// Tag body with the active game mode so CSS can hide/show funnel UI without touching every site.
document.body.classList.add('mode-'+GAME_MODE);
initEngine();refreshTrophyPeek();
{const mb=$('mute-btn');if(mb)mb.textContent=muted?'🔇 Sound Off':'🔊 Sound On'}
// Two-tap confirm — first press arms the button (turns solid red, label "TAP TO CONFIRM"),
// second press inside 2.5s actually ends. Stops accidental kills on mobile.
let _endArmed=false,_endArmedT=null;
// Trophy peek from the landing card — opens an in-overlay dialog with the same trophy list as s5.
let _peekOpen=false;
// Trophy = caught species that's rare or legendary. Commons/uncommons fill the Codex but don't
// earn a trophy chip.
function trophyFish(){return FISH.filter(f=>fishCatalog.has(f.n)&&(f.r==='rare'||f.r==='legendary'))}
function peekTrophies(){
  if(trophyFish().length===0)return;
  const card=$('mini-card'),el=$('mini');if(!card||!el)return;
  miniActive=true;_peekOpen=true;
  card.innerHTML=`
    <div class="m-kicker" style="color:#a78bfa">Trophy Board</div>
    <div class="m-title">${trophyFish().length} trophy catch${trophyFish().length===1?'':'es'} pulled out of Castor Bayou.</div>
    <div class="m-sub">Rares + legendaries you've landed. Saved across reloads. Best score: ${bestScore}.</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0">${trophyFish().map(f=>`<span style="background:rgba(8,18,38,0.6);border:1px solid ${RARE_COLOR[f.r]};border-radius:6px;padding:5px 9px;color:${RARE_COLOR[f.r]};font:12px 'DM Sans',sans-serif">${f.e} ${f.n}<span style="color:#64748b;font-size:9px;text-transform:uppercase;letter-spacing:1px;margin-left:6px">${f.r}</span></span>`).join('')}</div>
    <button class="btn bx" onclick="DS.closePeek()">Close</button>`;
  el.style.display='flex';
}
function closePeek(){const el=$('mini');if(el)el.style.display='none';const card=$('mini-card');if(card)card.innerHTML='';miniActive=false;_peekOpen=false;/* never resume the loop — peek is a menu overlay, S.on stays as-is */}
// Fish Codex — the full collection screen. Caught species show in color with their lore line;
// uncaught ones show as locked ??? silhouettes grouped by rarity. Reuses the peek overlay frame.
// === TACKLE SHOP ===
// Spend bait currency on consumable buffs. Reuses the #mini overlay frame; doesn't pause the world
// loop differently from peek/codex (miniActive=true, _peekOpen=true).
const SHOP_ITEMS=[
  {id:'hull',n:'Patch Kit',c:'#10b981',cost:25,desc:'+25 hull integrity on the spot.',fn:()=>{S.hull=Math.min(100,(S.hull||100)+25)}},
  {id:'sonar',n:'Sonar Bank',c:'#60d0ff',cost:18,desc:'Stores 3 ready pings. Each press of Space spends one — no 3s wait.',fn:()=>{buffs.sonarBank+=3}},
  {id:'line',n:'Tournament Line',c:'#a78bfa',cost:40,desc:'Next 5 casts triple-weight rare + legendary fish.',fn:()=>{buffs.rareLine+=5}},
  {id:'scout',n:'Scout Flare',c:'#fbcf3b',cost:30,desc:'Reveals all active beacons + civilians for 30s on the minimap.',fn:()=>{buffs.scoutPing=Date.now()*0.001+30}}
];
function openShop(){
  const card=$('mini-card'),el=$('mini');if(!card||!el)return;
  miniActive=true;_peekOpen=true;
  const rows=SHOP_ITEMS.map(it=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(3,7,18,0.5);border:1px solid ${it.c}33;border-left:3px solid ${it.c};border-radius:8px;margin:6px 0">
      <div style="flex:1;min-width:0;padding-right:12px"><div style="font-weight:600;color:${it.c};font-size:12.5px">${it.n} · <span style="color:#fbcf3b;font-family:'JetBrains Mono',monospace">${it.cost} bait</span></div><div style="font-size:11px;color:#94a3b8;line-height:1.4;margin-top:2px">${it.desc}</div></div>
      <button class="btn bp shop-buy" data-id="${it.id}" style="width:auto;padding:8px 14px;margin:0;background:${bait>=it.cost?it.c:'#374151'};font-size:11px">${bait>=it.cost?'BUY':'—'}</button>
    </div>`).join('');
  card.innerHTML=`
    <div class="m-kicker" style="color:#fbcf3b">Tackle Shop</div>
    <div class="m-title">Bait on hand: <span style="color:#fbcf3b">${bait}</span></div>
    <div class="m-sub">Spend fish currency on consumable gear. Active buffs travel with you across runs.</div>
    <div style="font:11px 'JetBrains Mono',monospace;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin:8px 0 4px">Active Buffs</div>
    <div style="background:rgba(3,7,18,0.5);border-radius:8px;padding:8px 12px;font-size:11.5px;color:#cbd5e1;margin-bottom:8px">
      Sonar bank: <span style="color:#60d0ff">${buffs.sonarBank||0}</span> &nbsp;·&nbsp; Rare line: <span style="color:#a78bfa">${buffs.rareLine||0}</span> &nbsp;·&nbsp; Scout flare: <span style="color:#fbcf3b">${(buffs.scoutPing||0)>Date.now()*0.001?'live':'—'}</span>
    </div>
    ${rows}
    <button class="btn bx" onclick="DS.closePeek()" style="margin-top:12px">Close</button>`;
  card.querySelectorAll('.shop-buy').forEach(b=>b.onclick=()=>{const it=SHOP_ITEMS.find(x=>x.id===b.dataset.id);if(!it||bait<it.cost)return;bait-=it.cost;it.fn();persist();sfx('click');openShop()});
  el.style.display='flex';
}

// Stubs — real bodies land in dedicated commits below. They render a placeholder card so the
// buttons don't no-op in this commit while the bait-economy ships first.
function openAchievements(){const card=$('mini-card'),el=$('mini');if(!card||!el)return;miniActive=true;_peekOpen=true;
  const got=[...achievements].map(id=>ACH[id]).filter(Boolean);
  const all=Object.entries(ACH);
  const rows=all.map(([id,a])=>{const u=achievements.has(id);return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(3,7,18,0.45);border-radius:8px;margin:4px 0;opacity:${u?1:0.45}"><div style="font-size:22px">${u?'🏅':'🔒'}</div><div><div style="font:700 12.5px 'DM Sans',sans-serif;color:${u?'#fbcf3b':'#94a3b8'}">${a.n}</div><div style="font-size:11px;color:#94a3b8;line-height:1.4">${a.d}</div></div></div>`}).join('');
  card.innerHTML=`<div class="m-kicker" style="color:#fbcf3b">Achievements</div><div class="m-title">${got.length} / ${all.length} unlocked.</div><div class="m-sub">Earned across all your sessions.</div>${rows}<button class="btn bx" onclick="DS.closePeek()" style="margin-top:12px">Close</button>`;
  el.style.display='flex';
}
function openSettings(){const card=$('mini-card'),el=$('mini');if(!card||!el)return;miniActive=true;_peekOpen=true;
  card.innerHTML=`<div class="m-kicker" style="color:#60d0ff">Settings</div><div class="m-title">Operations panel.</div>
    <div style="background:rgba(3,7,18,0.5);border-radius:8px;padding:12px 14px;margin:10px 0">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0"><span style="color:#cbd5e1">Sound</span><button class="btn bx" id="set-mute" onclick="DS.toggleMute();document.getElementById('set-mute').textContent=document.getElementById('mute-btn').textContent" style="width:auto;padding:6px 12px;margin:0">${muted?'🔇 Off':'🔊 On'}</button></div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-top:1px solid rgba(30,41,59,0.4)"><span style="color:#cbd5e1">Graphics Quality</span><select id="set-gfx" onchange="DS.setGfx(this.value)" style="background:rgba(8,18,38,0.8);border:1px solid rgba(251,146,60,0.25);color:#e8edf5;border-radius:6px;padding:6px 10px;font:12px 'DM Sans',sans-serif"><option value="low" ${gfxQuality==='low'?'selected':''}>Low (fastest)</option><option value="medium" ${gfxQuality==='medium'?'selected':''}>Medium</option><option value="high" ${gfxQuality==='high'?'selected':''}>High (bloom + reflections)</option></select></div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-top:1px solid rgba(30,41,59,0.4)"><span style="color:#cbd5e1">Reset Save</span><button class="btn bx" onclick="if(confirm('Wipe all trophies + bait + achievements?')){try{localStorage.removeItem('dockshield_save_v1')}catch(e){};location.reload()}" style="width:auto;padding:6px 12px;margin:0;border-color:rgba(239,68,68,0.4);color:#fca5a5">WIPE</button></div>
    </div>
    <div style="font:11px 'JetBrains Mono',monospace;color:#94a3b8;line-height:1.7;background:rgba(3,7,18,0.4);border-radius:8px;padding:10px">
      <div style="color:#fb923c;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px">Controls</div>
      W/A/S/D · Arrows — Drive<br>
      Space — Sonar Ping<br>
      F — Cast (when stopped)<br>
      Esc — Bail mini-game / close menus
    </div>
    <button class="btn bx" onclick="DS.closePeek()" style="margin-top:12px">Close</button>`;
  el.style.display='flex';
}
let gfxQuality='medium';
function setGfx(q){gfxQuality=q;try{localStorage.setItem('dockshield_gfx',q)}catch(e){}applyGfx()}
function applyGfx(){/* wired in the visual-quality commit */}
try{const g=localStorage.getItem('dockshield_gfx');if(g)gfxQuality=g}catch(e){}

function openCodex(){
  const card=$('mini-card'),el=$('mini');if(!card||!el)return;
  miniActive=true;_peekOpen=true;
  const caught=fishCatalog.size,total=FISH.length;
  const byTier=r=>FISH.filter(f=>f.r===r);
  const tierBlock=(label,r)=>{const list=byTier(r);if(!list.length)return '';
    return `<div style="margin:8px 0 2px;font:700 9px 'JetBrains Mono',monospace;letter-spacing:1.5px;color:${RARE_COLOR[r]};text-transform:uppercase">${label}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">${list.map(f=>{const got=fishCatalog.has(f.n);return `<span title="${got?f.f:'Not yet caught'}" style="background:rgba(8,18,38,0.6);border:1px solid ${got?RARE_COLOR[r]:'rgba(148,163,184,0.2)'};border-radius:6px;padding:4px 8px;color:${got?RARE_COLOR[r]:'#475569'};font:12px 'DM Sans',sans-serif">${got?f.e+' '+f.n:'🔒 ???'}</span>`}).join('')}</div>`};
  card.innerHTML=`
    <div class="m-kicker" style="color:#60d0ff">Fish Codex</div>
    <div class="m-title">${caught} / ${total} species landed.</div>
    <div class="m-sub">Drive to a named spot and cast to fill the board. Rarer water holds rarer fish.</div>
    ${tierBlock('Common','common')}${tierBlock('Uncommon','uncommon')}${tierBlock('Rare','rare')}${tierBlock('Legendary','legendary')}
    <button class="btn bx" onclick="DS.closePeek()" style="margin-top:12px">Close</button>`;
  el.style.display='flex';
}
// Show the trophy peek button on s1 only if there's something to show.
function refreshTrophyPeek(){const b=$('trophy-peek-btn');if(b)b.style.display=fishCatalog.size>0?'block':'none'}

function endRun(){
  const btn=$('end-run');
  if(_endArmed){_endArmed=false;clearTimeout(_endArmedT);if(btn){btn.classList.remove('arm');btn.textContent='END RUN'}if(S.on)endGame(S.hull>0);return}
  _endArmed=true;if(btn){btn.classList.add('arm');btn.textContent='TAP TO CONFIRM'}
  _endArmedT=setTimeout(()=>{_endArmed=false;if(btn){btn.classList.remove('arm');btn.textContent='END RUN'}},2500);
}
// QA hook (only active with ?qa=1) — force-opens a mini-game with a synthetic drop point so the
// headless smoke + screenshot pass can exercise each overlay without driving to a random beacon.
function qaOpen(kind){
  if(new URLSearchParams(location.search).get('qa')!=='1')return false;
  const type=DP_TYPES.find(d=>d.k===kind);if(!type)return false;
  const dp=mkDropPoint(type);dp.position.set(9999,0,9999);dp.visible=false;dp.userData.qa=true;scene.add(dp);dropPoints.push(dp);
  const fn=mini[type.open];if(typeof fn==='function'){fn(dp);return true}return false;
}
return{launch,skip,skipFromLoad,playFromTier,boat,tier,quote,pay,reset,showTiers,replay,ping:fireSonar,beginRun,qAns,launchGame,endRun,qaOpen,cast:castLine,peekTrophies,closePeek,openCodex,toggleMute,openShop,openAchievements,openSettings,setGfx,mode:GAME_MODE};
})();

