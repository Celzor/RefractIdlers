/** Final-core film, Web Audio isolation, and frozen multiplayer victory in Chromium. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.env.TEST_URL||'http://127.0.0.1:4175/';
const executable=process.env.BROWSER_EXECUTABLE||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const output=path.resolve('test-results');await mkdir(output,{recursive:true});const profile=await mkdtemp(path.join(output,'finale-cdp-'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),pending=new Map(),errors=[];
let browser,socket,serial=0,loads=0;
const saved=`JSON.parse(localStorage.getItem('refract-idlers:solo:v1'))`;
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timed out: ${method}`));},15000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression,userGesture=false){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
async function waitFor(expression){for(let attempt=0;attempt<120;attempt++){try{if(await evaluate(expression))return;}catch(error){if(!/context.*(destroyed|found)|Cannot find context/i.test(error.message))throw error;}await pause(80);}throw Error(`Timed out: ${expression}`);}
async function capture(name){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,`${name}.png`),Buffer.from(shot.data,'base64'));}
async function click(selector){const position=await evaluate(`(()=>{const button=document.querySelector(${JSON.stringify(selector)});if(!button||button.disabled)throw Error('Unavailable '+${JSON.stringify(selector)});const r=button.getBoundingClientRect();if(!r.width||!r.height)throw Error('Hidden '+${JSON.stringify(selector)});return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...position,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...position,button:'left',clickCount:1});}
async function key(key,code,windowsVirtualKeyCode){await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode});}
async function hooks(){await evaluate(`Promise.all([import('./src/arena.js'),import('./src/finale.js')]).then(([{OrbitArena},{FinaleScene}])=>{const render=OrbitArena.prototype.render;OrbitArena.prototype.render=function(...args){globalThis.__arena=this;return render.apply(this,args);};const draw=FinaleScene.prototype.draw;FinaleScene.prototype.draw=function(...args){globalThis.__finale=this;return draw.apply(this,args);};return true;})`);}
async function reload(){const before=loads;await send('Page.reload',{ignoreCache:true});for(let i=0;loads<=before&&i<100;i++)await pause(60);await waitFor(`document.querySelector('#connection')?.textContent.includes('Solo')`);await hooks();await evaluate('document.fonts.ready.then(()=>true)');}
async function seed(code){const fixture=await evaluate(`(async()=>{const game=await import('./src/game.js'),campaign=await import('./src/campaign.js'),state=game.createGame();const p=game.addPlayer(state,{id:'you',name:'You'});game.applyAction(state,'you',{type:'start'});${code}if(!game.validateState(state))throw Error('Invalid finale fixture');return state;})()`);const{identifier}=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('refract-idlers:solo:v1',${JSON.stringify(JSON.stringify(fixture))});`});try{await reload();}finally{await send('Page.removeScriptToEvaluateOnNewDocument',{identifier});}}
const finalFixture=`state.now=campaign.FINAL_MIN_SECONDS;p.orb={level:campaign.FINAL_LEVEL,hp:1,finalElapsed:campaign.FINAL_MIN_SECONDS};p.highestOrb=campaign.FINAL_LEVEL;p.orbsDestroyed=campaign.FINAL_LEVEL-1;p.farm.unlocked=true;p.farm.plots[0]={crop:'carrot',progress:.5,water:1,fertilised:false};p.fuel=campaign.fuelTarget(campaign.FINAL_LEVEL);p.farm.fedSeconds=10;`;
async function filmTime(seconds){await evaluate(`__finale.started=performance.now()-${seconds*1000}`);await pause(100);}
async function assertFilmFrame(width,height){const result=await evaluate(`(()=>{const dialog=document.querySelector('.finale-dialog'),nodes=[dialog,...dialog.querySelectorAll('.finale-summary:not([hidden]),button:not([hidden])')];return{width:innerWidth,height:innerHeight,open:dialog.open,focused:dialog.contains(document.activeElement),bad:nodes.filter(node=>{const r=node.getBoundingClientRect();return!r.width||!r.height||r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1;}).map(node=>node.className||node.textContent),summaryOverflow:!dialog.querySelector('.finale-summary').hidden&&dialog.querySelector('.finale-summary').scrollHeight>dialog.querySelector('.finale-summary').clientHeight+2};})()`);assert.equal(result.width,width);assert.equal(result.height,height);assert.equal(result.open,true);assert.equal(result.focused,true,'The native finale modal owns keyboard focus');assert.deepEqual(result.bad,[],'Finale controls stay in the viewport');assert.equal(result.summaryOverflow,false,'The victory summary fits');}

const frame=id=>`document.querySelector('iframe[data-participant-id="${id}"]')`;
const frameDoc=id=>`${frame(id)}.contentDocument`;
const session=id=>`(()=>{const storage=${frame(id)}.contentWindow.sessionStorage,key=Object.keys(storage).find(key=>key.startsWith('refract-idlers:session:')&&key.endsWith(':${id}'));return key?JSON.parse(storage.getItem(key)):null;})()`;
async function coopVictory(){
  await send('Page.navigate',{url:new URL('tools/preview.html',base).href});
  await waitFor(`document.querySelectorAll('iframe').length===2 && ${frameDoc(101)}.querySelector('#round-action') && ${frameDoc(202)}.querySelector('#round-action')`);
  await waitFor(`${session(101)}?.players.length===2 && ${session(202)}?.players.length===2`);
  const fixture=await evaluate(`(async()=>{const game=await import(${JSON.stringify(new URL('src/game.js',base).href)}),campaign=await import(${JSON.stringify(new URL('src/campaign.js',base).href)}),state=game.createGame({mode:'coop'});game.addPlayer(state,{id:'101',name:'Alex'});game.addPlayer(state,{id:'202',name:'Sam'});game.applyAction(state,'101',{type:'start'});state.now=campaign.FINAL_MIN_SECONDS;state.sharedOrb={level:campaign.FINAL_LEVEL,hp:1,finalElapsed:campaign.FINAL_MIN_SECONDS};state.sharedFuel=campaign.fuelTarget(campaign.FINAL_LEVEL);for(const p of state.players)p.highestOrb=campaign.FINAL_LEVEL;state.players[0].generators.mote=1;if(!game.validateState(state))throw Error('Invalid Co-op victory fixture');return state;})()`);
  const storageKey=await evaluate(`Object.keys(${frame(101)}.contentWindow.sessionStorage).find(key=>key.startsWith('refract-idlers:session:')&&key.endsWith(':101'))`);
  const{identifier}=await send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem(${JSON.stringify(storageKey)},${JSON.stringify(JSON.stringify(fixture))});`});
  try{await evaluate(`${frame(101)}.contentWindow.location.reload()`);await waitFor(`${session(202)}?.mode==='coop'&&${session(202)}?.sharedOrb.level===200`);}finally{await send('Page.removeScriptToEvaluateOnNewDocument',{identifier});}
  await evaluate(`${frameDoc(202)}.querySelector('[data-tab="galaxy"]').click()`);
  await waitFor(`${session(101)}?.phase==='victory'&&${session(202)}?.phase==='victory'`);
  await waitFor(`${frameDoc(101)}.querySelector('.finale-dialog').open&&${frameDoc(202)}.querySelector('.finale-dialog').open`);
  assert.equal(await evaluate(`${frameDoc(202)}.body.dataset.view`),'galaxy','Automatic victory takes focus even while the follower explores the galaxy');
  const result=await evaluate(session(202));for(const p of result.players){assert.equal(p.totalPrestige,100);assert.equal(p.prestigePoints,100);assert.equal(p.victories,1);}
  await pause(400);assert.deepEqual(await evaluate(session(202)),result,'Every Co-op client stays frozen after victory');
  await evaluate(`document.querySelector('[aria-label="Leave as Alex"]').click()`);await waitFor(`${session(202)}.players.length===1`);
  const handover=await evaluate(session(202));assert.equal(handover.phase,'victory');assert.equal(handover.players[0].totalPrestige,100);assert.equal(handover.sharedOrb.hp,0);
  await evaluate(`document.querySelector('#toggle-third').click()`);await waitFor(`Boolean(${frame(303)})`);
  await waitFor(`${session(303)}?.phase==='victory'&&${frameDoc(303)}.querySelector('.finale-dialog').open`);
  const late=(await evaluate(session(303))).players.find(p=>p.id==='303');assert.equal(late.totalPrestige,0);assert.equal(late.victories,0);
  assert.equal(await evaluate(`${frameDoc(303)}.querySelector('.finale-reward').hidden`),true,'A late joiner is not shown an unearned100PP reward');
  assert.match(await evaluate(`${frameDoc(303)}.querySelector('.finale-replay-note').textContent`),/No new reward was granted/);
  console.log('PASS Co-op automatic victory reaches every view, awards100PP once, and survives host departure');
}

try{
  browser=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  const endpoint=await new Promise((resolve,reject)=>{let stderr='';const timer=setTimeout(()=>reject(Error(`Browser failed: ${stderr.slice(-500)}`)),15000);browser.once('error',error=>{clearTimeout(timer);reject(error);});browser.stderr.on('data',data=>{stderr+=data;const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
  const target=await(await fetch(`http://${new URL(endpoint).host}/json/new?about:blank`,{method:'PUT'})).json();socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=({data})=>{const message=JSON.parse(data);if(message.id){const request=pending.get(message.id);pending.delete(message.id);if(request)message.error?request.reject(Error(message.error.message)):request.resolve(message.result);}else if(message.method==='Page.loadEventFired')loads++;else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);};
  await send('Page.enable');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base});await waitFor(`document.querySelector('#connection')?.textContent.includes('Solo')`);await hooks();

  await seed('p.orb.hp=1;');await waitFor('Boolean(globalThis.__arena)');await click('#core');await waitFor('__arena.shatters.length>0');await pause(140);
  const shatter=await evaluate(`(()=>{const a=__arena,d=a.getFleetDiagnostics(),pixels=a.effectsContext.getImageData(0,0,a.width,a.height).data;return{...d,litPixels:Array.from(pixels).filter((value,index)=>index%4===3&&value>0).length};})()`);
  assert.equal(shatter.shatterShards,28);assert.equal(shatter.shatterRays,12);assert.ok(shatter.litPixels>100,'Ordinary core destruction draws crystal facets, light rays and a shock ring above the core');
  await capture('core-crystal-shatter');await pause(1300);assert.equal(await evaluate('__arena.shatters.length'),0,'Crystal debris clears after its bounded lifetime');
  console.log('PASS ordinary core breaks draw bounded crystal shards and radial light');

  const audioProbe=await evaluate(`import('./src/audio.js').then(async({GameAudio})=>{const audio=new GameAudio();await audio.unlock();audio.play('purchase');const before=audio.voices.size;audio.beginFinale();const silenced=audio.voices.size;audio.play('hit');audio.orbBreak(1);const blocked=audio.voices.size===0&&audio.lastPlayed.size===0;const played=audio.playFinale(),score=audio.voices.size;audio.endFinale();const ended=audio.voices.size;audio.setEnabled(false);audio.beginFinale();const muted=audio.playFinale()===false&&audio.voices.size===0;audio.destroy();return{before,silenced,blocked,played,score,ended,muted};})`,true);
  assert.ok(audioProbe.before>0);assert.equal(audioProbe.silenced,0);assert.equal(audioProbe.blocked,true);assert.equal(audioProbe.played,true);assert.ok(audioProbe.score>10&&audioProbe.score<=32);assert.equal(audioProbe.ended,0);assert.equal(audioProbe.muted,true);
  console.log('PASS finale audio stops existing voices, blocks game sounds, stays bounded, and respects mute');

  await seed(finalFixture);await waitFor('Boolean(globalThis.__arena)');await click('#core');await waitFor(`document.querySelector('.finale-dialog').open&&Boolean(globalThis.__finale)&&${saved}.phase==='victory'`);
  const victory=await evaluate(saved);assert.equal(victory.players[0].totalPrestige,100);assert.equal(victory.players[0].prestigePoints,100);assert.equal(victory.players[0].orb.hp,0);
  assert.equal(await evaluate(`__finale.audio.finaleActive`),true);assert.equal(await evaluate(`document.body.dataset.finale`),'active');
  const arenaClock=await evaluate('__arena.instrumentTime');await pause(500);assert.deepEqual(await evaluate(saved),victory,'Income, growth, meals, clocks and victory points freeze during the finale');assert.equal(await evaluate('__arena.instrumentTime'),arenaClock,'The normal arena presentation pauses');
  const accessibility=await send('Accessibility.getFullAXTree');assert.ok(accessibility.nodes.some(node=>node.role?.value==='dialog'&&node.name?.value==='The final Refract core'),'The modal has an accessible title throughout the film');
  await click('[data-finale-sound]');assert.equal(await evaluate('__finale.audio.enabled'),false,'The film exposes a working mute control');
  await filmTime(2.1);await capture('finale-1366-gathering');
  await filmTime(4.15);await capture('finale-1366-explosion');
  await filmTime(9.2);await capture('finale-1366-afterglow');
  await filmTime(18);await waitFor(`!document.querySelector('.finale-summary').hidden`);await pause(1450);
  for(const[width,height]of[[1366,768],[1920,1080]]){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await pause(100);await assertFilmFrame(width,height);await capture(`finale-${width}-victory`);}
  await click('[data-finale-replay]');await waitFor(`document.querySelector('.finale-summary').hidden`);await key('Escape','Escape',27);await waitFor(`!document.querySelector('.finale-summary').hidden`);
  assert.equal(await evaluate(`document.querySelector('.finale-dialog').open`),true,'Escape skips the film without dismissing victory');assert.equal(await evaluate('__finale.audio.voices.size'),0,'Skip stops all remaining finale audio');
  assert.deepEqual(await evaluate(saved),victory,'Watching again never awards another100PP');
  await click('[data-finale-continue]');assert.equal(await evaluate('document.body.dataset.view'),'galaxy');assert.equal(await evaluate('__finale.active'),false);assert.equal(await evaluate('__finale.audio.finaleActive'),false);
  await click('[data-galaxy-replay]');await waitFor(`document.querySelector('.finale-dialog').open`);await key('Escape','Escape',27);await click('[data-finale-continue]');assert.deepEqual(await evaluate(saved),victory);
  await reload();await waitFor(`document.querySelector('.finale-dialog').open`);assert.equal((await evaluate(saved)).players[0].totalPrestige,100,'Reload preserves the earned reward without duplicating it');await key('Escape','Escape',27);await click('[data-finale-continue]');
  await click('[data-new-journey]');await waitFor(`${saved}.phase==='intermission'`);assert.equal((await evaluate(saved)).players[0].orb.level,1);assert.equal((await evaluate(saved)).players[0].totalPrestige,100);await click('#research-ready');await waitFor(`${saved}.phase==='round'`);
  console.log('PASS real final kill, focus, frozen simulation,100PP once, replay, reload, and a new journey');

  await seed(`${finalFixture}p.generators.mote=1;`);await click('[data-tab="skills"]');await waitFor(`document.querySelector('.finale-dialog').open`);assert.equal(await evaluate('document.body.dataset.view'),'skills','Automatic final-core kills take focus from the research tab');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await filmTime(4.5);assert.equal(await evaluate('__finale.reducedMotion'),true);await capture('finale-reduced-motion');await key('Escape','Escape',27);assert.equal(await evaluate(`getComputedStyle(document.querySelector('.finale-summary')).animationName`),'none','Reduced motion removes the card animation');await click('[data-finale-continue]');
  await coopVictory();assert.deepEqual(errors,[],'No browser runtime exceptions');console.log('Refract Idlers finale acceptance passed.');
}catch(error){if(socket?.readyState===WebSocket.OPEN)await capture('finale-acceptance-failure').catch(()=>{});throw error;}
finally{for(const item of pending.values())item.reject(Error('Browser test ended'));pending.clear();socket?.close();browser?.kill();await pause(400);if(path.dirname(profile)===output&&path.basename(profile).startsWith('finale-cdp-'))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
