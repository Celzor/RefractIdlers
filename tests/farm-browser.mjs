/** Garden acceptance in installed Edge/Chromium. Run with the dev server running. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.TEST_URL || 'http://127.0.0.1:4175/';
const executable = process.env.BROWSER_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const output = path.resolve('test-results');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(output, 'farm-cdp-'));
const soloKey = 'refract-idlers:solo:v1';
const saved = `globalThis.__farmAcceptanceGame.migrateState(JSON.parse(localStorage.getItem(${JSON.stringify(soloKey)})))`;
const garden = `${saved}.players[0].farm`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map(), errors = [];
let browser, socket, serial = 0, loads = 0;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timed out: ${method}`)); }, 15000);
    pending.set(id, { resolve(value) { clearTimeout(timer); resolve(value); }, reject(error) { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({id, method, params}));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
  if (result.exceptionDetails) throw Error(`${result.exceptionDetails.text}: ${result.exceptionDetails.exception?.description}`);
  return result.result.value;
}
async function waitFor(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if (await evaluate(expression)) return; } catch (error) {
      if (!/context.*(destroyed|found)|Cannot find context/i.test(error.message)) throw error;
    }
    await pause(100);
  }
  throw Error(`UI did not become ready: ${expression}`);
}
async function navigate(reload = false) {
  const before = loads;
  await send(reload ? 'Page.reload' : 'Page.navigate', reload ? {ignoreCache:true} : {url:base});
  for (let attempt = 0; loads <= before && attempt < 100; attempt++) await pause(100);
  assert.ok(loads > before, 'Page loaded');
  await waitFor(`document.querySelector('#connection')?.textContent.includes('Solo')`);
  await evaluate('document.fonts.ready.then(() => true)');
  await evaluate(`import('./src/game.js').then(game=>{globalThis.__farmAcceptanceGame=game;return true;})`);
}
async function loadFixture(fixture) {
  const {identifier} = await send('Page.addScriptToEvaluateOnNewDocument', {
    source:`localStorage.setItem(${JSON.stringify(soloKey)},${JSON.stringify(JSON.stringify(fixture))});localStorage.setItem('refract-idlers:buy-quantity','1');`,
  });
  try { await navigate(true); } finally { await send('Page.removeScriptToEvaluateOnNewDocument', {identifier}); }
}
async function seed(code, current = false) {
  const fixture = await evaluate(`(async()=>{
    const game=await import('./src/game.js');
    const state=${current ? saved : "game.createGame();game.addPlayer(state,{id:'you',name:'You'})"};
    const p=state.players[0];
    ${code}
    if(!game.validateState(state))throw Error('Invalid farm acceptance fixture');
    return state;
  })()`);
  await loadFixture(fixture);
}
async function click(selector) {
  const target = `document.querySelector(${JSON.stringify(selector)})`;
  const position = await evaluate(`(()=>{const el=${target};if(!el||el.disabled)throw Error('Control unavailable: '+${JSON.stringify(selector)});const r=el.getBoundingClientRect();if(!r.width||!r.height)throw Error('Control hidden: '+${JSON.stringify(selector)});return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchMouseEvent', {type:'mousePressed', ...position, button:'left', clickCount:1});
  await send('Input.dispatchMouseEvent', {type:'mouseReleased', ...position, button:'left', clickCount:1});
}
async function capture(name) {
  const shot = await send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
  await writeFile(path.join(output, `${name}.png`), Buffer.from(shot.data,'base64'));
}
async function assertShopLayout(view) {
  const geometry=await evaluate(`(()=>{
    const farm=${view==='farm'},bounds=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
    return {main:bounds('main'),view:bounds(farm?'#farm-view':'#orbit-view'),scene:bounds(farm?'.garden-main':'.orbit-panel'),shop:bounds(farm?'.garden-workshop':'.generator-panel'),beam:bounds('#beam-companion'),heading:bounds(farm?'.garden-workshop>header':'.generator-panel>.section-heading'),beamInShop:document.querySelector(farm?'#farm-shop-companion':'#orbit-shop-companion').contains(document.querySelector('#beam-companion'))};
  })()`);
  assert.equal(geometry.beamInShop,true,`Beam sits inside the ${view} shop`);
  assert.ok(geometry.beam.width>0&&geometry.beam.height>0&&geometry.beam.left>=geometry.shop.left&&geometry.beam.right<=geometry.shop.right&&geometry.beam.top>=geometry.shop.top&&geometry.beam.bottom<=geometry.heading.top+1,`Beam is visible above the ${view} shop heading`);
  assert.ok(Math.abs(geometry.view.left-geometry.main.left)<=1&&Math.abs(geometry.view.right-geometry.main.right)<=1,`${view} fills the main frame with no unused sidebar`);
  assert.ok(Math.abs(geometry.scene.left-geometry.view.left)<=1&&Math.abs(geometry.shop.right-geometry.view.right)<=1&&geometry.shop.left>geometry.scene.right&&geometry.shop.left-geometry.scene.right<=20,`${view} scene and shop span the full available width`);
}
async function assertFrame(width, height) {
  const result = await evaluate(`(()=>{
    const selectors=['[data-tab="farm"]','#farm-view','#beam-companion','[data-buy-farm-plot]','[data-farm-upgrade]','[data-farm-plot]','[data-select-crop]','[data-feed-crop]'];
    const problems=[];
    for(const selector of selectors){const nodes=[...document.querySelectorAll(selector)];if(!nodes.length)problems.push('Missing '+selector);
      for(const node of nodes){if(node.closest('[hidden]'))continue;const r=node.getBoundingClientRect();if(r.width<=0||r.height<=0||r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1)problems.push('Outside viewport '+selector);
        const text=node.matches('[data-farm-plot]')?node.querySelector('.garden-bed-action'):node;
        if(node.matches('button')&&(text.scrollWidth>text.clientWidth+2||text.scrollHeight>text.clientHeight+2))problems.push('Clipped control '+selector+' '+text.textContent);
      }
    }
    for(const node of document.querySelectorAll('.garden-upgrades,.garden-upgrade,.garden-round')){
      if(node.scrollHeight>node.clientHeight+2)problems.push('Shop content escapes '+node.className);
    }
    const upgrades=document.querySelector('.garden-upgrades').getBoundingClientRect(),round=document.querySelector('.garden-round').getBoundingClientRect();
    for(const node of document.querySelectorAll('.garden-upgrade p')){
      const r=node.getBoundingClientRect();if(r.bottom>upgrades.bottom+1||r.bottom>round.top+1)problems.push('Upgrade description overlaps round controls');
    }
    return {problems,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight};
  })()`);
  assert.equal(result.width,width); assert.equal(result.height,height);
  assert.ok(result.scrollWidth <= width + 1 && result.scrollHeight <= height + 1, `Garden fits the desktop frame: ${JSON.stringify(result)}`);
  assert.deepEqual(result.problems,[],`Garden controls fit at ${width}x${height}`);
  await assertShopLayout('farm');
}
const frameDocument = id => `document.querySelector('iframe[data-participant-id="${id}"]').contentDocument`;
const frameWindow = id => `document.querySelector('iframe[data-participant-id="${id}"]').contentWindow`;
const session = id => `(()=>{const storage=${frameWindow(id)}.sessionStorage;const key=Object.keys(storage).find(key=>key.startsWith('refract-idlers:session:')&&key.endsWith(':${id}'));return key?globalThis.__farmAcceptanceGame.migrateState(JSON.parse(storage.getItem(key))):null;})()`;
async function frameClick(id, selector) {
  await evaluate(`(()=>{const button=${frameDocument(id)}.querySelector(${JSON.stringify(selector)});if(!button||button.disabled||!button.getBoundingClientRect().width)throw Error('Frame control unavailable: '+${JSON.stringify(selector)});button.click();})()`);
}
async function loadHostFixture(fixture) {
  const key=await evaluate(`Object.keys(${frameWindow(101)}.sessionStorage).find(key=>key.startsWith('refract-idlers:session:')&&key.endsWith(':101'))`);
  const marker=`farm-fixture-${Date.now()}`;
  const {identifier}=await send('Page.addScriptToEvaluateOnNewDocument',{
    source:`window.__farmFixtureLoaded=${JSON.stringify(marker)};sessionStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify(fixture))});localStorage.setItem('refract-idlers:shop-catalog','workshop');`,
  });
  try {
    await evaluate(`${frameWindow(101)}.location.reload()`);
    await waitFor(`${frameWindow(101)}.__farmFixtureLoaded===${JSON.stringify(marker)} && ${frameDocument(101)}.querySelector('#connection')?.textContent.includes('Refract') && ${session(202)}?.phase==='intermission'`);
  } finally {await send('Page.removeScriptToEvaluateOnNewDocument',{identifier});}
}
async function cooperativeFarm() {
  await send('Page.navigate',{url:new URL('tools/preview.html',base).href});
  await waitFor(`document.querySelectorAll('iframe').length===2 && ${frameDocument(101)}.querySelector('#round-action') && ${frameDocument(202)}.querySelector('#round-action')`);
  await evaluate(`import(${JSON.stringify(new URL('src/game.js',base).href)}).then(game=>{globalThis.__farmAcceptanceGame=game;return true;})`);
  await waitFor(`${session(101)}?.players.length===2 && ${session(202)}?.players.length===2`);
  const fixture=await evaluate(`(()=>{const game=globalThis.__farmAcceptanceGame,state=game.createGame({mode:'coop'});game.addPlayer(state,{id:'101',name:'Alex'});game.addPlayer(state,{id:'202',name:'Sam'});game.applyAction(state,'101',{type:'start'});game.advance(state,60);const p=state.players[0];p.lrc=p.runLrc=p.lifetimeLrc=10000000;state.sharedLrc=100000;state.players[1].skillPoints=10;if(!game.validateState(state))throw Error('Invalid Co-op farm fixture');return state;})()`);
  await loadHostFixture(fixture);
  await waitFor(`${session(101)}?.sharedLrc===100000 && ${session(202)}?.sharedLrc===100000`);
  await frameClick(202,'[data-tab="orbit"]');
  await frameClick(202,'[data-tab="skills"]');
  // The follower researches its own Garden licence by double-clicking the node.
  await evaluate(`${frameDocument(202)}.querySelector('[data-skill-node="ki1"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  await waitFor(`${session(101)}.players.find(p=>p.id==='202').farm.unlocked && ${session(202)}.players.find(p=>p.id==='202').farm.unlocked`);
  await frameClick(202,'[data-tab="farm"]');
  await frameClick(202,'[data-farm-upgrade="growLights"]');
  await frameClick(202,'[data-farm-plot="0"]');
  await waitFor(`${session(101)}.players.find(p=>p.id==='202').farm.plots[0].crop==='carrot'`);
  const ripe=await evaluate(session(101));ripe.players.find(p=>p.id==='202').farm.plots[0].progress=1;
  await loadHostFixture(ripe);
  await waitFor(`${frameDocument(202)}.querySelector('[data-farm-plot="0"]').dataset.growthStage==='ready'`);
  await frameClick(202,'[data-farm-plot="0"]');
  await waitFor(`${session(202)}.players.find(p=>p.id==='202').farm.inventory.carrot===1`);
  await frameClick(202,'[data-feed-crop="carrot"]');
  for(let chop=0;chop<4;chop++)await frameClick(202,'[data-chop]');
  await waitFor(`${session(101)}.players.find(p=>p.id==='202').farm.fedSeconds===30 && ${session(202)}.players.find(p=>p.id==='202').farm.fedSeconds===30`);
  const host=await evaluate(session(101)),follower=await evaluate(session(202));
  assert.equal(host.sharedLrc,74900,'A follower pays 25,000 for a grow light and 100 for each carrot seed from the shared bank; the licence costs SP, not LRC');
  assert.equal(host.players[0].farm.unlocked,false,'The host does not receive the follower\'s farm purchases');
  assert.deepEqual(host.players[1].farm,follower.players[1].farm,'Both clients agree on the follower farm and Beam meal');
  await evaluate(`document.querySelector('[aria-label="Leave as Alex"]').click()`);
  await waitFor(`${session(202)}.players.length===1`);
  const handover=await evaluate(session(202));
  assert.deepEqual(handover.players[0].farm,follower.players[1].farm,'Host handover preserves planted beds, equipment, harvest inventory and meals');
  assert.equal(handover.sharedLrc,74900,'Host handover preserves the farm spending from the shared bank');
  console.log('PASS Co-op follower farm actions, shared spending, snapshots, and host handover');
}

try {
  browser = spawn(executable, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'], {windowsHide:true,stdio:['ignore','ignore','pipe']});
  const endpoint = await new Promise((resolve,reject) => {
    let stderr='';
    const timer=setTimeout(()=>reject(Error(`Browser did not start: ${stderr.slice(-600)}`)),15000);
    browser.on('error',error=>{clearTimeout(timer);reject(error);});
    browser.stderr.on('data',data=>{stderr+=data;const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
    browser.on('exit',code=>{clearTimeout(timer);reject(Error(`Browser exited ${code}: ${stderr.slice(-600)}`));});
  });
  const target = await (await fetch(`http://${new URL(endpoint).host}/json/new?about:blank`, {method:'PUT'})).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=({data})=>{
    const message=JSON.parse(data);
    if(message.id){const item=pending.get(message.id);pending.delete(message.id);if(item)message.error?item.reject(Error(message.error.message)):item.resolve(message.result);}
    else if(message.method==='Page.loadEventFired')loads++;
    else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await navigate();
  await seed('');
  assert.equal(await evaluate(`document.querySelector('[data-tab="farm"]').hidden`),true,'The garden tab starts locked');
  await seed(`game.applyAction(state,'you',{type:'start'});game.advance(state,60);p.lrc=p.runLrc=p.lifetimeLrc=10000000;p.skillPoints=10;`);
  await click('[data-tab="skills"]');
  // Double-clicking the Garden licence node researches it without visiting the inspector.
  await evaluate(`document.querySelector('[data-skill-node="ki1"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  await waitFor(`!document.querySelector('[data-tab="farm"]').hidden && ${garden}.unlocked && ${saved}.players[0].skills.ki1===1`);
  await click('[data-tab="farm"]');
  await waitFor(`!document.querySelector('#farm-view').hidden`);
  assert.equal(await evaluate(`${garden}.plots.length`),1,'The first farm opens a starter bed');
  console.log('PASS double-clicking the Garden licence unlocks the garden tab');

  await click('[data-buy-farm-plot]');
  await waitFor(`${garden}.plots.length===2`);
  assert.equal(await evaluate(`document.querySelector('[data-farm-plot="1"]').dataset.growthStage`),'empty','Bought land appears as an empty planting bed');
  await click('[data-select-crop="carrot"]');
  await click('[data-farm-plot="0"]');
  await waitFor(`${garden}.plots[0].crop==='carrot'`);
  assert.equal(await evaluate(`document.querySelector('[data-water-plot="0"]').hidden`),false,'Before hydroponics, a planted bed offers a watering can');
  assert.equal(await evaluate(`document.querySelector('[data-water-plot="0"]').disabled`),true,'A freshly planted bed is already soaked');
  await click('[data-fertilise-plot="0"]');
  await waitFor(`${garden}.plots[0].fertilised===true`);
  assert.equal(await evaluate(`document.querySelector('[data-fertilise-plot="0"]').hidden`),true,'A fertilised bed hides its fertiliser sack');
  assert.ok(await evaluate(`document.querySelectorAll('[data-farm-plot="0"] .garden-plant-slot svg').length`)===3,'A planted bed draws three growing plants');
  assert.equal(await evaluate(`document.querySelector('[data-farm-plot="0"]').disabled`),true,'A soaked, fertilised, growing bed has no chore left to click');
  console.log('PASS hand fertilising and watering tools on a planted bed');
  for(const id of ['growLights','hydroponics','tractor','picker']){
    for(let level=1;level<=3;level++){
      await click(`[data-farm-upgrade="${id}"]`);
      await waitFor(`${garden}.upgrades[${JSON.stringify(id)}]===${level}`);
      assert.equal(await evaluate(`document.querySelectorAll('[data-farm-equipment="${id}"] [data-equipment-unit]').length`),level,`${id} visibly renders every purchased level`);
    }
  }
  assert.equal(await evaluate(`document.querySelector('[data-water-plot="0"]').hidden`),true,'Hydroponics replaces the watering can');
  assert.equal(await evaluate(`document.querySelector('[data-bed-slot="0"]').dataset.moisture`),'hydro','Hydroponic beds are drawn as water troughs');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.garden-pipe-top')).display`),'block','Hydroponics installs feed pipes');
  for(const crop of ['lettuce','tomato','pumpkin']){
    await click(`[data-unlock-crop="${crop}"]`);
    await waitFor(`${garden}.crops[${JSON.stringify(crop)}]===true`);
  }
  await click('[data-select-crop="carrot"]');
  assert.match(await evaluate(`document.querySelector('[data-farm-plot="1"]').getAttribute('aria-label')`),/100.*LRC/,'Planting announces its fresh seed price');
  await click('[data-select-crop="tomato"]');
  await click('[data-farm-plot="1"]');
  await waitFor(`${garden}.plots[1].crop==='tomato'`);
  console.log('PASS land, vegetables, and each equipment level are purchased and drawn in the garden');

  // Park the picker bots for this step so the ripe bed is left for a manual harvest.
  await seed(`delete p.farm.upgrades.picker;p.farm.pickerClock=0;p.farm.inventory={};p.fuel=0;p.farm.fedSeconds=0;
    if(!p.farm.plots[0].crop)game.applyAction(state,'you',{type:'plantCrop',plot:0,crop:'carrot'});
    Object.assign(p.farm.plots[0],{crop:'carrot',progress:1,fertilised:true});game.advance(state,Math.min(10,state.remaining));`,true);
  await click('[data-tab="farm"]');
  await waitFor(`document.querySelector('[data-farm-plot="0"]').dataset.growthStage==='ready'`);
  await click('[data-farm-plot="0"]');
  await waitFor(`${garden}.inventory.carrot===2`);
  const statsBefore=await evaluate(`import('./src/game.js').then(game=>game.getStats(${saved}.players[0],${saved}))`);
  const fuelBefore=await evaluate(`${saved}.players[0].fuel`);
  await click('[data-feed-crop="carrot"]');
  // Feeding opens the chopping board; the meal is served after the fourth chop.
  await waitFor(`!document.querySelector('[data-kitchen]').hidden`);
  for(let chop=0;chop<4;chop++)await click('[data-chop]');
  await waitFor(`document.querySelector('[data-kitchen]').hidden`);
  await waitFor(`${garden}.inventory.carrot===1 && ${garden}.fedSeconds>0`);
  assert.equal(await evaluate(`${saved}.players[0].fuel`),fuelBefore+30,'Each meal also fuels Beam’s ship');
  assert.match(await evaluate(`document.querySelector('[data-fuel-text]').textContent`),/30 \/ 120/,'The ship panel shows the fuel tank filling');
  const statsAfter=await evaluate(`import('./src/game.js').then(game=>game.getStats(${saved}.players[0],${saved}))`);
  assert.ok(statsAfter.passiveRate>statsBefore.passiveRate,'A meal improves income');
  assert.ok(statsAfter.clickDamage>statsBefore.clickDamage,'A meal improves orb damage');
  assert.match(await evaluate(`document.querySelector('[data-farm-meal]').textContent`),/25%/,'The meal panel explains Beam\'s production bonus');
  await evaluate(`document.querySelector('[data-feed-crop="carrot"]').focus()`);
  await pause(350);
  assert.equal(await evaluate(`document.activeElement===document.querySelector('[data-feed-crop="carrot"]')`),true,'Live garden updates retain keyboard focus');
  await navigate(true);
  await click('[data-tab="farm"]');
  assert.equal(await evaluate(`${garden}.inventory.carrot`),1,'The harvest inventory survives reload');
  assert.equal(await evaluate(`${garden}.upgrades.hydroponics`),3,'Farm equipment survives reload');
  console.log('PASS planting, ripening, harvest, feeding, bonus, and save reload');

  await seed(`game.advance(state,state.remaining);p.lrc=p.runLrc=p.lifetimeLrc=10000000;while(p.farm.plots.length<6)game.applyAction(state,'you',{type:'buyFarmPlot'});for(let i=0;i<6;i++){if(p.farm.plots[i].crop)game.applyAction(state,'you',{type:'harvestCrop',plot:i});game.applyAction(state,'you',{type:'plantCrop',plot:i,crop:['carrot','lettuce','tomato','pumpkin'][i%4]});p.farm.plots[i].progress=[1,.2,.6][i%3];}`,true);
  await click('[data-tab="farm"]');
  for(const [width,height]of [[1366,768],[1920,1080]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await pause(200);
    await assertFrame(width,height);
    await capture(`farm-${width}-equipped`);
  }
  console.log('PASS all crops and equipment fit both desktop sizes without page scrolling');

  await click('[data-tab="skills"]');
  await click('[data-research-branch="farm"]');
  const farmNodes=await evaluate(`import('./src/game.js').then(game=>game.SKILLS.filter(skill=>skill.branch==='farm').map(skill=>skill.id))`);
  assert.equal(farmNodes.length,6,'Farming has six research tiers');
  for(const id of farmNodes)assert.equal(await evaluate(`Boolean(document.querySelector('[data-skill-node="${id}"]'))`),true,'Farm research node is rendered');
  await click('[data-tab="prestige"]');
  const permanent=await evaluate(`import('./src/game.js').then(game=>game.SKILLS.filter(skill=>skill.currency==='prestige'&&Object.keys(skill.effects).some(key=>['cropSpeed','cropYield','mealDuration','beamBoost','farmDiscount'].includes(key))).map(skill=>skill.id))`);
  assert.equal(permanent.length,4,'Four permanent farm nodes are available');
  for(const id of permanent)assert.equal(await evaluate(`Boolean(document.querySelector('#legacy-map [data-skill-node="${id}"]'))`),true,'Permanent farm research node is rendered');
  await click('#prestige-action'); await click('#confirm-prestige');
  await waitFor(`${saved}.players[0].prestigeCount===1`);
  const reset=await evaluate(garden);
  assert.equal(reset.unlocked,true,'Prestige retains garden access');
  assert.equal(reset.crops.pumpkin,true,'Prestige retains unlocked seeds');
  assert.equal(reset.plots.length,1,'Prestige resets purchased land');
  assert.deepEqual(reset.upgrades,{},'Prestige resets equipment');
  assert.deepEqual(reset.inventory,{},'Prestige resets harvested vegetables');
  await click('[data-tab="farm"]');
  assert.equal(await evaluate(`document.querySelectorAll('[data-equipment-unit]').length`),0,'The scene removes reset equipment');
  console.log('PASS farm research, prestige research, and visible prestige reset');

  await seed(`game.applyAction(state,'you',{type:'start'});p.lrc=p.runLrc=p.lifetimeLrc=10000000;p.skills.ki2=1;`);
  await click('[data-shop-catalog="click"]');
  let previous=await evaluate(`import('./src/game.js').then(game=>game.getStats(${saved}.players[0],${saved}))`);
  for(const id of ['wormhole','foamer','string']){
    await click(`[data-buy-generator="${id}"]`);
    await waitFor(`${saved}.players[0].generators.${id}===1`);
    const next=await evaluate(`import('./src/game.js').then(game=>game.getStats(${saved}.players[0],${saved}))`);
    if(id==='string'){
      assert.ok(next.criticalChance>previous.criticalChance,'String detheory improves critical chance');
      assert.ok(next.criticalMultiplier>previous.criticalMultiplier,'String detheory improves critical damage');
    }else assert.ok(next.clickDamage>previous.clickDamage,`${id} improves damage`);
    assert.equal(await evaluate(`Boolean(document.querySelector('#generator-${id} .generator-symbol svg'))`),true,`${id} has a shop illustration`);
    previous=next;
  }
  for(const [width,height]of [[1366,768],[1920,1080]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await pause(200);
    const layout=await evaluate(`(()=>{const ids=['wormhole','foamer','string'];return {width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,cards:ids.map(id=>document.querySelector('#generator-'+id).getBoundingClientRect().toJSON())};})()`);
    assert.ok(layout.width<=width+1&&layout.height<=height+1,'Click technology fits the desktop frame');
    for(const card of layout.cards)assert.ok(card.width>0&&card.height>0&&card.top>=0&&card.bottom<=height&&card.right<=width,'Click technology purchase card is visible');
    await assertShopLayout('orbit');
    await capture(`click-tech-${width}-first-units`);
  }
  console.log('PASS all three click technology purchases, effects, and desktop scenes');
  await cooperativeFarm();
  assert.deepEqual(errors,[],'No browser runtime exceptions');
  console.log('Refract Idlers farm browser acceptance passed.');
} catch(error) {
  if(socket?.readyState===WebSocket.OPEN)await capture('farm-acceptance-failure').catch(()=>{});
  throw error;
} finally {
  socket?.close(); browser?.kill(); await pause(800);
  if(path.dirname(profile)===output&&path.basename(profile).startsWith('farm-cdp-'))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});
}
