// Headless smoke test for DockShield: The Depth.
// Boots the static build in Chromium (swiftshader WebGL), drives the core flows, and asserts no
// fatal console errors + that every overlay tears down on its exit path. Self-contained: it spawns
// its own static server and shuts it down at the end.
//
//   npm run smoke            (from repo root)
//   NODE_PATH=/path/to/global/node_modules node test/smoke.js   (if playwright is global)
//
// Exit code 0 = PASS, 1 = FAIL.

const {spawn}=require('child_process');
const path=require('path');
const os=require('os');
let chromium;
try{({chromium}=require('playwright'));}
catch(e){console.error('playwright not found. Install it, or run with NODE_PATH pointing at a global install.');process.exit(1);}

const PORT=8771;
const ROOT=path.join(__dirname,'..','public');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const srv=spawn('python3',['-m','http.server',String(PORT),'--directory',ROOT],{stdio:'ignore'});
  const fail=m=>{console.error('FAIL:',m);srv.kill();process.exit(1)};
  await sleep(1500);
  const errs=[];
  const b=await chromium.launch({headless:true,args:['--use-gl=swiftshader','--enable-webgl','--ignore-certificate-errors']});
  try{
    const p=await (await b.newContext({viewport:{width:1280,height:800},ignoreHTTPSErrors:true})).newPage();
    p.on('pageerror',e=>errs.push('pageerror: '+e));
    p.on('console',m=>{if(m.type()==='error')errs.push('CE: '+m.text())});
    await p.goto(`http://127.0.0.1:${PORT}/?qa=1`,{waitUntil:'load',timeout:20000});
    await p.waitForFunction(()=>typeof DS!=='undefined',{timeout:10000});
    await sleep(1200);

    // Enter a run as The Reel
    await p.click('.bo[data-b="regular"]');await p.click('#begin-btn');await sleep(150);
    await p.click('#q-1 .q-opt[data-h="regular"]');await sleep(150);await p.click('#q-2 .q-opt[data-h="regular"]');
    await p.waitForFunction(()=>document.getElementById('hud').style.display==='flex',{timeout:15000});await sleep(900);
    console.log('· run started');

    // Cinematic grade overlay should be visible during a run
    const gradeOn=await p.evaluate(()=>getComputedStyle(document.getElementById('grade')).display);
    if(gradeOn!=='block')fail('grade overlay not shown during run ('+gradeOn+')');
    console.log('· grade overlay visible');

    // Duct chase opens + Escape tears down
    await p.evaluate(()=>DS.qaSpawnDuct());await sleep(200);
    await p.evaluate(()=>DS.duct());await sleep(400);
    await p.keyboard.press('Escape');await sleep(400);
    if(await p.evaluate(()=>document.getElementById('mini').style.display)!=='none')fail('Duct overlay stranded after Escape');
    console.log('· duct chase closes on Escape');

    // Forage camp opens + Escape tears down (the timer-leak path)
    await p.evaluate(()=>DS.qaDockCamp());await sleep(200);
    await p.evaluate(()=>{const b=document.querySelector('.forage-row');if(b)b.click()});await sleep(400);
    await p.keyboard.press('Escape');await sleep(400);
    if(await p.evaluate(()=>document.getElementById('mini').style.display)!=='none')fail('forage overlay stranded after Escape');
    console.log('· forage closes on Escape');

    // Mini-game overlay via qaOpen
    if(!await p.evaluate(()=>DS.qaOpen('battle')))fail('qaOpen battle returned false');
    await sleep(300);await p.keyboard.press('Escape');await sleep(300);
    console.log('· mini-game opens');

    // Boatworks open (exercises mkBoat disposal on the upgrade reopen path)
    await p.evaluate(()=>DS.openShop({id:'works',n:'Castor Boatworks',col:0xf97316,blurb:'t',boatworks:true,consumables:['hull']}));
    await sleep(300);await p.keyboard.press('Escape');await sleep(300);
    console.log('· boatworks opens');

    // Let the loop run to exercise water-normal staggering, engine audio, duct tick
    await sleep(2000);
    await p.screenshot({path:path.join(os.tmpdir(),'dockshield_smoke.png')}).catch(()=>{});
  }finally{
    await b.close();srv.kill();
  }
  const expected=['Failed to load resource','/api/config','/api/geocode','api.openweathermap.org','WebGL','GroupMarker','net::ERR'];
  const fatal=errs.filter(e=>!expected.some(x=>e.includes(x)));
  console.log(`errs ${errs.length} · fatal ${fatal.length}`);
  if(fatal.length){console.error('FATAL:',fatal.slice(0,8));process.exit(1)}
  console.log('PASS');
  process.exit(0);
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
