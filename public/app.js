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
// BT = boat tuning per hero. col=hull base, accents = secondary palette used by mkBoat for trim/
// decals/emblems. Three distinct visual identities now: Reel runs red/blue/yellow tournament-flashy;
// Lilly runs pink/lime/camo-muddy; Fly runs matte stealth black/navy.
// R19 handling tune: Lilly was unplayable-slow (couldn't reach a civ before hull failed). Bumped
// her accel/top-speed/turning to ~75% of Reel's so the wide-stable feel still reads, but the boat
// actually MOVES. Reel got a touch more turn snap; Fly's wind penalty eased so she's not a chore
// in a 6kt breeze. The s1 picker stat bars were retuned to match.
const BT={
  regular:{n:'The Reel',ac:.022,dr:.985,tu:.052,mx:1.35,col:0xc91111,wx:0.95, accents:{primary:0xc91111,trim:0xffffff,stripe:0x1d6dff,emblem:0xfde047,glow:0xfca5a5,ui:'#fca5a5'}},
  pontoon:{n:'Lilly Loch',ac:.018,dr:.987,tu:.04,mx:1.05,col:0x7a5b32,wx:.78, accents:{primary:0xec4899,trim:0x7a5b32,stripe:0x84cc16,emblem:0xfbcfe8,glow:0xf472b6,ui:'#f9a8d4',camo:true}},
  speedboat:{n:'The Fly',ac:.028,dr:.978,tu:.06,mx:1.9,col:0x0c1424,wx:1.15, accents:{primary:0x0c1424,trim:0x1e293b,stripe:0x3b82f6,emblem:0x60a5fa,glow:0x60a5fa,ui:'#93c5fd'}}
};
// === PERSISTENCE ===
// Trophy catalog, evidence case file, best score, and the mute pref persist to localStorage so the
// Pokemon-style collection survives reloads, not just same-tab sessions. Guarded for private-mode
// browsers where localStorage throws.
const SAVE_KEY='dockshield_save_v1';
const evidenceCatalog=new Set();
const fishCatalog=new Set();
let bestScore=0,muted=false,bait=0,achievements=new Set();
// Biggest single fish ever landed across all runs — surfaced in the Codex + trophy peek.
let bestFish=null;
// Per-species log of first-landing context: {n:'Bluegill': {date, spot, score}}. Lets the Codex
// surface a tiny "first caught" detail line per species. Append-only — only set on first land.
let speciesLog={};
// Daily streak — increments on first startGame() of a new calendar day if yesterday was played,
// resets to 1 on a gap. {count,lastPlayed:'YYYY-MM-DD',max}. UTC date drift avoided via localDayKey.
let streak={count:0,lastPlayed:'',max:0};
// Player identity — handle for share PNGs, boat name shown in HUD operative pill. Both optional.
let playerHandle='',boatName='';
// Per-day Duct sighting/attempt log (lore: "the pier keeps notes"). Keyed by YYYY-MM-DD,
// each entry is {s,a,n} for sightings/attempts/near-catches. logDuct() bumps + trims to ~30 days.
let ductLog={};
// One-time tutorial flag — set to true after the player dismisses the first overlay so it never
// shows again. Persisted so it survives reloads. Each kind ('cast', 'duct') is shown at most once.
let tutorialSeen={};
function logDuct(kind){
  const day=new Date().toISOString().slice(0,10);
  if(!ductLog[day])ductLog[day]={s:0,a:0,n:0};
  if(kind==='sighting')ductLog[day].s++;else if(kind==='attempt')ductLog[day].a++;else if(kind==='near')ductLog[day].n++;
  // Trim to the last 30 days so the blob doesn't grow unbounded.
  const keys=Object.keys(ductLog).sort();while(keys.length>30){delete ductLog[keys.shift()]}
}
// Lifetime bait spent at any shop counts toward loyalty discount tiers:
//   0     → 0% off, "Drifter"
//   500   → 3% off, "Regular"
//   2000  → 6% off, "Local"
//   5000  → 10% off, "Old Salt"
let loyaltySpent=0;
const LOYALTY_TIERS=[
  {at:0,    name:'Drifter',  pct:0},
  {at:500,  name:'Regular',  pct:0.03},
  {at:2000, name:'Local',    pct:0.06},
  {at:5000, name:'Old Salt', pct:0.10}
];
function loyaltyTier(){let cur=LOYALTY_TIERS[0];for(const t of LOYALTY_TIERS)if(loyaltySpent>=t.at)cur=t;return cur}
function loyaltyDiscount(cost){return Math.max(1,Math.round(cost*(1-loyaltyTier().pct)))}
function loyaltyBuy(cost){const final=loyaltyDiscount(cost);bait-=final;loyaltySpent+=final;return final}
// Shared price-label HTML — strikes through the original cost when a loyalty discount applies.
function priceLabel(cost){const disc=loyaltyDiscount(cost);return disc<cost?`<s style="opacity:0.55;font-size:9px;margin-right:3px">${cost}</s>${disc} bait`:`${cost} bait`}
// Duct the Rubber Ducky — the uncatchable legendary. Persisted lifetime stats only; he never
// enters fishCatalog or the trophy case (canon: nobody has ever landed him).
let ductStats={sightings:0,attempts:0,nearCatches:0};
// Active buffs (consumable items from the tackle shop). Persists across runs until consumed.
let buffs={rareLine:0,sonarBank:0,scoutPing:0};
// Bait pantry — typed bait gathered from shore foraging. Each cast consumes one of the equipped
// bait type and biases rollFish() in a different direction (see BAIT_TYPES below).
let baitInv={worm:0,cricket:0,frog:0,minnow:0,crayfish:0,ducttape:0,calmminnow:0,loudcricket:0};
let equippedBait='';   // '' = bare hook, no bait bias
// === BOAT UPGRADES ===
// Per-hero loadout. Four slots × 3 tiers each. Bought with bait at the new Boatworks shop. Each
// tier ALSO attaches a visible part to the hull (bigger motor block, deck floodlights, hull
// plating, antenna mast). Per-hero so each operative has its own boat and own upgrade ladder.
const BOAT_UP={
  engine:[
    {n:'Stock Outboard',cost:0,  speedMul:1.00,e:'⚙️',d:'Came with the boat.'},
    {n:'V-Tuned',       cost:60, speedMul:1.10,e:'🔥',d:'+10% top speed + acceleration.'},
    {n:'Twin-Prop',     cost:180,speedMul:1.22,e:'🚀',d:'+22% top speed. Sounds mean.'}
  ],
  lights:[
    {n:'Nav Lights',    cost:0,  range:0,    e:'💡',d:'Standard port + starboard.'},
    {n:'Bow Spotlight', cost:55, range:1.4,  e:'🔦',d:'Cuts further into fog.'},
    {n:'Floodlight Rig',cost:160,range:2.2,  e:'🌟',d:'Deck floodlights. Night-runs become easy.'}
  ],
  armor:[
    {n:'Bare Hull',     cost:0,  resist:0,   e:'🧱',d:'Whatever the factory left.'},
    {n:'Hull Plating',  cost:70, resist:0.08,e:'🛡️',d:'+8% damage resistance.'},
    {n:'Reinforced Keel',cost:200,resist:0.18,e:'⛓️',d:'+18% damage resistance.'}
  ],
  electronics:[
    {n:'Basic Sonar',   cost:0,  sonarBoost:0,    e:'📡',d:'Standard ping.'},
    {n:'Wide-Sweep',    cost:65, sonarBoost:0.18, e:'🛰️',d:'+18% sonar range.'},
    {n:'Depth Gauge',   cost:190,sonarBoost:0.32, e:'📊',d:'+32% sonar range + extra HUD depth pill.'}
  ]
};
// Per-hero starter loadout — Reel V-Tuned engine, Lilly hull plating, Fly wide-sweep electronics.
let boatUpgrades={
  regular:  {engine:1,lights:0,armor:0,electronics:0},
  pontoon:  {engine:0,lights:0,armor:1,electronics:0},
  speedboat:{engine:0,lights:0,armor:0,electronics:1}
};
const eqUp=(slot)=>BOAT_UP[slot][(boatUpgrades[S.bc]||{})[slot]||0];
const BAIT_TYPES={
  worm:    {n:'Worm',     c:'#a47a52', e:'🪱', desc:'+10% uncommon bias.'},
  cricket: {n:'Cricket',  c:'#8db347', e:'🦗', desc:'+18% uncommon, slight rare lift.'},
  minnow:  {n:'Minnow',   c:'#7ec8e3', e:'🐠', desc:'+20% rare odds (pike-biased).'},
  frog:    {n:'Frog',     c:'#5fa75f', e:'🐸', desc:'+25% rare, lures bass.'},
  crayfish:{n:'Crayfish', c:'#cf4040', e:'🦞', desc:'+30% rare + 10% legendary.'},
  // Lore item — crafted at the tackle shop from rare forage. People swear it draws Duct in faster
  // and "almost" works. Actually: it widens the bobber peak window during Duct fights by ~30%.
  // Does NOT make him catchable. Consumed only on Duct attempts, not regular casts.
  ducttape:{n:'Duct Tape Lure', c:'#ffd23f', e:'🦆', desc:'A wad of duct tape on a hook. "Almost" works on Duct.', isLure:true},
  // Crafted: pacified minnow → cleaner bites on uncommon spots, no spook factor.
  calmminnow:{n:'Calm Minnow Rig', c:'#a5d8ee', e:'🪞', desc:'+35% rare on uncommon spots, no spook.', crafted:true},
  // Crafted: loud cricket → uncommon + double bites at lure-marked spots.
  loudcricket:{n:'Loud Cricket Charm', c:'#d8e066', e:'📣', desc:'+25% uncommon · doubles bites at lure spots.', crafted:true}
};
// Duct Tape Lure recipe — crafted at any tackle shop. Designed to be just out of reach early on so
// the player has to forage a while before they can chase the legend with it.
const DUCT_LURE_RECIPE={crayfish:3,frog:4,minnow:6};
// Crafting recipe table — each entry describes a craftable bait + its cost.
// Yields BAIT_TYPES key (so they show in the pantry + are equippable like any other bait).
const CRAFT_RECIPES=[
  {id:'ducttape',out:'ducttape',in:DUCT_LURE_RECIPE,
   ach:'duct_lure_crafted',
   tag:'🦆 Duct Tape Lure',blurb:'"Almost" works on Duct. Widens the bobber peak window.'},
  {id:'calmminnow',out:'calmminnow',in:{minnow:5,worm:5},
   ach:'first_craft',
   tag:'🪞 Calm Minnow Rig',blurb:'A pacified minnow. +35% rare on uncommon spots, no spook factor.'},
  {id:'loudcricket',out:'loudcricket',in:{cricket:6,frog:1},
   ach:'first_craft',
   tag:'📣 Loud Cricket Charm',blurb:'A cricket that won\'t shut up. +25% uncommon AND lure-spots see double bites.'}
];
// === GEAR PROGRESSION ===
// Four equipment slots, each a tier ladder bought with bait at the lake's bait shops. Higher tiers
// improve the fishing loop: rod = fight control, reel = rare odds, line = max landable rarity,
// box = hull cap + bait capacity. `gear` holds the equipped tier index per slot (0 = starter).
const GEAR={
  rod:[
    {n:'Cane Pole',         cost:0,   control:1.0, e:'🎋', d:'Starter. Snaps under a real fight.'},
    {n:'Graphite Rod',      cost:45,  control:1.35,e:'🎣', d:'Stiffer backbone — gators tire faster.'},
    {n:'Reel\'s Tournament Rod',cost:140,control:1.8, e:'🏆', d:'The Reel\'s own rig. Heroic hook-sets.'},
    {n:'Depth Harpoon Rod', cost:360, control:2.4, e:'🔱', d:'Built for what lives under the Deep Dock.'}
  ],
  reel:[
    {n:'Spincast',          cost:0,   rare:1.0,  e:'🌀', d:'Gets the job done.'},
    {n:'Baitcaster',        cost:55,  rare:1.25, e:'⚙️', d:'+25% rare & legendary odds.'},
    {n:'Sealed Drag Reel',  cost:160, rare:1.6,  e:'🛞', d:'+60% rare odds. Survives blackwater.'},
    {n:'Loch Special',      cost:400, rare:2.1,  e:'💠', d:'Lilly tuned it. The water answers.'}
  ],
  line:[
    {n:'8lb Mono',          cost:0,   strength:1, e:'➰', d:'Lands up to uncommon cleanly.'},
    {n:'20lb Braid',        cost:60,  strength:2, e:'🪢', d:'Holds rare fish without snapping.'},
    {n:'40lb Fluoro',       cost:175, strength:3, e:'🧵', d:'Legendary-rated. Nearly invisible.'},
    {n:'Depth Cable',       cost:420, strength:4, e:'⛓️', d:'Will not break. Tested on the boss.'}
  ],
  box:[
    {n:'Bucket',            cost:0,   hullCap:100, baitCap:400, e:'🪣', d:'Holds the basics.'},
    {n:'Tackle Box',        cost:70,  hullCap:120, baitCap:800, e:'🧰', d:'+20 hull cap, more bait room.'},
    {n:'Field Locker',      cost:200, hullCap:140, baitCap:1500,e:'🗃️', d:'+40 hull cap. Pro storage.'},
    {n:'Depth Case',        cost:480, hullCap:170, baitCap:5000,e:'🧊', d:'+70 hull cap. Carries it all.'}
  ]
};
let gear={rod:0,reel:0,line:0,box:0};
// Convenience accessors for the equipped tier objects.
const eqRod=()=>GEAR.rod[gear.rod],eqReel=()=>GEAR.reel[gear.reel],eqLine=()=>GEAR.line[gear.line],eqBox=()=>GEAR.box[gear.box];
// Graphics quality preference (separate small key so a settings wipe doesn't reset gfx).
let gfxQuality='medium';
try{const g=localStorage.getItem('dockshield_gfx');if(g)gfxQuality=g}catch(e){}
// Photo mode — free orbit camera with HUD hidden. Pauses the run while active.
let photoMode=false,photoCam={yaw:0,pitch:0.35,dist:22},_photoResume=false;
// Polish-pass user prefs: audio master volume + shake intensity multiplier. Plain numbers in the
// save blob so JSON.stringify round-trips losslessly. Defaults applied via || in loadSave.
// Master + per-bus volume. _audVol is the master multiplier (kept for backward-compat with the
// existing slider + save field). The bus values default to 1.0 so a save without them sounds
// identical to before. Each consumer reads master*bus.
let _audVol=0.6,_shakeMul=1.0;
let _sfxVol=1.0,_engineVol=1.0,_ambientVol=1.0,_musicVol=0.8;
function loadSave(){
  try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)return;const d=JSON.parse(raw);
    (d.fish||[]).forEach(n=>fishCatalog.add(n));(d.evidence||[]).forEach(n=>evidenceCatalog.add(n));
    (d.ach||[]).forEach(n=>achievements.add(n));
    bestScore=d.best||0;muted=!!d.muted;bait=d.bait||0;loyaltySpent=d.loyalty||0;
    if(d.bestFish&&typeof d.bestFish==='object')bestFish=d.bestFish;
    if(d.ductLog&&typeof d.ductLog==='object')ductLog=d.ductLog;
    if(d.speciesLog&&typeof d.speciesLog==='object')speciesLog=d.speciesLog;
    if(d.streak&&typeof d.streak==='object')Object.assign(streak,d.streak);
    if(typeof d.playerHandle==='string')playerHandle=d.playerHandle.slice(0,24);
    if(typeof d.boatName==='string')boatName=d.boatName.slice(0,24);
    if(d.tutorialSeen&&typeof d.tutorialSeen==='object')tutorialSeen=d.tutorialSeen;
    if(d.buffs)Object.assign(buffs,d.buffs);
    if(d.gear)Object.assign(gear,d.gear);
    if(d.duct)Object.assign(ductStats,d.duct);
    if(d.baitInv)Object.assign(baitInv,d.baitInv);
    if(typeof d.equippedBait==='string')equippedBait=d.equippedBait;
    if(d.boatUpgrades){Object.keys(boatUpgrades).forEach(h=>{if(d.boatUpgrades[h])Object.assign(boatUpgrades[h],d.boatUpgrades[h])})}
    if(typeof d.audioVol==='number')_audVol=Math.max(0,Math.min(1,d.audioVol));
    if(typeof d.shakeMul==='number')_shakeMul=Math.max(0,Math.min(1.5,d.shakeMul));
    if(typeof d.sfxVol==='number')_sfxVol=Math.max(0,Math.min(1,d.sfxVol));
    if(typeof d.engineVol==='number')_engineVol=Math.max(0,Math.min(1,d.engineVol));
    if(typeof d.ambientVol==='number')_ambientVol=Math.max(0,Math.min(1,d.ambientVol));
    if(typeof d.musicVol==='number')_musicVol=Math.max(0,Math.min(1,d.musicVol));
  }catch(e){}
}
function persist(){
  // Bait is capped by the equipped box capacity.
  bait=Math.min(bait,eqBox().baitCap);
  try{localStorage.setItem(SAVE_KEY,JSON.stringify({fish:[...fishCatalog],evidence:[...evidenceCatalog],ach:[...achievements],best:bestScore,muted,bait,buffs,gear,duct:ductStats,baitInv,equippedBait,boatUpgrades,audioVol:_audVol,shakeMul:_shakeMul,sfxVol:_sfxVol,engineVol:_engineVol,ambientVol:_ambientVol,musicVol:_musicVol,loyalty:loyaltySpent,bestFish,ductLog,speciesLog,streak,playerHandle,boatName,tutorialSeen}))}catch(e){}
  // Auto-save indicator — brief green pulse next to the HUD score. Falls back gracefully if HUD
  // isn't in the DOM yet (very-early bootstrap persist).
  const dot=typeof document!=='undefined'?document.getElementById('save-dot'):null;
  if(dot){dot.style.opacity='1';clearTimeout(persist._dot);persist._dot=setTimeout(()=>{dot.style.opacity='0.25'},500)}
}
// QA-only: read the current save blob (post-load) for backward-compat assertions. No side effects.
function getSave(){try{return JSON.parse(localStorage.getItem(SAVE_KEY)||'{}')}catch(e){return{}}}
loadSave();
// Fish species pool with rarity weights, score values, and lore flavor. Higher 'w' = more common.
// Spots on the lake bias which species roll — see FISH_SPOTS below.
// fight: 0 = no struggle (lands instantly), 1..3 = fight intensity. line: minimum line strength
// needed to land cleanly (1..4) — under-gunned line shrinks the safe zone and risks a snap.
// gator: true = a thrashing reptile catch with its own fight flavor + harder pull.
const FISH=[
  // common (no fight)
  {n:'Bluegill',     r:'common',  w:24, s:8,  e:'🐟', fight:0, line:1, f:'Easy money — fries up clean.'},
  {n:'Crappie',      r:'common',  w:20, s:10, e:'🐟', fight:0, line:1, f:'Schools where the shadows fall.'},
  {n:'Channel cat',  r:'common',  w:16, s:14, e:'🐡', fight:0, line:1, f:'Bottom feeder. Big enough.'},
  // uncommon (light fight)
  {n:'Largemouth bass', r:'uncommon', w:12, s:25, e:'🎣', fight:1, line:1, f:'The Reel would already be on camera.'},
  {n:'Striper',      r:'uncommon', w:10, s:30, e:'🐠', fight:1, line:1, f:'Fights like it owes you money.'},
  {n:'Spotted gar',  r:'uncommon', w:8,  s:35, e:'🦈', fight:1, line:2, gator:true, f:'Teeth older than the marina.'},
  // rare (real fight)
  {n:'Bowfin',       r:'rare',    w:5,  s:65, e:'🐉', fight:2, line:2, f:'Living fossil. Lilly loved them as a kid.'},
  {n:'Alligator gar',r:'rare',    w:4,  s:90, e:'🐊', fight:2, line:2, gator:true, f:'Folks say they used to be bigger. They’re right.'},
  {n:'Mud carp',     r:'rare',    w:3,  s:110,e:'🪲', fight:2, line:3, f:'The Quarantine Line outflow grew these.'},
  {n:'Bull gator',   r:'rare',    w:2.2,s:160,e:'🐊', fight:3, line:3, gator:true, f:'Not a fish. Hooked it anyway. It is NOT happy.'},
  // legendary (Castor Bayou specials — heavy fights)
  {n:'Albino bream', r:'legendary', w:1.2, s:280, e:'👻', fight:2, line:3, f:'White as wet paper. Found near the Flooded Chapel.'},
  {n:'Three-eyed pike',r:'legendary', w:0.9, s:420, e:'🐲', fight:3, line:3, f:'Pulled from the Sunk Road waters. Lilly looked at it too long.'},
  {n:'Deep-Dock catch',r:'legendary',w:0.4,s:850, e:'🌑', fight:3, line:4, gator:true, f:'Doesn’t look right. Something else is on the line below this one.'}
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
  const reelBonus=eqReel().rare;  // equipped reel's permanent rare-odds multiplier
  // Bait pantry bias — consumed in castLine before the roll runs; bias is read here.
  const useBait=equippedBait&&baitInv[equippedBait]>0?equippedBait:'';
  const baitBias=f=>{
    if(!useBait)return 1;
    if(useBait==='worm')return f.r==='uncommon'?1.10:1;
    if(useBait==='cricket')return f.r==='uncommon'?1.18:f.r==='rare'?1.05:1;
    if(useBait==='minnow')return f.r==='rare'?1.20:f.n==='Three-eyed pike'?1.5:1;
    if(useBait==='frog')return f.r==='rare'?1.25:f.n==='Largemouth bass'?1.5:1;
    if(useBait==='crayfish')return f.r==='rare'?1.30:f.r==='legendary'?1.10:1;
    // Crafted baits.
    if(useBait==='calmminnow')return spot&&f.r==='uncommon'?1.35:f.r==='rare'?1.10:1;
    if(useBait==='loudcricket')return f.r==='uncommon'?1.25:(spot&&spot.bias&&spot.bias.includes(f.n))?2.0:1;
    return 1;
  };
  let pool=FISH.map(f=>{let w=f.w;if(spot&&spot.bias.includes(f.n))w*=3;if(stormy&&(f.r==='rare'||f.r==='legendary'))w*=2.2;if(tourney&&(f.r==='rare'||f.r==='legendary'))w*=3;if((f.r==='rare'||f.r==='legendary'))w*=reelBonus;w*=baitBias(f);return {...f,w}});
  if(useBait){baitInv[useBait]=Math.max(0,baitInv[useBait]-1);persist()}
  if(tourney){buffs.rareLine--;persist()}
  const total=pool.reduce((a,b)=>a+b.w,0);let r=Math.random()*total;
  for(const f of pool){r-=f.w;if(r<=0)return f}return pool[0];
}
// Run-scoped catch log so s5 can summarize the haul.
let runCatches=[];
// Hero identity per boat — kit signature, voice palette, and HUD badge color.
// Voice lines lean on the Character Bible: Reel = bold/quotable, Fly = dry/short, Lilly = country direct.
const HERO={
  regular:{id:'reel',n:'The Reel',role:'Rescue · Control',kit:'Casting rod grapnel + heavy reel winch',badge:'#ef4444',col:'#fca5a5',voice:{start:"Line's tight. Somebody's coming home.",surge:'Bayou Bay paid for a show — keep it together.',rescue:'You can bite the boat — you ain\'t getting the people.',evidence:'Got something. Bag it.',catchCommon:'Cleaner than I deserved. Keep working.',catchRare:'Heavy. Tournament heavy.',catchLegendary:'I felt that one in the rod butt. Folks at Garbone will want a look.',catchGator:'Hooked into a slab. Hands wide on the rod.'}},
  pontoon:{id:'lilly',n:'Lilly Loch',role:'Brawler · Traversal',kit:'Swamp strength + improvised dock-board shield',badge:'#10b981',col:'#a7f3d0',voice:{start:'Water already moved. We move with it.',surge:'Bless your heart, hold on.',rescue:'I got you. Easy, easy.',evidence:'Castor Bayou\'s talking. We\'re listening.',catchCommon:'Pretty fish. Pretty water.',catchRare:'Look at that color. Bayou paints \'em right.',catchLegendary:'Mama\'d have a stroke if she saw this.',catchGator:'Bull on the line. Tail like a oar. Stay on the deck.'}},
  speedboat:{id:'fly',n:'The Fly',role:'Recon · Trap',kit:'Fly-line tripwires + hook cams + sonar pings',badge:'#3b82f6',col:'#93c5fd',voice:{start:'That wake has no boat. Move careful.',surge:'Surge. Brace.',rescue:'Civilian out. Clean.',evidence:'Tag it. We\'ll read it back at the yard.',catchCommon:'Logged.',catchRare:'Rare specimen. Photographed. Sample bagged.',catchLegendary:'Legendary signature. Sonar read it three hundred meters out.',catchGator:'Apex on the line. Confirm hull integrity before you boat it.'}}
};
const TI={1:{n:'Preventative',p:49},2:{n:'Comprehensive',p:99},3:{n:'Premium',p:199}};
let S={addr:'',email:'',bc:'pontoon',ti:2,lat:34.1751,lng:-83.996,on:false,score:0,t0:0,maxSpd:0,dist:0,near:0,lid:null,curl:null,played:false,phase:0,pc:0,hull:100,discount:0,outcome:'',civsSaved:0,civsTotal:0,evCollected:null,missionsCleared:0,wx:{ws:3,wd:180,g:0,c:'Clear',t:72,v:10000}};
// Discount tiers earned by run outcome
const DISC={'FULL EXTRACTION':15,'CLEAN EXTRACTION':15,'CLOSE CALLS':10,'RECKLESS':5,'OVERRUN':0};
const $=id=>document.getElementById(id);
// One-shot mobile detect. Hoisted here so every consumer (show(), initEngine, audio unlock) reads
// the same regex — iPhone/iPad were missing from the older /Mobi|Android/i checks.
const _isMob=/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
function show(id){['s1','s2','s3','s4','s5'].forEach(s=>$(s).classList.toggle('off',s!==id));
  // Hide touch controls when any card is showing
  const tEl=$('touch');if(tEl)tEl.style.display=(id===null&&_isMob)?'block':'none'}

let scene,cam,ren,bMesh,waterGeo,waterOZ,stumps=[],aiB=[],civs=[],evidence=null,dropPoints=[];
// Drop point types -> mini-game key, marker color, label, expected mini-game opener function name.
// Special boss drop type — never spawned randomly; only by spawnDeepDock() once unlock fires.
const DP_BOSS={k:'boss',col:0x9333ea,n:'THE DEPTH RISES',open:'openBoss'};
// Gator King — special drop that auto-spawns at East Rocks once the player has logged 3+ gators.
const DP_GATOR_KING={k:'gator_king',col:0x4a8a32,n:'GATOR KING · EAST ROCKS',open:'openGatorKing'};
const GATOR_NAMES=['Spotted gar','Alligator gar','Bull gator'];  // 3 trigger gators (Deep-Dock excluded — that's the boss)
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
// Frees every geometry/material under an Object3D so removing it from the scene doesn't leak GPU
// memory. Used wherever meshes are rebuilt/removed mid-run (boats, drop points, rain).
function disposeTree(obj){if(!obj)return;obj.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m&&m.dispose())}})}
// Hoisted scratch vectors — reused each frame so loop()/tickDuct() don't allocate per frame.
const _yAxis=new THREE.Vector3(0,1,0),_vDir=new THREE.Vector3(),_vCam=new THREE.Vector3(),_vDuct=new THREE.Vector3(),_vFwd=new THREE.Vector3(),_vTip=new THREE.Vector3();
// Frame counter — lets the loop stagger expensive work (e.g. water normals) across frames.
let _frame=0;
// Minimap zoom — 1.0 = default (whole lake), 2.2 = zoomed in (dense areas). Toggled with M.
let _mmZoom=1.0;
// Hysteresis flag for night-mode visuals (sign-bloom). Toggled in the sun-arc block of loop().
let _isNight=false;
// Local-day key for the streak counter — UTC (via toISOString) drifts in PST/JST late hours, so use
// the player's actual calendar day. Used only for streak math; other date-stamps stay UTC for now.
function localDayKey(offsetDays){const d=new Date();if(offsetDays)d.setDate(d.getDate()+offsetDays);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
// Offset (seconds) added to the day/night cycle clock — QA hook uses it to force a time of day.
let _dayOffset=0;
// Fight-mode flags — music.update reads them to switch into the 'chase' palette during Deep Dock
// boss or Gator King fights. The Duct chase already exposes DUCT.engaged for the same purpose.
let _bossActive=false,_gkActive=false;
// Sun-arc edge-trigger state for golden-hour flash events (sunrise + sunset amber tint).
let _lastDayness=null,_goldenFlashUntil=0;
// Track the last-displayed bait value so the HUD can pulse on any change (up or down).
let _lastBait=0;
function pulseBait(delta){
  const el=document.getElementById('h-bait');if(!el)return false;
  el.classList.remove('bait-pop-up','bait-pop-down');void el.offsetWidth;  // restart animation
  el.classList.add(delta>=0?'bait-pop-up':'bait-pop-down');
  return true;
}
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
  // Shared backdrop painter for forage canvas games — radial vignette + faint grain stippling so
  // none of them read as flat color boxes. Each caller passes its biome's "core" + "edge" colors.
  paintForageBg(ctx,W,H,core,edge,grain){
    const g=ctx.createRadialGradient(W/2,H/2,20,W/2,H/2,Math.max(W,H));
    g.addColorStop(0,core);g.addColorStop(0.55,edge);g.addColorStop(1,'#0a0d0c');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    ctx.fillStyle=grain;for(let i=0;i<70;i++)ctx.fillRect((i*97)%W,(i*131)%H,1,1);
  },
  finish(dp,score,radioLine,who){
    // Drain per-mini-game teardown hooks first so listeners/timers don't outlive the overlay.
    this._teardowns.splice(0).forEach(fn=>{try{fn()}catch(e){}});
    if(_fightCleanup){_fightCleanup();_fightCleanup=null}
    // Belt-and-braces: clear the boss/GK music-mode flags so an Escape-out leaves music in explore
    // mode even if the inner flee/win/lose branch missed clearing them. Cheap, idempotent.
    if(dp&&dp.userData&&dp.userData.type){const k=dp.userData.type.k;if(k==='boss')_bossActive=false;if(k==='gator_king')_gkActive=false}
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
  // === GATOR KING: 3-phase mini-boss at East Rocks ===
  // Phase 1 (LUNGES): lunge bar; strike inside 45-55% gold band; 5 clean hits → phase 2.
  // Phase 2 (DRAG):   stiff tension-band fight, progress to 100 → phase 3.
  // Phase 3 (TAIL):   3 telegraphed tail-slap warnings; tap DODGE (Space) in the gold window of the
  //                   warning bar to avoid hull damage; 3 dodges → win.
  openGatorKing(dp){
    miniActive=true;S.on=false;_gkActive=true;
    const card=$('mini-card'),el=$('mini');if(!card||!el){_gkActive=false;mini.finish(dp,0,'Lost the line.','self');return}
    let phase=1,hits=0,need=5,playerHull=Math.round(S.hull),tension=0.3,progress=0,over=false,lungeT=null,lungeBar=0,lungeDir=1;
    let dodges=0,dodgeNeed=3,slapT=null,slapBar=0,slapArmed=false;  // phase 3 state
    // Lilly hero ability: damage resist trims gator strikes by 30% (10% baseline + 20% boss-arena).
    // Fly hero ability: a 1-slot wider strike band in phase 1 (recon clinches the timing).
    const heroResist=S.bc==='pontoon'?0.30:0;
    const flyBand=S.bc==='speedboat'?3:0;  // wider strike window in phase 1
    const render=()=>{
      const hullCol=playerHull<30?'#ef4444':playerHull<60?'#f59e0b':'#10b981';
      const phName={1:'PHASE 1 · LUNGES',2:'PHASE 2 · DRAG',3:'PHASE 3 · TAIL'}[phase];
      let body='';
      if(phase===1){
        body=`<div class="sb"><div class="sr"><span class="sl">Hits</span><span class="sv y">${hits} / ${need}</span></div><div class="sr"><span class="sl">Your Hull</span><span class="sv" style="color:${hullCol}">${playerHull}%</span></div></div>
          <div style="position:relative;height:24px;border-radius:6px;background:linear-gradient(90deg,#ef4444 0%,#f59e0b ${38-flyBand}%,#10b981 50%,#f59e0b ${62+flyBand}%,#ef4444 100%);overflow:hidden;margin:8px 0"><div id="gk-bar" style="position:absolute;top:0;bottom:0;left:0;width:3px;background:#fff;box-shadow:0 0 8px #fff"></div></div>
          <button class="btn bp" id="gk-strike" style="background:linear-gradient(135deg,#4a8a32,#2a5018)">STRIKE (Space)</button>`;
      }else if(phase===2){
        body=`<div class="m-sub" style="color:#94a3b8">Hold the line. Easy. He's tired.</div>
          <div style="position:relative;height:26px;border-radius:6px;background:linear-gradient(90deg,#10b981 0%,#10b981 65%,#f59e0b 85%,#ef4444 100%);overflow:hidden;margin:10px 0">
            <div id="gk-band" style="position:absolute;top:0;bottom:0;left:42%;width:16%;background:rgba(255,255,255,0.22);border-left:2px solid #fff;border-right:2px solid #fff"></div>
            <div id="gk-ten" style="position:absolute;top:0;bottom:0;width:3px;background:#fff;box-shadow:0 0 8px #fff"></div>
          </div>
          <div style="font:10px 'JetBrains Mono',monospace;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">Landed</div>
          <div style="height:10px;border-radius:5px;background:rgba(3,7,18,0.5);overflow:hidden;margin:4px 0 10px"><div id="gk-prog" style="height:100%;width:0%;background:#4a8a32;transition:width 0.05s"></div></div>
          <button class="btn bp" id="gk-reel" style="background:linear-gradient(135deg,#4a8a32,#2a5018);user-select:none">HOLD TO REEL (Space)</button>`;
      }else{
        body=`<div class="m-sub" style="color:#fb923c">Tail's coming around. DODGE (Space) when the bar peaks <b>gold</b>.</div>
          <div class="sb"><div class="sr"><span class="sl">Dodges</span><span class="sv y">${dodges} / ${dodgeNeed}</span></div><div class="sr"><span class="sl">Your Hull</span><span class="sv" style="color:${hullCol}">${playerHull}%</span></div></div>
          <div style="position:relative;height:24px;border-radius:6px;background:linear-gradient(90deg,#1a1a2e 0%,#1a1a2e 40%,#fbcf3b 50%,#1a1a2e 60%,#1a1a2e 100%);overflow:hidden;margin:8px 0"><div id="gk-slap" style="position:absolute;top:0;bottom:0;left:0;width:3px;background:#ef4444;box-shadow:0 0 8px #ef4444"></div></div>
          <button class="btn bp" id="gk-dodge" style="background:linear-gradient(135deg,#fb923c,#9a3a10)">DODGE (Space)</button>`;
      }
      card.innerHTML=`<div class="m-kicker" style="color:#4a8a32">🐊 ${dp.userData.type.n} · ${phName}${heroResist>0?' <span style=color:#a7f3d0;font-size:9px>· Lilly resist active</span>':''}${flyBand>0?' <span style=color:#93c5fd;font-size:9px>· Fly recon active</span>':''}</div><div class="m-title">${phase===1?'Wait for the lunge.':phase===2?'Bring him in.':'Get out of the way.'}</div>${body}<button class="btn bx" id="gk-flee" style="margin-top:8px">Cut Line</button>`;
      if(phase===1)$('gk-strike').onclick=strike;
      if(phase===3)$('gk-dodge').onclick=dodge;
      $('gk-flee').onclick=flee;
    };
    // Phase 1 — lunge bar oscillates; strike when inside the 45-55% (±flyBand) gold band.
    const startLunges=()=>{lungeT=setInterval(()=>{
      lungeBar+=0.05*lungeDir;if(lungeBar>=1){lungeBar=1;lungeDir=-1}else if(lungeBar<=0){lungeBar=0;lungeDir=1}
      const b=$('gk-bar');if(b)b.style.left=(lungeBar*100)+'%';
    },40);mini.addTeardown(()=>clearInterval(lungeT))};
    const strike=()=>{
      const pct=lungeBar*100,lo=38-flyBand,hi=62+flyBand;
      if(pct>=45-flyBand&&pct<=55+flyBand){hits++;sfx('win');if(hits>=need){clearInterval(lungeT);phase=2;startReel();render();return}}
      else{const dmg=Math.round(15*(1-heroResist));playerHull=Math.max(0,playerHull-dmg);S.hull=playerHull;sfx('hit');flashDamage(0.7);if(playerHull<=0){clearInterval(lungeT);lose();return}}
      render();
    };
    // Phase 2 — band fight.
    const startReel=()=>{
      const bandHalf=0.08,bandCenter=0.5,climb=0.012,fall=0.011;
      const tk=setInterval(()=>{
        if(over)return;
        const reel=keysSpace;
        tension+=reel?climb:-fall;tension=Math.max(0,Math.min(1,tension));
        if(tension>=1){over=true;clearInterval(tk);sfx('hit');flashDamage(0.4);finishGK(false);return}
        const inBand=Math.abs(tension-bandCenter)<=bandHalf;
        progress+=inBand?1.0:-0.7;progress=Math.max(0,Math.min(100,progress));
        const tEl=$('gk-ten'),pEl=$('gk-prog');
        if(tEl)tEl.style.left=(tension*100)+'%';if(pEl)pEl.style.width=progress+'%';
        if(progress>=100){clearInterval(tk);phase=3;startTailSlaps();render()}
      },50);
      mini.addTeardown(()=>clearInterval(tk));
    };
    // Phase 3 — tail-slap dodge. Bar sweeps across; tap DODGE in the gold window (45-55%).
    // Lilly resist halves slap damage. Missing the window costs hull. 3 successful dodges → win.
    const startTailSlaps=()=>{
      const sweep=()=>{slapBar=0;slapArmed=true;const dir=Math.random()<0.5?1:-1;if(dir<0)slapBar=1;
        slapT=setInterval(()=>{
          slapBar+=0.012*dir;
          if((dir>0&&slapBar>=1)||(dir<0&&slapBar<=0)){
            // Missed entirely — slap connects.
            clearInterval(slapT);slapArmed=false;
            const dmg=Math.round(20*(1-heroResist));playerHull=Math.max(0,playerHull-dmg);S.hull=playerHull;sfx('hit');flashDamage(0.8);
            if(playerHull<=0){lose();return}
            setTimeout(sweep,800);render();
          }
          const b=$('gk-slap');if(b)b.style.left=(slapBar*100)+'%';
        },40);
        mini.addTeardown(()=>clearInterval(slapT));
      };
      sweep();
    };
    const dodge=()=>{
      if(!slapArmed||phase!==3)return;
      const pct=slapBar*100;
      if(pct>=45&&pct<=55){
        clearInterval(slapT);slapArmed=false;dodges++;sfx('win');
        if(dodges>=dodgeNeed){finishGK(true);return}
        setTimeout(()=>{render();startTailSlaps()},700);
      }else{
        // Mistimed swat — half damage of a clean miss.
        const dmg=Math.round(10*(1-heroResist));playerHull=Math.max(0,playerHull-dmg);S.hull=playerHull;sfx('hit');flashDamage(0.5);
        if(playerHull<=0){clearInterval(slapT);lose();return}
      }
      render();
    };
    let keysSpace=false;
    const keyHandler=e=>{
      if(e.code==='Space'){e.preventDefault();
        if(phase===1&&e.type==='keydown')strike();
        else if(phase===3&&e.type==='keydown')dodge();
        else if(phase===2)keysSpace=(e.type==='keydown');
      }
    };
    document.addEventListener('keydown',keyHandler);document.addEventListener('keyup',keyHandler);
    mini.addTeardown(()=>{document.removeEventListener('keydown',keyHandler);document.removeEventListener('keyup',keyHandler)});
    const flee=()=>{_gkActive=false;S.hull=Math.max(1,S.hull-20);mini.finish(dp,40,'Let him slide off. He stays the king.','fly')};
    const finishGK=won=>{
      over=true;
      _gkActive=false;
      if(won){S.gatorKingDown=true;bait+=60;persist();onUnlock('gator_king');mini.finish(dp,800,'Got him. The Crayfish Hole is yours.','reel')}
      else{mini.finish(dp,0,'He rolled and snapped the line. Gone again.','lilly')}
    };
    const lose=()=>finishGK(false);
    startLunges();render();el.style.display='flex';radio('Gator King breached. Hold the line.','self');
  },
  // Phase 1 (SHELL): sonar 6 times to crack the shell. Each ping +1 hit; window is short.
  // Phase 2 (LURE): tap the surfacing weak point in the right window — too early misses, too late
  //                 the creature breaches and bites for -25 hull.
  // Phase 3 (LINE): hold the harpoon line as it drags. A bar drifts; release at peak tension.
  // Win = +1500 score, +120 bait, unlock 'deep_dock', clears the special drop point. Lose = sink.
  openBoss(dp){
    miniActive=true;S.on=false;_bossActive=true;
    const card=$('mini-card'),el=$('mini');
    // Hero ability hooks for the Deep Dock arena:
    //   The Fly:    -1 sonar hit needed in phase 1 (recon advantage), narrower phase-2 miss penalty
    //   Lilly Loch: 30% damage resist on all phase damage (stacks with hull armor)
    //   The Reel:   wider phase-3 release peak band (rod control reads the tension better)
    const heroResist=S.bc==='pontoon'?0.30:0;
    const heroFlyShell=S.bc==='speedboat'?1:0;
    const heroReelPeak=S.bc==='regular'?0.06:0;  // widens peak band by ±6%
    let phase=1,hits=0,need=6-heroFlyShell,playerHull=Math.round(S.hull),lureWindow=null,tension=0,won=null;
    // For the boss_clean achievement — track the lowest hull seen across the fight.
    let _bossHullMin=playerHull,_bossStartHull=playerHull;
    const _bossPhaseFlash=()=>{const gr=$('grade');if(!gr)return;const prev=gr.style.transition||'';gr.style.transition='opacity 0.2s ease-out';gr.style.opacity='0.4';setTimeout(()=>{gr.style.opacity='';gr.style.transition=prev},220)};
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
          <div style="margin:6px 0 2px;font:10px 'JetBrains Mono',monospace;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;display:flex;justify-content:space-between"><span>Bobber rhythm</span><span style="color:#fbcf3b">tap <b>B</b> on the peak · streak <span id="b-streak">0</span></span></div>
          <div style="position:relative;height:16px;border-radius:6px;background:rgba(3,7,18,0.5);overflow:hidden;margin-bottom:8px">
            <div id="b-peak" style="position:absolute;top:0;bottom:0;left:46%;width:8%;background:rgba(251,207,59,0.18);border-left:1px dashed rgba(251,207,59,0.6);border-right:1px dashed rgba(251,207,59,0.6)"></div>
            <div id="b-bob" style="position:absolute;top:50%;left:0;width:11px;height:11px;margin:-5px 0 0 -5px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,#fbcf3b 70%,#a06600);box-shadow:0 0 7px rgba(251,207,59,0.7)"></div>
          </div>
          <button class="btn bp" id="m-b-release" style="background:linear-gradient(135deg,#10b981,#059669);box-shadow:0 4px 16px rgba(16,185,129,0.4)">RELEASE (tap B for tension nudge)</button>`;
      }
      const heroPill=heroResist>0?' <span style="color:#a7f3d0;font-size:9px">· Lilly resist active</span>':heroFlyShell>0?' <span style="color:#93c5fd;font-size:9px">· Fly recon active</span>':heroReelPeak>0?' <span style="color:#fca5a5;font-size:9px">· Reel rod-feel active</span>':'';
      card.innerHTML=`<div class="m-kicker" style="color:#9333ea">${dp.userData.type.n} · ${phName}${heroPill}</div><div class="m-title">${phase===1?'Crack the shell.':phase===2?'Catch the breach.':'Bring it up.'}</div>${body}<button class="btn bx" id="m-b-flee" style="margin-top:8px">Cut Line (-30 hull)</button>`;
      if(phase===1)$('m-b-ping').onclick=()=>{hits++;sfx('ping');if(hits>=need){phase=2;_bossPhaseFlash();startLure()}render()};
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
      if(pct>=38&&pct<=62){phase=3;tension=0;_bossPhaseFlash();startReel();render();return}
      playerHull=Math.max(0,playerHull-Math.round(25*(1-heroResist)));S.hull=playerHull;_bossHullMin=Math.min(_bossHullMin,playerHull);sfx('hit');flashDamage(0.8);
      if(playerHull<=0){lose();return}
      // Missed → back to phase 1, need one more hit
      phase=1;need=Math.min(8,need+1);render();
    };
    // Phase-3 bobber-bounce: tap B on the peak window for a small tension nudge — gives the player
    // a way to hold the bar in the release sweet-spot longer instead of hoping the climb rate hits 0.85.
    let bobT=0,bobFreq=1.3+Math.random()*0.5,bobPhase=Math.random()*Math.PI*2,bossStreak=0;
    const bobPos=()=>0.5+Math.sin(bobT*bobFreq+bobPhase)*0.45;
    const bobInPeak=()=>{const p=bobPos();return p>=0.46&&p<=0.54};
    const tapBoss=()=>{
      if(phase!==3)return;
      if(bobInPeak()){
        bossStreak++;tension=Math.min(1,tension+0.025);
        const bb=$('b-bob'),be=$('b-streak');if(bb){bb.style.filter='brightness(2)';setTimeout(()=>bb&&(bb.style.filter='none'),100)}if(be)be.textContent=bossStreak;
        sfx('ping');bobFreq=1.0+Math.random()*0.9;bobPhase=Math.random()*Math.PI*2;
      }else{
        bossStreak=0;const be=$('b-streak');if(be)be.textContent=0;sfx('hit');
        bobFreq=0.9+Math.random()*1.1;bobPhase=Math.random()*Math.PI*2;
      }
    };
    const startReel=()=>{
      lureWindow=setInterval(()=>{
        tension=Math.min(1,tension+0.012);
        const bar=$('m-b-bar');if(bar)bar.style.width=(tension*100)+'%';
        bobT+=0.05;const bb=$('b-bob');if(bb)bb.style.left=(bobPos()*100)+'%';
        reelAudio.update(tension);  // R14: line-singing tension feedback in the boss reel too
        if(tension>=1){clearInterval(lureWindow);phase=3;render()}
      },50);
      mini.addTeardown(()=>{clearInterval(lureWindow);reelAudio.stop()});
    };
    const release=()=>{
      clearInterval(lureWindow);
      // Peak band 78-92%.
      // The Reel widens the release peak band — easier to time the hit on phase 3.
      if(tension>=0.78-heroReelPeak&&tension<=0.92+heroReelPeak){win();return}
      playerHull=Math.max(0,playerHull-Math.round(20*(1-heroResist)));S.hull=playerHull;_bossHullMin=Math.min(_bossHullMin,playerHull);sfx('hit');flashDamage(0.6);
      if(playerHull<=0){lose();return}
      tension=0;phase=3;startReel();render();
    };
    const flee=()=>{_bossActive=false;S.hull=Math.max(1,S.hull-30);mini.finish(dp,80,'Cut the line. It’s still down there. Bigger now.','fly')};
    // Final-hit beat: a brief grade fade + splash cue, then resolve. No global time-scale —
    // the world keeps ticking normally so water/AI/fish-jumps don't desync.
    const _bossFinalBeat=fn=>{
      sfx('splash_big');const gr=$('grade');if(gr){const prev=gr.style.transition||'';gr.style.transition='opacity 0.6s ease-out';gr.style.opacity='0.5';setTimeout(()=>{gr.style.opacity='';gr.style.transition=prev},620)}
      setTimeout(fn,600);
    };
    const win=()=>{
      _bossActive=false;
      S.hull=Math.min(100,Math.max(1,playerHull));bait+=120;persist();onUnlock('deep_dock');
      // Clean run = boss never knocked the player below 50% of starting hull.
      if(_bossHullMin>=Math.max(50,_bossStartHull*0.5))onUnlock('boss_clean');
      _bossFinalBeat(()=>mini.finish(dp,1500,'The Depth went still. The water remembers what you did down there.','lilly'));
    };
    const lose=()=>{_bossActive=false;_bossFinalBeat(()=>{mini.finish(dp,0,'It pulled the hull under. Castor Bayou keeps another secret.','reel');S.hull=0})};
    // Spacebar fires the phase-1 ping
    const keyHandler=e=>{
      if(e.code==='Space'&&miniActive&&phase===1){e.preventDefault();const b=$('m-b-ping');if(b)b.click()}
      if(e.code==='KeyB'&&miniActive&&phase===3&&e.type==='keydown'){e.preventDefault();tapBoss()}
    };
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
  },

  // === FORAGE: WORM DIG ===
  // 6x4 grid of dirt clods on a 320x220 canvas. Click a clod → it crumbles, ~50% chance of a worm,
  // ~15% chance of a cricket bonus, rest empty. 22s timer. Clods regrow on a 1.8s cycle.
  openForageWorm(camp){
    miniActive=true;S.on=false;_catchOpen=true;_catchBusy=false;
    const card=$('mini-card'),el=$('mini');if(!card||!el){miniActive=false;S.on=true;return}
    const W=320,H=220,cols=6,rows=4,cell=44,off=18;
    card.innerHTML=`<div class="m-kicker" style="color:#a47a52">Worm Dig · ${camp.userData.camp.n}</div>
      <div class="m-title">Dig the soft clods.</div>
      <div class="m-sub">Click dirt to dig. Worms + the odd cricket. 22 seconds.</div>
      <canvas id="m-fw-cv" width="${W}" height="${H}" style="background:#2a1d0e;cursor:crosshair"></canvas>
      <div class="sb"><div class="sr"><span class="sl">Worms</span><span class="sv g" id="m-fw-w">0</span></div><div class="sr"><span class="sl">Crickets</span><span class="sv y" id="m-fw-c">0</span></div><div class="sr"><span class="sl">Time</span><span class="sv b" id="m-fw-t">22</span></div></div>
      <button class="btn bx" id="m-fw-q">Pack Up</button>`;
    const cv=$('m-fw-cv'),ctx=cv.getContext('2d');
    const clods=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)clods.push({x:off+c*cell,y:off+r*cell,r:Math.random()<0.05?0:1,t:0});
    let worms=0,crickets=0,t=22;const G={alive:true};
    const draw=()=>{
      mini.paintForageBg(ctx,W,H,'#3a2812','#2a1d0e','rgba(120,80,40,0.07)');
      for(const c of clods){if(c.r>0){ctx.fillStyle=c.t>0?'#4a3422':'#7a5a3a';ctx.beginPath();ctx.arc(c.x,c.y,18,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3a2818';for(let i=0;i<3;i++)ctx.fillRect(c.x-8+i*6+Math.sin(c.x+i)*3,c.y-4+i*4,3,2)}else{ctx.fillStyle='#1a0e08';ctx.beginPath();ctx.arc(c.x,c.y,15,0,Math.PI*2);ctx.fill();
        // Dug-out highlight ring so the player can read "this one's done"
        ctx.strokeStyle='rgba(120,80,40,0.5)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(c.x,c.y,16,0,Math.PI*2);ctx.stroke()}}
    };
    cv.onclick=e=>{if(!G.alive)return;const r=cv.getBoundingClientRect();const mx=(e.clientX-r.left)*W/r.width,my=(e.clientY-r.top)*H/r.height;for(const c of clods){if(c.r>0&&Math.hypot(c.x-mx,c.y-my)<20){c.r=0;c.t=0;sfx('dig');const roll=Math.random();if(roll<0.55){worms++;baitInv.worm++;$('m-fw-w').textContent=worms}else if(roll<0.7){crickets++;baitInv.cricket++;$('m-fw-c').textContent=crickets}draw();persist();break}}};
    const tick=setInterval(()=>{if(!G.alive)return;t--;$('m-fw-t').textContent=t;for(const c of clods){if(c.r===0){c.t++;if(c.t>10){c.r=1;c.t=0}}}draw();if(t<=0){G.alive=false;clearInterval(tick);clearInterval(rf);const total=worms+crickets;onUnlock('first_forage');if(total>=8)onUnlock('worm_farmer');mini.finishForage(`${worms} worms${crickets?', '+crickets+' crickets':''}.`,worms*4+crickets*8)}},1000);
    const rf=setInterval(()=>draw(),120);
    $('m-fw-q').onclick=()=>{G.alive=false;clearInterval(tick);clearInterval(rf);mini.finishForage('Packed it in.',worms*4+crickets*8)};
    mini.addTeardown(()=>{G.alive=false;clearInterval(tick);clearInterval(rf);cv.onclick=null});
    draw();el.style.display='flex';
  },

  // === FORAGE: BUG CATCH (crickets) ===
  // Bugs scuttle across the card. Tap to swat. 22s.
  openForageBug(camp){
    miniActive=true;S.on=false;_catchOpen=true;_catchBusy=false;
    const card=$('mini-card'),el=$('mini');if(!card||!el){miniActive=false;S.on=true;return}
    const W=340,H=220;
    card.innerHTML=`<div class="m-kicker" style="color:#8db347">Bug Catch · ${camp.userData.camp.n}</div>
      <div class="m-title">Swat fast.</div>
      <div class="m-sub">Crickets are quick. Don't think — tap.</div>
      <canvas id="m-fb-cv" width="${W}" height="${H}" style="background:#1a2a14;cursor:crosshair"></canvas>
      <div class="sb"><div class="sr"><span class="sl">Crickets</span><span class="sv g" id="m-fb-c">0</span></div><div class="sr"><span class="sl">Time</span><span class="sv b" id="m-fb-t">22</span></div></div>
      <button class="btn bx" id="m-fb-q">Pack Up</button>`;
    const cv=$('m-fb-cv'),ctx=cv.getContext('2d');
    const bugs=[];const G={alive:true};let crickets=0,t=22;
    const spawn=()=>{if(bugs.length>5)return;const fromLeft=Math.random()<0.5;bugs.push({x:fromLeft?-10:W+10,y:20+Math.random()*(H-40),vx:(fromLeft?1:-1)*(1.3+Math.random()*1.7),vy:(Math.random()-0.5)*0.3,life:1})};
    const draw=()=>{
      mini.paintForageBg(ctx,W,H,'#3a5018','#1f2a14','rgba(180,200,80,0.05)');
      // Tufts of grass — random vertical slashes at deterministic positions for an alive backdrop.
      ctx.strokeStyle='rgba(140,170,80,0.25)';ctx.lineWidth=1;
      for(let i=0;i<22;i++){const x=(i*47)%W,y=H-((i*61)%30)-2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+2,y-8-((i*3)%4));ctx.stroke()}
      for(const b of bugs){if(b.life<=0)continue;ctx.fillStyle='#cce06b';ctx.beginPath();ctx.ellipse(b.x,b.y,7,5,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#cce06b';ctx.lineWidth=1;for(let i=-1;i<=1;i+=2){ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x+i*8,b.y-3);ctx.stroke()}}
    };
    cv.onclick=e=>{if(!G.alive)return;const r=cv.getBoundingClientRect();const mx=(e.clientX-r.left)*W/r.width,my=(e.clientY-r.top)*H/r.height;for(const b of bugs){if(b.life>0&&Math.hypot(b.x-mx,b.y-my)<14){b.life=0;crickets++;baitInv.cricket++;$('m-fb-c').textContent=crickets;sfx('swat');persist();break}}};
    const tick=setInterval(()=>{if(!G.alive)return;t--;$('m-fb-t').textContent=t;if(t<=0){G.alive=false;clearInterval(tick);clearInterval(rf);clearInterval(sp);onUnlock('first_forage');mini.finishForage(`${crickets} crickets in the box.`,crickets*6)}},1000);
    const sp=setInterval(spawn,500);
    const rf=setInterval(()=>{if(!G.alive)return;for(let i=bugs.length-1;i>=0;i--){const b=bugs[i];if(b.life<=0&&Math.random()<0.4){bugs.splice(i,1);continue}b.x+=b.vx;b.y+=b.vy;if(b.x<-20||b.x>W+20)b.life=0}draw()},40);
    $('m-fb-q').onclick=()=>{G.alive=false;clearInterval(tick);clearInterval(rf);clearInterval(sp);mini.finishForage('Packed it in.',crickets*6)};
    mini.addTeardown(()=>{G.alive=false;clearInterval(tick);clearInterval(rf);clearInterval(sp);cv.onclick=null});
    draw();el.style.display='flex';
  },

  // === FORAGE: FROG GRAB ===
  // Frogs hop, pause ~700ms, hop again. Tap during the still window.
  openForageFrog(camp){
    miniActive=true;S.on=false;_catchOpen=true;_catchBusy=false;
    const card=$('mini-card'),el=$('mini');if(!card||!el){miniActive=false;S.on=true;return}
    const W=340,H=220;
    card.innerHTML=`<div class="m-kicker" style="color:#5fa75f">Frog Grab · ${camp.userData.camp.n}</div>
      <div class="m-title">Catch them while they're still.</div>
      <div class="m-sub">Frogs pause, then hop. Tap them during the pause.</div>
      <canvas id="m-fg-cv" width="${W}" height="${H}" style="background:#1c2a16;cursor:crosshair"></canvas>
      <div class="sb"><div class="sr"><span class="sl">Frogs</span><span class="sv g" id="m-fg-f">0</span></div><div class="sr"><span class="sl">Time</span><span class="sv b" id="m-fg-t">25</span></div></div>
      <button class="btn bx" id="m-fg-q">Pack Up</button>`;
    const cv=$('m-fg-cv'),ctx=cv.getContext('2d');
    const frogs=[{x:W/2,y:H/2,still:0.7,t:0}];const G={alive:true};let caught=0,t=25;
    const draw=()=>{
      mini.paintForageBg(ctx,W,H,'#2c4a28','#16241a','rgba(110,180,110,0.05)');
      // Lily-pad blobs to read as a swamp surface, deterministic so the marsh looks lived-in.
      ctx.fillStyle='rgba(60,110,60,0.55)';
      for(let i=0;i<6;i++){const x=((i*113)%(W-40))+20,y=((i*191)%(H-40))+20;ctx.beginPath();ctx.ellipse(x,y,18,12,(i*0.5)%6,0,Math.PI*2);ctx.fill()}
      for(const f of frogs){const stillFrac=Math.min(1,f.t/f.still);ctx.fillStyle=stillFrac>=1?'#86c97c':'#5fa75f';ctx.beginPath();ctx.arc(f.x,f.y,12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#111';ctx.beginPath();ctx.arc(f.x-4,f.y-4,2,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(f.x+4,f.y-4,2,0,Math.PI*2);ctx.fill()}
    };
    cv.onclick=e=>{if(!G.alive)return;const r=cv.getBoundingClientRect();const mx=(e.clientX-r.left)*W/r.width,my=(e.clientY-r.top)*H/r.height;for(let i=0;i<frogs.length;i++){const f=frogs[i];if(Math.hypot(f.x-mx,f.y-my)<16&&f.t>=f.still){caught++;baitInv.frog++;$('m-fg-f').textContent=caught;sfx('croak');persist();frogs.splice(i,1);if(frogs.length<2)frogs.push({x:30+Math.random()*(W-60),y:30+Math.random()*(H-60),still:0.5+Math.random()*0.5,t:0});break}}};
    const tick=setInterval(()=>{if(!G.alive)return;t--;$('m-fg-t').textContent=t;if(t<=0){G.alive=false;clearInterval(tick);clearInterval(rf);onUnlock('first_forage');mini.finishForage(`${caught} frogs.`,caught*12)}},1000);
    const rf=setInterval(()=>{if(!G.alive)return;for(const f of frogs){f.t+=0.06;if(f.t>f.still+0.6){f.x=30+Math.random()*(W-60);f.y=30+Math.random()*(H-60);f.t=0;f.still=0.5+Math.random()*0.5}}draw()},60);
    $('m-fg-q').onclick=()=>{G.alive=false;clearInterval(tick);clearInterval(rf);mini.finishForage('Packed it in.',caught*12)};
    mini.addTeardown(()=>{G.alive=false;clearInterval(tick);clearInterval(rf);cv.onclick=null});
    draw();el.style.display='flex';
  },

  // === FORAGE: MINNOW NET ===
  // Drag the net (click + drag) across moving minnows. Anything inside the swept rectangle when
  // released counts. 22s timer; 3-second cooldown between sweeps.
  openForageMinnow(camp){
    miniActive=true;S.on=false;_catchOpen=true;_catchBusy=false;
    const card=$('mini-card'),el=$('mini');if(!card||!el){miniActive=false;S.on=true;return}
    const W=340,H=220;
    card.innerHTML=`<div class="m-kicker" style="color:#7ec8e3">Minnow Net · ${camp.userData.camp.n}</div>
      <div class="m-title">Sweep them up.</div>
      <div class="m-sub">Click + drag to draw a net. Release to scoop minnows inside.</div>
      <canvas id="m-fm-cv" width="${W}" height="${H}" style="background:#10303a;cursor:crosshair"></canvas>
      <div class="sb"><div class="sr"><span class="sl">Minnows</span><span class="sv g" id="m-fm-m">0</span></div><div class="sr"><span class="sl">Crayfish</span><span class="sv y" id="m-fm-y">0</span></div><div class="sr"><span class="sl">Time</span><span class="sv b" id="m-fm-t">22</span></div></div>
      <button class="btn bx" id="m-fm-q">Pack Up</button>`;
    const cv=$('m-fm-cv'),ctx=cv.getContext('2d');
    const m=[];const G={alive:true,drag:null};let caught=0,cray=0,t=22;
    for(let i=0;i<10;i++)m.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-0.5)*2.5,vy:(Math.random()-0.5)*2.5,r:Math.random()<0.08?'cray':'min'});
    const draw=()=>{
      mini.paintForageBg(ctx,W,H,'#0e3848','#06181f','rgba(126,200,227,0.06)');
      // Faint horizontal current lines so the water reads as moving even when minnows pause.
      ctx.strokeStyle='rgba(126,200,227,0.08)';ctx.lineWidth=1;
      for(let i=0;i<8;i++){const y=(i*H/8+((Date.now()*0.02+i*40)%20));ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
      for(const f of m){ctx.fillStyle=f.r==='cray'?'#cf4040':'#7ec8e3';ctx.beginPath();ctx.ellipse(f.x,f.y,f.r==='cray'?6:4,f.r==='cray'?4:2.5,Math.atan2(f.vy,f.vx),0,Math.PI*2);ctx.fill()}
      if(G.drag){ctx.strokeStyle='#fbcf3b';ctx.lineWidth=2;ctx.strokeRect(G.drag.x0,G.drag.y0,G.drag.x1-G.drag.x0,G.drag.y1-G.drag.y0)}
    };
    const xy=e=>{const r=cv.getBoundingClientRect();return [(e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height]};
    cv.onmousedown=e=>{if(!G.alive)return;const[x,y]=xy(e);G.drag={x0:x,y0:y,x1:x,y1:y}};
    cv.onmousemove=e=>{if(!G.drag)return;const[x,y]=xy(e);G.drag.x1=x;G.drag.y1=y};
    cv.onmouseup=()=>{if(!G.drag)return;const d=G.drag;const minX=Math.min(d.x0,d.x1),maxX=Math.max(d.x0,d.x1),minY=Math.min(d.y0,d.y1),maxY=Math.max(d.y0,d.y1);for(let i=m.length-1;i>=0;i--){const f=m[i];if(f.x>=minX&&f.x<=maxX&&f.y>=minY&&f.y<=maxY){if(f.r==='cray'){cray++;baitInv.crayfish++;$('m-fm-y').textContent=cray}else{caught++;baitInv.minnow++;$('m-fm-m').textContent=caught}m.splice(i,1);m.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-0.5)*2.5,vy:(Math.random()-0.5)*2.5,r:Math.random()<0.08?'cray':'min'})}}sfx('net');persist();G.drag=null};
    const tick=setInterval(()=>{if(!G.alive)return;t--;$('m-fm-t').textContent=t;if(t<=0){G.alive=false;clearInterval(tick);clearInterval(rf);onUnlock('first_forage');mini.finishForage(`${caught} minnows${cray?', '+cray+' crayfish':''}.`,caught*5+cray*20)}},1000);
    const rf=setInterval(()=>{if(!G.alive)return;for(const f of m){f.x+=f.vx;f.y+=f.vy;if(f.x<0||f.x>W)f.vx=-f.vx;if(f.y<0||f.y>H)f.vy=-f.vy}draw()},40);
    $('m-fm-q').onclick=()=>{G.alive=false;clearInterval(tick);clearInterval(rf);mini.finishForage('Packed it in.',caught*5+cray*20)};
    mini.addTeardown(()=>{G.alive=false;clearInterval(tick);clearInterval(rf);cv.onmousedown=null;cv.onmousemove=null;cv.onmouseup=null});
    draw();el.style.display='flex';
  },

  // === FORAGE: CRAYFISH (flip rocks) ===
  // Stony shore at East Rocks. Grid of rocks; click to flip — most are empty, ~30% hide a crayfish,
  // small chance of a "bonus rock" (extra). Crayfish that escape re-burrow after 1.2s so timing
  // matters. Yields baitInv.crayfish (+sometimes minnow as a bycatch).
  openForageCrayfish(camp){
    miniActive=true;S.on=false;_catchOpen=true;_catchBusy=false;
    const card=$('mini-card'),el=$('mini');if(!card||!el){miniActive=false;S.on=true;return}
    const W=340,H=220,cols=7,rows=5,cell=42,off=24;
    card.innerHTML=`<div class="m-kicker" style="color:#cf4040">Crayfish Hole · ${camp.userData.camp.n}</div>
      <div class="m-title">Flip the rocks.</div>
      <div class="m-sub">Most are empty. Some hide crayfish — tap them <b>before they re-burrow</b>.</div>
      <canvas id="m-fc-cv" width="${W}" height="${H}" style="background:#1f1410;cursor:crosshair"></canvas>
      <div class="sb"><div class="sr"><span class="sl">Crayfish</span><span class="sv y" id="m-fc-c">0</span></div><div class="sr"><span class="sl">Minnow</span><span class="sv g" id="m-fc-m">0</span></div><div class="sr"><span class="sl">Time</span><span class="sv b" id="m-fc-t">22</span></div></div>
      <button class="btn bx" id="m-fc-q">Pack Up</button>`;
    const cv=$('m-fc-cv'),ctx=cv.getContext('2d');
    // Each rock can be flipped(false → true), then 'reveal'={none|cray|min} for ~1.2s, then re-buries.
    const rocks=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const roll=Math.random();rocks.push({x:off+c*cell,y:off+r*cell,kind:roll<0.30?'cray':roll<0.42?'min':'none',flipped:false,revealUntil:0})}
    let cray=0,caught=0,t=22;const G={alive:true};
    const draw=()=>{
      mini.paintForageBg(ctx,W,H,'#3a1e10','#1c0f08','rgba(200,120,80,0.06)');
      // Faint shore-water suggestion at the bottom.
      ctx.fillStyle='rgba(56,120,140,0.18)';ctx.fillRect(0,H-26,W,26);
      const now=Date.now();
      for(const k of rocks){
        if(!k.flipped){
          // Whole rock — grey/brown polygon.
          ctx.fillStyle='#5a4030';ctx.beginPath();ctx.ellipse(k.x,k.y,16,12,0,0,Math.PI*2);ctx.fill();
          ctx.strokeStyle='rgba(0,0,0,0.4)';ctx.lineWidth=1;ctx.stroke();
        }else if(k.revealUntil>now){
          // Flipped + revealing — show the dark pocket + the crayfish/minnow underneath.
          ctx.fillStyle='#1a0e08';ctx.beginPath();ctx.ellipse(k.x,k.y,15,10,0,0,Math.PI*2);ctx.fill();
          if(k.kind==='cray'){ctx.fillStyle='#cf4040';ctx.beginPath();ctx.ellipse(k.x,k.y,9,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fbcf3b';ctx.beginPath();ctx.arc(k.x-3,k.y-1,1.5,0,Math.PI*2);ctx.arc(k.x+3,k.y-1,1.5,0,Math.PI*2);ctx.fill()}
          else if(k.kind==='min'){ctx.fillStyle='#7ec8e3';ctx.beginPath();ctx.ellipse(k.x,k.y,7,4,0,0,Math.PI*2);ctx.fill()}
        }else{
          // Empty pocket — flipped but nothing left.
          ctx.fillStyle='#1a0e08';ctx.beginPath();ctx.ellipse(k.x,k.y,15,10,0,0,Math.PI*2);ctx.fill();
        }
      }
    };
    cv.onclick=e=>{
      if(!G.alive)return;const r=cv.getBoundingClientRect();const mx=(e.clientX-r.left)*W/r.width,my=(e.clientY-r.top)*H/r.height;
      for(const k of rocks){
        if(Math.hypot(k.x-mx,k.y-my)<16){
          if(!k.flipped){
            // First click: flip the rock, reveal whatever's under it for 1.2s.
            k.flipped=true;k.revealUntil=Date.now()+1200;sfx('dig');
            if(k.kind==='cray'||k.kind==='min')sfx('click');  // little chitter
          }else if(k.revealUntil>Date.now()&&k.kind!=='none'){
            // Catch it.
            if(k.kind==='cray'){cray++;baitInv.crayfish=(baitInv.crayfish||0)+1;$('m-fc-c').textContent=cray;sfx('croak')}
            else{caught++;baitInv.minnow=(baitInv.minnow||0)+1;$('m-fc-m').textContent=caught;sfx('net')}
            k.kind='none';k.revealUntil=0;persist();
          }
          draw();return;
        }
      }
    };
    const tick=setInterval(()=>{if(!G.alive)return;t--;$('m-fc-t').textContent=t;
      // Slowly re-bury old flipped rocks so a patient player keeps having things to flip.
      const now=Date.now();for(const k of rocks){if(k.flipped&&k.revealUntil<now-3000&&Math.random()<0.04){k.flipped=false;k.revealUntil=0;const roll=Math.random();k.kind=roll<0.30?'cray':roll<0.42?'min':'none'}}
      if(t<=0){G.alive=false;clearInterval(tick);clearInterval(rf);onUnlock('first_forage');mini.finishForage(`${cray} crayfish${caught?', '+caught+' minnow':''}.`,cray*22+caught*5)}
    },1000);
    const rf=setInterval(()=>draw(),80);
    $('m-fc-q').onclick=()=>{G.alive=false;clearInterval(tick);clearInterval(rf);mini.finishForage('Packed it in.',cray*22+caught*5)};
    mini.addTeardown(()=>{G.alive=false;clearInterval(tick);clearInterval(rf);cv.onclick=null});
    draw();el.style.display='flex';
  },
  // Forage finish: pantry-checked achievements, score bonus, clear overlay, resume run.
  finishForage(msg,bonus){
    this._teardowns.splice(0).forEach(fn=>{try{fn()}catch(e){}});
    if(_fightCleanup){_fightCleanup();_fightCleanup=null}
    if(bonus)S.score+=bonus;
    radio(msg,'lilly');sfx('win');
    miniActive=false;S.on=true;_catchOpen=false;
    const el=$('mini');if(el){el.style.display='none';const c=$('mini-card');if(c)c.innerHTML=''}
    // Foraged-only (5 types) — must mirror the ACH.pantry_stocked.p() definition so the progress
    // bar's 5/5 readout actually corresponds to the unlock condition.
    const stocked=['worm','cricket','frog','minnow','crayfish'].every(t=>(baitInv[t]||0)>=5);
    if(stocked)onUnlock('pantry_stocked');
    if((baitInv.worm||0)>=50)onUnlock('worm_farmer');
  }
};

function initEngine(){
  scene=new THREE.Scene();scene.background=new THREE.Color(0x071520);scene.fog=new THREE.Fog(0x0b1e30,80,400);
  // Sky dome — large inverted sphere with vertex colors gradient from horizon to zenith. Reads as
  // a real sky band instead of a flat background color. Color values update each frame in the
  // day/night cycle.
  {
    const skyGeo=new THREE.SphereGeometry(500,32,16);const skyMat=new THREE.ShaderMaterial({
      side:THREE.BackSide,
      uniforms:{topColor:{value:new THREE.Color(0x081826)},bottomColor:{value:new THREE.Color(0x0b1e30)},offset:{value:33},exponent:{value:0.6}},
      vertexShader:'varying vec3 vWorldPos;void main(){vec4 wp=modelMatrix*vec4(position,1.0);vWorldPos=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}',
      fragmentShader:'uniform vec3 topColor;uniform vec3 bottomColor;uniform float offset;uniform float exponent;varying vec3 vWorldPos;void main(){float h=normalize(vWorldPos+vec3(0.0,offset,0.0)).y;gl_FragColor=vec4(mix(bottomColor,topColor,max(pow(max(h,0.0),exponent),0.0)),1.0);}'
    });
    const sky=new THREE.Mesh(skyGeo,skyMat);scene.add(sky);scene._sky=sky;
  }
  // Soft radial sprite texture — a glowing disc with a feathered edge. Reused for the moon, its
  // halo, and the star points so nothing renders as a hard square.
  const _softTex=(()=>{
    const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');
    const g=x.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(0.35,'rgba(255,255,255,0.85)');
    g.addColorStop(0.7,'rgba(255,255,255,0.18)');g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g;x.fillRect(0,0,64,64);
    const tx=new THREE.CanvasTexture(c);return tx;
  })();
  // Night sky — starfield (Points on a high dome) + a moon sprite. Hidden in daytime; faded in by
  // the _isNight flag in loop(). Stars sit just inside the sky dome so fog doesn't eat them.
  {
    const N=520,pos=new Float32Array(N*3);
    for(let i=0;i<N;i++){
      // Upper hemisphere only — random points on a 460-radius dome.
      const u=Math.random(),v=Math.random()*0.5;  // v<0.5 keeps them above the horizon
      const th=u*Math.PI*2,ph=Math.acos(1-v*2*0.9);
      pos[i*3]=Math.sin(ph)*Math.cos(th)*460;pos[i*3+1]=Math.abs(Math.cos(ph))*460+20;pos[i*3+2]=Math.sin(ph)*Math.sin(th)*460;
    }
    const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const sm=new THREE.PointsMaterial({map:_softTex,color:0xcfe0ff,size:4,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
    const stars=new THREE.Points(sg,sm);stars.visible=false;scene.add(stars);scene._stars=stars;
    // Moon — soft textured disc + a wider additive halo glow.
    const moon=new THREE.Sprite(new THREE.SpriteMaterial({map:_softTex,color:0xeaf0ff,transparent:true,opacity:0,depthWrite:false}));
    moon.scale.set(34,34,1);moon.visible=false;scene.add(moon);scene._moon=moon;
    const moonHalo=new THREE.Sprite(new THREE.SpriteMaterial({map:_softTex,color:0x9fb8e8,blending:THREE.AdditiveBlending,transparent:true,opacity:0,depthWrite:false}));
    moonHalo.scale.set(110,110,1);moonHalo.visible=false;scene.add(moonHalo);scene._moonHalo=moonHalo;
  }
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
  // Outer additive glow sprite — fakes a bloom flare around the sun without a postprocessing pass.
  const sunGlow=new THREE.Sprite(new THREE.SpriteMaterial({color:0xffd9a0,blending:THREE.AdditiveBlending,transparent:true,opacity:0.6,depthWrite:false}));sunGlow.scale.set(80,80,80);sunGlow.position.copy(sunDisc.position);scene.add(sunGlow);
  scene._sunDisc=sunDisc;scene._sunHalo=sunHalo;scene._sunGlow=sunGlow;
  // Water sun-glint — an additive sprite on the water plane along the sun's bearing. Cheap.
  // Updated in loop() with the sun arc; hidden at night via the _isNight flag.
  const glintMat=new THREE.SpriteMaterial({map:_softTex,color:0xfff2c0,blending:THREE.AdditiveBlending,transparent:true,opacity:0.55,depthWrite:false});
  const sunGlint=new THREE.Sprite(glintMat);sunGlint.scale.set(60,18,1);sunGlint.position.set(0,0.12,-60);scene.add(sunGlint);scene._sunGlint=sunGlint;
  // God-ray light shafts — three soft additive cones radiating down from the sun position. Reuse
  // _softTex so the cones have a feathered taper. Faded by sun height + Clear weather only.
  {
    const rays=new THREE.Group();
    for(let i=0;i<3;i++){
      const m=new THREE.SpriteMaterial({map:_softTex,color:0xfff2c0,blending:THREE.AdditiveBlending,transparent:true,opacity:0,depthWrite:false});
      const s=new THREE.Sprite(m);s.scale.set(50+i*22,180+i*40,1);rays.add(s);
    }
    scene.add(rays);scene._godRays=rays;
  }

  // Water — deeper blue-green, more reflective
  // Free-roam world: 1200×1200 water plane (was 800×800) so there's room to actually drive.
  waterGeo=new THREE.PlaneGeometry(1200,1200,96,96);
  // Water reflection env — a tiny vertical sky gradient through PMREM so the metalness water
  // mirrors a believable sky instead of reflecting black. Targeted to the water only (not
  // scene.environment) so it doesn't over-brighten every other material. Defensive: no-ops if the
  // GL context can't build it (e.g. some headless backends).
  let _waterEnv=null;
  try{
    const ec=document.createElement('canvas');ec.width=16;ec.height=64;const ex=ec.getContext('2d');
    const eg=ex.createLinearGradient(0,0,0,64);
    eg.addColorStop(0,'#3b6280');eg.addColorStop(0.45,'#1a3a55');eg.addColorStop(1,'#06121e');
    ex.fillStyle=eg;ex.fillRect(0,0,16,64);
    const et=new THREE.CanvasTexture(ec);et.mapping=THREE.EquirectangularReflectionMapping;
    const pmrem=new THREE.PMREMGenerator(ren);_waterEnv=pmrem.fromEquirectangular(et).texture;
    et.dispose();pmrem.dispose();
  }catch(e){_waterEnv=null}
  const wM=new THREE.MeshStandardMaterial({color:0x0b3038,roughness:0.15,metalness:0.75,transparent:true,opacity:0.94,envMap:_waterEnv,envMapIntensity:1.2});
  waterOZ=new Float32Array(waterGeo.attributes.position.count);
  for(let i=0;i<waterGeo.attributes.position.count;i++)waterOZ[i]=waterGeo.attributes.position.getZ(i);
  const waterMesh=new THREE.Mesh(waterGeo,wM);waterMesh.rotation.x=-Math.PI/2;waterMesh.receiveShadow=true;scene.add(waterMesh);

  mkBoat('pontoon');
  mkDock();mkWorld();mkObstacles();mkAI();mkWaypoints();mkCivs();mkEvidence();mkCryptid();mkDuct();mkMist();mkPOIs();mkShops();mkCamps();mkMarinaPreview();
  // Drop points are spawned by resetDropPoints() inside startGame() so each new run gets a fresh
  // set instead of inheriting whatever the previous run left mid-respawn.

  document.addEventListener('keydown',e=>{
    keys[e.code]=true;
    if(e.code==='Space'&&S.on&&!miniActive){e.preventDefault();fireSonar()}
    if(e.code==='KeyF'&&S.on&&GAME_MODE==='game'){e.preventDefault();
      // F engages Duct if he's in range + you're stopped; otherwise it casts a normal line.
      if(DUCT.active&&!DUCT.engaged&&bMesh.position.distanceTo(DUCT.mesh.position)<14&&Math.abs(spd)<0.3)openDuctChase();
      else castLine();
    }
    if(e.code==='KeyE'&&S.on&&GAME_MODE==='game'&&!miniActive&&!_peekOpen){e.preventDefault();
      if(_nearShop&&Math.abs(spd)<0.25)dockShop(_nearShop.userData.shop);
      else boatHorn();
    }
    if(e.code==='KeyG'&&S.on&&GAME_MODE==='game'&&_nearCamp&&Math.abs(spd)<0.25&&!miniActive){e.preventDefault();dockCamp(_nearCamp.userData.camp,_nearCamp)}
    if(e.code==='KeyP'&&GAME_MODE==='game'){e.preventDefault();togglePhoto()}
    if(e.code==='KeyM'&&GAME_MODE==='game'&&S.on&&!miniActive&&!_peekOpen){e.preventDefault();_mmZoom=_mmZoom>1.5?1.0:2.2;sfx('click')}
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
  const isMob=_isMob;
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

// === BAIT SHOPS ===
// Dockable shop POIs scattered around the lake. Each carries a curated slice of the gear ladder
// plus consumables. Drive within range + stop → "DOCK TO SHOP" prompt → opens that shop's UI.
const SHOPS=[
  {id:'garbone', n:'Garbone Bait & Cold Beer', x:-150, z:60,  col:0xfbcf3b,
   blurb:'Old men, bad advice, surprisingly good line.', sells:{rod:[1],reel:[1],line:[1,2],box:[1]}, consumables:['hull','sonar']},
  {id:'marina',  n:'Castor Marina Pro Shop',    x:10,   z:-150,col:0x60d0ff,
   blurb:'Tournament gear. Pricey, but it holds.',       sells:{rod:[1,2],reel:[1,2],line:[2],box:[1,2]}, consumables:['hull','scout','line']},
  {id:'spillway',n:'Spillway Salvage',          x:170,  z:-30, col:0xa78bfa,
   blurb:'Salvaged from boats that didn\'t come back.',  sells:{reel:[2,3],line:[3],box:[2,3]}, consumables:['line','sonar','scout']},
  {id:'deep',    n:'The Deep Dock Outfitter',   x:-60,  z:170, col:0xef4444,
   blurb:'Depth-rated gear. They know what\'s down there.', sells:{rod:[2,3],reel:[3],line:[3],box:[3]}, consumables:['hull','scout']},
  {id:'works',   n:'Castor Boatworks',           x:130,  z:130, col:0xf97316,
   blurb:'Engines, plating, lights, electronics. Walk it out new.',
   boatworks:true, consumables:['hull']}
];
let shopMeshes=[];
function mkShopStructure(shop){
  const g=new THREE.Group();
  // Dock platform
  for(let i=0;i<5;i++){const plank=new THREE.Mesh(new THREE.BoxGeometry(6,0.14,1.2),new THREE.MeshStandardMaterial({color:i%2?0x7a5c14:0x8B6914,roughness:0.85}));plank.position.set(0,0.3,-3+i*1.3);plank.castShadow=true;g.add(plank)}
  // Shack
  const wall=new THREE.Mesh(new THREE.BoxGeometry(4,2.4,3.2),new THREE.MeshStandardMaterial({color:0x4a3420,roughness:0.9}));wall.position.set(0,1.5,2.2);wall.castShadow=true;g.add(wall);
  // Roof — angled box
  const roof=new THREE.Mesh(new THREE.BoxGeometry(4.6,0.3,3.8),new THREE.MeshStandardMaterial({color:0x2a1d10,roughness:0.9}));roof.position.set(0,2.85,2.2);roof.rotation.x=0.12;g.add(roof);
  // Neon sign — color-coded, emissive, with a glow sprite
  const sign=new THREE.Mesh(new THREE.BoxGeometry(3.4,0.7,0.1),new THREE.MeshStandardMaterial({color:shop.col,emissive:shop.col,emissiveIntensity:0.8}));sign.position.set(0,2.1,0.6);g.add(sign);
  const signGlow=new THREE.Sprite(new THREE.SpriteMaterial({color:shop.col,blending:THREE.AdditiveBlending,transparent:true,opacity:0.5,depthWrite:false}));signGlow.scale.set(8,8,8);signGlow.position.set(0,2.1,0.6);g.add(signGlow);g.userData.signGlow=signGlow;
  // Overhead name label — canvas-painted sprite that hovers above the shop. Hidden by default;
  // tickShops shows it when the player gets close enough OR at night so the lake reads as named.
  {
    const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');
    x.font='bold 56px DM Sans, sans-serif';x.textAlign='center';x.textBaseline='middle';
    x.shadowColor='rgba(0,0,0,0.9)';x.shadowBlur=12;x.shadowOffsetY=2;
    x.fillStyle='#'+shop.col.toString(16).padStart(6,'0');x.fillText(shop.n,256,64);
    const tx=new THREE.CanvasTexture(c);
    const lbl=new THREE.Sprite(new THREE.SpriteMaterial({map:tx,transparent:true,opacity:0,depthWrite:false,depthTest:false}));
    lbl.scale.set(12,3,1);lbl.position.set(0,4.6,0.6);g.add(lbl);g.userData.nameLabel=lbl;
  }
  const lt=new THREE.PointLight(shop.col,1.0,30);lt.position.set(0,3,0);g.add(lt);
  // Beacon ring on the water so it's findable from a distance
  const ring=new THREE.Mesh(new THREE.RingGeometry(6,7,32),new THREE.MeshBasicMaterial({color:shop.col,transparent:true,opacity:0.2,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=0.08;g.add(ring);g.userData.ring=ring;
  g.position.set(shop.x,0,shop.z);g.userData.shop=shop;scene.add(g);
  return g;
}
function mkShops(){if(GAME_MODE!=='game')return;shopMeshes=SHOPS.map(mkShopStructure)}
// Proximity → dock prompt. Opening requires the player to be slow + close.
let _nearShop=null;
function tickShops(){
  if(!S.on||GAME_MODE!=='game'||miniActive){const p=$('shop-prompt');if(p)p.style.display='none';return}
  let near=null;
  for(const m of shopMeshes){
    if(m.userData.ring)m.userData.ring.material.opacity=0.15+Math.sin(Date.now()*0.003+m.position.x)*0.1;
    // Night-bloom on the shop neon: bigger + brighter sprite, brighter base sign.
    if(m.userData.signGlow){const sg=m.userData.signGlow;const sc=_isNight?11:8;sg.scale.set(sc,sc,sc);sg.material.opacity=_isNight?0.78:0.5}
    const d=bMesh.position.distanceTo(m.position);
    // Overhead name label: full opacity within 40u, half at 80u, hidden beyond — always visible at
    // night within 100u so the lake reads as named after sunset.
    if(m.userData.nameLabel){const lb=m.userData.nameLabel;let op=d<40?0.95:d<80?(80-d)/40*0.95:0;if(_isNight&&d<100)op=Math.max(op,(100-d)/100*0.85);lb.material.opacity=op}
    if(d<9)near=m;
  }
  _nearShop=near;
  const p=$('shop-prompt');if(!p)return;
  if(near&&Math.abs(spd)<0.25){p.style.display='block';p.innerHTML=`<b style="color:#${near.userData.shop.col.toString(16).padStart(6,'0')}">${near.userData.shop.n}</b> — press <b>E</b> to dock & shop`}
  else if(near){p.style.display='block';p.innerHTML='Slow to a stop to dock at the shop'}
  else p.style.display='none';
}

// === SHORE FORAGING CAMPS ===
// Visible little driftwood + lantern + bait-sign shacks at lake-edge spots away from bait shops.
// Beach the boat within range + slow → "FORAGE HERE" prompt → press G to open a forage overlay.
// Each camp lists which mini-games it offers (variety per location, replay value).
const CAMPS=[
  {id:'south_bank', n:'South Bank Worm Beds', x:75,  z:155, col:0xa47a52, games:['worm','cricket']},
  {id:'west_marsh', n:'West Marsh Frog Pond', x:-180,z:-25, col:0x5fa75f, games:['frog','cricket']},
  {id:'north_creek',n:'North Creek Minnow Run',x:-25,z:-180,col:0x7ec8e3, games:['minnow','worm']},
  {id:'east_rocks', n:'East Rocks Crayfish Hole',x:185,z:80, col:0xcf4040, games:['crayfish','minnow']}
];
let campMeshes=[];
function mkCampStructure(c){
  const g=new THREE.Group();
  // Driftwood pile + little plank deck so it reads as a beached camp.
  for(let i=0;i<3;i++){const log=new THREE.Mesh(new THREE.CylinderGeometry(0.18+i*0.06,0.16,2.5,8),new THREE.MeshStandardMaterial({color:0x5a4210,roughness:0.95}));log.rotation.z=Math.PI/2;log.rotation.y=i*0.4;log.position.set(0,0.35,-0.4+i*0.4);g.add(log)}
  const plank=new THREE.Mesh(new THREE.BoxGeometry(2.5,0.12,1.6),new THREE.MeshStandardMaterial({color:0x6a4f1a,roughness:0.9}));plank.position.set(0,0.4,1.2);g.add(plank);
  // Sign painted in the camp's bait color.
  const sign=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.6,0.06),new THREE.MeshStandardMaterial({color:c.col,emissive:c.col,emissiveIntensity:0.55}));sign.position.set(0,1.5,1.4);g.add(sign);
  const post=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,2,6),new THREE.MeshStandardMaterial({color:0x5a4210}));post.position.set(0,1,1.4);g.add(post);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({color:c.col,blending:THREE.AdditiveBlending,transparent:true,opacity:0.45,depthWrite:false}));glow.scale.set(5,5,5);glow.position.set(0,1.5,1.4);g.add(glow);
  const lt=new THREE.PointLight(c.col,0.7,18);lt.position.set(0,2,0.5);g.add(lt);
  const ring=new THREE.Mesh(new THREE.RingGeometry(4,5,32),new THREE.MeshBasicMaterial({color:c.col,transparent:true,opacity:0.18,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=0.08;g.add(ring);g.userData.ring=ring;
  g.position.set(c.x,0,c.z);g.userData.camp=c;scene.add(g);
  return g;
}
function mkCamps(){if(GAME_MODE!=='game')return;campMeshes=CAMPS.map(mkCampStructure)}
let _nearCamp=null;
function tickCamps(){
  if(!S.on||GAME_MODE!=='game'||miniActive){const p=$('forage-prompt');if(p)p.style.display='none';return}
  let near=null;
  for(const m of campMeshes){if(m.userData.ring)m.userData.ring.material.opacity=0.12+Math.sin(Date.now()*0.003+m.position.x)*0.09;const d=bMesh.position.distanceTo(m.position);if(d<9)near=m}
  _nearCamp=near;
  const p=$('forage-prompt');if(!p)return;
  if(near&&Math.abs(spd)<0.25){p.style.display='block';p.innerHTML=`<b style="color:#${near.userData.camp.col.toString(16).padStart(6,'0')}">${near.userData.camp.n}</b> — press <b>G</b> to forage`}
  else if(near){p.style.display='block';p.innerHTML='Slow to a stop to forage here'}
  else p.style.display='none';
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
  // Additive glow halo around the pin tip so it reads from across the lake.
  const pinGlow=new THREE.Sprite(new THREE.SpriteMaterial({color:0xff3333,blending:THREE.AdditiveBlending,transparent:true,opacity:0.7,depthWrite:false}));pinGlow.scale.set(7,7,7);pinGlow.position.y=10;pinG.add(pinGlow);
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
  // Shared stump geometry+material across all 70 stumps — was per-stump new() per critics' GPU
  // recommendation. Variance now via mesh.scale.set() + rotation rather than per-geometry params.
  // (Skipped full InstancedMesh — r128's instanceColor needs shader-chunk patch + collision code
  //  iterates stumps[] for hits/sonar. Shared geo/mat hits ~90% of the win at no risk.)
  const stumpGeo=new THREE.CylinderGeometry(0.5,0.7,1.5,6);
  const stumpMat=new THREE.MeshStandardMaterial({color:0x4a2e10,roughness:0.95});
  scene._sharedStumpGeo=stumpGeo;  // exposed for the smoke assertion
  // Stumps — sparse near start, dense in hazard zone, varied appearance.
  for(let i=0;i<70;i++){
    const sx=(Math.random()-0.5)*220;let sz=-Math.random()*160-10;
    if(Math.abs(sz-dockPos.z)<15||Math.abs(sz)<12)continue;
    if(sz>-40&&Math.random()>0.25)continue;
    const s=new THREE.Mesh(stumpGeo,stumpMat);
    const rx=0.6+Math.random()*1.0,ry=0.6+Math.random()*1.4,rz=0.6+Math.random()*1.0;
    s.scale.set(rx,ry,rz);
    s.position.set(sx,-0.3,sz);s.rotation.x=(Math.random()-0.5)*0.3;s.rotation.z=(Math.random()-0.5)*0.3;
    s.castShadow=true;scene.add(s);stumps.push(s);
  }
  // Floating debris — same shared-asset pattern.
  const dbGeo=new THREE.BoxGeometry(1,0.2,0.7);
  const dbMat=new THREE.MeshStandardMaterial({color:0x2a1a0a,roughness:0.9});
  for(let i=0;i<12;i++){
    const dx=(Math.random()-0.5)*180,dz=-20-Math.random()*100;
    const db=new THREE.Mesh(dbGeo,dbMat);
    db.scale.set(0.8+Math.random()*0.6,1,0.85+Math.random()*1.15);
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
  // Faux-bloom: additive billboard sprite around the beacon tip. Cheap glow without post-processing.
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({color:type.col,blending:THREE.AdditiveBlending,transparent:true,opacity:0.55,depthWrite:false}));
  glow.scale.set(6,6,6);glow.position.y=10;g.add(glow);
  g.userData={type,ring,active:true,glow};
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
// Gator King — auto-spawns at East Rocks Crayfish Hole once the player has logged all 3 trigger
// gators (Spotted gar, Alligator gar, Bull gator). Like the Deep Dock boss, at most once per run.
function maybeSpawnGatorKing(){
  if(S.gatorKingSpawned||S.gatorKingDown||GAME_MODE!=='game')return;
  if(!GATOR_NAMES.every(n=>fishCatalog.has(n)))return;
  S.gatorKingSpawned=true;
  const dp=mkDropPoint(DP_GATOR_KING);
  // Anchor at the East Rocks Crayfish Hole camp coordinates (185, 80).
  dp.position.set(185,0,80);dp.userData.isGatorKing=true;scene.add(dp);dropPoints.push(dp);
  radio('Something big just slid into East Rocks. Crayfish Hole won\'t be quiet today.','lilly');
  sfx('legendary');
}
function tickDropPoints(t){
  maybeSpawnBoss();maybeSpawnGatorKing();
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
  disposeTree(dp);scene.remove(dp);const idx=dropPoints.indexOf(dp);if(idx>=0)dropPoints.splice(idx,1);
  _dpRespawnT=setTimeout(()=>{_dpRespawnT=null;if(S.on&&GAME_MODE==='game'&&dropPoints.length<3)spawnDropPoint()},2000);
}
// Hard reset for the drop-point system — called by startGame() so a new run doesn't inherit
// markers from the previous run.
function resetDropPoints(){
  if(_dpRespawnT){clearTimeout(_dpRespawnT);_dpRespawnT=null}
  dropPoints.slice().forEach(dp=>{disposeTree(dp);scene.remove(dp)});dropPoints.length=0;
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
  const ctx=c.getContext('2d'),W=c.width,H=c.height,scl=0.42*_mmZoom;  // scale: world u -> px (× zoom toggle)
  // When zoomed in, the dial follows the boat (offset projection); when at 1× it stays centered.
  const camX=_mmZoom>1.5?bMesh.position.x:0,camZ=_mmZoom>1.5?bMesh.position.z:0;
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
  const proj=(wx,wz)=>{let px=(wx-camX)*scl,pz=(wz-camZ)*scl;const d=Math.hypot(px,pz);if(d>R){px=px/d*R;pz=pz/d*R}return[W/2+px,H/2+pz]};
  // POIs first (drawn under everything else)
  POIS.forEach(p=>{const[px,pz]=proj(p.x,p.z);ctx.fillStyle=p.c;ctx.globalAlpha=0.55;ctx.fillRect(px-1.5,pz-1.5,3,3);ctx.globalAlpha=1});
  // Bait shops — small diamond markers in their sign color so the player can navigate to gear.
  shopMeshes.forEach(m=>{const[sx,sz]=proj(m.position.x,m.position.z);ctx.save();ctx.translate(sx,sz);ctx.rotate(Math.PI/4);ctx.fillStyle='#'+m.userData.shop.col.toString(16).padStart(6,'0');ctx.fillRect(-2.2,-2.2,4.4,4.4);ctx.restore()});
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
  // R19 — Civilians are ALWAYS visible on the minimap as small orange beacons (was previously
  // gated on sonar reveal, which made the rescue loop opaque — players couldn't find anyone
  // without spending a ping). They pulse gently and ride at 60% alpha; sonar/scout flare bumps
  // them to 100% + a faint outer ring so the recon tool still feels valuable.
  const flareLive=(buffs.scoutPing||0)>Date.now()*0.001;
  const sonarLive=(S.pingReveal&&Date.now()*0.001<S.pingReveal);
  const reveal=flareLive||sonarLive;
  const pulse=0.7+Math.sin(now*4)*0.3;
  civs.forEach(c=>{if(c.userData.saved)return;
    const[cx,cz]=proj(c.position.x,c.position.z);
    ctx.fillStyle='#ff8c42';ctx.globalAlpha=reveal?1:0.6*pulse;
    ctx.beginPath();ctx.arc(cx,cz,reveal?2.6:2,0,Math.PI*2);ctx.fill();
    if(reveal){ctx.strokeStyle='#ff8c42';ctx.globalAlpha=0.5*pulse;ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx,cz,5,0,Math.PI*2);ctx.stroke()}
    ctx.globalAlpha=1;
  });
  if(reveal&&evidence&&!evidence.userData.collected){const[ex,ez]=proj(evidence.position.x,evidence.position.z);ctx.fillStyle='#fbcf3b';ctx.fillRect(ex-2,ez-2,4,4)}
  // Duct compass marker — a pulsing gold dot. If he's beyond the dial radius the proj() clamps to
  // the rim and we draw a small arrow chevron pointing outward so the player can chase the bearing.
  if(DUCT.active){
    const[dx,dz]=proj(DUCT.x,DUCT.z);
    const offRim=Math.hypot(DUCT.x*scl,DUCT.z*scl)>R-1;
    const pulse=0.6+Math.sin(now*4)*0.4;
    // Sonar-reveal flash: for ~2s after a ping, paint a wider gold ring on Duct so the recon tool
    // gets credit for "finding" him separately from the always-on compass marker.
    if(S.lastPing&&now-S.lastPing<2){const age=now-S.lastPing;ctx.strokeStyle='#ffd23f';ctx.globalAlpha=Math.max(0,1-age/2)*0.9;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(dx,dz,4+age*6,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1}
    ctx.fillStyle='#ffd23f';ctx.globalAlpha=pulse;
    ctx.beginPath();ctx.arc(dx,dz,offRim?2.5:3,0,Math.PI*2);ctx.fill();
    if(offRim){
      // Arrow chevron pointing from boat → Duct, clamped to the rim.
      const ang=Math.atan2(DUCT.z-bMesh.position.z,DUCT.x-bMesh.position.x);
      ctx.save();ctx.translate(dx,dz);ctx.rotate(ang);ctx.fillStyle='#ffd23f';
      ctx.beginPath();ctx.moveTo(4,0);ctx.lineTo(-2,-2.5);ctx.lineTo(-2,2.5);ctx.closePath();ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha=1;
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

// === DUCT THE RUBBER DUCKY ===
// Module state. Built once (mkDuct), shown/hidden by the spawn cycle. Never collides; the only
// interaction is the F-engage chase, which always ends in escape.
let DUCT={mesh:null,active:false,x:0,z:0,vx:0,vz:0,t0:0,life:0,lastQuack:0,wing:null,engaged:false};
function mkDuct(){
  const g=new THREE.Group();
  // Body — fat yellow sphere, slightly squashed.
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.9,16,12),new THREE.MeshStandardMaterial({color:0xffd23f,roughness:0.45,metalness:0.05,emissive:0x3a2c00,emissiveIntensity:0.25}));body.scale.set(1,0.85,1.1);body.position.y=0.55;g.add(body);
  // Head
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.55,14,10),new THREE.MeshStandardMaterial({color:0xffd23f,roughness:0.45,emissive:0x3a2c00,emissiveIntensity:0.25}));head.position.set(0,1.35,0.45);g.add(head);
  // Beak
  const beak=new THREE.Mesh(new THREE.ConeGeometry(0.22,0.5,8),new THREE.MeshStandardMaterial({color:0xff7a18,roughness:0.5}));beak.rotation.x=Math.PI/2;beak.position.set(0,1.3,1.05);g.add(beak);
  // Eyes
  [[-0.22,1.5,0.85],[0.22,1.5,0.85]].forEach(p=>{const e=new THREE.Mesh(new THREE.SphereGeometry(0.07,8,8),new THREE.MeshBasicMaterial({color:0x111111}));e.position.set(...p);g.add(e)});
  // Duct-tape stripe across the body (his namesake).
  const tape=new THREE.Mesh(new THREE.CylinderGeometry(0.92,0.92,0.32,16,1,true),new THREE.MeshStandardMaterial({color:0x8d9499,roughness:0.85,metalness:0.2,side:THREE.DoubleSide}));tape.position.y=0.55;tape.scale.set(1,1,1.1);g.add(tape);
  // Wings (hidden until the 'fly' escape) — flat triangles.
  const wing=new THREE.Group();
  [[-1,1],[1,1]].forEach(([s])=>{const w=new THREE.Mesh(new THREE.ConeGeometry(0.4,0.9,4),new THREE.MeshStandardMaterial({color:0xffe27a,roughness:0.5}));w.rotation.z=s*Math.PI/2.2;w.position.set(s*0.95,0.7,0);wing.add(w)});
  wing.visible=false;g.add(wing);DUCT.wing=wing;
  // Soft golden glow so a sighting reads from a distance.
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({color:0xffe27a,blending:THREE.AdditiveBlending,transparent:true,opacity:0.5,depthWrite:false}));glow.scale.set(5,5,5);glow.position.y=0.8;g.add(glow);DUCT.glow=glow;
  g.visible=false;scene.add(g);DUCT.mesh=g;
}
function spawnDuct(){
  if(!DUCT.mesh||DUCT.active||GAME_MODE!=='game')return;
  const a=Math.random()*Math.PI*2,r=45+Math.random()*75;
  DUCT.x=Math.cos(a)*r;DUCT.z=Math.sin(a)*r;DUCT.vx=(Math.random()-0.5)*0.05;DUCT.vz=(Math.random()-0.5)*0.05;
  DUCT.t0=Date.now()*0.001;DUCT.life=35+Math.random()*20;DUCT.active=true;DUCT.engaged=false;DUCT.wing.visible=false;
  DUCT.mesh.position.set(DUCT.x,0,DUCT.z);DUCT.mesh.visible=true;
  ductStats.sightings++;logDuct('sighting');persist();onUnlock('duct_sighting');
  radio('…is that a rubber duck? Tape on its back and everything. Get over there.','fly');
  sfx('quack');
}
function despawnDuct(){if(DUCT.mesh)DUCT.mesh.visible=false;DUCT.active=false;DUCT.engaged=false;const p=$('duct-prompt');if(p)p.style.display='none'}
function maybeSpawnDuct(){if(S.on&&GAME_MODE==='game'&&!DUCT.active&&!miniActive&&Math.random()<0.00018)spawnDuct()}
function tickDuct(t){
  if(!DUCT.active||DUCT.engaged)return;
  // Lifetime expiry — he slips away on his own if you never engage.
  if(t-DUCT.t0>DUCT.life){despawnDuct();return}
  // Lazy wander + bob; turn occasionally.
  if(Math.random()<0.01){DUCT.vx=(Math.random()-0.5)*0.06;DUCT.vz=(Math.random()-0.5)*0.06}
  DUCT.x+=DUCT.vx;DUCT.z+=DUCT.vz;
  const m=DUCT.mesh;m.position.set(DUCT.x,Math.sin(t*2.5)*0.12,DUCT.z);m.rotation.y=Math.atan2(DUCT.vx,DUCT.vz)+Math.sin(t)*0.2;
  if(DUCT.glow){const base=_isNight?0.85:0.4;const sc=_isNight?7:5;DUCT.glow.material.opacity=base+Math.sin(t*3)*0.15;DUCT.glow.scale.set(sc,sc,sc)}
  // Periodic quack if on-screen-ish (in front of the camera).
  if(t-DUCT.lastQuack>5.5){const toD=_vDuct.set(DUCT.x,0,DUCT.z).sub(cam.position);const fwd=_vFwd;cam.getWorldDirection(fwd);if(toD.normalize().dot(fwd)>0.3){sfx('quack');DUCT.lastQuack=t}}
  // Proximity prompt.
  const p=$('duct-prompt');if(p){const d=bMesh.position.distanceTo(m.position);if(d<14&&Math.abs(spd)<0.3&&!miniActive){p.style.display='block';p.innerHTML='🦆 <b>DUCT IN SIGHT</b> — press <b>F</b> to make your attempt'}else p.style.display='none'}
}

function mkEvidence(){
  // One evidence prop somewhere in the shallows zone — a small glowing crate with a marker beam.
  const g=new THREE.Group();
  const crate=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.4,0.5),new THREE.MeshStandardMaterial({color:0xfbcf3b,emissive:0xfbcf3b,emissiveIntensity:0.4,roughness:0.5}));crate.position.y=0.25;g.add(crate);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,4,6),new THREE.MeshBasicMaterial({color:0xfbcf3b,transparent:true,opacity:0.5}));beam.position.y=2.4;g.add(beam);
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.8,1.0,18),new THREE.MeshBasicMaterial({color:0xfbcf3b,transparent:true,opacity:0.45,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=0.05;g.add(ring);
  // Faux-bloom glow sprite — additive blend, depth-write off so it composites cleanly over water.
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({color:0xfbcf3b,blending:THREE.AdditiveBlending,transparent:true,opacity:0.5,depthWrite:false}));glow.scale.set(3,3,3);glow.position.y=0.5;g.add(glow);
  const x=(Math.random()-0.5)*30,z=-60-Math.random()*30;
  g.position.set(x,0,z);g.userData={collected:false,ring,beam,glow};scene.add(g);evidence=g;
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
    const tube=new THREE.Mesh(new THREE.TorusGeometry(0.55,0.18,8,16),new THREE.MeshStandardMaterial({color:0xff6b35,emissive:0xff6b35,emissiveIntensity:0.55,roughness:0.5}));tube.rotation.x=Math.PI/2;tube.position.y=0.2;g.add(tube);
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.18,8,6),new THREE.MeshStandardMaterial({color:0xd4a373,roughness:0.7}));head.position.y=0.55;g.add(head);
    const torso=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.3,0.25),new THREE.MeshStandardMaterial({color:0x2a4d6e,roughness:0.6}));torso.position.y=0.3;g.add(torso);
    // Pulsing call-for-help ring on the water
    const ring=new THREE.Mesh(new THREE.RingGeometry(0.9,1.1,18),new THREE.MeshBasicMaterial({color:0xff6b35,transparent:true,opacity:0.55,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=0.05;g.add(ring);
    // R19 — Help beam. A tall, additive orange column that's visible from clear across the lake
    // so the player can actually FIND the civilian instead of pinballing through fog. Pulses on
    // the same phase as the ring, scales down once the civ is within rescue range so it doesn't
    // dominate the close-up. Cylinder open at top + bottom so the camera flying through doesn't
    // clip it weirdly.
    const beam=new THREE.Mesh(
      new THREE.CylinderGeometry(0.35,0.8,28,12,1,true),
      new THREE.MeshBasicMaterial({color:0xff8c42,blending:THREE.AdditiveBlending,transparent:true,opacity:0.32,side:THREE.DoubleSide,depthWrite:false})
    );beam.position.y=14;g.add(beam);
    // Faint top capstone that fades the column out (no harsh edge against the sky).
    const beamTop=new THREE.Sprite(new THREE.SpriteMaterial({color:0xffb673,blending:THREE.AdditiveBlending,transparent:true,opacity:0.7,depthWrite:false}));
    beamTop.scale.set(3,3,1);beamTop.position.y=28;g.add(beamTop);
    g.position.set(x,0,z);g.userData={saved:false,ring,beam,beamTop};scene.add(g);civs.push(g);
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

// Hero hull silhouettes — each operative's boat has a distinct deck-plan profile, extruded from a
// 2D THREE.Shape so the bow is a real point and the beam differs per hero (Lilly's pontoon is wide
// + stable, the Fly's is narrow + sharp, the Reel's is balanced).
const HULL_PROFILE={
  regular:{halfBeam:1.15,bowZ:4.2,sternZ:-2.6,depth:0.95},   // The Reel — balanced runabout
  pontoon:{halfBeam:1.5, bowZ:3.6,sternZ:-2.8,depth:1.05},   // Lilly Loch — wide stable barge
  speedboat:{halfBeam:0.95,bowZ:4.6,sternZ:-2.4,depth:0.85}  // The Fly — narrow knife bow
};
function makeHullShape(p){
  // Deck plan in the XZ plane (x = beam, y-of-shape = z fore/aft). Pointed bow, square transom.
  const s=new THREE.Shape();
  s.moveTo(-p.halfBeam,p.sternZ);
  s.lineTo(p.halfBeam,p.sternZ);
  s.lineTo(p.halfBeam,p.bowZ-1.3);
  s.quadraticCurveTo(p.halfBeam,p.bowZ,0,p.bowZ);          // starboard bow sweep to the point
  s.quadraticCurveTo(-p.halfBeam,p.bowZ,-p.halfBeam,p.bowZ-1.3);
  s.lineTo(-p.halfBeam,p.sternZ);
  return s;
}
function mkBoat(cls){if(bMesh){disposeTree(bMesh);scene.remove(bMesh)}const t=BT[cls];bMesh=new THREE.Group();
  const prof=HULL_PROFILE[cls]||HULL_PROFILE.regular;
  // Extruded hull — beveled top edge reads as a gunwale. Rotated so the extrude depth becomes height.
  const hullGeo=new THREE.ExtrudeGeometry(makeHullShape(prof),{depth:prof.depth,bevelEnabled:true,bevelThickness:0.12,bevelSize:0.12,bevelSegments:2});
  hullGeo.rotateX(-Math.PI/2);  // shape was in XZ; extrude along +Y -> stand it up as the hull height
  const hull=new THREE.Mesh(hullGeo,new THREE.MeshStandardMaterial({color:t.col,roughness:0.32,metalness:0.18}));
  hull.position.y=0.15;hull.castShadow=true;hull.receiveShadow=true;bMesh.add(hull);
  // Interior deck floor so the hull doesn't look hollow from above.
  const deck=new THREE.Mesh(new THREE.BoxGeometry(prof.halfBeam*1.7,0.08,(prof.bowZ-prof.sternZ)*0.8),new THREE.MeshStandardMaterial({color:0x3a2a18,roughness:0.85}));deck.position.set(0,0.55,(prof.bowZ+prof.sternZ)/2-0.3);bMesh.add(deck);
  // Stern transom block (motor mounts here)
  const stern=new THREE.Mesh(new THREE.BoxGeometry(prof.halfBeam*1.8,0.7,0.5),new THREE.MeshStandardMaterial({color:t.col,roughness:0.4}));stern.position.set(0,0.4,prof.sternZ);bMesh.add(stern);
  // Deck stripe
  const stripe=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.04,4.8),new THREE.MeshStandardMaterial({color:0xe8590c,emissive:0xe8590c,emissiveIntensity:0.15}));stripe.position.y=0.92;bMesh.add(stripe);
  // Cabin
  const cab=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.9,2.2),new THREE.MeshStandardMaterial({color:0xf5f5f0,roughness:0.6}));cab.position.set(0,1.4,-0.3);cab.castShadow=true;bMesh.add(cab);
  // Windshield
  const ws=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.6,0.08),new THREE.MeshStandardMaterial({color:0x88ddff,transparent:true,opacity:0.45,metalness:0.9,roughness:0.1}));ws.position.set(0,1.8,0.8);ws.rotation.x=-0.25;bMesh.add(ws);
  // Console
  const dashConsole=new THREE.Mesh(new THREE.BoxGeometry(1,0.4,0.5),new THREE.MeshStandardMaterial({color:0x1a1a2e,metalness:0.6}));dashConsole.position.set(0,1.6,0.3);bMesh.add(dashConsole);
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
  // Caustics shimmer — a wider additive ring that ripples under the boat. Cheap, big mood lift.
  const caustics=new THREE.Mesh(new THREE.RingGeometry(3.2,5.2,32),new THREE.MeshBasicMaterial({color:0x6fc8e8,blending:THREE.AdditiveBlending,transparent:true,opacity:0.25,side:THREE.DoubleSide,depthWrite:false}));
  caustics.rotation.x=-Math.PI/2;caustics.position.y=-0.16;bMesh.add(caustics);bMesh.userData.caustics=caustics;
  // Hull-damage VFX layers — opacity driven from S.hull in the loop's foam-ring block.
  //   smokeGlow: dark sprite over the motor, opacity ramps in below 25% hull
  //   crackGlow: dim red emissive plane on the cabin, ramps in below 50% hull
  const smokeGlow=new THREE.Sprite(new THREE.SpriteMaterial({color:0x1a1820,transparent:true,opacity:0,depthWrite:false}));
  smokeGlow.scale.set(2.2,2.6,1);smokeGlow.position.set(0,1.5,-2.8);bMesh.add(smokeGlow);bMesh.userData.smokeGlow=smokeGlow;
  const crackGlow=new THREE.Mesh(new THREE.PlaneGeometry(1.5,0.9),new THREE.MeshBasicMaterial({color:0xef4444,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
  crackGlow.position.set(0,1.4,-0.3);bMesh.add(crackGlow);bMesh.userData.crackGlow=crackGlow;
  // === Hero accent kit + upgrade-visible parts ===
  // Each operative gets a wildly different boat skin so they read at a glance from across the lake.
  const up=boatUpgrades[cls]||{};
  const ac=t.accents||{};
  if(cls==='regular'){
    // The Reel: tournament boat — red hull with white pinstripes, blue racing stripe, gold star
    // emblem on the cabin. Flashy, sponsored-looking.
    // Twin pinstripes along the gunwale (white).
    [[-1.2,1.05,1],[1.2,1.05,1]].forEach(([x,y,z])=>{const trim=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.04,3.4),new THREE.MeshStandardMaterial({color:ac.trim,metalness:0.4,roughness:0.4}));trim.position.set(x,y,z);bMesh.add(trim)});
    // Blue racing stripe down the centre of the deck.
    const stripe=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.02,4.2),new THREE.MeshStandardMaterial({color:ac.stripe,emissive:ac.stripe,emissiveIntensity:0.35}));stripe.position.set(0,0.6,0.3);bMesh.add(stripe);
    // Gold "★" emblem on the port side of the cabin.
    const emblem=new THREE.Mesh(new THREE.CircleGeometry(0.22,5),new THREE.MeshBasicMaterial({color:ac.emblem,transparent:true,opacity:0.95}));emblem.position.set(-0.81,1.55,-0.3);emblem.rotation.y=-Math.PI/2;bMesh.add(emblem);
    const emblem2=emblem.clone();emblem2.position.x=0.81;emblem2.rotation.y=Math.PI/2;bMesh.add(emblem2);
    // Red accent panel on the cabin roof.
    const roofAccent=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.06,2),new THREE.MeshStandardMaterial({color:ac.primary,emissive:ac.primary,emissiveIntensity:0.18}));roofAccent.position.set(0,1.88,-0.3);bMesh.add(roofAccent);
  }else if(cls==='pontoon'){
    // Lilly: camo + pink. Muddy olive base with a pink stripe and lime accents; flower emblem on
    // the cabin. The wide pontoon body still reads as her hull, the trim now reads as personality.
    // Camo paint: 3 muddy patches randomly tossed on the cabin.
    const cabinCamo=new THREE.Mesh(new THREE.BoxGeometry(1.62,0.92,2.22),new THREE.MeshStandardMaterial({color:ac.trim,roughness:0.95}));cabinCamo.position.set(0,1.4,-0.3);bMesh.add(cabinCamo);
    [[0.4,1.5,-0.2,0.5],[-0.5,1.3,0.3,0.4],[0.2,1.7,-1.0,0.35]].forEach(([x,y,z,r])=>{const patch=new THREE.Mesh(new THREE.CircleGeometry(r,8),new THREE.MeshStandardMaterial({color:0x44551c,roughness:0.95}));patch.position.set(x,y,z);patch.rotation.y=Math.random()*Math.PI;bMesh.add(patch)});
    // Pink top stripe.
    const pinkStripe=new THREE.Mesh(new THREE.BoxGeometry(1.66,0.08,2.26),new THREE.MeshStandardMaterial({color:ac.primary,emissive:ac.primary,emissiveIntensity:0.45}));pinkStripe.position.set(0,1.9,-0.3);bMesh.add(pinkStripe);
    // Lime green inner-tube floats (her trademark).
    [[-1.3,0.6,0.5],[1.3,0.6,0.5],[-1.3,0.6,-1.4],[1.3,0.6,-1.4]].forEach(([x,y,z])=>{const tube=new THREE.Mesh(new THREE.TorusGeometry(0.32,0.1,8,16),new THREE.MeshStandardMaterial({color:ac.stripe,emissive:ac.stripe,emissiveIntensity:0.35}));tube.rotation.x=Math.PI/2;tube.position.set(x,y,z);bMesh.add(tube)});
    // Daisy/flower emblem on each cabin side.
    [-0.81,0.81].forEach(x=>{
      const petal=new THREE.Mesh(new THREE.CircleGeometry(0.22,8),new THREE.MeshBasicMaterial({color:ac.emblem,transparent:true,opacity:0.9}));petal.position.set(x,1.55,-0.3);petal.rotation.y=x<0?-Math.PI/2:Math.PI/2;bMesh.add(petal);
      const core=new THREE.Mesh(new THREE.CircleGeometry(0.07,8),new THREE.MeshBasicMaterial({color:ac.stripe}));core.position.set(x,1.55,-0.3);core.position.x+=x<0?-0.01:0.01;core.rotation.y=x<0?-Math.PI/2:Math.PI/2;bMesh.add(core);
    });
  }else if(cls==='speedboat'){
    // Fly: matte stealth boat — black hull, navy panels, glowing blue sonar mast + bow tracer line.
    // Quiet, tactical, slightly menacing.
    const panel=new THREE.Mesh(new THREE.BoxGeometry(1.62,0.92,2.24),new THREE.MeshStandardMaterial({color:ac.trim,roughness:0.85,metalness:0.4}));panel.position.set(0,1.4,-0.3);bMesh.add(panel);
    const mast=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,2.2,6),new THREE.MeshStandardMaterial({color:0x2a3a4a,metalness:0.8}));mast.position.set(0,2.6,-0.3);bMesh.add(mast);
    const dish=new THREE.Mesh(new THREE.SphereGeometry(0.18,8,4,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:ac.stripe,emissive:0x102a44,emissiveIntensity:0.5,side:THREE.DoubleSide}));dish.position.set(0,3.7,-0.3);dish.rotation.x=Math.PI;bMesh.add(dish);
    // Bow tracer line — thin glowing blue strip down the centre of the deck.
    const tracer=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.04,4.5),new THREE.MeshStandardMaterial({color:ac.stripe,emissive:ac.stripe,emissiveIntensity:0.9}));tracer.position.set(0,0.6,0.5);bMesh.add(tracer);
    // Blue arrow/wing emblem on each cabin side.
    [-0.81,0.81].forEach(x=>{
      const arrow=new THREE.Mesh(new THREE.CircleGeometry(0.18,3),new THREE.MeshBasicMaterial({color:ac.emblem,transparent:true,opacity:0.95}));arrow.position.set(x,1.55,-0.3);arrow.rotation.y=x<0?-Math.PI/2:Math.PI/2;arrow.rotation.z=Math.PI/2;bMesh.add(arrow);
    });
  }
  // ENGINE: upgrade tier scales the motor block + tint
  if((up.engine||0)>=1){const engBig=new THREE.Mesh(new THREE.BoxGeometry(0.9,1.5,1.1),new THREE.MeshStandardMaterial({color:0x111118,metalness:0.85,roughness:0.25}));engBig.position.set(0,0.5,-3.1);bMesh.add(engBig)}
  if((up.engine||0)>=2){const prop=new THREE.Mesh(new THREE.TorusGeometry(0.35,0.06,6,12),new THREE.MeshStandardMaterial({color:0xfb923c,emissive:0xe8590c,emissiveIntensity:0.6}));prop.rotation.x=Math.PI/2;prop.position.set(0,0.4,-3.5);bMesh.add(prop)}
  // LIGHTS: tier 1 = bow spotlight, tier 2 = deck floodlights
  if((up.lights||0)>=1){const spot=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.22,0.3,12),new THREE.MeshStandardMaterial({color:0xfff7d1,emissive:0xfff7d1,emissiveIntensity:0.8}));spot.rotation.x=Math.PI/2;spot.position.set(0,1.55,2.2);bMesh.add(spot);bMesh.add(new THREE.PointLight(0xffeecc,0.6,18))}
  if((up.lights||0)>=2){[[-0.9,1.5,-1.6],[0.9,1.5,-1.6]].forEach(([x,y,z])=>{const fl=new THREE.Mesh(new THREE.SphereGeometry(0.16,8,6),new THREE.MeshStandardMaterial({color:0xffeecc,emissive:0xffeecc,emissiveIntensity:0.7}));fl.position.set(x,y,z);bMesh.add(fl)})}
  // ARMOR: tier 1 = side plates, tier 2 = bow ram + keel band
  if((up.armor||0)>=1){[[-1.18,0.55,0.5],[1.18,0.55,0.5]].forEach(([x,y,z])=>{const plate=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.45,2),new THREE.MeshStandardMaterial({color:0x4a4a4a,metalness:0.8,roughness:0.45}));plate.position.set(x,y,z);bMesh.add(plate)})}
  if((up.armor||0)>=2){const ram=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.4,0.6),new THREE.MeshStandardMaterial({color:0x2a2a2a,metalness:0.9}));ram.position.set(0,0.4,4.1);bMesh.add(ram)}
  // ELECTRONICS: tier 1 = small antenna, tier 2 = larger dish
  if((up.electronics||0)>=1){const ant=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,1.6,6),new THREE.MeshStandardMaterial({color:0x60d0ff,emissive:0x113a55,emissiveIntensity:0.7}));ant.position.set(0.5,2.2,-1);bMesh.add(ant)}
  if((up.electronics||0)>=2){const radome=new THREE.Mesh(new THREE.SphereGeometry(0.28,12,8),new THREE.MeshStandardMaterial({color:0x60d0ff,emissive:0x102a44,emissiveIntensity:0.45,transparent:true,opacity:0.85}));radome.position.set(0,3.0,-0.6);bMesh.add(radome)}
  // Hero rim light — a side point light whose color matches the hero so the hull picks up a colored
  // rim against the sky/water. Sits low + behind the cabin so it grazes the side of the hull.
  const heroRim=new THREE.PointLight(t.col,0.55,9);heroRim.position.set(-1.6,1.0,-0.4);bMesh.add(heroRim);
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

// === SPLASH + FISH-JUMP PARTICLES ===
// Reuses the wakes[] array + tickWakes() lifecycle (gravity-arc droplets) for splash bursts.
const splashGeo=new THREE.SphereGeometry(0.14,5,4);
function splash(pos,n=14,color=0xcfe8ff,power=1){
  for(let i=0;i<n&&wakes.length<260;i++){
    const p=new THREE.Mesh(splashGeo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.8}));
    p.position.copy(pos);p.position.y=0.2;
    const a=Math.random()*Math.PI*2,sp=(0.04+Math.random()*0.09)*power;
    p.userData={life:1,decay:0.02+Math.random()*0.02,vy:0.06+Math.random()*0.08*power,vx:Math.cos(a)*sp,vz:Math.sin(a)*sp};
    scene.add(p);wakes.push(p);
  }
}
// R19 — Marina dock preview. Three moored boats flanking the dock so the player picks their
// operative by SEEING the boats from a slow aerial orbit, not just reading HTML chips. The
// preview boats are real scenery (they stay moored after the run starts), and they serve as the
// 3D hero picker on s1 — click the boat or its stat card to select.
const PREVIEW_POS={
  regular:  {x:-9,  z:-114, ry:Math.PI*0.05},
  pontoon:  {x: 0,  z:-114, ry:Math.PI*0.00},
  speedboat:{x: 9,  z:-114, ry:-Math.PI*0.05}
};
const previewBoats={};
function mkPreviewBoatGeom(cls){
  // Compact hero-themed mesh — same hull profile as the live boat so the silhouette reads, but
  // the upgrade-attachable + damage-VFX layers are omitted (those would be misleading on
  // moored display boats).
  const t=BT[cls],prof=HULL_PROFILE[cls],ac=t.accents||{};
  const g=new THREE.Group();
  const hullGeo=new THREE.ExtrudeGeometry(makeHullShape(prof),{depth:prof.depth,bevelEnabled:true,bevelThickness:0.1,bevelSize:0.1,bevelSegments:2});
  hullGeo.rotateX(-Math.PI/2);
  const hull=new THREE.Mesh(hullGeo,new THREE.MeshStandardMaterial({color:t.col,roughness:0.32,metalness:0.18}));
  hull.position.y=0.15;hull.castShadow=true;hull.receiveShadow=true;g.add(hull);
  // Deck floor.
  const deck=new THREE.Mesh(new THREE.BoxGeometry(prof.halfBeam*1.7,0.08,(prof.bowZ-prof.sternZ)*0.8),new THREE.MeshStandardMaterial({color:0x3a2a18,roughness:0.85}));deck.position.set(0,0.55,(prof.bowZ+prof.sternZ)/2-0.3);g.add(deck);
  // Cabin painted with the hero's primary accent so the silhouette pops from the orbital cam.
  const cab=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.9,2.2),new THREE.MeshStandardMaterial({color:ac.primary||0xf5f5f0,emissive:ac.primary||0,emissiveIntensity:0.15,roughness:0.6}));cab.position.set(0,1.4,-0.3);cab.castShadow=true;g.add(cab);
  // Windshield.
  const ws=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.6,0.08),new THREE.MeshStandardMaterial({color:0x88ddff,transparent:true,opacity:0.45,metalness:0.9,roughness:0.1}));ws.position.set(0,1.8,0.8);ws.rotation.x=-0.25;g.add(ws);
  // Motor.
  const motor=new THREE.Mesh(new THREE.BoxGeometry(0.7,1.2,0.9),new THREE.MeshStandardMaterial({color:0x111118,metalness:0.7,roughness:0.3}));motor.position.set(0,0.2,-2.8);g.add(motor);
  // Hero-color glow ring under the boat for the picker reads.
  const ringMat=new THREE.MeshBasicMaterial({color:ac.glow||ac.primary||0xfff,transparent:true,opacity:0.0,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});
  const ring=new THREE.Mesh(new THREE.RingGeometry(3.2,4.2,32),ringMat);
  ring.rotation.x=-Math.PI/2;ring.position.y=0.1;g.add(ring);
  g.userData.ring=ring;
  // Foam ring for "moored" anchor read.
  const foam=new THREE.Mesh(new THREE.RingGeometry(2.4,3.2,28),new THREE.MeshBasicMaterial({color:0xeaf4f0,transparent:true,opacity:0.28,side:THREE.DoubleSide}));
  foam.rotation.x=-Math.PI/2;foam.position.y=-0.08;g.add(foam);
  return g;
}
function mkMarinaPreview(){
  ['regular','pontoon','speedboat'].forEach(cls=>{
    const p=PREVIEW_POS[cls];
    const m=mkPreviewBoatGeom(cls);
    m.position.set(p.x,0.3,p.z);
    m.rotation.y=p.ry;
    m.userData.previewCls=cls;
    m.userData.basePos={x:p.x,z:p.z};
    scene.add(m);
    previewBoats[cls]=m;
  });
}
let fishJumps=[];
const jumpGeo=THREE.CapsuleGeometry?new THREE.CapsuleGeometry(0.18,0.5,3,6):new THREE.CylinderGeometry(0.18,0.1,0.7,6);
function spawnFishJump(){
  if(!FISH_SPOTS.length)return;
  const spot=FISH_SPOTS[Math.floor(Math.random()*FISH_SPOTS.length)];
  const a=Math.random()*Math.PI*2,r=Math.random()*spot.r;
  const x=spot.x+Math.cos(a)*r,z=spot.z+Math.sin(a)*r;
  const m=new THREE.Mesh(jumpGeo,new THREE.MeshStandardMaterial({color:0x8fb8c8,roughness:0.4,metalness:0.3,emissive:0x16323c,emissiveIntensity:0.3}));
  m.position.set(x,0,z);m.rotation.z=Math.PI/2.4;scene.add(m);
  splash(m.position,8,0xbfe0ef,0.7);
  fishJumps.push({m,t0:Date.now()*0.001,dur:0.9+Math.random()*0.3,x,z,vx:(Math.random()-0.5)*0.4,vz:(Math.random()-0.5)*0.4,splashed:false});
}
function tickFishJumps(t){
  // Occasionally spawn one when the world is live (cheap; 3D draw stays light).
  if(S.on&&Math.random()<0.012)spawnFishJump();
  for(let i=fishJumps.length-1;i>=0;i--){
    const j=fishJumps[i],age=(t-j.t0)/j.dur;
    if(age>=1){if(!j.splashed)splash(j.m.position,10,0xbfe0ef,0.8);scene.remove(j.m);j.m.material.dispose();fishJumps.splice(i,1);continue}
    // Parabolic arc.
    j.m.position.x=j.x+j.vx*age;j.m.position.z=j.z+j.vz*age;
    j.m.position.y=Math.sin(age*Math.PI)*1.6;
    j.m.rotation.x=age*Math.PI*1.4;
    if(age>0.9&&!j.splashed){j.splashed=true;splash(j.m.position,8,0xbfe0ef,0.7)}
  }
}

// === SONAR PING ===
function fireSonar(){
  if(!S.on)return false;
  const now=Date.now()*0.001;
  // Sonar Bank buff: each press spends one banked ping with no 3s wait. Falls through to the
  // standard cooldown gate if the bank is empty.
  // Sonar cooldown shortened by Fly's hero ability (3s → 2s) and not affected by upgrades; range
  // (revealed in tickSonar / minimap reveal) widens with electronics.
  const sonarCool=S.bc==='speedboat'?2:3;
  if(buffs.sonarBank>0){buffs.sonarBank--;persist()}
  else if(S.sonarReady&&now<S.sonarReady)return false;
  else S.sonarReady=now+sonarCool;
  S.lastPing=now;sfx('ping');S.pingReveal=now+4+(eqUp('electronics').sonarBoost||0)*5;
  // Duct sonar callout — if he's active and the player pings, the radio confirms the contact.
  // Rate-limited via S.ductPingLast so spamming the ping doesn't spam the line.
  if(DUCT.active&&(!S.ductPingLast||now-S.ductPingLast>8)){S.ductPingLast=now;radio('Sonar tagged something duck-shaped. Stay sharp.','fly')}
  const origin=bMesh.position.clone();origin.y=0.2;
  // Expanding ring on the water — reuse wake disposal pattern
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.4,0.6,32),new THREE.MeshBasicMaterial({color:0x60d0ff,transparent:true,opacity:0.85,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2;ring.position.copy(origin);scene.add(ring);
  sonarRings.push({m:ring,t0:now});
  const sonarRange=25*(1+(eqUp('electronics').sonarBoost||0));
  // Highlight every stump within sonarRange for ~1.5s
  let pinged=0;
  for(const s of stumps){if(s.position.distanceTo(origin)>sonarRange)continue;
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
  }else if(w.c!=='Rain'&&w.c!=='Drizzle'&&rainDrops.length){
    // Weather cleared — tear down the rain particles instead of letting them fall forever.
    rainDrops.forEach(r=>{disposeTree(r);scene.remove(r)});rainDrops.length=0;
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
// In-world bobber mesh + state for the wait-for-bite phase. Only one bobber lives at a time.
let _bobberMesh=null,_bobberState=null;  // {phase:'wait'|'nibble',spot,fish,t0,nibbleAt,nibbleEnd,bobBase}
// Bobber + the fishing-line + underwater fish silhouette. All disposed together.
let _bobberLine=null,_bobberFish=null,_bobberFishT0=0;
function disposeBobber(){
  // _bobberMesh is a THREE.Group containing 3 child Meshes (body lo, hi, antenna) — Group.geometry
  // and .material are undefined, so the old `if(_bobberMesh.geometry)` no-op'd and leaked all three
  // child geometries+materials per cast. disposeTree traverses the group and disposes each child.
  if(_bobberMesh){disposeTree(_bobberMesh);scene.remove(_bobberMesh);_bobberMesh=null}
  if(_bobberLine){scene.remove(_bobberLine);_bobberLine.geometry.dispose();_bobberLine.material.dispose();_bobberLine=null}
  if(_bobberFish){scene.remove(_bobberFish);_bobberFish.geometry.dispose();_bobberFish.material.dispose();_bobberFish=null}
  _bobberState=null;
}
function cancelCast(){
  // Hard-stop any in-flight cast: clear the animation interval, dispose the ring + bobber.
  if(_castAnim){clearInterval(_castAnim);_castAnim=null}
  if(_castRing){scene.remove(_castRing);_castRing.geometry.dispose();_castRing.material.dispose();_castRing=null}
  disposeBobber();
  _castInFlight=false;
}
function castLine(){
  if(!S.on||GAME_MODE!=='game'||miniActive||_catchOpen)return false;
  if(Math.abs(spd)>0.15){radio('Boat needs to be stopped to cast.','self');return false}
  // If a bobber is already in the water, F means "set the hook" — funnels through the nibble path.
  if(_bobberState){tryHookSet();return true}
  if(_castInFlight)return false;
  if(!tutorialSeen.cast&&showTutorial('cast'))return false;
  if(dropPoints.some(d=>d.userData.active&&!d.userData.qa&&bMesh.position.distanceTo(d.position)<7)){radio('Too close to a beacon to fish. Pull off it first.','self');return false}
  _castInFlight=true;S._castedThisRun=true;
  const spot=fishingSpot(bMesh.position);
  radio(spot?`Casting in ${spot.n}. Something\'s rolling on it.`:'Line in the water.','self');sfx('cast');
  // Visual: cast ring on the water at the boat's bow + the bobber arcs out.
  const ringMesh=new THREE.Mesh(new THREE.RingGeometry(1,1.2,24),new THREE.MeshBasicMaterial({color:0xfbcf3b,transparent:true,opacity:0.7,side:THREE.DoubleSide}));
  ringMesh.rotation.x=-Math.PI/2;ringMesh.position.copy(bMesh.position);ringMesh.position.y=0.12;
  const fwd=new THREE.Vector3(0,0,3).applyQuaternion(bMesh.quaternion);ringMesh.position.add(fwd);
  scene.add(ringMesh);_castRing=ringMesh;
  // Roll the fish at cast time so the wait window can be tuned to its rarity.
  const fish=rollFish(spot);
  const t0=Date.now();
  // Shorter cast animation (1.2s) — the bobber lands faster so the player gets back into the loop.
  _castAnim=setInterval(()=>{
    if(!S.on){cancelCast();return}
    const age=(Date.now()-t0)/1200;
    if(age>=1){clearInterval(_castAnim);_castAnim=null;scene.remove(ringMesh);ringMesh.geometry.dispose();ringMesh.material.dispose();_castRing=null;startBobberWait(spot,fish);return}
    const sc=1+age*4;ringMesh.scale.set(sc,sc,sc);ringMesh.material.opacity=0.7*(1-age);
  },50);
}
// === BOBBER WAIT + NIBBLE PHASE ===
// After the cast animation, a yellow bobber sits on the water in front of the bow. A "nibble"
// event fires after a random delay (2-7s, biased shorter for common fish, longer for legendary).
// During the ~1.2s nibble window the bobber dips, a high-pitched cue plays, and the radio whispers
// "Bite!" — if the player taps F or SPACE in that window, the fight starts. Miss it, and the fish
// steals the bait (consumes equipped bait, no fight). Early-strike before nibble spooks the fish.
function startBobberWait(spot,fish){
  const fwd=new THREE.Vector3(0,0,3).applyQuaternion(bMesh.quaternion);
  const bp=bMesh.position.clone().add(fwd);bp.y=0.25;
  splash(bp,8,0xcfe8ff,0.8);
  // Build the bobber — small red-and-white sphere with a tiny antenna.
  const grp=new THREE.Group();
  const lo=new THREE.Mesh(new THREE.SphereGeometry(0.18,10,8,0,Math.PI*2,Math.PI/2,Math.PI/2),new THREE.MeshStandardMaterial({color:0xef4444,emissive:0x661010,emissiveIntensity:0.4,roughness:0.5}));lo.position.y=-0.05;grp.add(lo);
  const hi=new THREE.Mesh(new THREE.SphereGeometry(0.18,10,8,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x444444,emissiveIntensity:0.2,roughness:0.5}));hi.position.y=0.05;grp.add(hi);
  const ant=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.45,5),new THREE.MeshStandardMaterial({color:0xffd23f,emissive:0xffd23f,emissiveIntensity:0.7}));ant.position.y=0.32;grp.add(ant);
  grp.position.copy(bp);scene.add(grp);_bobberMesh=grp;
  // Fishing line — thin LineSegments from rod-tip to bobber. Color picks the hero accent so each
  // operative's rod reads. Updated each tick in tickBobber so it swings with bobber motion.
  const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
  const heroAccent=(BT[S.bc]&&BT[S.bc].accents&&BT[S.bc].accents.stripe)||0xeeeeee;
  const lm=new THREE.LineBasicMaterial({color:heroAccent,transparent:true,opacity:0.7});
  _bobberLine=new THREE.LineSegments(lg,lm);scene.add(_bobberLine);
  // Underwater fish silhouette — a soft dark ellipse hovering just below the water surface,
  // circling the bobber. Sells "something's swimming around your line" without spoiling the species.
  const fishG=new THREE.Mesh(new THREE.SphereGeometry(0.42,12,8),new THREE.MeshBasicMaterial({color:0x041018,transparent:true,opacity:0.45,depthWrite:false}));
  fishG.scale.set(1.4,0.4,0.7);fishG.position.set(bp.x+1.6,-0.35,bp.z);scene.add(fishG);_bobberFish=fishG;
  _bobberFishT0=Date.now();
  // Wait time biases toward shorter for commons / minnow bait, longer for rare/legendary.
  const rar=fish.r==='legendary'?1.5:fish.r==='rare'?1.2:fish.r==='uncommon'?0.9:0.7;
  const wait=(1500+Math.random()*3500)*rar;
  // Pre-tell (400ms) telegraphs the strike before the F window opens — RF4/Dredge research said
  // springing the window unannounced felt cheap. pretellAt fires the twitch; nibbleAt opens the tap.
  _bobberState={phase:'wait',spot,fish,t0:Date.now(),pretellAt:Date.now()+wait-400,nibbleAt:Date.now()+wait,nibbleEnd:0,bobBase:bp.y,grp};
  // Prompt the player so they know what's happening.
  const p=$('cast-prompt');if(p){p.style.display='block';p.innerHTML='🎣 <b>Line in the water</b> — watch the bobber. <b>F</b> to set the hook when it dips.'}
  _castInFlight=false;
}
// Per-frame bobber drive. Cheap; only ticks while _bobberState exists.
function tickBobber(t){
  if(!_bobberState||!_bobberMesh)return;
  const s=_bobberState,now=Date.now();
  // Fishing line — snap rod tip + bobber positions into the existing LineSegments buffer. The rod
  // tip sits a touch above the boat's port-side gunwale; refreshed each frame so the line tracks
  // the boat's idle bob + the bobber's nibble dip.
  if(_bobberLine&&bMesh){
    const p=_bobberLine.geometry.attributes.position;
    const tipLocal=_vTip.set(0.6,1.4,3.4).applyQuaternion(bMesh.quaternion).add(bMesh.position);
    p.setXYZ(0,tipLocal.x,tipLocal.y,tipLocal.z);
    p.setXYZ(1,_bobberMesh.position.x,_bobberMesh.position.y+0.32,_bobberMesh.position.z);
    p.needsUpdate=true;
  }
  // Underwater fish — circles the bobber during wait, spirals in during pretell, vanishes on
  // nibble (the bobber dip sells it). Position lerps so the silhouette glides smoothly.
  if(_bobberFish&&_bobberMesh){
    const elapsed=(Date.now()-_bobberFishT0)*0.001;
    if(s.phase==='nibble'){_bobberFish.visible=false}
    else{
      _bobberFish.visible=true;
      const radius=s.phase==='pretell'?0.6:1.8;  // closes in during pretell
      const a=elapsed*1.4;
      _bobberFish.position.x=_bobberMesh.position.x+Math.cos(a)*radius;
      _bobberFish.position.z=_bobberMesh.position.z+Math.sin(a)*radius;
      _bobberFish.position.y=-0.35+Math.sin(elapsed*2.2)*0.05;
      _bobberFish.rotation.y=a+Math.PI/2;
      _bobberFish.material.opacity=s.phase==='pretell'?0.65:0.4;
    }
  }
  // Idle bob — tiny vertical sine while waiting. Edge-trigger to pretell ~400ms before the F window
  // opens so the player gets a visual telegraph (per Dredge/RF4 research). Pretell wobbles + mini-dips.
  if(s.phase==='wait'){
    _bobberMesh.position.y=s.bobBase+Math.sin(t*1.8)*0.04;
    if(now>=s.pretellAt){
      s.phase='pretell';s.dipsRemaining=2;s.twitchAmp=0.15;
      const p=$('cast-prompt');if(p)p.innerHTML='👀 <b style="color:#fbcf3b">SOMETHING\'S NIBBLING</b> — wait for the dip…';
    }
  }else if(s.phase==='pretell'){
    // Lateral wobble + small dip cycle — sells the strike instead of springing it on the player.
    _bobberMesh.rotation.z=Math.sin(t*12)*s.twitchAmp;
    _bobberMesh.position.y=s.bobBase-Math.abs(Math.sin(t*9))*0.05;
    if(now>=s.nibbleAt){
      s.phase='nibble';s.nibbleEnd=now+1200;sfx('cast');sfx('ping');
      _bobberMesh.rotation.z=0;
      radio('BITE! Tap F.','self');
      const p=$('cast-prompt');if(p)p.innerHTML='⚠️ <b style="color:#ef4444">SET THE HOOK</b> — tap <b>F</b>!';
    }
  }else if(s.phase==='nibble'){
    // Bobber dips dramatically — the underline of "set the hook".
    _bobberMesh.position.y=s.bobBase-0.25-Math.abs(Math.sin(t*9))*0.15;
    if(now>=s.nibbleEnd){
      // Missed the window — fish takes the bait silently.
      radio('Bait gone. He took it clean.','lilly');
      // Consume the equipped bait as the cost of missing.
      if(equippedBait&&baitInv[equippedBait])baitInv[equippedBait]--;
      persist();const p=$('cast-prompt');if(p)p.style.display='none';
      disposeBobber();
    }
  }
}
function tryHookSet(){
  if(!_bobberState)return false;
  const s=_bobberState;const p=$('cast-prompt');if(p)p.style.display='none';
  if(s.phase==='wait'||s.phase==='pretell'){
    // Early strike — fish spooks; line comes back empty. The pretell phase is a TELEGRAPH that the
    // bite is coming, not the F window itself — bobber-twitch is a heads-up, not the prompt.
    sfx('hit');radio('Yanked too early. Spooked it.','reel');
    disposeBobber();return true;
  }
  // Nibble window — clean hook set! Bigger splash + camera punch + brief golden flash so the
  // payoff lands. The fight UI takes over after the celebration cooldown.
  sfx('cast');sfx('ping');const bp=_bobberMesh.position.clone();bp.y=0.2;
  const fish=s.fish,spot=s.spot;
  splash(bp,fish.fight>=2?30:18,fish.gator?0x9fd8b0:0xfff2c0,fish.fight>=2?1.9:1.4);wet.add(fish.fight>=2?18:14);
  _shake=Math.max(_shake,0.45);  // camera punch — bigger for big fish via the existing flashDamage path
  if(fish.fight>=2)flashDamage(0.25);  // brief vignette pop for legendaries/gators
  // Golden flash via the #grade overlay — 220ms pulse so the player sees the strike.
  const gr=$('grade');if(gr){gr.style.transition='opacity 0.22s ease-out';gr.style.opacity='0.55';setTimeout(()=>{gr.style.opacity=''},230)}
  disposeBobber();
  if(!fish.fight)landFish(fish,spot);else openFight(fish,spot);
  return true;
}
// resolveCast was removed in the R13 fishing refactor (3-stage cast→wait→nibble took over via
// startBobberWait + tryHookSet). Last legacy reference was deleted in this audit pass.
// Logs the catalog + plays the catch sting + opens the keep/release dialog.
function landFish(fish,spot){
  runCatches.push(fish);
  if(!fishCatalog.has(fish.n)){
    fishCatalog.add(fish.n);
    // First-ever landing — stamp date + spot + score for the Codex tooltip.
    if(!speciesLog[fish.n])speciesLog[fish.n]={date:new Date().toISOString().slice(0,10),spot:spot?spot.n:'Open water',score:fish.s};
    persist();
    if(fishCatalog.size>=6)onUnlock('codex_half');if(fishCatalog.size>=FISH.length)onUnlock('codex_full');
  }
  if(fish.gator)onUnlock('gator_wrangler');
  // Track the biggest fish in THIS run and flash a "NEW BEST" pill when it changes. Separate from
  // bestFish (all-time, persisted) and runCatches[] (chronological run log).
  if(!S.runBest||fish.s>(S.runBest.s||0)){S.runBest={n:fish.n,e:fish.e,r:fish.r,s:fish.s};flashRunBest(S.runBest)}
  // Persist the biggest single catch ever (by score value) — surfaced in the Codex + trophy peek.
  if(!bestFish||fish.s>(bestFish.s||0)){bestFish={n:fish.n,e:fish.e,r:fish.r,s:fish.s,date:new Date().toISOString().slice(0,10)};persist()}
  sfx(fish.r==='legendary'?'legendary':'catch');
  // Per-hero catch chatter — picks the right voice key by rarity / type so the operative reacts in
  // their own voice. Falls back to the legacy generic line if a voice key is missing.
  const v=HERO[S.bc].voice;
  const key=fish.gator?'catchGator':fish.r==='legendary'?'catchLegendary':fish.r==='rare'?'catchRare':'catchCommon';
  const heroId=HERO[S.bc].id;  // 'reel' | 'lilly' | 'fly' — matches radio who-tags
  if(v[key])radio(v[key],heroId);
  showCatchDialog(fish,spot);
}
// === FISHING FIGHT ===
// Hold REEL (button or Space) to raise tension into the green band; release to let it fall. A
// progress bar fills while tension sits in the band and drains when it's out. Fill to 100% = landed.
// Line strength vs the fish's required line sets how wide the band is + how fast tension spikes;
// rod control widens the band. If tension pegs the red max, the line snaps and the fish escapes.
function openFight(fish,spot){
  miniActive=true;S.on=false;_catchOpen=true;_catchBusy=false;
  const card=$('mini-card'),el=$('mini');if(!card||!el){landFish(fish,spot);return}
  const lineStr=eqLine().strength,control=eqRod().control;
  const deficit=Math.max(0,fish.line-lineStr);           // how under-gunned we are (0 = fine)
  const bandHalf=Math.max(0.07,(0.16+control*0.06)-deficit*0.05); // green band half-width (0..1)
  const bandCenter=0.55;
  const climb=0.011+fish.fight*0.004+deficit*0.006;       // tension rise while reeling
  const fall=0.013+fish.fight*0.002;                      // tension fall while not reeling
  const drift=deficit*0.004;                              // under-gunned line creeps toward snap
  let tension=0.3,progress=0,reeling=false,over=false;
  // Bobber-bounce: optional rhythm bonus during the regular fight. Rod tier widens the peak window:
  // base 46-54%, max +0.07 wider per side at top-tier rod control.
  const fPeakHalf=0.04+control*0.07,fPeakLo=0.5-fPeakHalf,fPeakHi=0.5+fPeakHalf;
  card.innerHTML=`
    <div class="m-kicker" style="color:${RARE_COLOR[fish.r]}">${fish.gator?'GATOR ON THE LINE':'FISH ON'} · ${spot?spot.n:'Open water'}</div>
    <div class="m-title" style="font-size:22px;display:flex;gap:10px;align-items:center">${fish.e}<span>${fish.n}</span></div>
    <div class="m-sub">${fish.gator?'It is thrashing. Keep tension in the green — too hard and the line goes.':'Work it in. Hold REEL to build tension, ease off before it snaps.'} ${deficit>0?'<b style="color:#ef4444">Your line is under-rated for this fish — band is tight.</b>':''}</div>
    <div style="margin:8px 0 4px;font:10px 'JetBrains Mono',monospace;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;display:flex;justify-content:space-between"><span>Bobber rhythm <span style="color:#94a3b8;font-size:9px">(optional · rod ${eqRod().n})</span></span><span style="color:#fbcf3b">tap <b>B</b> · streak <span id="f-streak">0</span></span></div>
    <div style="position:relative;height:18px;border-radius:6px;background:rgba(3,7,18,0.5);overflow:hidden;margin-bottom:8px">
      <div id="f-peak" style="position:absolute;top:0;bottom:0;left:${fPeakLo*100}%;width:${(fPeakHi-fPeakLo)*100}%;background:rgba(251,207,59,0.12);border-left:1px dashed rgba(251,207,59,0.5);border-right:1px dashed rgba(251,207,59,0.5)"></div>
      <div id="f-bob" style="position:absolute;top:50%;left:0;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,#fbcf3b 70%,#a06600);box-shadow:0 0 8px rgba(251,207,59,0.7)"></div>
    </div>
    <div style="position:relative;height:26px;border-radius:6px;background:linear-gradient(90deg,#10b981 0%,#10b981 70%,#f59e0b 86%,#ef4444 100%);overflow:hidden;margin:10px 0">
      <div id="f-band" style="position:absolute;top:0;bottom:0;background:rgba(255,255,255,0.22);border-left:2px solid #fff;border-right:2px solid #fff"></div>
      <div id="f-ten" style="position:absolute;top:0;bottom:0;width:3px;background:#fff;box-shadow:0 0 8px #fff"></div>
    </div>
    <div style="font:10px 'JetBrains Mono',monospace;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">Landed</div>
    <div style="height:10px;border-radius:5px;background:rgba(3,7,18,0.5);overflow:hidden;margin:4px 0 10px"><div id="f-prog" style="height:100%;width:0%;background:${RARE_COLOR[fish.r]};transition:width 0.05s"></div></div>
    <button class="btn bp" id="f-reel" style="background:linear-gradient(135deg,${RARE_COLOR[fish.r]},#0a4a3a);user-select:none">HOLD TO REEL (Space) · TAP <b>B</b> ON BOBBER PEAK</button>
    <button class="btn bx" id="f-cut">Cut Line</button>`;
  const bandEl=$('f-band'),tenEl=$('f-ten'),progEl=$('f-prog');
  const paintBand=()=>{bandEl.style.left=((bandCenter-bandHalf)*100)+'%';bandEl.style.width=(bandHalf*2*100)+'%'};
  paintBand();
  const reelBtn=$('f-reel'),fBobEl=$('f-bob'),fStreakEl=$('f-streak');
  const setReel=v=>{reeling=v;reelBtn.style.filter=v?'brightness(1.3)':'none'};
  reelBtn.onmousedown=()=>setReel(true);reelBtn.onmouseup=()=>setReel(false);reelBtn.onmouseleave=()=>setReel(false);
  reelBtn.ontouchstart=e=>{e.preventDefault();setReel(true)};reelBtn.ontouchend=e=>{e.preventDefault();setReel(false)};
  // Bobber state — phase + freq reroll on every tap so the rhythm keeps changing.
  let fBobT=0,fBobFreq=1.2+Math.random()*0.7,fBobPhase=Math.random()*Math.PI*2,fStreak=0;
  const fBobPos=()=>{const s=Math.sin(fBobT*fBobFreq+fBobPhase);return 0.5+s*0.45};
  const fInPeak=()=>{const p=fBobPos();return p>=fPeakLo&&p<=fPeakHi};
  const fTapBob=()=>{
    if(over)return;
    if(fInPeak()){
      fStreak++;progress=Math.min(100,progress+1.4+Math.min(fStreak,5)*0.3);
      sfx('ping');if(fBobEl){fBobEl.style.filter='brightness(2)';setTimeout(()=>{if(fBobEl)fBobEl.style.filter='none'},120)}
      fBobFreq=1.0+Math.random()*0.9;fBobPhase=Math.random()*Math.PI*2;
    }else{
      fStreak=0;progress=Math.max(0,progress-0.6);sfx('hit');
      fBobFreq=0.9+Math.random()*1.1;fBobPhase=Math.random()*Math.PI*2;
    }
    if(fStreakEl)fStreakEl.textContent=fStreak;
  };
  if(fBobEl){fBobEl.onclick=fTapBob;fBobEl.ontouchstart=e=>{e.preventDefault();fTapBob()}}
  const keyH=e=>{
    if(e.code==='Space'){e.preventDefault();setReel(e.type==='keydown');return}
    if(e.code==='KeyB'&&e.type==='keydown'){e.preventDefault();fTapBob()}
  };
  document.addEventListener('keydown',keyH);document.addEventListener('keyup',keyH);
  $('f-cut').onclick=()=>finishFight(false,'Cut the line. It wins this round.');
  const tick=setInterval(()=>{
    if(over)return;
    tension+=(reeling?climb:-fall)+drift;
    if(tension>=1){over=true;sfx('hit');flashDamage(0.3);finishFight(false,fish.gator?'It rolled and snapped the line clean.':'SNAP. Line gone. Should\'ve eased off.');return}
    tension=Math.max(0,tension);
    const inBand=Math.abs(tension-bandCenter)<=bandHalf;
    progress+=inBand?1.1:-0.8;progress=Math.max(0,Math.min(100,progress));
    if(inBand&&Math.random()<0.3)sfx('click');
    if(progress>=100){over=true;finishFight(true);return}
    tenEl.style.left=(tension*100)+'%';progEl.style.width=progress+'%';
    reelAudio.update(tension);
    // Bobber update — same 50ms tick.
    fBobT+=0.05;if(fBobEl)fBobEl.style.left=(fBobPos()*100)+'%';
  },50);
  const finishFight=(won,msg)=>{
    over=true;clearInterval(tick);document.removeEventListener('keydown',keyH);document.removeEventListener('keyup',keyH);
    reelAudio.stop();
    if(won){landFish(fish,spot)}
    else{miniActive=false;_catchOpen=false;const e2=$('mini');if(e2)e2.style.display='none';const c2=$('mini-card');if(c2)c2.innerHTML='';if(!(S.played&&!$('s5').classList.contains('off')))S.on=true;radio(msg,'lilly')}
  };
  // Wire teardown so endGame/Escape can't strand the interval.
  _fightCleanup=()=>{clearInterval(tick);document.removeEventListener('keydown',keyH);document.removeEventListener('keyup',keyH);reelAudio.stop()};
  el.style.display='flex';
  radio(fish.gator?'Gator! Hold the line — easy, easy.':'Fish on. Work it in.','self');
}
let _fightCleanup=null;

// === DUCT CHASE (uncatchable) ===
// Mirrors the fishing fight UI but is rigged to escape. One of five archetypes is rolled per
// attempt; each triggers at a different Landed threshold with its own animation + taunt. He can
// never be landed — the bar visibly approaches 100% then he's gone.
const DUCT_ESCAPES=[
  {k:'slip', at:0.90, line:'He SLIPPED the hook at the last second. Quaaack.'},
  {k:'dive', at:0.65, line:'Dove straight down. Surfaced way over there. Unreal.'},
  {k:'fly',  at:0.82, line:'…it grew WINGS. It flew off. We are not okay.'},
  {k:'flop', at:0.75, line:'Rubber-banded sideways and spat the bobber back at you.'},
  {k:'bounce',at:0.70,line:'The bobber bounced YOU. Tape duck wins again.'},
  // Polish v2 additions — extending the variety so each Duct encounter feels fresh.
  {k:'tape', at:0.93, line:'He duct-taped your HOOK shut. Hook is a sticky brick now.'},
  {k:'decoy',at:0.78, line:'A SECOND duck. They split off. We don\'t know which one was real.'}
];
function openDuctChase(){
  if(!DUCT.active)return;
  if(!tutorialSeen.duct&&showTutorial('duct'))return;  // first Duct encounter shows the tutorial first
  DUCT.engaged=true;const esc=DUCT_ESCAPES[Math.floor(Math.random()*DUCT_ESCAPES.length)];
  ductStats.attempts++;logDuct('attempt');persist();
  if(ductStats.attempts>=10)onUnlock('duct_ten_attempts');
  if(ductStats.attempts>=25)onUnlock('duct_25_attempts');
  const p=$('duct-prompt');if(p)p.style.display='none';
  miniActive=true;S.on=false;_catchOpen=true;_catchBusy=false;
  const card=$('mini-card'),el=$('mini');if(!card||!el){endDuct(esc,0);return}
  // Duct Tape Lure: if equipped, consume one and widen the bobber peak window. Still doesn't land him.
  const lureOn=equippedBait==='ducttape'&&(baitInv.ducttape||0)>0;
  if(lureOn){baitInv.ducttape--;persist()}
  const bandHalf=0.13,bandCenter=0.55,climb=0.015,fall=0.014;
  // Peak window is normally 46-54% (0.08 wide). Lure widens it to ~36-64% (0.28 wide) — "almost" works.
  const peakLo=lureOn?0.36:0.46,peakHi=lureOn?0.64:0.54;
  let tension=0.3,progress=0,reeling=false,over=false,peaked=0;
  card.innerHTML=`
    <div class="m-kicker" style="color:#ffd23f">??? · IMPOSSIBLE CATCH</div>
    <div class="m-title" style="font-size:22px;display:flex;gap:10px;align-items:center">🦆<span>Duct</span></div>
    <div class="m-sub">Tape on his back, smug look on his face. Reel him in — if you even can. <b style="color:#fbcf3b">Nobody ever has.</b></div>
    <div style="margin:8px 0 4px;font:10px 'JetBrains Mono',monospace;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;display:flex;justify-content:space-between"><span>Bobber rhythm${lureOn?' · <b style="color:#ffd23f">DUCT TAPE LURE</b>':''}</span><span style="color:#fbcf3b">tap <b>B</b> on the peak · streak <span id="d-streak">0</span></span></div>
    <div style="position:relative;height:22px;border-radius:6px;background:rgba(3,7,18,0.5);overflow:hidden;margin-bottom:8px">
      <div id="d-peak" style="position:absolute;top:0;bottom:0;left:${peakLo*100}%;width:${(peakHi-peakLo)*100}%;background:rgba(251,207,59,0.18);border-left:2px dashed rgba(251,207,59,0.6);border-right:2px dashed rgba(251,207,59,0.6)"></div>
      <div id="d-bob" style="position:absolute;top:50%;left:0;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,#ffd23f 70%,#b8860b);box-shadow:0 0 12px rgba(251,207,59,0.8)"></div>
    </div>
    <div style="position:relative;height:26px;border-radius:6px;background:linear-gradient(90deg,#10b981 0%,#10b981 70%,#f59e0b 86%,#ef4444 100%);overflow:hidden;margin:10px 0">
      <div id="d-band" style="position:absolute;top:0;bottom:0;background:rgba(255,255,255,0.22);border-left:2px solid #fff;border-right:2px solid #fff"></div>
      <div id="d-ten" style="position:absolute;top:0;bottom:0;width:3px;background:#fff;box-shadow:0 0 8px #fff"></div>
    </div>
    <div style="font:10px 'JetBrains Mono',monospace;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">Landed</div>
    <div style="height:10px;border-radius:5px;background:rgba(3,7,18,0.5);overflow:hidden;margin:4px 0 10px"><div id="d-prog" style="height:100%;width:0%;background:#ffd23f;transition:width 0.05s"></div></div>
    <button class="btn bp" id="d-reel" style="background:linear-gradient(135deg,#ffd23f,#b8860b);color:#1a1a2e;user-select:none">HOLD TO REEL (Space) · TAP <b>B</b> ON BOBBER PEAK</button>
    <button class="btn bx" id="d-cut">Give Up</button>`;
  const bandEl=$('d-band'),tenEl=$('d-ten'),progEl=$('d-prog'),bobEl=$('d-bob'),streakEl=$('d-streak');
  bandEl.style.left=((bandCenter-bandHalf)*100)+'%';bandEl.style.width=(bandHalf*2*100)+'%';
  const reelBtn=$('d-reel');const setReel=v=>{reeling=v;reelBtn.style.filter=v?'brightness(1.2)':'none'};
  reelBtn.onmousedown=()=>setReel(true);reelBtn.onmouseup=()=>setReel(false);reelBtn.onmouseleave=()=>setReel(false);
  reelBtn.ontouchstart=e=>{e.preventDefault();setReel(true)};reelBtn.ontouchend=e=>{e.preventDefault();setReel(false)};
  // === BOBBER-BOUNCE rhythm sub-game ===
  // A bobber dot rides a sine across the bar; the peak window is the dashed gold zone (46-54%).
  // Tap B (or click the bobber) inside the window for a progress bonus + a streak counter. Misses
  // shave progress slightly. Phase + frequency reroll on hit/miss so the rhythm is "always changing"
  // — keeps each Duct encounter feeling fresh.
  let bobT=0,bobFreq=1.2+Math.random()*0.6,bobPhase=Math.random()*Math.PI*2,streak=0;
  const bobPos=()=>{const s=Math.sin(bobT*bobFreq+bobPhase);return 0.5+s*0.45};  // 0.05..0.95
  const inPeak=()=>{const p=bobPos();return p>=peakLo&&p<=peakHi};
  const tapBobber=()=>{
    if(over)return;
    if(inPeak()){
      // Hit — small progress kick + streak. Streak amplifies subsequent kicks slightly.
      streak++;progress=Math.min(99.5,progress+1.6+Math.min(streak,6)*0.4);
      sfx('ping');bobEl.style.filter='brightness(2)';setTimeout(()=>{if(bobEl)bobEl.style.filter='none'},120);
      bobFreq=1.0+Math.random()*0.9;bobPhase=Math.random()*Math.PI*2;
    }else{
      // Miss — light penalty + streak reset.
      streak=0;progress=Math.max(0,progress-1.0);sfx('hit');
      bobFreq=0.9+Math.random()*1.1;bobPhase=Math.random()*Math.PI*2;
    }
    if(streakEl)streakEl.textContent=streak;
  };
  if(bobEl){bobEl.onclick=tapBobber;bobEl.ontouchstart=e=>{e.preventDefault();tapBobber()}}
  const keyH=e=>{
    if(e.code==='Space'){e.preventDefault();setReel(e.type==='keydown');return}
    if(e.code==='KeyB'&&e.type==='keydown'){e.preventDefault();tapBobber()}
  };
  document.addEventListener('keydown',keyH);document.addEventListener('keyup',keyH);
  $('d-cut').onclick=()=>endDuct({k:'giveup',line:'Let him go. He was never gonna let YOU win.'},progress);
  const tick=setInterval(()=>{
    if(over)return;
    tension+=reeling?climb:-fall;tension=Math.max(0,Math.min(1,tension));
    const inBand=Math.abs(tension-bandCenter)<=bandHalf;
    progress+=inBand?1.2:-0.7;progress=Math.max(0,Math.min(99.5,progress));  // capped below 100 — never landed
    peaked=Math.max(peaked,progress);
    if(inBand&&Math.random()<0.25)sfx('click');
    tenEl.style.left=(tension*100)+'%';progEl.style.width=progress+'%';
    reelAudio.update(tension);  // R14: continuous tension feedback in the Duct chase too
    // Bobber bob: 50ms tick → ~20Hz position update, freq tuned so a full oscillation is ~1s.
    bobT+=0.05;if(bobEl)bobEl.style.left=(bobPos()*100)+'%';
    // Rig the escape: once the bar reaches this archetype's threshold, he bolts.
    if(progress>=esc.at*100){over=true;sfx('quack');runDuctEscapeAnim(esc.k);endDuct(esc,peaked)}
  },50);
  const stop=()=>{over=true;clearInterval(tick);document.removeEventListener('keydown',keyH);document.removeEventListener('keyup',keyH);reelAudio.stop()};
  function endDuct(e,peakPct){
    stop();
    if(peakPct>=60){ductStats.nearCatches++;logDuct('near');onUnlock('duct_near_miss')}
    if(ductStats.nearCatches>=3)onUnlock('duct_three_near');
    // Non-persistent toast variant when the chase ended very close — uses the same queue as
    // achievements so it doesn't clobber a real unlock toast fired in the same frame.
    if(peakPct>=80)pushAchToast({n:'ALMOST',d:(peakPct|0)+'%. Closer than anyone.'});
    bait+=15;persist();
    miniActive=false;_catchOpen=false;const e2=$('mini');if(e2)e2.style.display='none';const c2=$('mini-card');if(c2)c2.innerHTML='';
    if(!(S.played&&!$('s5').classList.contains('off')))S.on=true;
    radio(e.line,'reel');
    // Duct dives/flies off and despawns shortly after the world resumes.
    setTimeout(despawnDuct,900);
  }
  _fightCleanup=()=>{stop()};
  el.style.display='flex';
  radio('Duck on the line. This is it. THIS is the one.','self');
}
// Brief world animation on the duck mesh matching the escape archetype, then he's gone.
// Self-terminating; the decoy clone (when used) disposes its own geometry+material at the end.
function runDuctEscapeAnim(kind){
  const m=DUCT.mesh;if(!m)return;
  const wp=new THREE.Vector3(DUCT.x,0,DUCT.z);splash(wp,18,0xffe27a,1.3);if(typeof wet!=='undefined'&&wet)wet.add(20);
  if(kind==='fly'){DUCT.wing.visible=true}
  // decoy: a visual-only clone of the duck mesh that splits off in the opposite direction. No AI,
  // no userData — just two THREE primitives we dispose ourselves at the end of the anim.
  let decoyMesh=null;
  if(kind==='decoy'){
    const body=new THREE.Mesh(new THREE.SphereGeometry(0.65,12,8),new THREE.MeshStandardMaterial({color:0xffd23f,emissive:0x6a4a02,emissiveIntensity:0.4,roughness:0.5}));
    decoyMesh=body;decoyMesh.position.set(DUCT.x+0.8,0,DUCT.z+0.4);scene.add(decoyMesh);
  }
  let s=0;const a=setInterval(()=>{
    s+=0.05;
    if(s>=1||!m){
      clearInterval(a);
      if(decoyMesh){scene.remove(decoyMesh);if(decoyMesh.geometry)decoyMesh.geometry.dispose();if(decoyMesh.material)decoyMesh.material.dispose();decoyMesh=null}
      return;
    }
    if(kind==='dive'){m.position.y=-s*3;DUCT.x+=1.2;DUCT.z+=0.6}
    else if(kind==='fly'){m.position.y=s*9;m.rotation.y+=0.3}
    else if(kind==='slip'){m.position.y=-s*2;m.rotation.y+=0.4}
    else if(kind==='flop'){m.position.x=DUCT.x+Math.sin(s*20)*2}
    else if(kind==='tape'){m.rotation.z=s*0.6;m.position.y=Math.sin(s*Math.PI)*0.3;
      // m is a Group (no .material). Drive the body Mesh emissive directly so the "tape over the
      // hook, going dark" visual actually fires. children[0] = body sphere by construction in mkDuct.
      const body=m.children&&m.children[0];if(body&&body.material)body.material.emissiveIntensity=0.4*(1-s);
    }
    else if(kind==='decoy'){m.position.x=DUCT.x-s*4;m.position.y=Math.sin(s*Math.PI)*1.5;if(decoyMesh){decoyMesh.position.x=DUCT.x+0.8+s*4;decoyMesh.position.y=Math.sin(s*Math.PI)*1.5;decoyMesh.rotation.y=s*2}}
    else{m.position.y=Math.sin(s*Math.PI)*2;DUCT.x-=1.0}
  },30);
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
  if(_fightCleanup){_fightCleanup();_fightCleanup=null}  // kill any live fight interval/listeners
  // Forage games run through the _catchOpen path, so Escape lands here — drain their timers too.
  mini._teardowns.splice(0).forEach(fn=>{try{fn()}catch(e){}});
  const el=$('mini'),card=$('mini-card');
  if(card)card.innerHTML='';if(el)el.style.display='none';
  // Reset _catchBusy so a later _catchOpen overlay (e.g. forage after a fight) can be Escaped too.
  miniActive=false;_catchOpen=false;_catchBusy=false;
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
  const spec={cast:[300,520,.12,'sine'],catch:[440,760,.16,'triangle'],ping:[680,1150,.14,'sine'],rescue:[460,720,.18,'triangle'],win:[520,880,.22,'triangle'],hit:[150,60,.18,'square'],click:[300,360,.05,'square'],legendary:[300,1400,.5,'sawtooth'],quack:[620,300,.16,'square'],dig:[160,90,.07,'square'],croak:[110,70,.16,'sawtooth'],swat:[400,120,.06,'square'],net:[300,500,.1,'sine'],splash_big:[200,60,.22,'sine']}[type]||[300,360,.08,'sine'];
  const o=ctx.createOscillator(),g=ctx.createGain();o.type=spec[3];
  o.frequency.setValueAtTime(spec[0],now);o.frequency.exponentialRampToValueAtTime(Math.max(30,spec[1]),now+spec[2]);
  const peak=Math.max(0.0001,0.06*_audVol*_sfxVol);
  g.gain.setValueAtTime(0.0001,now);g.gain.linearRampToValueAtTime(peak,now+0.01);g.gain.exponentialRampToValueAtTime(0.0001,now+spec[2]);
  o.connect(g);g.connect(ctx.destination);o.start(now);o.stop(now+spec[2]+0.03);
}
// Shared kill-switch for every continuous audio source. Called from mute toggle, photo mode camera
// branch, endGame, reset, and the visibility-stash. Any new audio bus added later only needs to
// add one .stop() call here rather than touching 5 sites.
function stopAllAudio(){engineAudio.stop();stormAudio.stop();campAudio.stopAll();music.stop();reelAudio.stop()}
// Centralized run-flag reset. Owns every "is some system mid-fight / mid-cutscene" flag so the
// next system that adds one gets a single edit here instead of N (the auditor's "most concerning
// trend"). Called from startGame; safe to call from endGame too for belt-and-braces cleanup.
function resetRunFlags(){
  _bossActive=false;_gkActive=false;_castInFlight=false;
  S.bossSpawned=false;S.gatorKingSpawned=false;S.gatorKingDown=false;
}
function toggleMute(){muted=!muted;persist();const b=$('mute-btn');if(b)b.textContent=muted?'🔇 Sound Off':'🔊 Sound On';if(muted)stopAllAudio();else sfx('click')}

// === CONTINUOUS ENGINE + AMBIENT AUDIO ===
// A throaty motor whose pitch + volume track boat speed, plus a constant low water-lap bed. Built
// lazily on top of the shared AudioContext (after the user's first gesture) and driven each frame
// from loop(). Oscillators can't restart, so stop() just ducks the gain to silence.
const engineAudio={on:false,osc:null,sub:null,gain:null,lapGain:null,
  ensure(){
    if(this.on||muted)return;
    try{if(!_audioCtx)_audioCtx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return}
    const ctx=_audioCtx;
    // Motor: a sawtooth + detuned square through a lowpass for a low, throaty idle.
    this.gain=ctx.createGain();this.gain.gain.value=0;this.gain.connect(ctx.destination);
    const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=460;lp.connect(this.gain);
    this.osc=ctx.createOscillator();this.osc.type='sawtooth';this.osc.frequency.value=58;this.osc.connect(lp);
    this.sub=ctx.createOscillator();this.sub.type='square';this.sub.frequency.value=38;this.sub.detune.value=-10;this.sub.connect(lp);
    this.osc.start();this.sub.start();
    // Ambient water lap: a looping noise buffer through a bandpass at a whisper-low gain.
    const buf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*0.5;
    const lap=ctx.createBufferSource();lap.buffer=buf;lap.loop=true;
    const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=620;bp.Q.value=0.6;
    this.lapGain=ctx.createGain();this.lapGain.gain.value=0.012*_audVol*_ambientVol;
    lap.connect(bp);bp.connect(this.lapGain);this.lapGain.connect(ctx.destination);lap.start();
    this.on=true;
  },
  update(spd){
    if(muted)return;if(!this.on)this.ensure();if(!this.on)return;
    const now=_audioCtx.currentTime,a=Math.abs(spd);
    this.osc.frequency.setTargetAtTime(56+a*150,now,0.08);
    this.sub.frequency.setTargetAtTime(36+a*70,now,0.08);
    this.gain.gain.setTargetAtTime((a>0.02?0.05+a*0.06:0.012)*_audVol*_engineVol,now,0.1);
    this.lapGain.gain.setTargetAtTime((0.012+a*0.02)*_audVol*_ambientVol,now,0.2);
  },
  stop(){if(this.on&&_audioCtx){const now=_audioCtx.currentTime;this.gain.gain.setTargetAtTime(0,now,0.15);this.lapGain.gain.setTargetAtTime(0,now,0.2)}}
};
// Storm ambience — a low-pass-filtered noise loop that fades up in rain and down when it clears.
// Adds depth without competing with the motor or lap. Built lazily, mute-gated, idempotent.
const stormAudio={on:false,gain:null,src:null,
  ensure(){
    if(this.on||muted)return;
    try{if(!_audioCtx)_audioCtx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return}
    const ctx=_audioCtx;
    const buf=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*0.55;
    const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;
    const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=180;lp.Q.value=0.7;
    this.gain=ctx.createGain();this.gain.gain.value=0;
    src.connect(lp);lp.connect(this.gain);this.gain.connect(ctx.destination);src.start();
    this.src=src;this.on=true;
  },
  update(){
    if(muted)return;
    const raining=S.wx&&(S.wx.c==='Rain'||S.wx.c==='Drizzle');
    if(raining&&!this.on)this.ensure();
    if(!this.on)return;
    const target=raining?0.045*_audVol*_ambientVol:0;
    this.gain.gain.setTargetAtTime(target,_audioCtx.currentTime,0.5);
  },
  stop(){if(this.on&&_audioCtx)this.gain.gain.setTargetAtTime(0,_audioCtx.currentTime,0.2)}
};
// === REEL-WHINE ===
// Continuous oscillator that runs only during a fishing fight. Frequency + gain track tension
// (0=slack, 1=snap) so the player hears the line sing. Mirrors stormAudio's lazy-build pattern;
// must be stopped in all 3 fight exits (won/lost/Escape via _fightCleanup). Routes through the
// SFX bus (_audVol * _sfxVol) since it's a foreground fight cue, not ambient.
let _creakLast=0;  // throttle for the line-creak warning sfx near snap
const reelAudio={on:false,osc:null,gain:null,filt:null,
  ensure(){
    if(this.on||muted)return;
    try{if(!_audioCtx)_audioCtx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return}
    const ctx=_audioCtx;
    this.gain=ctx.createGain();this.gain.gain.value=0;
    this.filt=ctx.createBiquadFilter();this.filt.type='lowpass';this.filt.frequency.value=1400;this.filt.Q.value=0.7;
    this.filt.connect(this.gain);this.gain.connect(ctx.destination);
    this.osc=ctx.createOscillator();this.osc.type='sawtooth';this.osc.frequency.value=220;
    this.osc.connect(this.filt);this.osc.start();
    this.on=true;
  },
  update(tension){
    if(muted||_tabHidden){this.stop();return}
    if(!Number.isFinite(tension))return;  // setTargetAtTime rejects non-finite values
    if(!this.on)this.ensure();
    if(!this.on)return;
    const now=_audioCtx.currentTime,clamped=Math.max(0,Math.min(1,tension));
    this.osc.frequency.setTargetAtTime(220+clamped*660,now,0.05);
    this.gain.gain.setTargetAtTime((0.02+clamped*0.07)*_audVol*_sfxVol,now,0.05);
    // Sharp creak when the line is at risk of snapping — rate-limited so it pulses, doesn't whine.
    if(clamped>=0.85){const t=Date.now()*0.001;if(t-_creakLast>0.85){_creakLast=t;sfx('hit')}}
  },
  stop(){if(this.on&&_audioCtx){this.gain.gain.setTargetAtTime(0,_audioCtx.currentTime,0.08);_creakLast=0}}
};
// === CATALYST EVENT TICKER ===
// Sea-of-Thieves-style "story seed" punctuation. Every 60-120s, low-probability roll fires one of
// three audio-only events (gator splash, distant barge horn, waterbird flush). Guards against
// firing while the player is in any menu/fight/Duct so we never step on a foreground cue.
const CATALYST_LINES={
  gator:[['Big roll on the south bank.','lilly'],['Tail slap. Out there.','lilly']],
  horn: [['Barge horn. Quarantine traffic.','fly'],['Big boat passing through.','fly']],
  bird: [['Heron at the marsh.','self'],['Something flushed off the shore.','self']]
};
const catalyst={lastTick:Date.now()*0.001,nextRand:0,
  maybe(t){
    if(!S.on||GAME_MODE!=='game'||miniActive||_catchOpen||_peekOpen||DUCT.active||_castInFlight||_bobberState)return;
    if(t-this.lastTick<60+this.nextRand)return;
    if(Math.random()>0.012)return;  // rate-limited roll: ~once per 60-120s window
    const kinds=['gator','horn','bird'];this.fire(kinds[Math.floor(Math.random()*kinds.length)]);
  },
  fire(kind){
    this.lastTick=Date.now()*0.001;this.nextRand=Math.random()*60;
    const pickPair=arr=>arr[Math.floor(Math.random()*arr.length)];
    if(kind==='gator'){
      sfx('splash_big');
      // Pick a random spot 50-90u from the boat for the splash so it reads as off-screen.
      const ang=Math.random()*Math.PI*2,d=50+Math.random()*40;
      const sp=new THREE.Vector3(bMesh.position.x+Math.cos(ang)*d,0.2,bMesh.position.z+Math.sin(ang)*d);
      splash(sp,14,0x9fd8b0,1.2);
    }else if(kind==='horn'){
      sfx('catch');setTimeout(()=>sfx('hit'),140);
    }else{
      sfx('quack');  // reuse — high oscillator chirp doubles as a waterbird call
    }
    const [line,who]=pickPair(CATALYST_LINES[kind]);radio(line,who);
    return true;
  }
};
// === MUSIC ===
// One soft ambient drone built from three detuned triangle oscillators (root + fifth + octave).
// A slow LFO sweeps a lowpass filter so the texture breathes. Filter centre dips in foul weather
// for a warmer-but-muffled feel; brightens on Clear. Mute + master + bus volume all gate it.
// Three music modes — same 3 oscillators, retargeting frequency on context switch.
//   explore : A minor (A2/E3/A3 → 110/165/220) — default open-water drone.
//   chase   : C minor (C3/G3/Eb4 → 130/196/311) — fires on Duct/boss/Gator King start. Faster LFO.
//   golden  : F major9 (F2/A3/E4  →  87/220/330) — fires during golden-hour flash. Warmer.
const MUSIC_MODES={
  explore:{freqs:[110,165,220],lfo:0.07,detune:[-5,3,-2],filtHi:1100,filtLo:550},
  chase:  {freqs:[130,196,311],lfo:0.18,detune:[-8,5,-3], filtHi:1450,filtLo:700},
  golden: {freqs:[87,220,330], lfo:0.04,detune:[-3,2,-1], filtHi:1300,filtLo:600}
};
const music={on:false,osc:[],gain:null,filt:null,lfo:null,mode:'explore',
  ensure(){
    if(this.on||muted)return;
    try{if(!_audioCtx)_audioCtx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return}
    const ctx=_audioCtx;
    this.gain=ctx.createGain();this.gain.gain.value=0;
    this.filt=ctx.createBiquadFilter();this.filt.type='lowpass';this.filt.frequency.value=900;this.filt.Q.value=0.4;
    this.filt.connect(this.gain);this.gain.connect(ctx.destination);
    const m=MUSIC_MODES[this.mode];
    // Slow LFO on the filter cutoff so the pad shimmers rather than sitting flat.
    this.lfo=ctx.createOscillator();this.lfo.frequency.value=m.lfo;
    const lfoGain=ctx.createGain();lfoGain.gain.value=180;
    this.lfo.connect(lfoGain);lfoGain.connect(this.filt.frequency);this.lfo.start();
    // Three pad voices retuned per mode + detuned for warmth.
    m.freqs.forEach((f,i)=>{
      const o=ctx.createOscillator();o.type='triangle';o.frequency.value=f;o.detune.value=m.detune[i]||0;
      const g=ctx.createGain();g.gain.value=0.33;
      o.connect(g);g.connect(this.filt);o.start();this.osc.push(o);
    });
    this.on=true;
  },
  setMode(name){
    if(!MUSIC_MODES[name]||this.mode===name)return;
    this.mode=name;
    if(!this.on||!_audioCtx)return;
    const now=_audioCtx.currentTime,m=MUSIC_MODES[name];
    // Glide the existing oscillators to the new chord — no restart, no click.
    this.osc.forEach((o,i)=>{o.frequency.setTargetAtTime(m.freqs[i]||110,now,0.4);o.detune.setTargetAtTime(m.detune[i]||0,now,0.4)});
    if(this.lfo)this.lfo.frequency.setTargetAtTime(m.lfo,now,0.4);
  },
  update(){
    if(muted){this.stop();return}
    if(!this.on)this.ensure();
    if(!this.on)return;
    const now=_audioCtx.currentTime;
    // Auto-pick the chase mode whenever a Duct chase / boss / Gator King fight is live.
    if((DUCT&&DUCT.engaged)||_bossActive||_gkActive)this.setMode('chase');
    else if(_goldenFlashUntil&&Date.now()<_goldenFlashUntil)this.setMode('golden');
    else this.setMode('explore');
    // Music ducks slightly in heavy weather + when a fight overlay is up so it doesn't compete.
    const fightDuck=_catchOpen||miniActive?0.35:1;
    const target=0.035*_audVol*_musicVol*fightDuck;
    this.gain.gain.setTargetAtTime(target,now,1.5);
    // Foul-weather filter dip — warm, muffled.
    const m=MUSIC_MODES[this.mode];
    const muffle=S.wx&&(S.wx.c==='Rain'||S.wx.c==='Drizzle'||S.wx.c==='Overcast')?m.filtLo:m.filtHi;
    this.filt.frequency.setTargetAtTime(muffle,now,2.5);
  },
  stop(){if(this.on&&_audioCtx)this.gain.gain.setTargetAtTime(0,_audioCtx.currentTime,0.6)}
};
// === PER-CAMP AMBIENT AUDIO ===
// Each shore camp has a flavor sound that fades up as the player approaches and out as they leave.
// Lazily built on the shared AudioContext; one channel per camp id. All channels share the master
// _audVol and the mute flag. Stopped on photo/end/reset/mute.
const campAudio={chans:{},
  // Build a one-off looping noise source through a per-camp filter — cheap and matches the existing
  // engineAudio/stormAudio pattern (no asset loading).
  _build(id){
    if(!_audioCtx)return null;
    const ctx=_audioCtx;
    const buf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1);
    const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;
    const filt=ctx.createBiquadFilter(),gain=ctx.createGain();gain.gain.value=0;
    // Per-camp filter character — picks the texture (low rumble vs high gurgle vs band-pass croak).
    if(id==='west_marsh'){filt.type='bandpass';filt.frequency.value=420;filt.Q.value=2.5}        // frog-pond croak band
    else if(id==='north_creek'){filt.type='highpass';filt.frequency.value=1100;filt.Q.value=0.5}  // creek trickle
    else if(id==='east_rocks'){filt.type='bandpass';filt.frequency.value=240;filt.Q.value=0.7}    // crayfish hole bubbles
    else{filt.type='bandpass';filt.frequency.value=900;filt.Q.value=0.8}                          // worm beds — crickets-ish
    src.connect(filt);filt.connect(gain);gain.connect(ctx.destination);src.start();
    return {src,gain,filt};
  },
  ensure(id){
    if(this.chans[id]||muted)return;
    try{if(!_audioCtx)_audioCtx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return}
    const c=this._build(id);if(c)this.chans[id]=c;
  },
  // Drive the gains every frame: closest camp within 50u rolls in, all others roll out.
  update(){
    if(muted){this.stopAll();return}
    if(!_audioCtx)return;
    let nearestId=null,nearestD=Infinity;
    for(const m of campMeshes){const d=bMesh.position.distanceTo(m.position);if(d<50&&d<nearestD){nearestD=d;nearestId=m.userData.camp.id}}
    const now=_audioCtx.currentTime;
    for(const id in this.chans){
      const target=(id===nearestId)?Math.max(0,(50-nearestD)/50)*0.04*_audVol*_ambientVol:0;
      this.chans[id].gain.gain.setTargetAtTime(target,now,0.6);
    }
    if(nearestId&&!this.chans[nearestId])this.ensure(nearestId);
  },
  stopAll(){if(!_audioCtx)return;const now=_audioCtx.currentTime;for(const id in this.chans)this.chans[id].gain.gain.setTargetAtTime(0,now,0.2)}
};
// Screen-shake magnitude — bumped by surge/damage, decays each frame in the camera follow.
let _shake=0;

// === WET-SCREEN DROPLET OVERLAY ===
// Full-screen canvas2D layer above the WebGL scene, below the HUD. Droplets bead, drag down with a
// streak, and fade. Disabled on Low graphics. Triggered from splash/surge/turn/rain/Duct events.
// R19 — Droplet refresh. The old beads read flat (uniform circle + a single highlight pixel) and
// blew into harsh shapes mid-streak. Now: every drop is a vertical ellipse (surface tension pulls
// taller-than-wide), the bead has a dark rim + a soft body + a sharp specular highlight, and the
// trailing streak narrows to a tapered tail with a faint white center line. Reads like glass.
const wet={cv:null,ctx:null,drops:[],enabled:true,
  init(){this.cv=$('wet-cv');if(!this.cv)return;this.ctx=this.cv.getContext('2d');this.resize();window.addEventListener('resize',()=>this.resize())},
  resize(){if(!this.cv)return;this.cv.width=innerWidth;this.cv.height=innerHeight},
  add(n){if(!this.enabled||!this.cv)return;for(let i=0;i<n&&this.drops.length<90;i++){const r=2+Math.random()*6;this.drops.push({x:Math.random()*this.cv.width,y:Math.random()*this.cv.height*0.8,r,life:1,vy:0.2+Math.random()*0.6,streak:Math.random()<0.4?r*(4+Math.random()*8):0,jx:(Math.random()-0.5)*0.4})}},
  tick(){if(!this.ctx||!this.cv)return;const c=this.ctx;c.clearRect(0,0,this.cv.width,this.cv.height);
    for(let i=this.drops.length-1;i>=0;i--){const d=this.drops[i];d.life-=0.006;d.y+=d.vy;d.vy+=0.03;d.x+=d.jx;d.jx*=0.96;if(d.streak)d.streak*=0.985;
      if(d.life<=0){this.drops.splice(i,1);continue}
      const a=d.life;                   // base alpha drive
      const rx=d.r*0.82,ry=d.r*1.08;    // surface-tension squish: taller than wide
      // Streak — tapered (narrower at the trailing tail). Two-pass: faint outer + a brighter
      // 1px center line so the trail reads as moving water, not a flat block.
      if(d.streak){
        const sl=d.streak;
        c.save();c.translate(d.x,d.y);
        // outer trail
        const g1=c.createLinearGradient(0,-sl,0,0);
        g1.addColorStop(0,'rgba(190,220,235,0)');
        g1.addColorStop(1,'rgba(170,205,225,'+(a*0.32)+')');
        c.fillStyle=g1;
        c.beginPath();c.moveTo(-rx*0.18,-sl);c.lineTo(rx*0.18,-sl);c.lineTo(rx*0.45,0);c.lineTo(-rx*0.45,0);c.closePath();c.fill();
        // center sheen
        c.fillStyle='rgba(255,255,255,'+(a*0.28)+')';c.fillRect(-0.5,-sl,1,sl);
        c.restore();
      }
      // Bead — radial gradient. Dark rim (water absorbs light at the contact ring), cooler body,
      // soft cyan center. Sharp specular highlight up-left fakes the photographer lamp.
      c.save();c.translate(d.x,d.y);c.scale(rx,ry);
      const g2=c.createRadialGradient(-0.25,-0.25,0,0,0,1);
      g2.addColorStop(0,'rgba(220,235,245,'+(a*0.55)+')');
      g2.addColorStop(0.55,'rgba(150,190,215,'+(a*0.45)+')');
      g2.addColorStop(0.9,'rgba(75,110,140,'+(a*0.55)+')');
      g2.addColorStop(1,'rgba(40,70,100,'+(a*0.7)+')');
      c.fillStyle=g2;c.beginPath();c.arc(0,0,1,0,Math.PI*2);c.fill();
      c.restore();
      // Crisp specular pip — kept in pixel space (not scaled by the ellipse) for a hard edge.
      c.beginPath();c.arc(d.x-d.r*0.32,d.y-d.r*0.38,d.r*0.22,0,Math.PI*2);
      c.fillStyle='rgba(255,255,255,'+(a*0.85)+')';c.fill();
      // Second tiny pip below the main highlight — subsurface scatter cue.
      c.beginPath();c.arc(d.x+d.r*0.18,d.y+d.r*0.42,d.r*0.12,0,Math.PI*2);
      c.fillStyle='rgba(255,255,255,'+(a*0.35)+')';c.fill();
    }
  }
};
// === LIGHTNING ===
// Random thunderbolts during Rain/Drizzle. Brief white screen-flash + a delayed thunder cue. If
// the player is moving fast at the moment of strike, they take hull damage + a strong shake +
// 'storm_survivor' achievement. Strikes are rate-limited so they punctuate, not spam.
const storm={lastStrike:0,minGap:8,nextRand:5,
  maybe(t){
    if(!S.on)return;
    if(!(S.wx&&(S.wx.c==='Rain'||S.wx.c==='Drizzle')))return;
    if(t-this.lastStrike<this.minGap+this.nextRand)return;
    // ~3% chance per frame (rate-gated above) — translates to ~one strike every 12-18s during rain.
    if(Math.random()>0.03)return;
    this.strike();
  },
  strike(){
    this.lastStrike=Date.now()*0.001;this.nextRand=4+Math.random()*8;
    // White flash: bump dmg-flash with a cool tint, then fade. Reuse the existing element.
    const el=$('dmg-flash');if(el){const prev=el.style.background;el.style.background='radial-gradient(circle at center,rgba(255,255,255,0.5) 0%,rgba(160,200,255,0.55) 60%,rgba(80,120,200,0.5) 100%)';el.style.opacity='0.85';clearTimeout(this._t1);this._t1=setTimeout(()=>{el.style.opacity='0';clearTimeout(this._t2);this._t2=setTimeout(()=>{el.style.background=prev||''},500)},90)}
    _shake=Math.max(_shake,0.5);wet.add(20);
    // Damage if the player is moving fast — rewards staying slow during a storm.
    if(Math.abs(spd)>0.7){
      const dmg=Math.round((1-hullResist())*10);
      S.hull=Math.max(0,S.hull-dmg);
      flashDamage(0.5);onUnlock('storm_survivor');
      radio('LIGHTNING. Slow it down out there.','fly');
    }else{
      radio('Lightning. Glad we eased off.','lilly');
    }
    // Delayed thunder cue via two sfx pops to fake a roll.
    setTimeout(()=>sfx('splash_big'),180);
    setTimeout(()=>sfx('hit'),420);
  }
};
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
  codex_half:{n:'Field Naturalist',d:'Logged 6 species in the Fish Codex.',p:()=>({cur:Math.min(fishCatalog.size,6),max:6})},
  codex_full:{n:'Castor Compendium',d:'Logged all 12 species.',p:()=>({cur:Math.min(fishCatalog.size,FISH.length),max:FISH.length})},
  bait_baron:{n:'Bait Baron',d:'Banked 500 bait at once.',p:()=>({cur:Math.min(bait,500),max:500})},
  duct_sighting:{n:'Tape on the Water',d:'Spotted Duct the rubber ducky.'},
  duct_near_miss:{n:'So Close',d:'Got Duct past 60% before he escaped.'},
  duct_ten_attempts:{n:'Obsessed',d:'Tried to land Duct 10 times. You will not.',p:()=>({cur:Math.min(ductStats.attempts||0,10),max:10})},
  first_forage:{n:'Off the Boat',d:'Foraged your first bait.'},
  worm_farmer:{n:'Worm Farmer',d:'Banked 50 worms.',p:()=>({cur:Math.min(baitInv.worm||0,50),max:50})},
  pantry_stocked:{n:'Pantry Stocked',d:'Every bait type at 5 or more.',p:()=>{const types=['worm','cricket','frog','minnow','crayfish'];return {cur:types.filter(t=>(baitInv[t]||0)>=5).length,max:types.length}}},
  first_upgrade:{n:'Wrench In Hand',d:'Bought your first boat upgrade.'},
  boat_maxed:{n:'Tuned Up',d:'Maxed every upgrade slot on a hero boat.'},
  first_gear:{n:'Outfitted',d:'Bought your first piece of gear.'},
  fully_decked:{n:'Fully Decked',d:'Maxed every gear slot.'},
  gator_wrangler:{n:'Gator Wrangler',d:'Landed a thrashing gator.'},
  // Polish v2 — Duct + boss tightening.
  duct_25_attempts:{n:'Tape Faithful',d:'25 attempts on Duct. Still not him.',p:()=>({cur:Math.min(ductStats.attempts||0,25),max:25})},
  duct_three_near:{n:'Almost A Story',d:'Three near-catches on Duct.',p:()=>({cur:Math.min(ductStats.nearCatches||0,3),max:3})},
  boss_clean:{n:'Surgical',d:'Beat the Deep Dock without dropping below 50% hull.'},
  duct_lure_crafted:{n:'Recipe From The Pier',d:'Crafted your first Duct Tape Lure.'},
  gator_king:{n:'Crowned',d:'Took the Gator King at East Rocks.'},
  storm_survivor:{n:'Sky Falls',d:'Survived a lightning strike at speed.'},
  first_craft:{n:'Tackle Bench',d:'Crafted a custom bait at the pier.'},
  streak_7: {n:'Week At The Bayou',  d:'7-day login streak.',  p:()=>({cur:Math.min(streak.count||0,7), max:7})},
  streak_30:{n:'Month At The Bayou', d:'30-day login streak.', p:()=>({cur:Math.min(streak.count||0,30),max:30})}
};
// Tiny queue around the existing toast so rapid back-to-back unlocks don't clobber each other.
// We DON'T touch showAchToast — it keeps its own clearTimeout pattern. The queue just gates calls
// to it on a separate one-shot timer so the next one fires AFTER the current toast's full life.
const TOAST_LIFE=4200;  // matches showAchToast (3800ms visible + 400ms fade)
let _achQ=[],_achBusy=false,_achDrainT=null;
function _drainAch(){
  _achBusy=false;_achDrainT=null;
  const next=_achQ.shift();
  if(next){_achBusy=true;showAchToast(next);_achDrainT=setTimeout(_drainAch,TOAST_LIFE)}
}
function pushAchToast(a){
  if(_achBusy){_achQ.push(a);return}
  _achBusy=true;showAchToast(a);_achDrainT=setTimeout(_drainAch,TOAST_LIFE);
}
function onUnlock(id){
  if(!ACH[id]||achievements.has(id))return;
  achievements.add(id);persist();pushAchToast(ACH[id]);sfx('win');
}
// Top-center "NEW BEST" pill — fires when S.runBest is replaced. Non-blocking, mute-friendly.
function flashRunBest(f){
  const pill=$('run-best');if(!pill)return;
  const rcol=({legendary:'#ffd23f',rare:'#a78bfa',uncommon:'#3b82f6',common:'#10b981'})[f.r]||'#fb923c';
  pill.style.borderColor=rcol;pill.style.color=rcol;
  pill.innerHTML=`<span style="font-size:10px;letter-spacing:2px;color:#fbcf3b">NEW BEST</span> &nbsp; ${f.e} <b>${f.n}</b> <span style="color:#fde68a">+${f.s}</span>`;
  pill.style.display='block';pill.style.opacity='1';
  clearTimeout(flashRunBest._t);flashRunBest._t=setTimeout(()=>{pill.style.opacity='0';setTimeout(()=>{if(pill.style.opacity==='0')pill.style.display='none'},400)},2800);
}
function showAchToast(a){
  const t=$('ach-toast');if(!t)return;
  t.innerHTML=`<div style="font:700 9px 'JetBrains Mono',monospace;letter-spacing:1.5px;color:#fbcf3b">ACHIEVEMENT</div><div style="font:700 14px 'DM Sans',sans-serif;margin-top:2px">${a.n}</div><div style="font-size:11px;color:#94a3b8;margin-top:2px">${a.d}</div><div style="font-size:9px;color:#475569;margin-top:4px;letter-spacing:1px">tap to dismiss</div>`;
  t.style.display='block';t.style.opacity='1';t.style.cursor='pointer';t.style.pointerEvents='auto';
  const dismiss=()=>{t.style.opacity='0';setTimeout(()=>{if(t.style.opacity==='0'){t.style.display='none';t.style.pointerEvents='none'}},400)};
  t.onclick=()=>{clearTimeout(showAchToast._t);dismiss();if(_achDrainT){clearTimeout(_achDrainT);_achDrainT=setTimeout(_drainAch,400)}};
  clearTimeout(showAchToast._t);showAchToast._t=setTimeout(dismiss,3800);
}
// === ONE-TIME TUTORIAL OVERLAY ===
// Shown the first time a player encounters a key system (cast / Duct chase). Dismissible, persists
// the seen flag so it never reappears. Reuses the #mini overlay (transparent backdrop) for layout.
const TUTORIALS={
  cast:{title:'How to Fish',body:'Press <b style="color:#fbcf3b">F</b> when you\'re stopped to cast. During the fight, <b style="color:#fbcf3b">hold SPACE</b> to reel — keep the tension cursor in the green band. Tap <b style="color:#fbcf3b">B</b> on the gold bobber peak for a bonus.'},
  duct:{title:'Duct in Sight',body:'Press <b style="color:#fbcf3b">F</b> to engage Duct. He\'s <b style="color:#fbcf3b">never been caught</b>. Get as close as you can — the bobber rhythm + a <b style="color:#ffd23f">Duct Tape Lure</b> from the tackle bench widen your peak window.'},
  forage:{title:'Foraging',body:'Beach the boat at a shore camp (press <b style="color:#fbcf3b">G</b> when slow + close). Each camp has 1-2 mini-games for bait. Stock the pantry to equip + bias your catch rolls.'},
  boatworks:{title:'Castor Boatworks',body:'Spend bait on visible upgrades — <b style="color:#fb923c">Engine</b> (speed), <b style="color:#60d0ff">Lights</b> (range), <b style="color:#94a3b8">Armor</b> (resist), <b style="color:#a78bfa">Electronics</b> (sonar). Each slot has 3 tiers; you can only buy the next step. Upgrades are per-hero and visible on the boat. Look for the <b style="color:#fbcf3b">BEST VALUE</b> badge for the cheapest next step.'}
};
function showTutorial(kind){
  if(tutorialSeen[kind])return false;
  const t=TUTORIALS[kind];if(!t)return false;
  tutorialSeen[kind]=true;persist();
  const card=$('mini-card'),el=$('mini');if(!card||!el)return false;
  miniActive=true;_peekOpen=true;S.on=false;
  card.innerHTML=`<div class="m-kicker" style="color:#fb923c">First Time · ${t.title}</div>
    <div class="m-title">${t.title}</div>
    <div class="m-sub" style="line-height:1.6;color:#cbd5e1">${t.body}</div>
    <div style="margin-top:10px;font:10px 'JetBrains Mono',monospace;color:#64748b;letter-spacing:1px;text-transform:uppercase">Settings · Controls tab has the full keymap</div>
    <button class="btn bp" onclick="DS.closePeek()" style="margin-top:14px;background:linear-gradient(135deg,#fb923c,#9a3a10)">Got it</button>`;
  el.style.display='flex';
  return true;
}

// === HULL-DAMAGE VISUAL FEEDBACK ===
// Brief red vignette pulse — drained on a short timer so rapid hits stack into a sustained flash
// instead of a strobe. Intensity 0..1.
let _dmgFade=null;
function flashDamage(intensity){
  const el=$('dmg-flash');if(!el)return;
  el.style.opacity=Math.min(0.85,intensity).toFixed(2);
  _shake=Math.max(_shake,0.35+intensity*0.5);  // impacts kick the camera proportional to the hit
  clearTimeout(_dmgFade);_dmgFade=setTimeout(()=>{el.style.opacity='0'},220);
}

// R19 — Marina stat cards. Each preview boat gets an HTML card anchored to its screen-projected
// position. Cards show name + role + speed/handling/stability bars + the hero ability. Clicking
// a card calls boat(cls). Cards auto-hide once s1 is dismissed.
const _vPrev=new THREE.Vector3();
const MARINA_CARD={
  regular:  {name:'THE REEL',     role:'Frontline',   spd:70,hnd:75,stb:65,kit:'Rescue +25% bait',col:'#fca5a5'},
  pontoon:  {name:'LILLY LOCH',   role:'Steady Hand', spd:55,hnd:60,stb:95,kit:'+10% damage resist',col:'#f9a8d4'},
  speedboat:{name:'THE FLY',      role:'Stealth',     spd:98,hnd:90,stb:30,kit:'Sonar 2s + 5% speed', col:'#93c5fd'}
};
function updateMarinaCards(){
  if(!$('s1')||$('s1').classList.contains('off')){
    ['regular','pontoon','speedboat'].forEach(cls=>{const el=document.getElementById('marina-card-'+cls);if(el)el.style.display='none'});
    const tip=document.getElementById('marina-tip');if(tip)tip.style.display='none';
    return;
  }
  // Marina tip ribbon — one-time appended; the CSS class handles styling.
  let tip=document.getElementById('marina-tip');
  if(!tip&&GAME_MODE==='game'){
    tip=document.createElement('div');tip.id='marina-tip';tip.className='marina-tip';
    tip.textContent='Walk the dock · Click a boat to take it out';
    document.body.appendChild(tip);
  }
  if(tip)tip.style.display='block';
  ['regular','pontoon','speedboat'].forEach(cls=>{
    const m=previewBoats[cls];if(!m)return;
    let el=document.getElementById('marina-card-'+cls);
    if(!el){
      const d=MARINA_CARD[cls];
      el=document.createElement('div');el.id='marina-card-'+cls;
      el.style.cssText='position:fixed;z-index:11;pointer-events:auto;cursor:pointer;background:rgba(8,18,38,0.92);border:1px solid '+d.col+'55;border-left:3px solid '+d.col+';border-radius:8px;padding:8px 12px;font:600 11px JetBrains Mono,monospace;color:#e8edf5;letter-spacing:0.5px;min-width:150px;transform:translate(-50%,0);transition:opacity 0.25s,border-color 0.25s,box-shadow 0.25s;box-shadow:0 6px 18px rgba(0,0,0,0.6);user-select:none';
      el.innerHTML=`
        <div style="color:${d.col};font:700 11px DM Sans,sans-serif;letter-spacing:2px">${d.name}</div>
        <div style="color:#64748b;font-size:8.5px;letter-spacing:1.5px;text-transform:uppercase;margin-top:1px">${d.role}</div>
        <div style="margin-top:5px;display:grid;grid-template-columns:24px 1fr;gap:3px 4px;font-size:8.5px;color:#94a3b8">
          <span>SPD</span><span style="background:#1e293b;height:5px;border-radius:2px;overflow:hidden"><span style="display:block;height:100%;width:${d.spd}%;background:${d.col}"></span></span>
          <span>HND</span><span style="background:#1e293b;height:5px;border-radius:2px;overflow:hidden"><span style="display:block;height:100%;width:${d.hnd}%;background:${d.col}"></span></span>
          <span>STB</span><span style="background:#1e293b;height:5px;border-radius:2px;overflow:hidden"><span style="display:block;height:100%;width:${d.stb}%;background:${d.col}"></span></span>
        </div>
        <div style="margin-top:5px;font-size:9px;color:#fbcf3b">${d.kit}</div>`;
      el.addEventListener('click',()=>{boat(cls);sfx('pop')});
      document.body.appendChild(el);
    }
    _vPrev.copy(m.position).project(cam);
    const W=innerWidth,H=innerHeight;
    if(_vPrev.z>1||_vPrev.z<-1){el.style.display='none';return}
    el.style.display='block';
    const px=(_vPrev.x*0.5+0.5)*W;
    const py=(-_vPrev.y*0.5+0.5)*H + 70;  // anchor below the boat
    el.style.left=px+'px';el.style.top=py+'px';
    const sel=cls===S.bc;
    el.style.opacity=sel?'1':'0.78';
    const d=MARINA_CARD[cls];
    el.style.borderColor=sel?d.col:(d.col+'55');
    el.style.boxShadow=sel?('0 0 22px '+d.col+'40, 0 4px 14px rgba(0,0,0,0.5)'):'0 4px 14px rgba(0,0,0,0.5)';
  });
}
// R19 — Marina boat raycast click. While on s1, a click in 3D selects the corresponding hero.
// Pointer events on the wet-canvas + the HUD canvas pass through (pointer-events:none on those
// elements), so the click lands here.
const _marinaRay=new THREE.Raycaster();
const _marinaMouse=new THREE.Vector2();
window.addEventListener('pointerdown',e=>{
  if(!$('s1')||$('s1').classList.contains('off'))return;
  if(e.target&&e.target.closest&&e.target.closest('#s1, #overlay'))return;  // let the card buttons handle their own clicks
  _marinaMouse.x=(e.clientX/innerWidth)*2-1;
  _marinaMouse.y=-(e.clientY/innerHeight)*2+1;
  _marinaRay.setFromCamera(_marinaMouse,cam);
  const targets=Object.values(previewBoats);
  const hits=_marinaRay.intersectObjects(targets,true);
  if(hits.length){
    let o=hits[0].object;while(o&&!o.userData.previewCls)o=o.parent;
    if(o&&o.userData.previewCls){boat(o.userData.previewCls);sfx('pop')}
  }
},{passive:true});

// R19 — Off-screen rescue arrow. Projects the nearest unrescued civilian into NDC. If they're
// behind the camera OR outside ~0.8 of the viewport, anchor a chevron at the screen edge along
// the projected bearing. Distance label below the arrow. Cleanly hidden once the civ enters
// camera frame at close range. Re-uses a single DOM node spawned on demand.
const _vCivProj=new THREE.Vector3();
function updateRescueArrow(civ,dist){
  let el=document.getElementById('rescue-arrow');
  if(!civ){if(el)el.style.display='none';return}
  if(!el){
    el=document.createElement('div');el.id='rescue-arrow';
    el.style.cssText='position:fixed;z-index:14;pointer-events:none;font:700 11px JetBrains Mono,monospace;letter-spacing:1px;color:#ff8c42;text-shadow:0 0 8px rgba(255,140,66,0.6);text-align:center;line-height:1;transform-origin:center;transition:opacity 0.2s';
    el.innerHTML='<div style="font-size:32px;line-height:1">▲</div><div id="rescue-arrow-d" style="margin-top:2px;font-size:10px">--</div>';
    document.body.appendChild(el);
  }
  _vCivProj.copy(civ.position).project(cam);
  const onScreen=_vCivProj.z>-1&&_vCivProj.z<1&&Math.abs(_vCivProj.x)<0.88&&Math.abs(_vCivProj.y)<0.85;
  // Hide if the civ is right in front + close — the help beam covers it.
  if(onScreen&&dist<35){el.style.display='none';return}
  el.style.display='block';
  // If the civ is behind the camera, flip the projected XY (project returns inverted values).
  let nx=_vCivProj.x,ny=_vCivProj.y;
  if(_vCivProj.z>1){nx=-nx;ny=-ny}
  // Clamp to screen-edge ring (margin 60px).
  const W=innerWidth,H=innerHeight,mx=60,my=60,cx=W/2,cy=H/2;
  const ang=Math.atan2(-ny,nx);
  const px=cx+Math.cos(ang)*(cx-mx);
  const py=cy-Math.sin(ang)*(cy-my);
  el.style.left=(px-22)+'px';el.style.top=(py-30)+'px';
  el.style.transform='rotate('+(ang*180/Math.PI+90)+'deg)';
  el.firstChild.nextSibling.textContent=dist.toFixed(0)+'m';
  el.style.opacity=Math.max(0.4,Math.min(1,1-dist/180)).toFixed(2);
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
function loop(){requestAnimationFrame(loop);const t=Date.now()*0.001;_frame++;
  const wA=0.25+S.wx.ws*0.04;const wp=waterGeo.attributes.position;
  for(let i=0;i<wp.count;i++){const x=wp.getX(i),y=wp.getY(i);wp.setZ(i,waterOZ[i]+Math.sin(x*0.05+t)*wA+Math.cos(y*0.07+t*0.8)*(wA*0.6))}
  // computeVertexNormals on a 96x96 plane is the loop's biggest CPU cost — stagger it (and skip
  // entirely on low gfx, where flat normals are fine) without any visible difference.
  wp.needsUpdate=true;if(gfxQuality!=='low'&&_frame%2===0)waterGeo.computeVertexNormals();
  // Pin bob
  if(scene._pinG)scene._pinG.position.y=Math.sin(t*1.2)*0.4;
  if(scene._beacon)scene._beacon.material.opacity=0.14+Math.sin(t*2)*0.06;
  // Foam ring grows with speed and pulses to read as turbulence
  if(bMesh&&bMesh.userData.foam){const f=bMesh.userData.foam;const sp=Math.abs(spd);const sc=1+sp*1.2;f.scale.set(sc,sc,sc);
    // Speed-rim: bloom the foam ring opacity slightly above 0.6 throttle for that "burst out of the
    // hull" rim feel. Cheap — modulates an existing mesh, no new geometry.
    const rim=sp>0.6?(sp-0.6)*0.7:0;
    f.material.opacity=Math.min(0.95,0.25+sp*0.5+rim+Math.sin(t*4)*0.05);
    // Caustics: a wider additive ring that ripples + rotates slowly under the boat.
    if(bMesh.userData.caustics){const c=bMesh.userData.caustics;const cs=1+sp*0.4+Math.sin(t*1.7)*0.05;
      c.scale.set(cs,cs,cs);c.rotation.z=t*0.3;c.material.opacity=0.18+Math.sin(t*2.2)*0.08+sp*0.1}
    // Hull damage VFX — crack glow below 50% pulses, smoke plume below 25% billows; spawns a wake
    // particle every ~0.4s at <25% to read as a smoke trail behind the boat.
    if(bMesh.userData.crackGlow){const h=S.hull||100;const crk=h<50?(50-h)/50*0.45:0;bMesh.userData.crackGlow.material.opacity=crk*(0.7+Math.sin(t*3)*0.3)}
    if(bMesh.userData.smokeGlow){const h=S.hull||100;const smk=h<25?(25-h)/25*0.7:0;bMesh.userData.smokeGlow.material.opacity=smk*(0.75+Math.sin(t*1.5)*0.25);
      // Smoke puff trail — push a fading dark wake particle every ~24 frames.
      // tickWakes overrides material.opacity each frame to `u.life * 0.4`, so we can't bake the smk
      // factor into the initial opacity (it'd be clobbered immediately). Instead scale the puff's
      // life by smk so a less-damaged hull spawns shorter-lived puffs.
      if(smk>0.05&&_frame%24===0){const ang=bMesh.rotation.y+Math.PI;const off=new THREE.Vector3(Math.sin(ang)*2.8,1.5,Math.cos(ang)*2.8);off.add(bMesh.position);const s=new THREE.Mesh(new THREE.SphereGeometry(0.45,8,6),new THREE.MeshBasicMaterial({color:0x1a1820,transparent:true,opacity:0}));s.position.copy(off);s.userData={life:0.4+smk*0.6,decay:0.018,vy:0.012,vx:(Math.random()-0.5)*0.02,vz:(Math.random()-0.5)*0.02};scene.add(s);wakes.push(s)}
    }}
  // Day/night cycle — 6-minute loop. Sun position arcs, sun color warms/cools, sky tints.
  // _dayOffset lets the QA hook jump the cycle (e.g. force night for a screenshot) without waiting.
  if(scene._sunDisc&&scene._sun){
    const cyc=((t+_dayOffset)%360+360)%360/360,ang=cyc*Math.PI*2;
    const sunY=Math.sin(ang)*60+30;const sunX=Math.cos(ang)*120;
    scene._sunDisc.position.set(sunX,sunY,-280);if(scene._sunHalo)scene._sunHalo.position.copy(scene._sunDisc.position);if(scene._sunGlow)scene._sunGlow.position.copy(scene._sunDisc.position);
    // Cool when low (night-ish), warm at midday.
    const dayness=Math.max(0,Math.sin(ang));
    scene._sun.intensity=0.4+dayness*1.0;
    // Golden-hour flash — when dayness crosses 0.12 (sunrise rising / sunset falling), fire a soft
    // amber tint to the #grade overlay for ~3.5s. Edge-triggered via _lastDayness so it pulses
    // exactly once per crossing.
    if(typeof _lastDayness==='number'){
      const rising=_lastDayness<0.12&&dayness>=0.12;
      const setting=_lastDayness>0.12&&dayness<=0.12&&dayness>0;
      if((rising||setting)&&!_goldenFlashUntil){
        _goldenFlashUntil=Date.now()+3500;
        const gr=$('grade');if(gr){gr.style.transition='opacity 0.6s ease-out';gr.style.background='radial-gradient(ellipse 75% 70% at 50% 45%,rgba(251,146,60,0.18) 0%,transparent 55%,rgba(2,6,18,0.55) 100%),linear-gradient(180deg,rgba(255,170,80,0.25) 0%,transparent 14%,transparent 86%,rgba(2,6,18,0.4) 100%)';gr.style.opacity='1'}
        radio(rising?'Sun\'s up. Lake lights.':'Sundown. It gets quiet now.','self');
      }
    }
    _lastDayness=dayness;
    if(_goldenFlashUntil&&Date.now()>_goldenFlashUntil){
      _goldenFlashUntil=0;const gr=$('grade');if(gr){gr.style.background='';gr.style.opacity=''}
    }
    // Water glint: a streak on the water along the light's bearing in front of the camera. Warm
    // sun by day, cool moonlight by night — so the reflection always reads.
    if(scene._sunGlint){const gl=scene._sunGlint;const dx=Math.cos(ang);const ahead=cam?cam.position:bMesh.position;
      gl.position.set(ahead.x+dx*40,0.12,ahead.z-60+sunY*0.4);
      if(dayness>0.05){gl.material.color.setHex(0xfff2c0);gl.material.opacity=dayness*0.6;gl.visible=true}
      else{gl.material.color.setHex(0xaec6ff);gl.material.opacity=0.22;gl.visible=true}}
    // Night hysteresis: flip on at sunY<25 (low sun), off at sunY>35 — prevents flicker at dusk.
    if(!_isNight&&sunY<25)_isNight=true;else if(_isNight&&sunY>35)_isNight=false;
    // Night sky: fade stars + moon in/out with how dark it is. Moon arcs opposite the sun.
    const nightAmt=Math.max(0,Math.min(1,(28-sunY)/40));  // 0 at high sun, ramps in as it sets
    if(scene._stars){const on=nightAmt>0.02;scene._stars.visible=on;if(on)scene._stars.material.opacity=nightAmt*0.9*(0.85+Math.sin(t*1.5)*0.15)}
    if(scene._moon){const on=nightAmt>0.02;const mx=-sunX,my=Math.max(40,-sunY+90);
      [scene._moon,scene._moonHalo].forEach(s=>{if(s){s.visible=on;s.position.set(mx,my,-300)}});
      if(on){scene._moon.material.opacity=nightAmt*0.95;if(scene._moonHalo)scene._moonHalo.material.opacity=nightAmt*0.35}}
    // God rays — three soft cones flaring down from the sun. Only on Clear days and during the
    // golden-hour window when the sun's angle is shallow (dayness 0.05..0.55), where shafts read.
    if(scene._godRays&&gfxQuality!=='low'){
      const clearWx=S.wx.c==='Clear';
      const golden=Math.max(0,Math.min(1,(0.55-Math.abs(dayness-0.3))/0.55));  // peak at dayness=0.3
      const op=clearWx?golden*0.45:0;
      const ahead=cam?cam.position:bMesh.position;
      scene._godRays.position.set(sunX*0.4+ahead.x*0.3,18,sunY*0.4-90);
      scene._godRays.rotation.z=Math.atan2(sunX,sunY)*0.4;
      for(let i=0;i<scene._godRays.children.length;i++){
        const s=scene._godRays.children[i];s.material.opacity=op*(1-i*0.22);
        s.position.x=Math.sin(t*0.3+i)*4;
      }
    }
    if(S.wx.c==='Clear'){scene.background.r=0.027+dayness*0.020;scene.background.g=0.082+dayness*0.030;scene.background.b=0.125+dayness*0.030;
      // Keep fog tracking the sky so the horizon doesn't read as a fixed band at night.
      if(scene.fog)scene.fog.color.lerp(scene.background,0.05)}
  }
  // Sky-dome gradient tracks dayness + weather tint. Top stays cooler than bottom band.
  if(scene._sky){
    const cyc=((t+_dayOffset)%360+360)%360/360,ang=cyc*Math.PI*2,dayness=Math.max(0,Math.sin(ang));
    const wxC=S.wx.c==='Rain'||S.wx.c==='Drizzle'?0:S.wx.c==='Clouds'||S.wx.c==='Overcast'?0.4:1;
    const u=scene._sky.material.uniforms;
    u.topColor.value.setRGB(0.02+dayness*0.04*wxC,0.05+dayness*0.06*wxC,0.10+dayness*0.10*wxC);
    u.bottomColor.value.setRGB(0.05+dayness*0.10*wxC,0.10+dayness*0.13*wxC,0.18+dayness*0.12*wxC);
  }
  // Atmospheric mist drift — Points cloud spawned in mkMist(), shifts on the wind.
  if(scene._mist){const m=scene._mist;m.rotation.y=t*0.01;m.position.y=2+Math.sin(t*0.2)*0.4}
  // Minimap update
  if(S.on&&$('mm-canvas')){drawMinimap()}
  // Named fishing-spot indicator — fades in when the boat enters a spot's radius.
  if(S.on&&GAME_MODE==='game'&&!photoMode){const sp=fishingSpot(bMesh.position),tag=$('spot-tag');if(tag){if(sp){tag.textContent='~ '+sp.n+' ~';tag.style.display='block'}else tag.style.display='none'}}
  updateMissionQueue();
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
    // Engine upgrade multiplies top speed + accel; Fly's hero ability bumps top speed +5% extra.
    const engM=eqUp('engine').speedMul*(S.bc==='speedboat'?1.05:1);
    if(!frozen&&(keys.ArrowUp||keys.KeyW||tch.lY>0.1))spd=Math.min(spd+bt.ac*wxP*hullP*engM*(keys.ArrowUp||keys.KeyW?1:tch.lY),bt.mx*hullP*engM);
    // Reverse capped at -bt.mx*0.5 — the boat can back up but can't outrun itself in reverse.
    if(!frozen&&(keys.ArrowDown||keys.KeyS||tch.lY<-0.1))spd=Math.max(spd-bt.ac*0.5,-bt.mx*0.5*hullP);
    spd*=bt.dr;
    if(!frozen&&Math.abs(spd)>0.03){if(keys.ArrowLeft||keys.KeyA||tch.rX>0.1)aV+=bt.tu*wxP*hullP*(keys.ArrowLeft||keys.KeyA?1:tch.rX);if(keys.ArrowRight||keys.KeyD||tch.rX<-0.1)aV-=bt.tu*wxP*hullP*(keys.ArrowRight||keys.KeyD?1:Math.abs(tch.rX))}
    aV*=0.88;bMesh.rotation.y+=aV;
    const dir=_vDir.set(0,0,-1).applyAxisAngle(_yAxis,bMesh.rotation.y);prev.copy(bMesh.position);
    bMesh.position.addScaledVector(dir,spd);
    // Per-hero idle bob personality — Reel is balanced (default), Lilly is the wide pontoon (slow,
    // higher bob amplitude), Fly is the knife-bow speedboat (quicker, lower amplitude, tighter sway).
    const hp=S.bc==='pontoon'?{bobA:0.28,bobF:1.6,sway:0.06}:S.bc==='speedboat'?{bobA:0.14,bobF:2.6,sway:0.10}:{bobA:0.20,bobF:2.2,sway:0.08};
    const stillness=Math.max(0,1-Math.abs(spd)*5);  // 1 when fully stopped, 0 at speed → extra sway when docked
    bMesh.position.y=0.3+Math.sin(t*hp.bobF)*hp.bobA+Math.sin(t*1.3+0.5)*0.1;
    bMesh.rotation.z=-aV*2.5+Math.sin(t*0.8)*hp.sway*stillness;
    bMesh.rotation.x=spd*0.05+Math.cos(t*0.7)*hp.sway*0.5*stillness;
    const wr=S.wx.wd*Math.PI/180;bMesh.position.x+=Math.sin(wr)*S.wx.ws*0.0008*bt.wx;bMesh.position.z+=Math.cos(wr)*S.wx.ws*0.0008*bt.wx;
    // Blackwater surge — only in THE SHALLOWS, every ~4-7s, shoves the boat sideways
    if(S.phase>=1&&t-S.lastSurge>4+(S.surgeRand||3)){S.lastSurge=t;S.surgeRand=Math.random()*3;const sa=Math.random()*Math.PI*2;bMesh.position.x+=Math.cos(sa)*2;bMesh.position.z+=Math.sin(sa)*2;$('ww').textContent='BLACKWATER SURGE';$('ww').style.display='block';setTimeout(()=>{if($('ww').textContent==='BLACKWATER SURGE')$('ww').style.display='none'},1400);radio(HERO[S.bc].voice.surge,'reel');wet.add(14);sfx('splash_big');_shake=Math.max(_shake,0.55)}
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
    const hb=$('h-bait');if(hb){hb.textContent=bait;if(bait!==_lastBait){pulseBait(bait-_lastBait);_lastBait=bait}}
    // Hull HUD + color states
    const hh=$('h-hull');if(hh){hh.textContent=Math.round(S.hull)+'%';hh.style.color=S.hull<30?'#ef4444':(S.hull<60?'#f59e0b':'#fb923c')}
    const dmgMul=1-hullResist();
    for(const s of stumps){const d=bMesh.position.distanceTo(s.position);if(d<2.5){flashDamage(1);endGame(false);return}if(d<4){S.hull=Math.max(0,S.hull-0.35*dmgMul);S.near++;if(S.hull%5<0.4)flashDamage(0.35)}else if(d<6){S.near++}}
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
    let _nearestCiv=null,_nearestCivD=Infinity;
    for(const c of civs){if(c.userData.saved)continue;
      c.position.y=Math.sin(t*1.8+c.position.x)*0.12;
      if(c.userData.ring)c.userData.ring.material.opacity=0.3+Math.sin(t*3+c.position.x)*0.2;
      const dc=bMesh.position.distanceTo(c.position);
      // Track nearest active civ for the off-screen direction arrow below.
      if(dc<_nearestCivD){_nearestCivD=dc;_nearestCiv=c}
      // Help-beam pulse — fades down close-up so it doesn't blind the player on approach.
      if(c.userData.beam){
        const closeup=Math.min(1,Math.max(0,(dc-6)/30));
        c.userData.beam.material.opacity=(0.18+Math.sin(t*3+c.position.x)*0.14)*closeup;
        if(c.userData.beamTop)c.userData.beamTop.material.opacity=(0.55+Math.sin(t*3.5+c.position.x)*0.35)*closeup;
      }
      if(dc<3){
        if(Math.abs(spd)<0.4){
          // Reel's hero ability: +25% bait yield from civilian rescues (rounded to whole bait).
          c.userData.saved=true;c.visible=false;S.civsSaved++;S.score+=100;S.hull=Math.min(100,S.hull+0.5);const rescueBait=S.bc==='regular'?13:10;bait+=rescueBait;persist();sfx('rescue');
          $('h-civ').textContent=S.civsSaved+'/'+S.civsTotal;
          $('ww').textContent='CIVILIAN EXTRACTED';$('ww').style.display='block';setTimeout(()=>{if($('ww').textContent==='CIVILIAN EXTRACTED')$('ww').style.display='none'},1400);
          if(S.civsSaved===1)radio(HERO[S.bc].voice.rescue);
        }else if(dc<2.2&&$('ww').textContent!=='TOO FAST FOR PICKUP'){
          $('ww').textContent='TOO FAST FOR PICKUP';$('ww').style.display='block';setTimeout(()=>{if($('ww').textContent==='TOO FAST FOR PICKUP')$('ww').style.display='none'},1200);
        }
      }
    }
    // R19 — Off-screen rescue arrow. If the nearest unrescued civ is behind the camera or beyond
    // ~50u, paint a small directional chevron at the edge of the screen pointing toward them.
    // Hides cleanly once they enter near range OR all civs are saved.
    updateRescueArrow(_nearestCiv,_nearestCivD);
    spawnWake();tickWakes();tickRain();tickSonar();
    if(GAME_MODE==='game'){tickDropPoints(t);tickAI();tickShops();tickCamps();tickFishJumps(t);maybeSpawnDuct();tickDuct(t);storm.maybe(t)}
    // Business mode: reaching the dock wins the run. Game mode: dock is just a POI;
    // runs end on hull=0 (sink) or player-triggered "End Run".
    if(GAME_MODE==='business'){tickPh();if(dd<8){S.pc=3;endGame(true)}}
    const bh=_vCam.set(0,7+Math.abs(spd)*3,-14);bh.applyAxisAngle(_yAxis,bMesh.rotation.y);bh.add(bMesh.position);cam.position.lerp(bh,0.1);
    // Screen-shake (surge/impact) — random jitter that decays fast for a punchy, recoverable hit.
    if(_shake>0.002){const sk=_shake*_shakeMul;cam.position.x+=(Math.random()-0.5)*sk;cam.position.y+=(Math.random()-0.5)*sk*0.6;_shake*=0.86}
    cam.lookAt(bMesh.position.x,bMesh.position.y+1,bMesh.position.z);
    // Speed-punch FOV — widens with throttle for a GTA-style sense of speed, eased both ways.
    const wantFov=60+Math.min(13,Math.abs(spd)*9);if(Math.abs(cam.fov-wantFov)>0.04){cam.fov+=(wantFov-cam.fov)*0.07;cam.updateProjectionMatrix()}
    engineAudio.update(spd);stormAudio.update();campAudio.update();music.update();catalyst.maybe(t);
    // Bobber wait/nibble tick — only does work if a bobber is in the water.
    tickBobber(t);
    // First-cast hint pip: subtle yellow nudge when the player is stopped over castable water and
    // hasn't fished yet this session. Hides once they've made a cast or while a bobber is out.
    const hint=$('cast-hint');if(hint){
      const stopped=Math.abs(spd)<0.15;
      const onWater=fishingSpot(bMesh.position)!==null;
      const noBobber=!_bobberState&&!_catchOpen&&!miniActive;
      if(stopped&&onWater&&noBobber&&!S._castedThisRun){hint.style.display='block';hint.textContent='Press F to cast'}
      else hint.style.display='none';
    }
  }else if(photoMode){
    // Photo mode — free orbit around the boat. Arrows orbit/tilt, Z/X zoom. Boat is frozen.
    photoCam.yaw+=(keys.ArrowLeft?-0.025:0)+(keys.ArrowRight?0.025:0);
    photoCam.pitch=Math.max(-0.15,Math.min(1.35,photoCam.pitch+(keys.ArrowUp?0.02:0)+(keys.ArrowDown?-0.02:0)));
    photoCam.dist=Math.max(7,Math.min(70,photoCam.dist+(keys.KeyZ?-0.4:0)+(keys.KeyX?0.4:0)));
    const cp=Math.cos(photoCam.pitch),cx=bMesh.position.x+Math.sin(photoCam.yaw)*cp*photoCam.dist,cz=bMesh.position.z+Math.cos(photoCam.yaw)*cp*photoCam.dist,cy=bMesh.position.y+Math.sin(photoCam.pitch)*photoCam.dist+1.5;
    cam.position.set(cx,cy,cz);cam.lookAt(bMesh.position.x,bMesh.position.y+0.6,bMesh.position.z);
    stopAllAudio();if(Math.abs(cam.fov-60)>0.04){cam.fov+=(60-cam.fov)*0.1;cam.updateProjectionMatrix()}
  }else{
    // R19 — Marina aerial picker. While the player is on s1 (hero pick), the camera orbits
    // slowly around the marina dock so all three boats are visible from changing angles. The
    // selected operative's boat glows + has its stat card highlighted. Once the run starts the
    // preview boats stay moored as scenery (the picked hero is the one that drives away).
    const marinaActive=!$('s1').classList.contains('off');
    if(marinaActive){
      const tt=t*0.12;
      const rad=22+Math.sin(t*0.18)*2;
      cam.position.x=dockPos.x+Math.sin(tt)*rad;
      cam.position.z=dockPos.z+Math.cos(tt)*rad+8;
      cam.position.y=12+Math.sin(t*0.3)*1.4;
      cam.lookAt(dockPos.x,1.5,dockPos.z-2);
      // Idle bob on preview boats — feels alive even before pick.
      Object.values(previewBoats).forEach(m=>{
        const bp=m.userData.basePos;
        m.position.y=0.3+Math.sin(t*1.4+bp.x)*0.08;
        m.rotation.z=Math.sin(t*0.9+bp.x)*0.04;
      });
      // Highlight ring follows the chosen hero.
      Object.entries(previewBoats).forEach(([cls,m])=>{
        const sel=cls===S.bc;
        if(m.userData.ring)m.userData.ring.material.opacity=sel?(0.35+Math.sin(t*4)*0.18):0;
      });
      // Update screen-anchored stat cards.
      updateMarinaCards();
    }else{
      // Old hazard-zone sweep — kept as the photo-mode-style cinematic if anything else triggers
      // the no-state branch (rare; effectively only the post-run summary).
      const tt=t*0.08;
      cam.position.x=Math.sin(tt)*55;cam.position.z=Math.cos(tt)*55-30;cam.position.y=6+Math.sin(t*0.25)*3;
      cam.lookAt(Math.sin(tt+0.6)*20,2,-50);
    }
    // One patrol boat drifts in the distance during idle so something is alive
    if(aiB[0]){const p=aiB[0];p.position.x=Math.sin(t*0.3)*70;p.position.z=-90+Math.cos(t*0.2)*20;p.position.y=0.3+Math.sin(t*1.5)*0.2;p.rotation.y=t*0.3+Math.PI*0.5}
  }
  // Rain drizzle on the lens + per-frame wet overlay redraw.
  if(wet.enabled){if(S.on&&(S.wx.c==='Rain'||S.wx.c==='Drizzle')&&Math.random()<0.4)wet.add(1);wet.tick()}
  ren.render(scene,cam)}

// Tackle box → stump-damage resistance (0..~0.41) so a better box means a tougher run, while hull
// stays a clean 0..100 everywhere else. hullCap field is reframed as effective armor.
// Total damage resistance from: tackle box (existing), armor upgrade, and Lilly's hero ability.
function hullResist(){const base=Math.min(0.5,(eqBox().hullCap-100)/170);const armor=eqUp('armor').resist||0;const heroBonus=S.bc==='pontoon'?0.1:0;return Math.min(0.6,base+armor+heroBonus)}
function startGame(){
  // Daily streak — local-day key (UTC drifts in late-evening timezones). yesterday→++, today→noop,
  // gap→reset. Fires non-persistent milestone toasts at 3/14/100; real ACH at 7 + 30.
  {const today=localDayKey(),yesterday=localDayKey(-1);
   if(streak.lastPlayed!==today){
     // Detect a broken streak BEFORE we reset — friendly nudge so the player knows what happened.
     const broken=streak.lastPlayed&&streak.lastPlayed!==yesterday&&(streak.count||0)>=3;
     const wasCount=streak.count||0;
     if(streak.lastPlayed===yesterday)streak.count=(streak.count||0)+1;
     else streak.count=1;
     streak.lastPlayed=today;streak.max=Math.max(streak.max||0,streak.count);
     persist();
     if(broken)pushAchToast({n:'STREAK RESET',d:`Your ${wasCount}-day streak broke. Welcome back.`});
     if(streak.count===3||streak.count===14||streak.count===100)pushAchToast({n:'STREAK!',d:streak.count+' days at the Bayou.'});
     if(streak.count>=7)onUnlock('streak_7');
     if(streak.count>=30)onUnlock('streak_30');
   }
  }
  S.on=true;document.body.classList.add('playing');_lastBait=bait;S.score=0;S.t0=Date.now();S.maxSpd=0;S.dist=0;S.near=0;S.pc=0;S.hull=100;S.lastSurge=Date.now()*0.001;S.surgeRand=3;S.civsSaved=0;S.civsTotal=civs.length;S.sonarReady=0;S.evCollected=null;S.missionsCleared=0;runCatches=[];S.runBest=null;S._castedThisRun=false;
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
  resetRunFlags();
  // R19 — Hide the picked preview boat (the active bMesh now takes that role). The other two
  // operatives' boats stay moored at the marina as ambient scenery — the dock feels like a real
  // home base instead of a launching pad.
  Object.entries(previewBoats).forEach(([cls,m])=>{m.visible=cls!==S.bc});
  // R19 — Sweep up any stray marina UI artifacts so the run starts on a clean HUD.
  ['regular','pontoon','speedboat'].forEach(cls=>{const el=document.getElementById('marina-card-'+cls);if(el)el.style.display='none'});
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
  photoMode=false;_photoResume=false;despawnDuct();
  $('nfo').textContent=GAME_MODE==='game'?'WASD=Drive · Space=Sonar · F=Cast · E=Shop · P=Photo · drive to a beacon for a mission':'WASD / Arrows · Space = Sonar Ping · Follow the rescue markers';$('nfo').style.color='#475569';
  // Free-roam weather drifts: refetch + re-apply visuals every 45s so a long session sees the
  // sky/wind/rain actually change instead of being frozen at the launch reading.
  if(_wxTimer)clearInterval(_wxTimer);
  if(GAME_MODE==='game')_wxTimer=setInterval(()=>{if(S.on&&!_tabHidden)fetchWx()},45000);
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
function endGame(won){S.on=false;S.played=true;document.body.classList.remove('playing');stopAllAudio();_shake=0;if(cam){cam.fov=60;cam.updateProjectionMatrix()}$('hud').style.display='none';$('nfo').style.display='none';$('phud').style.display='none';$('ww').style.display='none';const er=$('end-run');if(er)er.style.display='none';const mm=$('minimap');if(mm)mm.style.display='none';const sp=$('spot-tag');if(sp)sp.style.display='none';const shp=$('shop-prompt');if(shp)shp.style.display='none';const mq=$('mq');if(mq)mq.style.display='none';const ph=$('photo-hint');if(ph)ph.style.display='none';const fp=$('forage-prompt');if(fp)fp.style.display='none';photoMode=false;_photoResume=false;_nearShop=null;_nearCamp=null;despawnDuct();cancelCast();const cp=$('cast-prompt');if(cp)cp.style.display='none';const ch=$('cast-hint');if(ch)ch.style.display='none';aiB.forEach(a=>a.userData.on=false);
  // Tear down any in-flight cast / open catch dialog / fight so it can't pop over the result screen.
  cancelCast();if(_fightCleanup){_fightCleanup();_fightCleanup=null}if(_catchOpen){_catchOpen=false;miniActive=false;const me=$('mini');if(me)me.style.display='none';const mc=$('mini-card');if(mc)mc.innerHTML=''}
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
    // Sparkline-style rarity breakdown: a single proportional bar split by tier.
    const total=runCatches.length;
    const tierOrder=['common','uncommon','rare','legendary'];
    const bar=`<div style="display:flex;height:10px;border-radius:5px;overflow:hidden;background:rgba(3,7,18,0.5);margin:8px 0 6px">${tierOrder.map(r=>byR[r]>0?`<div title="${r} · ${byR[r]}" style="flex:${byR[r]};background:${RARE_COLOR[r]}"></div>`:'').join('')}</div>`;
    const legend=tierOrder.filter(r=>byR[r]>0).map(r=>`<span style="color:${RARE_COLOR[r]};text-transform:uppercase;letter-spacing:1px;font-size:10px">${r}</span> <b style="color:#fde68a;font-size:11px">${byR[r]}</b>`).join(' &nbsp; ');
    // Find the biggest fish (highest score value) for a "biggest catch" callout.
    const biggest=runCatches.reduce((a,b)=>(!a||b.s>a.s)?b:a,null);
    const biggestLine=biggest?`<div style="margin-top:6px;padding:6px 10px;background:rgba(${biggest.r==='legendary'?'255,210,63':biggest.r==='rare'?'139,92,246':'16,185,129'},0.10);border-left:2px solid ${RARE_COLOR[biggest.r]};border-radius:4px;font-size:11px;color:#cbd5e1"><b>Biggest:</b> ${biggest.e} ${biggest.n} <span style="color:#fbcf3b">+${biggest.s}</span></div>`:'';
    haulDetail.innerHTML=bar+legend+biggestLine;
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
async function fetchWx(){try{const key=C.OWM_KEY||C.OPENWEATHER_KEY;if(!key)throw 0;const r=await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${S.lat}&lon=${S.lng}&appid=${key}&units=imperial`);if(!r.ok)throw 0;const d=await r.json();S.wx={ws:d.wind?.speed||3,wd:d.wind?.deg||180,g:d.wind?.gust||0,c:d.weather?.[0]?.main||'Clear',t:Math.round(d.main?.temp||72),v:d.visibility||10000}}catch(e){S.wx={ws:3+Math.random()*7,wd:Math.round(Math.random()*360),g:5+Math.random()*5,c:['Clear','Clouds','Overcast'][Math.floor(Math.random()*3)],t:Math.round(65+Math.random()*20),v:5000+Math.random()*5000}}$('wx-c').textContent=`${S.wx.c} ${S.wx.t}°F`;
  const wxText=$('wx-w-text');if(wxText)wxText.textContent=`Wind ${S.wx.ws.toFixed(1)}mph`;else $('wx-w').textContent=`Wind ${S.wx.ws.toFixed(1)}mph`;
  // Wind arrow — rotate the down-arrow glyph to the wind's "to" bearing (meteorological wd is the
  // direction the wind comes FROM, so rotate by wd+180 to point where it's going).
  const wxArrow=$('wx-arrow');if(wxArrow)wxArrow.style.transform=`rotate(${(S.wx.wd||0)+180}deg)`;
  applyWeatherVisuals()}
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
function boat(c){
  S.bc=c;
  document.querySelectorAll('.bo').forEach(el=>{el.classList.toggle('on',el.dataset.b===c);if(el.dataset.b===c){el.style.borderColor=HERO[c].badge;el.style.background=HERO[c].badge+'14'}else{el.style.borderColor='';el.style.background=''}});
  mkBoat(c);
  const hb=$('h-hero');if(hb){const h=HERO[c];hb.textContent=h.n.toUpperCase()+(boatName?' · '+boatName.toUpperCase():'');hb.style.color=h.badge}
  // Tag the body with the hero class so CSS can tint HUD accents to match the operative.
  document.body.classList.remove('hero-reel','hero-lilly','hero-fly');
  document.body.classList.add('hero-'+(c==='regular'?'reel':c==='pontoon'?'lilly':'fly'));
}
// Full-screen hero ID card — flashes role + name + ability after the player picks an operative.
// One-shot DOM element; click anywhere to skip; auto-fades after 1.2s.
function showHeroCallout(h){
  const el=document.createElement('div');
  el.style.cssText='position:fixed;inset:0;z-index:55;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:radial-gradient(ellipse at center,rgba(2,6,18,0.7) 0%,rgba(2,6,18,0.95) 100%);color:'+h.badge+';font-family:DM Sans,sans-serif;opacity:0;transition:opacity 0.35s ease-out;pointer-events:auto;cursor:pointer';
  el.innerHTML=`<div style="font:700 11px JetBrains Mono,monospace;letter-spacing:5px;color:#94a3b8;text-transform:uppercase;margin-bottom:10px">Operative · ${h.role}</div>
    <div style="font:800 72px DM Sans,sans-serif;letter-spacing:2px;text-shadow:0 4px 30px ${h.badge}66">${h.n.toUpperCase()}</div>
    <div style="margin-top:14px;font:600 16px JetBrains Mono,monospace;color:#fbcf3b;letter-spacing:3px;text-transform:uppercase">READY</div>
    <div style="margin-top:28px;font:11px JetBrains Mono,monospace;color:#64748b;letter-spacing:1px">${h.kit||''}</div>`;
  document.body.appendChild(el);
  requestAnimationFrame(()=>{el.style.opacity='1'});
  const fade=()=>{el.style.opacity='0';setTimeout(()=>el.remove(),400)};
  const t1=setTimeout(fade,1100);
  el.addEventListener('click',()=>{clearTimeout(t1);fade()},{once:true,passive:true});
}
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
function reset(){S.on=false;S.played=false;document.body.classList.remove('playing');stopAllAudio();if(_wxTimer){clearInterval(_wxTimer);_wxTimer=null}$('hud').style.display='none';$('wxb').style.display='none';$('nfo').style.display='none';$('phud').style.display='none';$('ww').style.display='none';if($('f-addr'))$('f-addr').value='';if($('f-email'))$('f-email').value='';aiB.forEach(a=>a.userData.on=false);
  // R19 — Restore the picker so the player can swap operatives between runs.
  Object.values(previewBoats).forEach(m=>{m.visible=true});
  show('s1');
  // Reset game-mode question state so the entry flow starts fresh on each "New Run".
  if(GAME_MODE==='game'){$('op-grid').style.display='grid';$('op-label').style.display='block';$('begin-btn').style.display='block';$('q-1').style.display='none';$('q-2').style.display='none';const hd=$('home-dock-wrap');if(hd)hd.style.display='block';S.lore={};refreshTrophyPeek()}}

// === GAME-MODE ENTRY: hero pick → Q1 → Q2 → free-roam ===
// No email, no address. The two questions tag S.lore so radio chatter can reference them later;
// they don't override the hero pick (player keeps the operative they selected).
function beginRun(){
  if(!S.lore)S.lore={};
  // Cinematic hero ID card — flashes the selected operative's badge for ~1.2s on top of the
  // lore question card. Pure CSS, mute-respecting click-to-skip.
  if(S.bc&&HERO[S.bc])showHeroCallout(HERO[S.bc]);
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
// Apply a default hero tint so the s1 boat-picker chips have themed accents on first load. The
// boat() call later overwrites this with the actual hero once a class is chosen.
document.body.classList.add('hero-reel');
initEngine();wet.init();refreshTrophyPeek();applyGfx();
// Pause when the tab is hidden — silence all continuous audio so we don't bleed in a background
// tab, and stash S.on so we can restore it on visibilitychange→visible. The RAF loop is left
// running (a paused tab throttles RAF automatically) so the scene is ready when the user returns.
let _hiddenSavedOn=null,_tabHidden=false;
function setTabHidden(hidden){
  if(_tabHidden===hidden)return;
  _tabHidden=hidden;
  if(hidden){
    _hiddenSavedOn=S.on;S.on=false;
    stopAllAudio();
  }else{
    if(_hiddenSavedOn===true)S.on=true;_hiddenSavedOn=null;
    if(_audioCtx&&_audioCtx.state==='suspended')_audioCtx.resume().catch(()=>{});
  }
}
document.addEventListener('visibilitychange',()=>setTabHidden(document.hidden));
// iOS Safari requires AudioContext.resume() inside a user-gesture handler. sfx() already lazy-
// creates the ctx, but it can land in a 'suspended' state. Wire a one-shot pointerdown/touchend/
// keydown that resumes it the first time the user actually does anything. {once:true} per type.
['pointerdown','touchend','keydown'].forEach(ev=>{
  window.addEventListener(ev,()=>{if(_audioCtx&&_audioCtx.state==='suspended')_audioCtx.resume().catch(()=>{})},{once:true,passive:true});
});
{const mb=$('mute-btn');if(mb)mb.textContent=muted?'🔇 Sound Off':'🔊 Sound On'}
// First-load cinematic intro — 6-second title fade over the existing idle-cam sweep. Shown once
// (gated by tutorialSeen.intro) so returning players don't sit through it. The idle camera is
// already orbiting the lake whenever S.on is false, so we just layer a title card on top.
if(GAME_MODE==='game'&&!tutorialSeen.intro){
  tutorialSeen.intro=true;persist();
  const el=document.createElement('div');el.id='intro-card';
  el.style.cssText='position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:radial-gradient(ellipse at center,rgba(2,6,18,0.55) 0%,rgba(2,6,18,0.95) 100%);color:#fbcf3b;font-family:DM Sans,sans-serif;opacity:0;transition:opacity 0.8s ease-out;pointer-events:auto;cursor:pointer';
  el.innerHTML=`
    <div style="font:700 12px JetBrains Mono,monospace;letter-spacing:4px;color:#94a3b8;text-transform:uppercase;margin-bottom:12px">A Castor Bayou Story</div>
    <div style="font:800 56px DM Sans,sans-serif;letter-spacing:1px;text-shadow:0 4px 30px rgba(0,0,0,0.7)">DockShield</div>
    <div style="font:600 22px DM Sans,sans-serif;color:#fb923c;margin-top:6px;letter-spacing:6px;text-transform:uppercase">The Depth</div>
    <div style="margin-top:36px;font:11px JetBrains Mono,monospace;color:#64748b;letter-spacing:1.5px">something is rising below the waterline</div>`;
  document.body.appendChild(el);
  // Fade in → hold → fade out → remove. Total ~6s; user can skip by clicking anywhere.
  requestAnimationFrame(()=>{el.style.opacity='1'});
  const fadeOut=()=>{el.style.opacity='0';setTimeout(()=>el.remove(),900)};
  const t1=setTimeout(fadeOut,5200);
  document.addEventListener('click',()=>{clearTimeout(t1);fadeOut()},{once:true,passive:true});
}
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
// Dock at a lake bait shop mid-run: pause the world, open that shop, resume on close.
let _shopResumeRun=false;
function dockShop(shop){if(S.on){S.on=false;_shopResumeRun=true}const p=$('shop-prompt');if(p)p.style.display='none';sfx('win');radio('Tied off at '+shop.n+'. Take your time.','self');openShop(shop)}
// Beach the boat at a shore camp — open a picker of the camp's foraging games. Picking a game
// fires the matching mini.openForage* opener. Closes via Cast Off back to the run.
function dockCamp(camp,mesh){
  if(S.on){S.on=false;_shopResumeRun=true}
  const p=$('forage-prompt');if(p)p.style.display='none';
  // First forage: show the tutorial overlay instead of the picker — closing it reveals the picker.
  if(!tutorialSeen.forage&&showTutorial('forage')){_shopResumeRun=true;return}
  sfx('win');radio('Beached at '+camp.n+'. Dig in.','self');
  const card=$('mini-card'),el=$('mini');if(!card||!el)return;
  miniActive=true;_peekOpen=true;
  const gameMeta={
    worm:    {n:'Dig Worm Beds',  c:'#a47a52', e:'🪱', d:'Click clods for worms + the odd cricket.', fn:'openForageWorm'},
    cricket: {n:'Swat Crickets',  c:'#8db347', e:'🦗', d:'Bugs run across the patch. Tap to swat.',     fn:'openForageBug'},
    frog:    {n:'Grab Frogs',     c:'#5fa75f', e:'🐸', d:'They pause, then hop. Catch the pause.',     fn:'openForageFrog'},
    minnow:  {n:'Net Minnows',    c:'#7ec8e3', e:'🐠', d:'Click + drag a net rectangle to scoop.',     fn:'openForageMinnow'},
    crayfish:{n:'Flip the Rocks',  c:'#cf4040',e:'🦞', d:'Stony shore. Tap a flipped rock before they re-burrow.', fn:'openForageCrayfish'}
  };
  const rows=camp.games.map(k=>{const g=gameMeta[k];if(!g)return '';
    return `<button class="btn forage-row" data-fn="${g.fn}" style="width:100%;text-align:left;background:rgba(3,7,18,0.5);border:1px solid ${g.c}33;border-left:3px solid ${g.c};border-radius:8px;padding:10px 12px;margin:5px 0;color:#e8edf5">
      <div style="font-weight:600;color:${g.c};font-size:13px">${g.e} ${g.n}</div>
      <div style="font-size:11px;color:#94a3b8;line-height:1.4;margin-top:2px">${g.d}</div></button>`}).join('');
  card.innerHTML=`<div class="m-kicker" style="color:#${camp.col.toString(16).padStart(6,'0')}">Shore Camp</div>
    <div class="m-title">${camp.n}</div>
    <div class="m-sub">Pick what you're after. Bait stays in your pantry.</div>
    ${rows}
    <button class="btn bx" onclick="DS.closePeek()" style="margin-top:8px">Cast Off</button>`;
  card.querySelectorAll('.forage-row').forEach(btn=>btn.onclick=()=>{const fn=btn.dataset.fn;_peekOpen=false;const c2=$('mini-card');if(c2)c2.innerHTML='';if(typeof mini[fn]==='function')mini[fn](mesh)});
  el.style.display='flex';
}
function closePeek(){const el=$('mini');if(el)el.style.display='none';const card=$('mini-card');if(card)card.innerHTML='';miniActive=false;_peekOpen=false;
  // If we paused a live run to dock at a shop, resume it now.
  if(_shopResumeRun){_shopResumeRun=false;S.on=true}}
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
// openShop(shop) — shop is a SHOPS entry; omitted = the generic s1 Tackle Shop (all consumables,
// no gear). Renders gear tiers (the shop's `sells` slots) + the shop's consumables.
// Renders the Boatworks "Boat Upgrades" rows for the current hero. Each slot shows the next-step
// tier (one above what you own) as buyable; already-owned tiers show ✓ OWNED.
function renderBoatworksRows(){
  const heroBoat=BT[S.bc].n;const hu=boatUpgrades[S.bc]||{};
  // Identify the cheapest *buyable* next-tier slot for a "BEST VALUE" badge so the player has a
  // tasteful nudge toward the next upgrade rather than staring at a wall of identical rows.
  let bestCost=Infinity,bestKey=null;
  for(const slot of ['engine','lights','armor','electronics']){
    const cur=hu[slot]||0,tier=cur+1;
    if(tier>=BOAT_UP[slot].length)continue;
    const it=BOAT_UP[slot][tier];
    if(bait>=it.cost&&it.cost<bestCost){bestCost=it.cost;bestKey=slot+':'+tier}
  }
  let html=`<div style="font:11px 'JetBrains Mono',monospace;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin:8px 0 2px">Boat Upgrades · ${heroBoat} <span style="color:#475569">· hover for after-purchase balance</span></div>`;
  for(const slot of ['engine','lights','armor','electronics']){
    const cur=hu[slot]||0;
    for(let tier=1;tier<BOAT_UP[slot].length;tier++){
      const it=BOAT_UP[slot][tier];const cost=loyaltyDiscount(it.cost),owned=cur>=tier,buyable=cur===tier-1&&bait>=cost;
      // Cost preview: post-purchase bait balance + delta, as a native title tooltip on the button.
      const tip=owned?'Already owned':`After: ${Math.max(0,bait-cost)} bait (${bait}−${cost})`;
      const isBest=bestKey===slot+':'+tier;
      html+=`<div style="position:relative;display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:rgba(3,7,18,0.5);border-radius:8px;margin:5px 0;opacity:${owned||buyable?1:0.5};${isBest?'box-shadow:0 0 0 1px rgba(251,207,59,0.55);':''}">
        ${isBest?`<span style="position:absolute;top:-6px;right:10px;background:#fbcf3b;color:#1a1a2e;font:700 8px 'JetBrains Mono',monospace;letter-spacing:1px;padding:2px 6px;border-radius:3px">BEST VALUE</span>`:''}
        <div style="flex:1;min-width:0;padding-right:10px"><div style="font-weight:600;font-size:12.5px;color:#e8edf5">${it.e} ${it.n} <span style="color:#64748b;font-size:9px;text-transform:uppercase;letter-spacing:1px">${slot}</span></div><div style="font-size:10.5px;color:#94a3b8;line-height:1.4;margin-top:2px">${it.d}</div></div>
        <button class="btn bp up-buy" data-slot="${slot}" data-tier="${tier}" title="${tip}" style="width:auto;padding:7px 13px;margin:0;font-size:11px;background:${owned?'#1f5f3a':buyable?'#f97316':'#374151'}">${owned?'✓ OWNED':bait>=cost?priceLabel(it.cost):'—'}</button>
      </div>`;
    }
  }
  return html;
}
function openShop(shop){
  // First Boatworks visit shows the tutorial — closing it then opens the shop on the next call.
  if(shop&&shop.boatworks&&!tutorialSeen.boatworks&&showTutorial('boatworks'))return;
  const card=$('mini-card'),el=$('mini');if(!card||!el)return;
  miniActive=true;_peekOpen=true;
  const title=shop?shop.n:'Tackle Shop';
  const titleCol=shop?'#'+shop.col.toString(16).padStart(6,'0'):'#fbcf3b';
  const slotLabel={rod:'Rod',reel:'Reel',line:'Line',box:'Tackle Box'};
  // Gear rows — only the tiers this shop stocks AND that are the next-or-owned step (no buying tier
  // 3 before tier 2). A tier is buyable if it's exactly one above what you own.
  let gearHtml='';
  if(shop&&shop.sells){
    for(const slot of Object.keys(shop.sells)){
      for(const tier of shop.sells[slot]){
        const it=GEAR[slot][tier];const cost=loyaltyDiscount(it.cost);const owned=gear[slot]>=tier;const buyable=gear[slot]===tier-1&&bait>=cost;
        gearHtml+=`<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:rgba(3,7,18,0.5);border-radius:8px;margin:5px 0;opacity:${owned||buyable?1:0.5}">
          <div style="flex:1;min-width:0;padding-right:10px"><div style="font-weight:600;font-size:12.5px;color:#e8edf5">${it.e} ${it.n} <span style="color:#64748b;font-size:9px;text-transform:uppercase;letter-spacing:1px">${slotLabel[slot]}</span></div><div style="font-size:10.5px;color:#94a3b8;line-height:1.4;margin-top:2px">${it.d}</div></div>
          <button class="btn bp gear-buy" data-slot="${slot}" data-tier="${tier}" style="width:auto;padding:7px 13px;margin:0;font-size:11px;background:${owned?'#1f5f3a':buyable?titleCol:'#374151'}">${owned?'✓ OWNED':bait>=cost?priceLabel(it.cost):'—'}</button>
        </div>`;
      }
    }
  }
  const conIds=shop?shop.consumables:SHOP_ITEMS.map(i=>i.id);
  const conRows=SHOP_ITEMS.filter(it=>conIds.includes(it.id)).map(it=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:rgba(3,7,18,0.5);border-left:3px solid ${it.c};border-radius:8px;margin:5px 0">
      <div style="flex:1;min-width:0;padding-right:10px"><div style="font-weight:600;color:${it.c};font-size:12.5px">${it.n}</div><div style="font-size:10.5px;color:#94a3b8;line-height:1.4;margin-top:2px">${it.desc}</div></div>
      <button class="btn bp shop-buy" data-id="${it.id}" style="width:auto;padding:7px 13px;margin:0;background:${bait>=loyaltyDiscount(it.cost)?it.c:'#374151'};font-size:11px">${bait>=loyaltyDiscount(it.cost)?priceLabel(it.cost):'—'}</button>
    </div>`).join('');
  card.innerHTML=`
    <div class="m-kicker" style="color:${titleCol}">${shop?'Bait Shop':'Tackle Shop'}</div>
    <div class="m-title" style="font-size:18px">${title}</div>
    ${shop?`<div class="m-sub" style="font-style:italic">"${shop.blurb}"</div>`:''}
    <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(3,7,18,0.5);border-radius:8px;padding:8px 12px;margin:8px 0;font-size:12px;gap:10px">
      <div><span style="color:#94a3b8">Bait on hand</span> <span style="color:#fbcf3b;font:700 14px 'JetBrains Mono',monospace">${bait}</span></div>
      ${(()=>{const t=loyaltyTier();const nxt=LOYALTY_TIERS[LOYALTY_TIERS.indexOf(t)+1];
        return `<div style="text-align:right;font:10px 'JetBrains Mono',monospace;line-height:1.4"><span style="color:${t.pct>0?'#10b981':'#94a3b8'};letter-spacing:1px;text-transform:uppercase">${t.name}${t.pct>0?` · -${(t.pct*100|0)}%`:''}</span>${nxt?`<br><span style="color:#64748b">Next: ${nxt.name} at ${nxt.at} spent (${nxt.at-loyaltySpent} to go)</span>`:''}</div>`;
      })()}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0 4px">
      <div style="font:11px 'JetBrains Mono',monospace;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">Bait Pantry · equip one for your next casts</div>
      <div style="display:flex;gap:3px">
        ${['all','foraged','crafted'].map(t=>`<button class="pantry-tab" data-t="${t}" style="background:${_pantryTab===t?'rgba(251,207,59,0.2)':'rgba(3,7,18,0.5)'};border:1px solid ${_pantryTab===t?'#fbcf3b':'rgba(30,41,59,0.6)'};color:${_pantryTab===t?'#fbcf3b':'#94a3b8'};font:600 9px 'JetBrains Mono',monospace;letter-spacing:1px;padding:4px 8px;border-radius:4px;cursor:pointer">${t.toUpperCase()}</button>`).join('')}
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
      ${_pantryTab!=='crafted'?`<button class="btn bait-equip" data-k="" style="background:${equippedBait===''?'#475569':'rgba(3,7,18,0.5)'};border:1px solid #475569;color:#cbd5e1;width:auto;padding:6px 10px;margin:0;font-size:11px">🪝 Bare hook</button>`:''}
      ${Object.entries(BAIT_TYPES).filter(([k,bt])=>{
        if(_pantryTab==='all')return true;
        const isCrafted=bt.crafted||bt.isLure;
        return _pantryTab==='crafted'?isCrafted:!isCrafted;
      }).map(([k,bt])=>{const have=baitInv[k]||0;const eq=equippedBait===k;return `<button class="btn bait-equip" data-k="${k}" style="background:${eq?bt.c:'rgba(3,7,18,0.5)'};border:1px solid ${bt.c}55;color:${eq?'#02060f':bt.c};width:auto;padding:6px 10px;margin:0;font-size:11px"${have<=0?' disabled':''} title="${bt.desc}">${bt.e} ${bt.n} <span style="opacity:0.65">×${have}</span></button>`}).join('')}
    </div>
    ${(()=>{
      // Generic crafting block — renders one row per CRAFT_RECIPES entry the player has either
      // already crafted before or has the ingredients for. Hidden entirely if neither is true.
      const visible=CRAFT_RECIPES.filter(r=>(baitInv[r.out]||0)>0||Object.entries(r.in).every(([k,n])=>(baitInv[k]||0)>=n));
      if(!visible.length)return '';
      const rows=visible.map(r=>{
        const canCraft=Object.entries(r.in).every(([k,n])=>(baitInv[k]||0)>=n);
        const cost=Object.entries(r.in).map(([k,n])=>`${BAIT_TYPES[k].e}×${n}`).join(' + ');
        const bt=BAIT_TYPES[r.out],col=bt.c;
        return `<div style="background:rgba(251,207,59,0.04);border:1px dashed ${col}66;border-radius:8px;padding:8px 12px;margin-bottom:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div><b style="color:${col}">${r.tag}</b> <span style="color:#94a3b8;font-size:10px">×${baitInv[r.out]||0}</span><div style="font-size:10px;color:#94a3b8;margin-top:2px">${r.blurb}</div></div>
            <button class="btn recipe-craft" data-rid="${r.id}" ${canCraft?'':'disabled'} title="Cost: ${cost}" style="background:${canCraft?`linear-gradient(135deg,${col},#1a1a2e)`:'rgba(3,7,18,0.5)'};color:${canCraft?'#1a1a2e':'#475569'};border:1px solid ${col}88;width:auto;padding:6px 12px;margin:0;font-size:11px">CRAFT (${cost})</button>
          </div>
        </div>`;
      }).join('');
      return `<div style="font:11px 'JetBrains Mono',monospace;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin:8px 0 4px">Tackle Bench · craft custom bait</div>${rows}`;
    })()}
    ${gearHtml?`<div style="font:11px 'JetBrains Mono',monospace;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin:8px 0 2px">Equipment</div>${gearHtml}`:''}
    ${shop&&shop.boatworks?renderBoatworksRows():''}
    <div style="font:11px 'JetBrains Mono',monospace;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin:10px 0 2px">Consumables</div>
    ${conRows}
    <button class="btn bx" onclick="DS.closePeek()" style="margin-top:12px">Cast Off</button>`;
  const reopen=()=>openShop(shop);
  card.querySelectorAll('.shop-buy').forEach(b=>b.onclick=()=>{const it=SHOP_ITEMS.find(x=>x.id===b.dataset.id);if(!it||bait<loyaltyDiscount(it.cost))return;loyaltyBuy(it.cost);it.fn();persist();sfx('click');reopen()});
  card.querySelectorAll('.bait-equip').forEach(b=>b.onclick=()=>{const k=b.dataset.k;if(k&&(baitInv[k]||0)<=0)return;equippedBait=k;persist();sfx('click');reopen()});
  card.querySelectorAll('.pantry-tab').forEach(b=>b.onclick=()=>{_pantryTab=b.dataset.t;reopen()});
  card.querySelectorAll('.recipe-craft').forEach(b=>b.onclick=()=>{
    const r=CRAFT_RECIPES.find(x=>x.id===b.dataset.rid);if(!r)return;
    if(!Object.entries(r.in).every(([k,n])=>(baitInv[k]||0)>=n))return;
    Object.entries(r.in).forEach(([k,n])=>{baitInv[k]=(baitInv[k]||0)-n});
    baitInv[r.out]=(baitInv[r.out]||0)+1;persist();sfx('win');
    if(r.ach)onUnlock(r.ach);
    pushAchToast({n:BAIT_TYPES[r.out].n.toUpperCase(),d:'Crafted at the tackle bench.'});
    reopen();
  });
  card.querySelectorAll('.gear-buy').forEach(b=>b.onclick=()=>{const slot=b.dataset.slot,tier=+b.dataset.tier,it=GEAR[slot][tier];if(gear[slot]!==tier-1||bait<loyaltyDiscount(it.cost))return;loyaltyBuy(it.cost);gear[slot]=tier;persist();sfx('win');onUnlock('first_gear');if(['rod','reel','line','box'].every(s=>gear[s]>=GEAR[s].length-1))onUnlock('fully_decked');reopen()});
  card.querySelectorAll('.up-buy').forEach(b=>b.onclick=()=>{const slot=b.dataset.slot,tier=+b.dataset.tier,it=BOAT_UP[slot][tier];const cur=(boatUpgrades[S.bc]||{})[slot]||0;if(cur!==tier-1||bait<loyaltyDiscount(it.cost))return;loyaltyBuy(it.cost);boatUpgrades[S.bc][slot]=tier;persist();sfx('win');onUnlock('first_upgrade');if(['engine','lights','armor','electronics'].every(s=>(boatUpgrades[S.bc][s]||0)>=BOAT_UP[s].length-1))onUnlock('boat_maxed');mkBoat(S.bc);reopen()});
  el.style.display='flex';
}

// Stubs — real bodies land in dedicated commits below. They render a placeholder card so the
// buttons don't no-op in this commit while the bait-economy ships first.
// Category buckets for the achievements UI — id prefix determines the category bin.
// Anything not matched falls into 'misc'. Order here defines the render order.
const ACH_CATEGORIES=[
  {id:'fishing',name:'Fishing',col:'#10b981',ids:['first_catch','first_release','legendary_landed','gator_wrangler','bait_baron','codex_half','codex_full']},
  {id:'duct',name:'Duct',col:'#ffd23f',ids:['duct_sighting','duct_near_miss','duct_ten_attempts','duct_25_attempts','duct_three_near','duct_lure_crafted']},
  {id:'rescue',name:'Rescue',col:'#fb923c',ids:['five_missions','full_extraction','home_repaired','deep_dock','boss_clean','gator_king','storm_survivor']},
  {id:'gear',name:'Gear & Boat',col:'#60d0ff',ids:['first_gear','fully_decked','first_upgrade','boat_maxed']},
  {id:'forage',name:'Foraging & Craft',col:'#a47a52',ids:['first_forage','worm_farmer','pantry_stocked','first_craft']},
  {id:'retention',name:'Streaks',col:'#3b82f6',ids:['streak_7','streak_30']}
];
function openAchievements(){const card=$('mini-card'),el=$('mini');if(!card||!el)return;miniActive=true;_peekOpen=true;
  const all=Object.entries(ACH);
  const got=[...achievements].map(id=>ACH[id]).filter(Boolean);
  // Assign every entry to a category; ids that don't show up in any bucket fall into 'misc'.
  const seen=new Set();
  const cats=ACH_CATEGORIES.map(c=>({...c,rows:c.ids.filter(id=>ACH[id]).map(id=>{seen.add(id);return [id,ACH[id]]})}));
  const misc=all.filter(([id])=>!seen.has(id));
  if(misc.length)cats.push({id:'misc',name:'Misc',col:'#94a3b8',rows:misc});
  const renderRow=([id,a])=>{
    const u=achievements.has(id);
    // Tiered achievements with a .p(state) function render a tiny progress bar + cur/max readout.
    let progHtml='';
    if(!u&&typeof a.p==='function'){
      try{const pr=a.p();if(pr&&pr.max>0){const pct=Math.min(100,(pr.cur/pr.max)*100);
        progHtml=`<div style="margin-top:5px;display:flex;align-items:center;gap:6px"><div style="flex:1;height:5px;background:rgba(3,7,18,0.7);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#fb923c,#fbcf3b)"></div></div><span style="font:10px 'JetBrains Mono',monospace;color:#94a3b8;min-width:42px;text-align:right">${pr.cur} / ${pr.max}</span></div>`}}catch(e){}
    }
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(3,7,18,0.45);border-radius:8px;margin:4px 0;opacity:${u?1:0.55}"><div style="font-size:22px">${u?'🏅':'🔒'}</div><div style="flex:1;min-width:0"><div style="font:700 12.5px 'DM Sans',sans-serif;color:${u?'#fbcf3b':'#94a3b8'}">${a.n}</div><div style="font-size:11px;color:#94a3b8;line-height:1.4">${a.d}</div>${progHtml}</div></div>`;
  };
  const catBlocks=cats.filter(c=>c.rows.length).map(c=>{
    const unlocked=c.rows.filter(([id])=>achievements.has(id)).length;
    return `<div style="margin-top:10px"><div style="display:flex;justify-content:space-between;align-items:center;font:700 9px 'JetBrains Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;color:${c.col};margin-bottom:4px"><span>${c.name}</span><span style="color:#64748b;font-weight:400">${unlocked}/${c.rows.length}</span></div>${c.rows.map(renderRow).join('')}</div>`;
  }).join('');
  const shareBtn=got.length?`<button class="btn bx" onclick="DS.exportAchievements()" style="margin-top:14px;margin-right:8px;width:auto;display:inline-block">💾 Share PNG</button>`:'';
  card.innerHTML=`<div class="m-kicker" style="color:#fbcf3b">Achievements</div><div class="m-title">${got.length} / ${all.length} unlocked.</div><div class="m-sub">Earned across all your sessions.</div>${catBlocks}<div style="margin-top:14px;display:flex;gap:8px">${shareBtn}<button class="btn bx" onclick="DS.closePeek()" style="flex:1">Close</button></div>`;
  el.style.display='flex';
}
// Settings tab state — persists across reopens so the player isn't jolted back to the first tab.
let _setTab='audio';
function openSettings(){const card=$('mini-card'),el=$('mini');if(!card||!el)return;miniActive=true;_peekOpen=true;
  const tabBtn=(id,label)=>`<button class="set-tab" data-tab="${id}" style="background:${_setTab===id?'rgba(96,208,255,0.18)':'rgba(3,7,18,0.5)'};border:1px solid ${_setTab===id?'#60d0ff':'rgba(30,41,59,0.6)'};color:${_setTab===id?'#60d0ff':'#94a3b8'};font:600 11px 'JetBrains Mono',monospace;letter-spacing:1px;padding:7px 14px;border-radius:6px;cursor:pointer">${label}</button>`;
  const row=(label,right)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid rgba(30,41,59,0.4)"><span style="color:#cbd5e1">${label}</span>${right}</div>`;
  // Audio tab: sound toggle + the two sliders.
  const audioTab=`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0"><span style="color:#cbd5e1">Sound</span><button class="btn bx" id="set-mute" onclick="DS.toggleMute();document.getElementById('set-mute').textContent=document.getElementById('mute-btn').textContent" style="width:auto;padding:6px 12px;margin:0">${muted?'🔇 Off':'🔊 On'}</button></div>
    ${row('Master Volume',`<input id="audio-vol" type="range" min="0" max="1" step="0.05" value="${_audVol}" oninput="DS.setAudVol(parseFloat(this.value))" style="width:160px;accent-color:#fb923c">`)}
    ${row('· SFX',`<input id="sfx-vol" type="range" min="0" max="1" step="0.05" value="${_sfxVol}" oninput="DS.setSfxVol(parseFloat(this.value))" style="width:160px;accent-color:#94a3b8">`)}
    ${row('· Engine',`<input id="engine-vol" type="range" min="0" max="1" step="0.05" value="${_engineVol}" oninput="DS.setEngineVol(parseFloat(this.value))" style="width:160px;accent-color:#94a3b8">`)}
    ${row('· Ambient',`<input id="ambient-vol" type="range" min="0" max="1" step="0.05" value="${_ambientVol}" oninput="DS.setAmbientVol(parseFloat(this.value))" style="width:160px;accent-color:#94a3b8">`)}
    ${row('· Music',`<input id="music-vol" type="range" min="0" max="1" step="0.05" value="${_musicVol}" oninput="DS.setMusicVol(parseFloat(this.value))" style="width:160px;accent-color:#94a3b8">`)}
  `;
  // Graphics tab: quality preset + shake.
  const gfxTab=`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0"><span style="color:#cbd5e1">Graphics Quality</span><select id="set-gfx" onchange="DS.setGfx(this.value)" style="background:rgba(8,18,38,0.8);border:1px solid rgba(251,146,60,0.25);color:#e8edf5;border-radius:6px;padding:6px 10px;font:12px 'DM Sans',sans-serif"><option value="low" ${gfxQuality==='low'?'selected':''}>Low (fastest)</option><option value="medium" ${gfxQuality==='medium'?'selected':''}>Medium</option><option value="high" ${gfxQuality==='high'?'selected':''}>High (bloom + reflections)</option></select></div>
    ${row('Screen Shake',`<input id="shake-mul" type="range" min="0" max="1.5" step="0.1" value="${_shakeMul}" oninput="DS.setShakeMul(parseFloat(this.value))" style="width:160px;accent-color:#fb923c">`)}
    ${row('Reset Save',`<button class="btn bx" onclick="if(confirm('Wipe all trophies + bait + achievements?')){try{localStorage.removeItem('dockshield_save_v1')}catch(e){};location.reload()}" style="width:auto;padding:6px 12px;margin:0;border-color:rgba(239,68,68,0.4);color:#fca5a5">WIPE</button>`)}
  `;
  // Controls tab: keybinds + the bobber-rhythm key, which didn't exist when this card was first written.
  const controlsTab=`
    <div style="font:11px 'JetBrains Mono',monospace;color:#94a3b8;line-height:1.85;padding:6px 0">
      <span style="color:#fbcf3b">W A S D</span> · Arrows — Drive<br>
      <span style="color:#fbcf3b">Space</span> — Sonar Ping / Reel (in a fight)<br>
      <span style="color:#fbcf3b">B</span> — Bobber-bounce tap (rhythm bonus during fights + Duct)<br>
      <span style="color:#fbcf3b">F</span> — Cast (when stopped) / engage Duct<br>
      <span style="color:#fbcf3b">E</span> — Dock at a bait shop<br>
      <span style="color:#fbcf3b">G</span> — Beach at a shore camp (forage)<br>
      <span style="color:#fbcf3b">P</span> — Photo mode (orbit cam)<br>
      <span style="color:#fbcf3b">M</span> — Toggle minimap zoom<br>
      <span style="color:#fbcf3b">Esc</span> — Bail mini-game / close menus
    </div>
    ${row('Replay Tutorials',`<button class="btn bx" onclick="DS.replayTutorials();this.textContent='Will Replay'" style="width:auto;padding:6px 12px;margin:0">Clear seen flags</button>`)}
  `;
  const tabHtml={audio:audioTab,gfx:gfxTab,controls:controlsTab}[_setTab];
  card.innerHTML=`<div class="m-kicker" style="color:#60d0ff">Settings</div><div class="m-title">Operations panel.</div>
    <div style="display:flex;gap:6px;margin:10px 0 8px">${tabBtn('audio','🔊 Audio')}${tabBtn('gfx','✨ Graphics')}${tabBtn('controls','🎮 Controls')}</div>
    <div style="background:rgba(3,7,18,0.5);border-radius:8px;padding:6px 14px;margin-bottom:10px;min-height:180px">${tabHtml}</div>
    <button class="btn bx" onclick="DS.closePeek()">Close</button>`;
  card.querySelectorAll('.set-tab').forEach(b=>b.onclick=()=>{_setTab=b.dataset.tab;openSettings()});
  el.style.display='flex';
}
function setGfx(q){gfxQuality=q;try{localStorage.setItem('dockshield_gfx',q)}catch(e){}applyGfx()}
function setAudVol(v){_audVol=Math.max(0,Math.min(1,v));persist()}
function setShakeMul(v){_shakeMul=Math.max(0,Math.min(1.5,v));persist()}
function setSfxVol(v){_sfxVol=Math.max(0,Math.min(1,v));persist()}
function setEngineVol(v){_engineVol=Math.max(0,Math.min(1,v));persist()}
function setAmbientVol(v){_ambientVol=Math.max(0,Math.min(1,v));persist()}
function setMusicVol(v){_musicVol=Math.max(0,Math.min(1,v));persist()}
// Clear all tutorial-seen flags so the first-time overlays re-fire on the next encounter.
// Intro is excluded — re-firing it on the next reload would surprise the player.
function replayTutorials(){const intro=tutorialSeen.intro;tutorialSeen={};if(intro)tutorialSeen.intro=intro;persist()}
// Identity setters — persist + update the HUD operative pill if a name is added mid-run.
function setHandle(v){playerHandle=String(v||'').slice(0,24);persist()}
function setBoatName(v){boatName=String(v||'').slice(0,24);persist();if(S.bc)boat(S.bc)}
// Render the player's biggest catch into a shareable PNG. Lays the trophy out on a 1200×630
// open-graph-friendly card and triggers a browser download.
// === MOBILE TOUCH GLUE ===
// Bridge mobile buttons to the right action based on context — the same E/G/B/F keys on desktop.
function touchDock(){if(_nearShop)dockShop(_nearShop.userData.shop);else if(_bobberState)tryHookSet();else sfx('click')}
function touchForage(){if(_nearCamp)dockCamp(_nearCamp.userData.camp,_nearCamp);else sfx('click')}
function touchBobber(){
  // On mobile, BOBBER taps the rhythm bobber dot directly (Duct or fight). If neither is open,
  // and we're in the wait/nibble window, treat it as a hook-set.
  const dbob=document.getElementById('d-bob');if(dbob){dbob.click();return}
  const fbob=document.getElementById('f-bob');if(fbob){fbob.click();return}
  if(_bobberState)tryHookSet();
}
// === BOAT HORN ===
// Honk when the player taps E away from a shop, or when this hook is called from the mobile button.
let _hornLast=0;
function boatHorn(){
  const now=Date.now()*0.001;if(now-_hornLast<1.2)return;_hornLast=now;
  sfx('catch');setTimeout(()=>sfx('hit'),140);  // two short pops fake a horn
  // Cheeky radio variant per hero.
  const lines={regular:'(toot)',pontoon:'HONK! Make way!',speedboat:'(short blip)'};
  radio(lines[S.bc]||'(toot)',HERO[S.bc]?HERO[S.bc].id:'self');
}
function touchHorn(){boatHorn()}
function exportTrophy(){
  if(!bestFish)return false;
  const W=1200,H=630;const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  // Background — radial gradient + a subtle vignette.
  const bg=x.createRadialGradient(W/2,H*0.4,40,W/2,H/2,W*0.7);
  bg.addColorStop(0,'#0c1c2e');bg.addColorStop(1,'#02060f');x.fillStyle=bg;x.fillRect(0,0,W,H);
  const rcol=({legendary:'#ffd23f',rare:'#a78bfa',uncommon:'#3b82f6',common:'#10b981'})[bestFish.r]||'#fb923c';
  // Top kicker.
  x.font='700 24px JetBrains Mono, monospace';x.fillStyle='#fb923c';x.textAlign='center';x.fillText('DOCKSHIELD · THE DEPTH', W/2, 90);
  // Big emoji + name.
  x.font='180px DM Sans, sans-serif';x.fillText(bestFish.e||'🏆',W/2,310);
  x.font='700 80px DM Sans, sans-serif';x.fillStyle=rcol;x.fillText(bestFish.n,W/2,420);
  // Score + date.
  x.font='600 36px JetBrains Mono, monospace';x.fillStyle='#fde68a';x.fillText('+'+bestFish.s+' score',W/2,490);
  x.font='400 24px DM Sans, sans-serif';x.fillStyle='#94a3b8';x.fillText('biggest catch · '+(bestFish.date||''),W/2,538);
  // Rarity stripe.
  x.fillStyle=rcol;x.fillRect(W*0.3,576,W*0.4,4);
  x.font='600 16px JetBrains Mono, monospace';x.fillStyle='#475569';x.fillText('CASTOR BAYOU · WE HOLD THE LINE'+(playerHandle?' · '+playerHandle:''),W/2,610);
  // Trigger download.
  const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='dockshield-trophy.png';document.body.appendChild(a);a.click();a.remove();
  sfx('win');return true;
}
// Streak share card — same OG-friendly 1200×630 framing as exportTrophy. Shows the player's
// current daily-streak count + all-time best as a shareable PNG.
function exportStreak(){
  if(!streak||(streak.count||0)<1)return false;
  const W=1200,H=630;const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  // Background — warmer than the trophy card, with a soft orange aura under the flame.
  const bg=x.createRadialGradient(W/2,H*0.45,40,W/2,H/2,W*0.8);
  bg.addColorStop(0,'#1a1006');bg.addColorStop(0.45,'#0a0a18');bg.addColorStop(1,'#02060f');
  x.fillStyle=bg;x.fillRect(0,0,W,H);
  x.font='700 24px JetBrains Mono, monospace';x.fillStyle='#fb923c';x.textAlign='center';
  x.fillText('DOCKSHIELD · THE DEPTH',W/2,90);
  x.font='160px DM Sans, sans-serif';x.fillText('🔥',W/2,310);
  x.font='700 110px DM Sans, sans-serif';x.fillStyle='#fde68a';x.fillText('Day '+(streak.count||0),W/2,430);
  x.font='600 32px JetBrains Mono, monospace';x.fillStyle='#fbcf3b';x.fillText('at the Bayou',W/2,472);
  if((streak.max||0)>(streak.count||0)){
    x.font='400 22px DM Sans, sans-serif';x.fillStyle='#94a3b8';x.fillText('best streak · '+streak.max+' days',W/2,520);
  }
  x.fillStyle='#fb923c';x.fillRect(W*0.32,560,W*0.36,4);
  x.font='600 16px JetBrains Mono, monospace';x.fillStyle='#475569';x.fillText('CASTOR BAYOU · WE HOLD THE LINE'+(playerHandle?' · '+playerHandle:''),W/2,608);
  const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='dockshield-streak.png';document.body.appendChild(a);a.click();a.remove();
  sfx('win');return true;
}
// Achievements share card — 1200x630 OG-friendly PNG showing the player's unlock count + the
// 5 most-recently-earned badge names. Companion to exportTrophy/exportStreak.
function exportAchievements(){
  const got=[...achievements].map(id=>ACH[id]).filter(Boolean);
  if(!got.length)return false;
  const W=1200,H=630;const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  const bg=x.createRadialGradient(W/2,H*0.45,40,W/2,H/2,W*0.8);
  bg.addColorStop(0,'#0c1c2e');bg.addColorStop(0.45,'#0a0a18');bg.addColorStop(1,'#02060f');
  x.fillStyle=bg;x.fillRect(0,0,W,H);
  x.font='700 24px JetBrains Mono, monospace';x.fillStyle='#fb923c';x.textAlign='center';
  x.fillText('DOCKSHIELD · THE DEPTH',W/2,90);
  x.font='130px DM Sans, sans-serif';x.fillText('🏅',W/2,260);
  x.font='700 90px DM Sans, sans-serif';x.fillStyle='#fde68a';x.fillText(got.length+' / '+Object.keys(ACH).length,W/2,360);
  x.font='600 28px JetBrains Mono, monospace';x.fillStyle='#fbcf3b';x.fillText('achievements unlocked',W/2,395);
  // Most-recent 5 badge names (achievement set preserves insertion order on add).
  const recent=got.slice(-5).reverse();
  x.font='400 20px DM Sans, sans-serif';x.textAlign='left';
  recent.forEach((a,i)=>{x.fillStyle='#fbcf3b';x.fillText('★',W*0.18,475+i*28);x.fillStyle='#e8edf5';x.fillText(a.n,W*0.18+24,475+i*28)});
  x.textAlign='center';x.fillStyle='#fb923c';x.fillRect(W*0.32,560,W*0.36,4);
  x.font='600 16px JetBrains Mono, monospace';x.fillStyle='#475569';x.fillText('CASTOR BAYOU · WE HOLD THE LINE'+(playerHandle?' · '+playerHandle:''),W/2,608);
  const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='dockshield-achievements.png';document.body.appendChild(a);a.click();a.remove();
  sfx('win');return true;
}
function applyGfx(){
  if(!scene)return;
  const lowMode=gfxQuality==='low',highMode=gfxQuality==='high';
  // Wet-screen overlay is disabled on Low.
  wet.enabled=!lowMode;if(lowMode&&wet.ctx&&wet.cv){wet.drops.length=0;wet.ctx.clearRect(0,0,wet.cv.width,wet.cv.height)}
  // Glow sprites are the biggest cost on weak GPUs — hide on Low, dim on Medium, full on High.
  const setGlow=(s,baseOpacity,scaleHi)=>{if(!s)return;s.visible=!lowMode;s.material.opacity=baseOpacity*(lowMode?0:highMode?1.3:1);if(scaleHi)s.scale.setScalar(scaleHi*(highMode?1.25:1))};
  setGlow(scene._sunGlow,0.6,80);
  if(scene._pinG){const glow=scene._pinG.children.find(c=>c.isSprite);setGlow(glow,0.7,7)}
  dropPoints.forEach(dp=>{if(dp.userData.glow)setGlow(dp.userData.glow,0.55,6)});
  // Renderer tone mapping exposure leans warmer on High.
  if(ren)ren.toneMappingExposure=highMode?1.4:lowMode?1.0:1.2;
}
/* gfxQuality declaration + initial load moved to the persistence block at the top of the file. */

// Codex search/filter state — persists across reopens like the settings tab does.
let _codexQ='',_codexTier='all';
// Pier's Notes Duct sparkline span — toggles 14 ↔ 30 days via the in-card button.
let _ductChartSpan=14;
function toggleDuctSpan(){_ductChartSpan=_ductChartSpan===14?30:14;openCodex()}
// Bait pantry filter — All / Foraged (worm/cricket/frog/minnow/crayfish) / Crafted (BAIT_TYPES.crafted/isLure).
let _pantryTab='all';
function openCodex(){
  const card=$('mini-card'),el=$('mini');if(!card||!el)return;
  miniActive=true;_peekOpen=true;
  const caught=fishCatalog.size,total=FISH.length;
  // Filter pipeline — query (case-insensitive name match) + tier filter (all | per-rarity | caught-only).
  const matches=f=>{
    if(_codexTier!=='all'&&_codexTier!=='caught'&&f.r!==_codexTier)return false;
    if(_codexTier==='caught'&&!fishCatalog.has(f.n))return false;
    if(_codexQ&&!f.n.toLowerCase().includes(_codexQ.toLowerCase()))return false;
    return true;
  };
  const tierPill=(id,label,c)=>`<button class="cdx-tier" data-t="${id}" style="background:${_codexTier===id?(c||'#60d0ff')+'33':'rgba(3,7,18,0.5)'};border:1px solid ${_codexTier===id?(c||'#60d0ff'):'rgba(30,41,59,0.5)'};color:${_codexTier===id?(c||'#60d0ff'):'#94a3b8'};font:600 10px 'JetBrains Mono',monospace;letter-spacing:1px;padding:5px 10px;border-radius:5px;cursor:pointer">${label}</button>`;
  const byTier=r=>FISH.filter(f=>f.r===r&&matches(f));
  const tierBlock=(label,r)=>{const list=byTier(r);if(!list.length)return '';
    return `<div style="margin:8px 0 2px;font:700 9px 'JetBrains Mono',monospace;letter-spacing:1.5px;color:${RARE_COLOR[r]};text-transform:uppercase">${label} <span style="color:#64748b">· ${list.filter(f=>fishCatalog.has(f.n)).length}/${list.length}</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">${list.map(f=>{const got=fishCatalog.has(f.n);const sl=speciesLog[f.n];const tip=got?(sl?`${f.f}\n— First landed ${sl.date} at ${sl.spot} (+${sl.score})`:f.f):'Not yet caught';return `<span title="${tip}" style="background:rgba(8,18,38,0.6);border:1px solid ${got?RARE_COLOR[r]:'rgba(148,163,184,0.2)'};border-radius:6px;padding:4px 8px;color:${got?RARE_COLOR[r]:'#475569'};font:12px 'DM Sans',sans-serif">${got?f.e+' '+f.n:'🔒 ???'}</span>`}).join('')}</div>`};
  // If the filter zeros out a tier, hide the whole block (showing only matching rows).
  const allEmpty=['common','uncommon','rare','legendary'].every(r=>byTier(r).length===0);
  card.innerHTML=`
    <div class="m-kicker" style="color:#60d0ff">Fish Codex</div>
    <div class="m-title">${caught} / ${total} species landed.</div>
    <div class="m-sub">Drive to a named spot and cast to fill the board. Rarer water holds rarer fish.</div>
    ${bestFish?`<div style="display:flex;align-items:center;gap:10px;background:rgba(${bestFish.r==='legendary'?'255,210,63':bestFish.r==='rare'?'139,92,246':'16,185,129'},0.08);border:1px solid ${RARE_COLOR[bestFish.r]||'#475569'}55;border-radius:8px;padding:8px 12px;margin:8px 0">
      <div style="font-size:22px">${bestFish.e||'🏆'}</div>
      <div style="flex:1;min-width:0"><div style="font:9px 'JetBrains Mono',monospace;letter-spacing:1.5px;color:#fb923c;text-transform:uppercase">Trophy · biggest ever</div>
      <div style="color:${RARE_COLOR[bestFish.r]||'#e8edf5'};font-weight:600;font-size:13px">${bestFish.n} <span style="color:#fde68a">+${bestFish.s}</span> <span style="color:#64748b;font-size:10px">· ${bestFish.date||''}</span></div></div>
      <button class="btn bx" onclick="DS.exportTrophy()" title="Save as PNG" style="width:auto;padding:5px 10px;margin:0;font-size:10px">💾 Save</button>
    </div>`:''}
    <div style="display:flex;gap:6px;margin:10px 0 4px;align-items:center">
      <input id="cdx-q" type="text" placeholder="Search species…" value="${_codexQ}" style="flex:1;background:rgba(8,18,38,0.6);border:1px solid rgba(96,208,255,0.25);color:#e8edf5;border-radius:6px;padding:7px 10px;font:12px 'DM Sans',sans-serif">
      ${_codexQ?'<button id="cdx-clear" title="Clear search" style="background:rgba(3,7,18,0.5);border:1px solid rgba(30,41,59,0.5);color:#94a3b8;border-radius:6px;padding:5px 10px;cursor:pointer">✕</button>':''}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">
      ${tierPill('all','All')}
      ${tierPill('common','Common',RARE_COLOR.common)}
      ${tierPill('uncommon','Uncommon',RARE_COLOR.uncommon)}
      ${tierPill('rare','Rare',RARE_COLOR.rare)}
      ${tierPill('legendary','Legendary',RARE_COLOR.legendary)}
      ${tierPill('caught','Caught only','#fb923c')}
    </div>
    ${allEmpty?`<div style="text-align:center;padding:24px;color:#64748b;font:12px 'DM Sans',sans-serif">No species match the current filter.</div>`:`${tierBlock('Common','common')}${tierBlock('Uncommon','uncommon')}${tierBlock('Rare','rare')}${tierBlock('Legendary','legendary')}`}
    <div style="margin:12px 0 2px;font:700 9px 'JetBrains Mono',monospace;letter-spacing:1.5px;color:#ffd23f;text-transform:uppercase">??? · The Impossible</div>
    <div style="display:flex;align-items:flex-start;gap:10px;background:rgba(255,210,63,0.06);border:1px dashed rgba(255,210,63,0.35);border-radius:8px;padding:10px 12px">
      <div style="font-size:26px;filter:grayscale(0.3)">🦆</div>
      <div style="flex:1;min-width:0"><div style="font-weight:700;color:#ffd23f">Duct <span style="color:#64748b;font-size:9px;text-transform:uppercase;letter-spacing:1px">uncatchable</span></div>
      <div style="font-size:10.5px;color:#94a3b8;line-height:1.5">Rubber ducky. Duct tape on his back. Nobody has ever landed him — and you won't either.<br>Spotted <b style="color:#fde68a">${ductStats.sightings}</b> · Almost had him <b style="color:#fde68a">${ductStats.nearCatches}</b> · Attempts <b style="color:#fde68a">${ductStats.attempts}</b></div>
      ${(()=>{
        // N-day sparkline. _ductChartSpan toggles between 14 and 30 days. Best-week highlight
        // strip marks the 7-day window with the most attempts.
        const span=_ductChartSpan||14;
        const today=new Date();const days=[];for(let i=span-1;i>=0;i--){const d=new Date(today);d.setDate(d.getDate()-i);days.push(d.toISOString().slice(0,10))}
        const entries=days.map(d=>ductLog[d]||{s:0,a:0,n:0});
        const max=Math.max(1,...entries.map(e=>Math.max(e.s,e.a,e.n)));
        if(max<=1&&Object.keys(ductLog).length===0)return '';
        // Best-week highlight: scan every 7-day sliding window for the one with the most attempts.
        let bestStart=0,bestSum=-1;
        for(let i=0;i<=entries.length-7;i++){let sum=0;for(let j=0;j<7;j++)sum+=entries[i+j].a;if(sum>bestSum){bestSum=sum;bestStart=i}}
        const showBest=bestSum>0;
        return `<div style="margin-top:8px;font:9px 'JetBrains Mono',monospace;color:#64748b;letter-spacing:1px;text-transform:uppercase;display:flex;justify-content:space-between;align-items:center">
          <span>Pier's Notes · last ${span} days${showBest?` · best week ${bestSum} attempts`:''}</span>
          <button onclick="DS.toggleDuctSpan()" style="background:rgba(251,207,59,0.08);border:1px solid rgba(251,207,59,0.3);color:#fbcf3b;font:600 8px 'JetBrains Mono',monospace;letter-spacing:1px;padding:2px 6px;border-radius:3px;cursor:pointer">${span===14?'30d':'14d'}</button>
        </div>
          <div style="position:relative;display:flex;align-items:flex-end;gap:1px;height:34px;padding:2px 0;border-bottom:1px solid rgba(251,207,59,0.2)">
            ${showBest?`<div style="position:absolute;left:${(bestStart/entries.length)*100}%;width:${(7/entries.length)*100}%;top:0;bottom:0;background:rgba(16,185,129,0.08);border:1px dashed rgba(16,185,129,0.4);pointer-events:none"></div>`:''}
            ${entries.map((e,i)=>`<div title="${days[i]} · sightings ${e.s} · attempts ${e.a} · near ${e.n}" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:1px;height:100%;position:relative">
              ${e.n>0?`<div style="height:${(e.n/max)*30}px;background:#10b981"></div>`:''}
              ${e.a>0?`<div style="height:${(e.a/max)*30}px;background:#fbcf3b"></div>`:''}
              ${e.s>0?`<div style="height:${(e.s/max)*30}px;background:rgba(251,207,59,0.4)"></div>`:''}
            </div>`).join('')}
          </div>
          <div style="display:flex;gap:10px;margin-top:3px;font:9px 'JetBrains Mono',monospace;color:#64748b"><span><span style="display:inline-block;width:8px;height:8px;background:rgba(251,207,59,0.4)"></span> sighting</span><span><span style="display:inline-block;width:8px;height:8px;background:#fbcf3b"></span> attempt</span><span><span style="display:inline-block;width:8px;height:8px;background:#10b981"></span> near</span>${showBest?'<span style="color:#10b981">▢ best week</span>':''}</div>`;
      })()}
      </div>
    </div>
    ${(()=>{
      // Duct Tape Lure — Codex entry. Locked until crafted at least once.
      const crafted=achievements.has('duct_lure_crafted')||(baitInv.ducttape||0)>0;
      return `<div style="margin:10px 0 2px;font:700 9px 'JetBrains Mono',monospace;letter-spacing:1.5px;color:${crafted?'#ffd23f':'#475569'};text-transform:uppercase">Craftable · The Lure</div>
        <div style="display:flex;align-items:center;gap:10px;background:rgba(255,210,63,0.04);border:1px dashed rgba(255,210,63,${crafted?0.35:0.15});border-radius:8px;padding:10px 12px;opacity:${crafted?1:0.55}">
          <div style="font-size:26px;${crafted?'':'filter:grayscale(1)'}">🦆</div>
          <div><div style="font-weight:700;color:${crafted?'#ffd23f':'#64748b'}">${crafted?'Duct Tape Lure':'🔒 ???'}</div>
          <div style="font-size:10.5px;color:#94a3b8;line-height:1.5">${crafted?`A wad of tape on a hook. People at the pier swear it "almost" works. The bobber peak window opens up <b style="color:#fde68a">3.5×</b> wider during a Duct chase. He still doesn't land.<br>On hand: <b style="color:#fde68a">${baitInv.ducttape||0}</b>`:'Recipe is at the tackle shop. Forage the rare bait and you\'ll see it.'}</div></div>
        </div>`;
    })()}
    ${(()=>{
      // Gator King — Codex entry. Locked until first defeat.
      const won=achievements.has('gator_king');
      return `<div style="margin:10px 0 2px;font:700 9px 'JetBrains Mono',monospace;letter-spacing:1.5px;color:${won?'#4a8a32':'#475569'};text-transform:uppercase">Mini-Boss · East Rocks</div>
        <div style="display:flex;align-items:center;gap:10px;background:rgba(74,138,50,0.06);border:1px dashed rgba(74,138,50,${won?0.45:0.15});border-radius:8px;padding:10px 12px;opacity:${won?1:0.6}">
          <div style="font-size:26px;${won?'':'filter:grayscale(1)'}">🐊</div>
          <div><div style="font-weight:700;color:${won?'#86c97c':'#64748b'}">${won?'Gator King':'🔒 ???'}</div>
          <div style="font-size:10.5px;color:#94a3b8;line-height:1.5">${won?'Took him at the Crayfish Hole. He stays put for the rest of the run, but he\'ll be back next time.':'Land every gator on the bayou. Then go to East Rocks.'}</div></div>
        </div>`;
    })()}
    <button class="btn bx" onclick="DS.closePeek()" style="margin-top:12px">Close</button>`;
  // Wire the search + tier pills. Each rebuild calls openCodex() so the panel re-renders with the
  // new filter state without us re-querying scattered DOM nodes.
  const qIn=$('cdx-q');if(qIn){qIn.oninput=()=>{_codexQ=qIn.value;openCodex();const q2=$('cdx-q');if(q2){q2.focus();q2.selectionStart=q2.selectionEnd=q2.value.length}}}
  const qClr=$('cdx-clear');if(qClr)qClr.onclick=()=>{_codexQ='';openCodex()};
  card.querySelectorAll('.cdx-tier').forEach(b=>b.onclick=()=>{_codexTier=b.dataset.t;openCodex()});
  el.style.display='flex';
}
// Show the trophy peek button on s1 only if there's something to show.
function refreshTrophyPeek(){
  const b=$('trophy-peek-btn');if(b)b.style.display=fishCatalog.size>0?'block':'none';
  // Daily-streak pill — only shown once the player has at least 1 day on the count.
  const sp=$('streak-pill');if(sp){
    if(streak.count>0){sp.style.display='block';sp.innerHTML=`🔥 Day ${streak.count} at the Bayou${streak.max>streak.count?` · best ${streak.max}`:''} <button onclick="DS.exportStreak();event.stopPropagation()" style="margin-left:6px;background:transparent;border:1px solid rgba(147,197,253,0.4);color:#93c5fd;padding:2px 8px;border-radius:4px;font:600 9px 'JetBrains Mono',monospace;letter-spacing:1px;cursor:pointer">💾 SHARE</button>`}
    else sp.style.display='none';
  }
  // Prefill the identity inputs from the persisted save so returning players see their handle.
  const fh=$('f-handle');if(fh&&!fh.value&&playerHandle)fh.value=playerHandle;
  const fb=$('f-boatname');if(fb&&!fb.value&&boatName)fb.value=boatName;
}

function endRun(){
  const btn=$('end-run');
  if(_endArmed){_endArmed=false;clearTimeout(_endArmedT);if(btn){btn.classList.remove('arm');btn.textContent='END RUN'}if(S.on)endGame(S.hull>0);return}
  _endArmed=true;if(btn){btn.classList.add('arm');btn.textContent='TAP TO CONFIRM'}
  _endArmedT=setTimeout(()=>{_endArmed=false;if(btn){btn.classList.remove('arm');btn.textContent='END RUN'}},2500);
}
// Photo mode toggle (P). Pauses a live run, hides the gameplay HUD, shows the photo hint. Exiting
// restores the HUD + resumes the run.
function togglePhoto(){
  if(GAME_MODE!=='game')return;
  if(miniActive)return;  // don't enter from a menu/dialog
  photoMode=!photoMode;
  const hud=$('hud'),nfo=$('nfo'),mm=$('minimap'),er=$('end-run'),mq=$('mq'),ph=$('photo-hint'),sp=$('spot-tag'),wxb=$('wxb');
  if(photoMode){
    if(S.on){S.on=false;_photoResume=true}
    [hud,nfo,mm,er,mq,sp,wxb].forEach(e=>{if(e)e.style.display='none'});
    if(ph)ph.style.display='block';
    photoCam={yaw:bMesh.rotation.y+Math.PI,pitch:0.35,dist:22};
  }else{
    if(ph)ph.style.display='none';
    if(_photoResume){_photoResume=false;S.on=true;if(hud)hud.style.display='flex';if(nfo)nfo.style.display='block';if(mm)mm.style.display='block';if(er)er.style.display='block';if(wxb)wxb.style.display='block'}
  }
}
// Mission-queue ticker — names the nearest active beacon + distance so the player always has a
// next objective without opening a menu. Updated each frame from the loop.
function updateMissionQueue(){
  const mq=$('mq');if(!mq||!S.on||GAME_MODE!=='game'||photoMode){if(mq&&!photoMode&&mq.style.display!=='none'&&!S.on)mq.style.display='none';return}
  let best=null,bd=Infinity;
  for(const d of dropPoints){if(!d.userData.active||d.userData.qa)continue;const dist=bMesh.position.distanceTo(d.position);if(dist<bd){bd=dist;best=d}}
  if(best){const ty=best.userData.type;mq.style.display='block';mq.innerHTML=`<span style="color:#94a3b8">▸ NEXT</span> <b style="color:#${ty.col.toString(16).padStart(6,'0')}">${ty.n}</b> <span style="color:#94a3b8">· ${bd.toFixed(0)}m</span>`}
  else{mq.style.display='block';mq.innerHTML='<span style="color:#94a3b8">▸ No active beacons — fish, explore, or end the run</span>'}
}

// QA hook (only active with ?qa=1) — force-opens a mini-game with a synthetic drop point so the
// headless smoke + screenshot pass can exercise each overlay without driving to a random beacon.
function qaOpen(kind){
  if(new URLSearchParams(location.search).get('qa')!=='1')return false;
  // Boss type lives outside DP_TYPES (never spawned randomly) — qa hook checks both.
  const type=DP_TYPES.find(d=>d.k===kind)||(kind==='boss'?DP_BOSS:null);if(!type)return false;
  const dp=mkDropPoint(type);dp.position.set(9999,0,9999);dp.visible=false;dp.userData.qa=true;scene.add(dp);dropPoints.push(dp);
  const fn=mini[type.open];if(typeof fn==='function'){fn(dp);return true}return false;
}
// QA hook for Duct — spawns him near the boat for smoke tests. Must override DUCT.x/z AFTER
// spawnDuct() (which randomizes them) so tickDuct keeps him in range.
function qaSpawnDuct(){if(new URLSearchParams(location.search).get('qa')!=='1')return false;if(DUCT.active)despawnDuct();spawnDuct();DUCT.x=bMesh.position.x+8;DUCT.z=bMesh.position.z;DUCT.vx=0;DUCT.vz=0;DUCT.mesh.position.set(DUCT.x,0,DUCT.z);return true}
// QA-only hook: drives a single Duct escape archetype synchronously so the smoke can verify each
// branch in runDuctEscapeAnim doesn't throw. Gated on ?qa=1 like the other QA hooks.
function qaDuctEscape(kind){
  if(new URLSearchParams(location.search).get('qa')!=='1')return false;
  if(!DUCT.active){spawnDuct()}
  try{runDuctEscapeAnim(kind);return true}catch(e){return false}
}
// QA-only: fire a list of unlock IDs through the toast queue without grinding the prereqs.
function qaUnlock(ids){
  if(new URLSearchParams(location.search).get('qa')!=='1')return false;
  if(!Array.isArray(ids))return false;
  // Real unlock path — adds to the persistent achievements Set + fires the toast through onUnlock.
  // Falls back to a raw toast if the id isn't a registered achievement (so synthetic ids still flash).
  ids.forEach(id=>{if(ACH[id]){onUnlock(id)}else{pushAchToast({n:id,d:'(qa)'})}});return true;
}
function qaPulseBait(d){if(new URLSearchParams(location.search).get('qa')!=='1')return false;return pulseBait(d||1)}
// QA-only: jump the day/night clock to deep night (cycle = 0.75 → sun fully below) so the smoke
// can verify + screenshot the starfield/moon. Returns whether the night sky meshes exist.
function qaForceNight(){
  if(new URLSearchParams(location.search).get('qa')!=='1')return false;
  const t=Date.now()*0.001;_dayOffset=(270-((t%360)))-0;  // land the cycle at 270° (sunY≈-30)
  return !!(scene&&scene._stars&&scene._moon);
}
// QA: spawn the Gator King drop directly (skips the gators-required gate).
function qaSpawnGatorKing(){
  if(new URLSearchParams(location.search).get('qa')!=='1')return false;
  if(S.gatorKingSpawned)return true;
  S.gatorKingSpawned=true;
  const dp=mkDropPoint(DP_GATOR_KING);dp.position.set(185,0,80);dp.userData.isGatorKing=true;scene.add(dp);dropPoints.push(dp);
  return true;
}
// QA: open the Gator King mini-boss UI directly (parallels qaOpen for the regular drop types).
function qaOpenGatorKing(){
  if(new URLSearchParams(location.search).get('qa')!=='1')return false;
  let dp=dropPoints.find(d=>d.userData&&d.userData.isGatorKing);
  if(!dp){qaSpawnGatorKing();dp=dropPoints.find(d=>d.userData&&d.userData.isGatorKing)}
  if(!dp)return false;
  mini.openGatorKing(dp);return true;
}
// QA: force a lightning strike (skips the rate-limit / rain gate).
function qaStrikeLightning(){
  if(new URLSearchParams(location.search).get('qa')!=='1')return false;
  storm.strike();return true;
}
// QA: stuff the bait pantry with ducttape recipe ingredients so the craft button appears.
function qaSeedDuctRecipe(){
  if(new URLSearchParams(location.search).get('qa')!=='1')return false;
  Object.entries(DUCT_LURE_RECIPE).forEach(([k,n])=>{baitInv[k]=(baitInv[k]||0)+n});
  persist();return true;
}
// QA: force the bobber into the pre-nibble telegraph phase. Bypasses the cast-aim animation +
// fishingSpot check by calling startBobberWait directly with a synthetic spot, then jumps the
// state machine to pretell so the smoke catches the new branch deterministically.
function qaForceNibble(){
  if(new URLSearchParams(location.search).get('qa')!=='1')return null;
  if(!_bobberState){
    // Synthesize: pick any fishable fish + skip the cast arc + start the bobber wait immediately.
    const fish=FISH.find(f=>f.fight)||FISH[0];
    cancelCast();startBobberWait(null,fish);
  }
  if(!_bobberState)return null;  // startBobberWait failed (no bMesh, etc.)
  const s=_bobberState;s.phase='pretell';s.dipsRemaining=2;s.twitchAmp=0.15;
  s.nibbleAt=Date.now()+400;
  const p=$('cast-prompt');if(p)p.innerHTML='👀 <b style="color:#fbcf3b">SOMETHING\'S NIBBLING</b> — wait for the dip…';
  return {phase:s.phase,dipsRemaining:s.dipsRemaining,twitchAmp:s.twitchAmp};
}
// QA: probe live audio bus state without an AudioContext analyser.
function qaAudioProbe(){
  if(new URLSearchParams(location.search).get('qa')!=='1')return null;
  return {
    reelOn:reelAudio.on,
    reelFreq:reelAudio.on&&reelAudio.osc?reelAudio.osc.frequency.value:null,
    musicOn:music.on,
    stormOn:stormAudio.on,
    engineOn:engineAudio.on,
    campChans:Object.keys(campAudio.chans||{})
  };
}
// QA: advance the streak's lastPlayed by N days into the past so the smoke can test the
// yesterday→++, today→noop, gap→reset branches without faking system time.
function qaAdvanceDay(n){
  if(new URLSearchParams(location.search).get('qa')!=='1')return false;
  streak.lastPlayed=localDayKey(-n);persist();return true;
}
function qaResetStreak(){
  if(new URLSearchParams(location.search).get('qa')!=='1')return false;
  streak={count:0,lastPlayed:'',max:streak.max||0};persist();return true;
}
// QA: bypass the rate-limit + state guards and fire one catalyst event synchronously.
function qaTriggerCatalyst(kind){
  if(new URLSearchParams(location.search).get('qa')!=='1')return false;
  return !!catalyst.fire(kind);
}
// QA: open a synthetic fishing fight so the smoke can exercise reelAudio + the fight UI without
// waiting for a real bobber-cast-resolve cycle. Clears blocking flags + tears down any in-flight
// cast/bobber so openFight doesn't bail.
function qaForceFight(){
  if(new URLSearchParams(location.search).get('qa')!=='1')return false;
  // Bail if the run already ended — stacking a fight overlay on the s5 result screen would let
  // a win → landFish → showCatchDialog land a second modal on top of the post-run summary.
  if(S.played&&!$('s5').classList.contains('off'))return false;
  cancelCast();disposeBobber();
  miniActive=false;_catchOpen=false;_catchBusy=false;_peekOpen=false;
  if(_fightCleanup){_fightCleanup();_fightCleanup=null}
  const fish=FISH.find(f=>f.fight)||FISH[0];
  openFight(fish,null);
  reelAudio.update(0.3);
  return true;
}
// QA: count meshes in the scene that point at the shared stump geometry. Lets the smoke verify the
// shared-asset optimization landed without exposing the scene object globally.
function qaStumpCount(){
  if(new URLSearchParams(location.search).get('qa')!=='1')return -1;
  if(!scene||!scene._sharedStumpGeo)return 0;
  let n=0;scene.traverse(o=>{if(o.geometry===scene._sharedStumpGeo)n++});return n;
}
function qaSetTabHidden(hidden){
  if(new URLSearchParams(location.search).get('qa')!=='1')return null;
  setTabHidden(Boolean(hidden));
  return{hidden:_tabHidden,on:S.on,weatherTimer:Boolean(_wxTimer)};
}
return{launch,skip,skipFromLoad,playFromTier,boat,tier,quote,pay,reset,showTiers,replay,ping:fireSonar,beginRun,qAns,launchGame,endRun,qaOpen,qaSpawnDuct,cast:castLine,peekTrophies,closePeek,openCodex,toggleMute,openShop,openAchievements,openSettings,setGfx,setAudVol,setShakeMul,setSfxVol,setEngineVol,setAmbientVol,setMusicVol,replayTutorials,exportTrophy,exportStreak,exportAchievements,toggleDuctSpan,setHandle,setBoatName,dockShop,dockCamp,togglePhoto,duct:()=>openDuctChase(),qaDockCamp:()=>{if(new URLSearchParams(location.search).get('qa')!=='1')return false;if(!campMeshes.length)return false;dockCamp(campMeshes[0].userData.camp,campMeshes[0]);return true},qaDuctEscape,qaUnlock,qaPulseBait,qaForceNight,qaSpawnGatorKing,qaOpenGatorKing,qaStrikeLightning,qaSeedDuctRecipe,qaForceNibble,qaAudioProbe,qaAdvanceDay,qaResetStreak,qaTriggerCatalyst,qaForceFight,qaStumpCount,qaSetTabHidden,getSave,mode:GAME_MODE};
})();

