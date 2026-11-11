/** UI acceptance with installed Edge/Chromium and its CDP endpoint. No npm dependency. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as engine from '../src/game.js';

const base = process.env.TEST_URL || 'http://127.0.0.1:4175/';
const graphOnly = process.argv.includes('--graph-only');
const includeMobile = process.argv.includes('--mobile');
const sidebarOnly = process.argv.includes('--sidebar-only');
const executable = process.env.BROWSER_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const output = path.resolve('test-results');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(output, 'idler-cdp-'));
const soloKey = 'refract-idlers:solo:v1';
let browser;
let socket;
let serial = 0;
let loads = 0;
const pending = new Map();
const errors = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (message) => console.log(`PASS ${message}`);

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 15000);
    pending.set(id, {
      resolve(value) { clearTimeout(timer); resolve(value); },
      reject(error) { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`${result.exceptionDetails.text}: ${result.exceptionDetails.exception?.description}`);
  return result.result.value;
}
async function waitFor(expression, message = expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if (await evaluate(expression)) return; } catch (error) {
      if (!/context.*(destroyed|found)|Cannot find context/i.test(error.message)) throw error;
    }
    await pause(100);
  }
  throw new Error(`UI did not become ready: ${message}`);
}
async function click(selector, documentExpression = 'document') {
  const element = `${documentExpression}.querySelector(${JSON.stringify(selector)})`;
  assert.equal(await evaluate(`Boolean(${element} && !${element}.disabled)`), true, `Enabled control ${selector}`);
  await evaluate(`${element}.click()`);
}
async function pointerClick(selector,documentExpression='document') {
  const position = await evaluate(`(() => {const element=${documentExpression}.querySelector(${JSON.stringify(selector)});element.scrollIntoView({block:'center'});const rect=element.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...position, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...position, button: 'left', clickCount: 1 });
}
async function touchTap(selector,scroll=true) {
  const position=await evaluate(`(() => {const node=document.querySelector(${JSON.stringify(selector)});${scroll?"node.scrollIntoView({block:'center'});":'node.focus({preventScroll:true});'}const rect=node.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};})()`);
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...position,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
}
async function navigate(url = base) {
  const before = loads;
  await send('Page.navigate', { url });
  await waitLoad(before);
  await waitFor(`document.readyState === 'complete'`);
  await evaluate('document.fonts.ready.then(() => true)');
}
async function waitLoad(before) {
  for (let attempt=0;attempt<100;attempt++) { if(loads>before)return; await pause(100); }
  throw Error('The page did not finish navigating');
}
async function reload() {
  const before = loads;
  await send('Page.reload', { ignoreCache: true });
  await waitLoad(before);
  await waitFor(`document.querySelector('#connection')?.textContent.includes('Solo') && document.querySelector('#round-action')`);
  await evaluate('document.fonts.ready.then(() => true)');
}
const readSolo = `JSON.parse(localStorage.getItem(${JSON.stringify(soloKey)}))`;
const bossFixture = `game.applyAction(state,'you',{type:'start'});const player=state.players[0];player.orb.level=10;player.orb.hp=game.getOrb(player,state).maxHp;player.highestOrb=10;player.orbsDestroyed=9;player.lrc=1e40;player.runLrc=1e40;player.lifetimeLrc=1e40;player.generators={mote:5,satellite:4,prism:3,star:2,nova:1};`;
async function solo() { return evaluate(readSolo); }
const orbFor = (state,id=state.players[0]?.id) => engine.getOrb(state.players.find(player=>player.id===id),state);
async function seed(code) {
  const fixture = await evaluate(`(async () => {
    const game = await import('./src/game.js');
    const state = game.createGame(); game.addPlayer(state, {id:'you',name:'You'});
    ${code}
    if (!game.validateState(state)) throw new Error('Browser fixture generated an invalid state');
    return state;
  })()`);
  const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem(${JSON.stringify(soloKey)}, ${JSON.stringify(JSON.stringify(fixture))});`,
  });
  try { await reload(); } finally { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier }); }
}
async function fit(label) {
  const metrics = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,core:document.querySelector('#core')?.getBoundingClientRect().toJSON()})`);
  assert.ok(metrics.scroll <= metrics.width + 1, `${label}: horizontal overflow ${JSON.stringify(metrics)}`);
  if (metrics.core?.width) assert.ok(metrics.core.width >= 44, `${label}: core has a usable touch target`);
  log(`${label} fits without horizontal overflow`);
}
async function desktopFrame(label,selectors=[],documentExpression='document') {
  const layout=await evaluate(`(() => {
    const doc=${documentExpression},win=doc.defaultView;
    const controls=${JSON.stringify(selectors)}.flatMap(selector=>{const nodes=[...doc.querySelectorAll(selector)];if(!nodes.length)throw Error('Missing frame control '+selector);return nodes.map(node=>({selector,rect:node.getBoundingClientRect().toJSON()}));});
    return {width:win.innerWidth,height:win.innerHeight,scrollWidth:doc.documentElement.scrollWidth,scrollHeight:doc.documentElement.scrollHeight,controls};
  })()`);
  assert.ok(layout.scrollWidth<=layout.width+1&&layout.scrollHeight<=layout.height+1,`${label}: document stays inside its frame (${JSON.stringify(layout)})`);
  for(const {selector,rect}of layout.controls)assert.ok(rect.width>0&&rect.height>0&&rect.left>=-1&&rect.top>=-1&&rect.right<=layout.width+1&&rect.bottom<=layout.height+1,`${label}: ${selector} is fully visible (${JSON.stringify(rect)})`);
  log(`${label}: controls fit with no page scrolling`);
}
async function shopFrame(documentExpression='document') {
  const geometry=await evaluate(`(()=>{
    const doc=${documentExpression},bounds=selector=>doc.querySelector(selector).getBoundingClientRect().toJSON();
    return {main:bounds('main'),view:bounds('#orbit-view'),scene:bounds('.orbit-panel'),shop:bounds('.generator-panel'),beam:bounds('#beam-companion'),heading:bounds('.generator-panel>.section-heading'),beamInShop:doc.querySelector('#orbit-shop-companion').contains(doc.querySelector('#beam-companion'))};
  })()`);
  assert.equal(geometry.beamInShop,true,'Beam sits inside the orbit shop');
  assert.ok(geometry.beam.width>0&&geometry.beam.height>0&&geometry.beam.left>=geometry.shop.left&&geometry.beam.right<=geometry.shop.right&&geometry.beam.top>=geometry.shop.top&&geometry.beam.bottom<=geometry.heading.top+1,'Beam is visible above the shop heading');
  assert.ok(Math.abs(geometry.view.left-geometry.main.left)<=1&&Math.abs(geometry.view.right-geometry.main.right)<=1,'The orbit fills the main frame with no unused sidebar');
  assert.ok(Math.abs(geometry.scene.left-geometry.view.left)<=1&&Math.abs(geometry.shop.right-geometry.view.right)<=1&&geometry.shop.left>geometry.scene.right&&geometry.shop.left-geometry.scene.right<=20,'Scene and shop span the full available width');
}
async function containedContent(selector,{overlap=true,documentExpression='document'}={}) {
  const problems=await evaluate(`(() => {const issues=[];for(const root of ${documentExpression}.querySelectorAll(${JSON.stringify(selector)})){
    const bounds=root.getBoundingClientRect();if(!bounds.width||!bounds.height)continue;
    const children=[...root.children].map(node=>({node,rect:node.getBoundingClientRect()})).filter(({rect})=>rect.width&&rect.height);
    for(const {node,rect}of children){const label=node.className||node.tagName;if(rect.left<bounds.left-2||rect.right>bounds.right+2||rect.top<bounds.top-2||rect.bottom>bounds.bottom+2)issues.push(label+' escapes '+root.className);
      if(node.scrollHeight>node.clientHeight+2)issues.push(label+' clips its text vertically ('+node.scrollHeight+'/'+node.clientHeight+')');}
    if(${overlap})for(let a=0;a<children.length;a++)for(let b=a+1;b<children.length;b++){const x=children[a].rect,y=children[b].rect;if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1)issues.push((children[a].node.className||children[a].node.tagName)+' overlaps '+(children[b].node.className||children[b].node.tagName));}
  }return issues;})()`);
  assert.deepEqual(problems,[],`${selector}: text and controls stay inside their panels without overlap`);
}
async function inspectEveryNode(map,inspector) {
  const issues=await evaluate(`(() => {
    for(const node of document.querySelectorAll('${map} [data-skill-node]')){
      node.click();const root=document.querySelector('${inspector}'),bounds=root.getBoundingClientRect();
      const children=[...root.children].map(item=>({item,rect:item.getBoundingClientRect()})).filter(({rect})=>rect.width&&rect.height);
      const problems=[];
      for(const {item,rect}of children){if(rect.left<bounds.left-2||rect.right>bounds.right+2||rect.top<bounds.top-2||rect.bottom>bounds.bottom+2)problems.push(item.className+' escapes inspector');if(item.scrollHeight>item.clientHeight+2)problems.push(item.className+' text overflow');}
      for(let a=0;a<children.length;a++)for(let b=a+1;b<children.length;b++){const x=children[a].rect,y=children[b].rect;if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1)problems.push(children[a].item.className+' overlaps '+children[b].item.className);}
      if(problems.length)return {node:node.dataset.skillNode,problems};
    }return null;
  })()`);
  assert.equal(issues,null,`${inspector}: every node's details fit without overlap (${JSON.stringify(issues)})`);
}
async function containedElements(parentSelector,childSelector,documentExpression='document') {
  const escaped=await evaluate(`(() => {const failures=[];for(const root of ${documentExpression}.querySelectorAll(${JSON.stringify(parentSelector)})){const box=root.getBoundingClientRect();for(const child of root.querySelectorAll(${JSON.stringify(childSelector)})){const rect=child.getBoundingClientRect();if(!rect.width||!rect.height)continue;if(rect.left<box.left-1||rect.right>box.right+1||rect.top<box.top-1||rect.bottom>box.bottom+1)failures.push({text:child.textContent,box:box.toJSON(),rect:rect.toJSON()});}}return failures;})()`);
  assert.deepEqual(escaped,[],`${childSelector} stays inside ${parentSelector}`);
}
async function capture(name) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path.join(output, `${name}.png`), Buffer.from(shot.data, 'base64'));
}
async function showResearch(key) {
  const skill=await evaluate(`import('./src/game.js').then(game=>{const skill=game.SKILLS.find(skill=>skill.key===${JSON.stringify(key)}||skill.id===${JSON.stringify(key)});return {id:skill.id,branch:skill.branch,currency:skill.currency};})`);
  await click(`[data-tab="${skill.currency==='prestige'?'prestige':'skills'}"]`);
  if(skill.currency!=='prestige')await click(`[data-research-branch="${skill.branch}"]`);
  await selectResearch(skill.id);
  return skill.id;
}
async function selectResearch(id) {
  await click(`[data-skill-node="${id}"]`);
  await waitFor(`Boolean(document.querySelector('[data-buy-skill="${id}"]'))`);
  assert.equal(await evaluate(`document.querySelector('[data-skill-node="${id}"]').classList.contains('is-selected')`),true,'The selected graph node opens its inspector');
}
const graphTransform = (map) => `getComputedStyle(document.querySelector('${map} [data-graph-board]')).transform`;
async function graphPointer(map) {
  return evaluate(`(() => {
    const viewport=document.querySelector('${map} [data-graph-viewport]');
    viewport.scrollIntoView({block:'center'});
    const rect=viewport.getBoundingClientRect();
    for(const fy of [.85,.15,.5])for(const fx of [.8,.5,.2]){
      const x=rect.x+rect.width*fx,y=rect.y+rect.height*fy;
      const target=document.elementFromPoint(x,y);
      if(target&&viewport.contains(target)&&!target.closest('button,input'))return{x,y};
    }
    throw Error('No unobstructed map surface for a drag');
  })()`);
}
async function exerciseGraph(map, touch=false) {
  const start=await graphPointer(map);
  const before=await evaluate(graphTransform(map));
  if(touch){
    await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x-35,y:start.y-20,id:1}]});
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x-70,y:start.y-40,id:1}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',buttons:1,clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x-90,y:start.y-40,button:'left',buttons:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x-90,y:start.y-40,button:'left',buttons:0,clickCount:1});
  }
  await waitFor(`${graphTransform(map)} !== ${JSON.stringify(before)}`,'Dragging pans the research map');
  const zoomBefore=await evaluate(`document.querySelector('${map} [data-graph-zoom]').textContent`);
  await click(`${map} [data-graph-action="in"]`);
  await waitFor(`document.querySelector('${map} [data-graph-zoom]').textContent !== ${JSON.stringify(zoomBefore)}`,'Zoom control changes the graph scale');
  if(!touch){
    const wheelStart=await graphPointer(map);
    const beforeWheel=await evaluate(graphTransform(map));
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',...wheelStart,deltaY:-180,deltaX:0});
    await waitFor(`${graphTransform(map)} !== ${JSON.stringify(beforeWheel)}`,'Mouse wheel zooms the map');
  }
  await click(`${map} [data-graph-action="fit"]`);
  const overlaps=await evaluate(`(() => {const nodes=[...document.querySelectorAll('${map} [data-skill-node]')].map(node=>({id:node.dataset.skillNode,rect:node.getBoundingClientRect()}));const collisions=[];for(let a=0;a<nodes.length;a++)for(let b=a+1;b<nodes.length;b++){const x=nodes[a].rect,y=nodes[b].rect;if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>.5&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>.5)collisions.push([nodes[a].id,nodes[b].id]);}return collisions;})()`);
  assert.deepEqual(overlaps,[],`${map}: node buttons do not overlap at Fit`);
  await fit(`${touch?'Touch':'Mouse'} research navigation`);
  if(touch)await send('Emulation.setTouchEmulationEnabled',{enabled:false});
}
async function freshPreview() {
  const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `if(window.top === window)sessionStorage.clear();`,
  });
  try { await navigate(new URL('tools/preview.html', base).href); }
  finally { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier }); }
  await waitFor(`document.querySelectorAll('iframe').length === 2 && ${frameDoc(101)}.querySelector('#round-action') && ${frameDoc(202)}.querySelector('#round-action')`);
  await waitFor(`${session(101)}?.players?.length === 2 && ${session(202)}?.players?.length === 2`);
}
const frameDoc = (id) => `document.querySelector('iframe[data-participant-id="${id}"]').contentDocument`;
const frameWindow = (id) => `document.querySelector('iframe[data-participant-id="${id}"]').contentWindow`;
const session = (id) => `(() => {const storage=${frameWindow(id)}.sessionStorage;const key=Object.keys(storage).find(key=>key.startsWith('refract-idlers:session:')&&key.endsWith(':${id}'));return key?JSON.parse(storage.getItem(key)):null;})()`;
async function eightPlayerSidebars(){
  // Layout-only protocol fixture: eight roster entries and two actual clients.
  for(const mode of ['scoreboard','coop']){
    await freshPreview();
    if(mode==='coop')await click('[data-mode="coop"]',frameDoc(101));
    const roster=[{id:101,name:'Alex'},{id:202,name:'Sam'},{id:303,name:'Taylor'},{id:404,name:'Alexandria'},{id:505,name:'Christopher'},{id:606,name:'Anastasia'},{id:707,name:'Benjamin'},{id:808,name:'Celzor'}];
    await evaluate(`(()=>{for(const id of [101,202])document.querySelector('iframe[data-participant-id="'+id+'"]').contentWindow.postMessage({protocol:'refract-activity/1',type:'participants',participants:${JSON.stringify(roster)}},location.origin);})()`);
    await waitFor(`${session(101)}?.players?.length===8 && ${session(202)}?.players?.length===8`);
    await click('#round-action',frameDoc(101));
    await waitFor(`${session(101)}?.phase==='round'`);
    for(const [width,height]of [[1366,768],[1920,1080]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await evaluate(`(()=>{const frame=document.querySelector('iframe[data-participant-id="101"]');Object.assign(frame.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',zIndex:'9999',border:'0',background:'#302a25'});document.body.style.overflow='hidden';})()`);
    const doc=frameDoc(101);
    await desktopFrame(`Eight-player ${mode} ${width}x${height}`,['#core','#round-action','.generator:not([hidden]) [data-buy-generator]','#beam-companion'],doc);
    await shopFrame(doc);
    if(mode==='scoreboard'){
      await desktopFrame('Scorebook launcher',['#scoreboard-toggle'],doc);
      await capture(`desktop-${width}-eight-player-orbit`);
      await pointerClick('#scoreboard-toggle',doc);
      await waitFor(`${doc}.querySelector('#scoreboard-dialog').open`,'Scorebook opens as a dialog');
      assert.equal(await evaluate(`${doc}.querySelectorAll('#scoreboard-list .scoreboard-row').length`),8,'All eight scoreboard entries are rendered');
      await desktopFrame('Eight-player scoreboard dialog',['#scoreboard-dialog','#scoreboard-close','#scoreboard-list .scoreboard-row'],doc);
      assert.equal(await evaluate(`(()=>{const dialog=${doc}.querySelector('#scoreboard-dialog');return dialog.scrollHeight<=dialog.clientHeight+1;})()`),true,'The eight-player scorebook needs no internal scrollbar');
      const behindDialogClicks=(await evaluate(session(101))).players.find(player=>player.id==='101').clicks;
      const behindDialogHealth=await evaluate(`${doc}.querySelector('#orb-health-fill').style.width`);
      await evaluate(`${doc}.activeElement.blur()`);
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
      await pause(1600);
      assert.equal(await evaluate(`${doc}.querySelector('#scoreboard-dialog').open`),true,'Space leaves the scorebook open');
      assert.equal(await evaluate(`${doc}.querySelector('#orb-health-fill').style.width`),behindDialogHealth,'Space cannot damage the core behind the scorebook');
      assert.equal((await evaluate(session(101))).players.find(player=>player.id==='101').clicks,behindDialogClicks,'Space behind the dialog creates no gameplay action');
      await capture(`desktop-${width}-eight-player-scoreboard`);
      await click('#scoreboard-close',doc);
      assert.equal(await evaluate(`${doc}.querySelector('#scoreboard-dialog').open`),false,'Close button dismisses the scorebook');
      assert.equal(await evaluate(`${doc}.activeElement.id`),'scoreboard-toggle','Closing the scorebook restores focus to its launcher');
      await pointerClick('#scoreboard-toggle',doc);
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await waitFor(`!${doc}.querySelector('#scoreboard-dialog').open`,'Escape closes the scorebook');
      assert.equal(await evaluate(`${doc}.activeElement.id`),'scoreboard-toggle','Escape restores focus to the scorebook launcher');
    }else{
      assert.equal(await evaluate(`${doc}.querySelector('#scoreboard-toggle').textContent.trim()`),'Crew','Co-op has a Crew dialog launcher');
      await pointerClick('#scoreboard-toggle',doc);
      await waitFor(`${doc}.querySelector('#scoreboard-dialog').open`,'Crew opens as a dialog');
      assert.equal(await evaluate(`${doc}.querySelectorAll('#crew .crew-member').length`),8,'All eight co-op crew entries are rendered');
      await desktopFrame(`Eight-player co-op dialog ${width}x${height}`,['#scoreboard-dialog','#scoreboard-close','#coop-panel','#crew-panel','#crew'],doc);
      await containedContent('#crew',{documentExpression:doc});
      await containedElements('#crew-panel','.crew-member',doc);
      assert.equal(await evaluate(`(()=>{const dialog=${doc}.querySelector('#scoreboard-dialog');return dialog.scrollHeight<=dialog.clientHeight+1;})()`),true,'The eight-player Crew dialog needs no internal scrollbar');
      await capture(`desktop-${width}-eight-player-coop`);
      await click('#scoreboard-close',doc);
      assert.equal(await evaluate(`${doc}.activeElement.id`),'scoreboard-toggle','Closing Crew restores focus to its launcher');
    }
    }
  }
}

try {
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error(`Browser did not start: ${stderr.slice(-600)}`)), 15000);
    browser.on('error', (error) => { clearTimeout(timeout); reject(error); });
    browser.stderr.on('data', (data) => {
      stderr += data;
      const found = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (found) { clearTimeout(timeout); resolve(found[1]); }
    });
    browser.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Browser exited ${code}: ${stderr.slice(-600)}`)); });
  });
  const protocolURL = `http://${new URL(endpoint).host}`;
  const target = await (await fetch(`${protocolURL}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const item = pending.get(message.id); pending.delete(message.id);
      if (item) message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
    } else if (message.method === 'Page.loadEventFired') loads++;
    else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate();
  await waitFor(`document.querySelector('#connection')?.textContent.includes('Solo')`);
  const loadedFonts = await evaluate(`[...document.fonts].filter(face=>face.status==='loaded').map(face=>face.family.replaceAll('"','').replaceAll("'",''))`);
  assert.ok(loadedFonts.includes('Pixel') && loadedFonts.includes('Terminal'), `Local retro fonts loaded: ${loadedFonts.join(', ')}`);
  log('Local Pixel and Terminal fonts loaded without fallback');
  if(sidebarOnly)await eightPlayerSidebars();else{
  for(const [width,height]of [[1366,768],[1920,1080]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await seed('');
    await desktopFrame(`Desktop ${width}x${height} lobby`,['#lobby-start','[data-mode]','[data-tab]:not([hidden])','#beam-companion','#scoreboard-toggle','#sound','#help','#multiplayer']);
    assert.equal(await evaluate(`Boolean(document.querySelector('#beam-companion img, #beam-companion svg, #beam-companion canvas'))`),true,'Beam has a visible pixel-art representation');
    await capture(`desktop-${width}-lobby`);
    await seed(bossFixture);
    await desktopFrame(`Desktop ${width}x${height} orbit`,['#core','#orb-health','#round-action','[data-buy-quantity]','.generator:not([hidden]) [data-buy-generator]','#beam-companion']);
    await shopFrame();
    await containedContent('.stat > div',{overlap:false});
    await containedElements('.stat','small');
    await capture(`desktop-${width}-frame-orbit`);
    await seed(`game.applyAction(state,'you',{type:'start'});game.advance(state,60);const p=state.players[0];state.round=800;p.completedRounds=800;p.highestOrb=180;p.orbsDestroyed=179;p.prestigeCount=3;p.totalPrestige=100;p.prestigePoints=100;p.skillPoints=10000;p.lrc=p.runLrc=p.lifetimeLrc=10000;`);
    await showResearch('quantum-barrage');
    await desktopFrame(`Desktop ${width}x${height} research`,['#research-map','#research-inspector','#research-search','#research-available','#research-inspector [data-buy-skill]','#research-ready']);
    await containedContent('#research-inspector');
    await inspectEveryNode('#research-map','#research-inspector');
    await showResearch('quantum-barrage');
    await capture(`desktop-${width}-frame-research`);
    const deepestLegacy=engine.SKILLS.filter(skill=>skill.currency==='prestige').at(-1).key;
    await showResearch(deepestLegacy);
    await desktopFrame(`Desktop ${width}x${height} prestige`,['#prestige-action','#legacy-map','#legacy-inspector','#legacy-inspector [data-buy-skill]']);
    await containedContent('#legacy-inspector');
    await inspectEveryNode('#legacy-map','#legacy-inspector');
    await showResearch(deepestLegacy);
    await containedContent('.prestige-rules');
    await containedElements('.prestige-machine','.prestige-rules span');
    await capture(`desktop-${width}-frame-prestige`);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await seed('');
  assert.equal(await evaluate(`document.querySelector('[data-mode="scoreboard"]').getAttribute('aria-pressed')`), 'true', 'Scoreboard is the default mode');
  await fit('Desktop lobby');
  await capture('desktop-lobby');
  if(!graphOnly){
  await click('#lobby-start');
  await waitFor(`!document.querySelector('#core').disabled`);
  await click('#core');
  await waitFor(`${readSolo}?.players?.[0]?.clicks >= 1`);
  assert.ok((await solo()).players[0].lrc >= 0.25, 'Core hit grants the small mint reward');
  const firstHitOrb=orbFor(await solo());
  assert.equal(firstHitOrb.maxHp,2000,'A fresh solo core has 2,000 HP');
  assert.ok(firstHitOrb.hp < firstHitOrb.maxHp, 'Core hit damages the starting orb');
  assert.equal(firstHitOrb.fractureStage,0,'One ordinary hit does not visibly crack the hard core');
  log('Core hit damages the orb and grants the small mint reward');
  const initialSound = await evaluate(`document.querySelector('#sound').getAttribute('aria-pressed')`);
  await pointerClick('#sound');
  assert.equal(await evaluate(`document.querySelector('#sound').getAttribute('aria-pressed')`), initialSound === 'true' ? 'false' : 'true', 'Sound can be toggled by a user gesture');
  await pointerClick('#sound');
  assert.equal(await evaluate(`document.querySelector('#sound').getAttribute('aria-pressed')`), initialSound, 'Sound can be toggled back');
  const clicksBeforeSpace = (await solo()).players[0].clicks;
  await evaluate(`document.activeElement?.blur()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  for (let i=0;i<4;i++) await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, autoRepeat: true });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await waitFor(`${readSolo}?.players?.[0]?.clicks === ${clicksBeforeSpace+1}`);
  log('Sound toggle works and holding Space does not create repeated clicks');
  await seed(`game.applyAction(state,'you',{type:'start'});state.players[0].orb.hp=game.getOrb(state.players[0],state).maxHp*.9+2;state.rng=1;`);
  assert.equal(await evaluate(`document.querySelector('#core').dataset.fracture`),'0','The core remains uncracked before ten percent damage');
  await click('#core');
  await waitFor(`document.querySelector('#core').dataset.fracture==='1'`,'The first crack appears at ten percent damage');
  await waitFor(`${readSolo}?.players?.[0]?.clicks===1`,'The first crack snapshot is persisted');
  assert.ok(Math.abs(orbFor(await solo()).damageFraction-.1)<1e-10,'The visible crack matches the actual HP damage fraction');
  await capture('desktop-first-core-crack');
  const beamClicks=(await solo()).players[0].clicks;
  const beforeBeamHp=await evaluate(`document.querySelector('#orb-health-text').textContent`);
  await pointerClick('#beam-companion .beam-poke');
  assert.equal(await evaluate(`document.querySelector('#beam-companion').dataset.mood`),'cheer','Beam visibly responds to a harmless greeting');
  assert.equal(await evaluate(`document.querySelector('#orb-health-text').textContent`),beforeBeamHp,'Greeting Beam does not damage the core');
  assert.equal((await solo()).players[0].clicks,beamClicks,'Beam is a companion, not a core attack target');
  log('Hard-core crack threshold and separate Beam companion target');
  await seed(`game.applyAction(state,'you',{type:'start'});state.players[0].orb.hp=1;`);
  const orbBeforeBreak=orbFor(await solo());
  const lrcBeforeBreak=(await solo()).players[0].lifetimeLrc;
  await click('#core');
  await waitFor(`${readSolo}?.players?.[0]?.orb?.level >= 2`);
  assert.ok((await solo()).players[0].lifetimeLrc >= lrcBeforeBreak+orbBeforeBreak.reward, 'Breaking the orb grants its advertised LRC drop');
  log('Breaking the orb pays a drop and advances to a stronger orb');

  await seed(`game.applyAction(state,'you',{type:'start'}); game.advance(state,30);`);
  await click('[data-buy-generator="mote"]');
  await waitFor(`${readSolo}?.players?.[0]?.generators?.mote === 1`);
  const purchased = await solo();
  assert.ok(purchased.players[0].lrc < 15, 'Generator purchase spends 25 LRC');
  await waitFor(`${readSolo}?.players?.[0]?.autoClicks >= 1`);
  assert.equal((await solo()).players[0].clicks, 0, 'Automatic core pulses do not count as manual clicks');
  assert.ok((await solo()).players[0].orb.hp < purchased.players[0].orb.hp, 'Automatic core pulses damage the orb');
  await reload();
  await waitFor(`!document.querySelector('#core').disabled`);
  assert.equal((await solo()).players[0].generators.mote, 1, 'Generator survives mid-round reload');
  assert.equal((await solo()).phase, 'round', 'Reload resumes the current round');
  assert.ok(orbFor(await solo()).hp < orbFor(await solo()).maxHp, 'Damaged orb survives mid-round reload');
  await fit('Desktop active round');
  await capture('desktop-orbit');
  log('Auto clicker purchases, automatic damage and mid-round HP persistence');
  const legacySave=await solo();
  engine.advance(legacySave,legacySave.remaining);
  delete legacySave.combatVersion;
  legacySave.sharedOrb={level:1,hp:9};
  for(const player of legacySave.players) {
    for(const key of ['highestOrb','orbsDestroyed','completedRounds','combo','comboAt']) delete player[key];
    player.orb={level:1,hp:6};
    player.skills['tap-tuning']=1;
  }
  const {identifier:legacyScript}=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem(${JSON.stringify(soloKey)},${JSON.stringify(JSON.stringify(legacySave))});`});
  try { await reload(); } finally { await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:legacyScript}); }
  await waitFor(`${readSolo}?.combatVersion===2 && ${readSolo}?.players?.[0]?.orb?.hp>6`);
  const migratedPlayer=(await solo()).players[0];
  assert.equal(migratedPlayer.generators.mote,1,'Legacy save migration keeps machines');
  assert.equal(migratedPlayer.skills['tap-tuning'],1,'Legacy save migration keeps earned research');
  assert.equal(migratedPlayer.orb.hp/orbFor(await solo()).maxHp,.5,'Legacy 6/12 HP retains exactly half health in the harder combat system');
  assert.equal((await solo()).combatVersion,2,'Migrated snapshots use the current combat version');
  log('Legacy combat saves retain damage fraction, machines and earned research');

  await seed(`game.applyAction(state,'you',{type:'start'});game.advance(state,60);`);
  await click('[data-tab="orbit"]');
  await click('[data-buy-quantity="10"]');
  assert.equal(await evaluate(`document.querySelector('[data-buy-generator="mote"]').disabled`), true, 'Buy10 is disabled when the whole batch is unaffordable');
  const cannotAffordTen = await solo();
  await evaluate(`document.querySelector('[data-buy-generator="mote"]').click()`);
  assert.equal((await solo()).players[0].lrc, cannotAffordTen.players[0].lrc, 'Unaffordable bulk purchase does not spend a partial amount');
  assert.equal((await solo()).players[0].generators.mote || 0, 0, 'Unaffordable Buy10 does not buy a partial batch');

  await seed(`game.applyAction(state,'you',{type:'start'});for(let i=0;i<50;i++){game.advance(state,60);if(i<49)game.applyAction(state,'you',{type:'ready'});}`);
  await click('[data-tab="orbit"]');
  await click('[data-buy-quantity="10"]');
  const batchBalance = (await solo()).players[0].lrc;
  await click('[data-buy-generator="mote"]');
  await waitFor(`${readSolo}?.players?.[0]?.generators?.mote === 10`);
  assert.ok((await solo()).players[0].lrc < batchBalance - 250, 'Buy10 charges increasing prices instead of ten copies of the starting price');
  await click('[data-buy-quantity="max"]');
  await click('[data-buy-generator="mote"]');
  await waitFor(`${readSolo}?.players?.[0]?.generators?.mote > 10`);
  assert.equal(await evaluate(`document.querySelector('[data-buy-generator="mote"]').disabled`), true, 'Max leaves too little balance to buy another unit');
  await capture('desktop-bulk-purchase');
  await click('[data-buy-quantity="1"]');
  log('Buy10 is atomic and Max buys the full affordable batch');
  }

  await seed(`game.applyAction(state,'you',{type:'start'});for(let round=0;round<4;round++){game.advance(state,60);if(round<3)game.applyAction(state,'you',{type:'ready'});}state.players[0].highestOrb=10;state.players[0].orbsDestroyed=9;`);
  await waitFor(`${readSolo}?.phase === 'intermission'`);
  await click('[data-tab="skills"]');
  await selectResearch('lucky-photon');
  assert.equal(await evaluate(`document.querySelector('[data-buy-skill="lucky-photon"]').disabled`), true, 'Dependent skill starts locked');
  await selectResearch('tap-tuning');
  await click('[data-buy-skill="tap-tuning"]');
  await selectResearch('lucky-photon');
  assert.equal(await evaluate(`document.querySelector('[data-buy-skill="lucky-photon"]').disabled`), true, 'Dependent research requires the stated previous rank');
  await selectResearch('tap-tuning');
  await click('[data-buy-skill="tap-tuning"]');
  await selectResearch('lucky-photon');
  await waitFor(`!document.querySelector('[data-buy-skill="lucky-photon"]').disabled`);
  await click('[data-buy-skill="lucky-photon"]');
  await waitFor(`${readSolo}?.players?.[0]?.skills?.['lucky-photon'] === 1`);
  await capture('desktop-skills');
  await click('[data-tab="orbit"]');
  await click('#round-action');
  await waitFor(`${readSolo}?.phase === 'round' && ${readSolo}.round === 5`);
  log('Round completion, skill prerequisites, purchases and ready-up');

  await seed(`game.applyAction(state,'you',{type:'start'}); for(let i=0;i<50;i++){game.advance(state,60);if(i<49)game.applyAction(state,'you',{type:'ready'});}game.applyAction(state,'you',{type:'buyGenerator',id:'mote'});game.applyAction(state,'you',{type:'buySkill',id:'tap-tuning'});`);
  const beforePrestige = await solo();
  await click('[data-tab="prestige"]');
  await capture('desktop-prestige');
  await click('#prestige-action');
  await waitFor(`document.querySelector('#confirm-prestige')`);
  await capture('desktop-prestige-confirm');
  await click('#confirm-prestige');
  await waitFor(`${readSolo}?.players?.[0]?.prestigeCount === 1`);
  const afterPrestige = (await solo()).players[0];
  assert.equal(afterPrestige.totalPrestige, 1);
  assert.equal(afterPrestige.lrc, 0);
  assert.equal(afterPrestige.runLrc, 0);
  assert.equal(afterPrestige.skillPoints, beforePrestige.players[0].skillPoints);
  assert.deepEqual(afterPrestige.generators, {});
  assert.deepEqual(afterPrestige.skills, beforePrestige.players[0].skills);
  assert.equal(afterPrestige.orb.level, 1);
  assert.equal(afterPrestige.lifetimeLrc, beforePrestige.players[0].lifetimeLrc);
  log('Prestige resets machines and the personal orb while retaining research, SP and lifetime earnings');
  const eternalSpark=await showResearch('eternal-spark');
  await click(`[data-buy-skill="${eternalSpark}"]`);
  await waitFor(`${readSolo}?.players?.[0]?.skills?.[${JSON.stringify(eternalSpark)}] === 1`);
  assert.equal((await solo()).players[0].prestigePoints,0,'Permanent research spends available PP');
  assert.equal((await solo()).players[0].totalPrestige,1,'Spending PP preserves lifetime prestige production bonus');
  await reload();
  assert.equal((await solo()).players[0].skills[eternalSpark],1,'Permanent research survives reload');
  await seed(`Object.assign(state,JSON.parse(localStorage.getItem(${JSON.stringify(soloKey)})));for(let i=0;i<40;i++){game.applyAction(state,'you',{type:'ready'});game.advance(state,60);}`);
  await click('[data-tab="prestige"]');
  await click('#prestige-action');
  await click('#confirm-prestige');
  await waitFor(`${readSolo}?.players?.[0]?.prestigeCount === 2`);
  assert.equal((await solo()).players[0].skills[eternalSpark],1,'Permanent research survives another prestige');
  log('Permanent PP research spends the right currency and survives reload and another prestige');

  // Valid late-game fixtures isolate cross-branch UI gates; pacing is audited separately.
  await seed(`game.applyAction(state,'you',{type:'start'});game.advance(state,60);
    const player=state.players[0];state.round=80;player.completedRounds=80;player.highestOrb=60;player.orbsDestroyed=59;player.prestigeCount=1;player.totalPrestige=1;player.prestigePoints=1;player.skillPoints=10000;
    for(const [id,ranks]of [['tap-tuning',2],['lucky-photon',3],['singularity',2],['solar-cells',2]])for(let i=0;i<ranks;i++){if(!game.applyAction(state,'you',{type:'buySkill',id}).ok)throw Error('Prerequisite fixture failed');}
  `);
  const echoStrike=await showResearch('echo-strike');
  assert.equal(await evaluate(`document.querySelector('[data-buy-skill="${echoStrike}"]').disabled`),true,'Cross-branch research is locked without the other discipline');
  assert.match(await evaluate(`document.querySelector('#research-inspector').textContent`),/Orbital array/,'The missing cross-branch prerequisite is named');
  assert.equal(await evaluate(`document.querySelectorAll('#research-map [data-skill-node]').length`),54,'All fifty-four normal nodes remain in the graph');
  assert.ok(await evaluate(`document.querySelectorAll('#research-map [data-edge-from][data-edge-to]').length > 40`),'The atlas draws prerequisite connections');
  assert.ok(await evaluate(`document.querySelectorAll('#research-map [data-edge-from].is-path').length > 0`),'Selected ancestry is highlighted on the graph');
  await click(`#research-inspector [data-focus-skill="orbital-array"]`);
  await waitFor(`Boolean(document.querySelector('[data-buy-skill="orbital-array"]'))`);
  assert.equal(await evaluate(`document.querySelector('[data-skill-node="orbital-array"]').classList.contains('is-selected')`),true,'Prerequisite link selects the other branch node');
  await click('[data-buy-skill="orbital-array"]');
  await click('[data-buy-skill="orbital-array"]');
  await showResearch('echo-strike');
  await click(`[data-buy-skill="${echoStrike}"]`);
  await waitFor(`${readSolo}?.players?.[0]?.skills?.[${JSON.stringify(echoStrike)}] === 1`);
  const finalClickNode=await showResearch('quantum-barrage');
  assert.equal(await evaluate(`document.querySelector('[data-buy-skill="${finalClickNode}"]').disabled`),true,'Late research remains locked despite abundant SP');
  await exerciseGraph('#research-map');
  await evaluate(`document.querySelector('#research-map').scrollIntoView({block:'start'})`);
  await capture('desktop-deep-research');
  await click('[data-research-branch="all"]');
  await capture('desktop-research-overview');
  await click('#research-map [data-graph-action="expand"]');
  await waitFor(`document.querySelector('#skill-tree').classList.contains('graph-expanded')`);
  await click('#research-map [data-graph-action="fit"]');
  await capture('desktop-research-expanded');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await evaluate(`document.querySelector('#skill-tree').classList.contains('graph-expanded')`),false,'Escape closes the expanded map');
  await click('#research-map [data-graph-action="expand"]');
  await click('[data-tab="orbit"]');
  assert.equal(await evaluate(`document.querySelector('#skill-tree').classList.contains('graph-expanded')`),false,'Changing views closes the expanded map');
  await click('[data-tab="skills"]');
  await evaluate(`(()=>{const input=document.querySelector('#research-search');input.value='orb';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  assert.equal(await evaluate(`document.querySelectorAll('#research-map [data-skill-node]').length`),54,'Search preserves the complete graph context');
  const searchCounts=await evaluate(`({dim:document.querySelectorAll('#research-map [data-skill-node].is-dim').length,bright:document.querySelectorAll('#research-map [data-skill-node]:not(.is-dim)').length})`);
  assert.ok(searchCounts.dim>0&&searchCounts.bright>0,'Search highlights matches while dimming other nodes');
  await evaluate(`(()=>{const input=document.querySelector('#research-search');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('#research-available');
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('#research-map [data-skill-node]:not(.is-dim)')).every(node=>node.dataset.state==='ready')`),true,'Available filter highlights purchasable nodes');
  assert.equal(await evaluate(`document.querySelectorAll('#research-map [data-skill-node]').length`),54,'Available filter retains graph context');
  await click('#research-available');
  await click('[data-research-branch="all"]');
  const beforeBranch=await evaluate(graphTransform('#research-map'));
  await click('[data-research-branch="orbs"]');
  assert.equal(await evaluate(`document.querySelector('[data-research-branch="orbs"]').getAttribute('aria-pressed')`),'true','Branch selection is announced');
  assert.notEqual(await evaluate(graphTransform('#research-map')),beforeBranch,'Branch selection focuses its nodes on the map');
  assert.equal(await evaluate(`document.querySelectorAll('#research-map [data-skill-node]').length`),54,'Branch focus keeps the connected atlas intact');
  await click('[data-tab="prestige"]');
  assert.equal(await evaluate(`document.querySelectorAll('#legacy-map [data-skill-node]').length`),16,'Permanent graph exposes sixteen research nodes');
  await showResearch('eternal-spark');
  await exerciseGraph('#legacy-map');
  await evaluate(`document.querySelector('#legacy-map').scrollIntoView({block:'start'})`);
  await capture('desktop-legacy-research');
  log('Connected research graphs, prerequisite navigation, deep gates and context-preserving search work');

  if(!graphOnly){
  await seed(`game.applyAction(state,'you',{type:'start'});
    for(let round=0;round<40&&Object.keys(state.players[0].generators).length<5;round++){
      for(let second=0;second<60;second++){
        game.advance(state,1);
        for(const generator of [...game.GENERATORS].reverse()){
          if(game.generatorCost(state.players[0],generator.id)<=state.players[0].lrc)game.applyAction(state,'you',{type:'buyGenerator',id:generator.id});
        }
      }
      for(const skill of game.SKILLS)game.applyAction(state,'you',{type:'buySkill',id:skill.id});
      game.applyAction(state,'you',{type:'ready'});
    }`);
  assert.equal(Object.values((await solo()).players[0].generators).filter(count=>count>0).length, 5, 'Powered orbit fixture owns all five upgrade types');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await reload();
  await pause(650);
  await capture('desktop-powered-orbit');
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await fit('Desktop 1366x768 powered orbit');
  const compactBounds = await evaluate(`({height:innerHeight,core:document.querySelector('#core').getBoundingClientRect().toJSON(),controls:document.querySelector('.round-controls').getBoundingClientRect().toJSON()})`);
  for(const [name,rect] of Object.entries({core:compactBounds.core,controls:compactBounds.controls})) {
    assert.ok(rect.top>=0&&rect.bottom<=compactBounds.height+1, `${name} stays inside the 1366x768 viewport: ${JSON.stringify(compactBounds)}`);
  }
  await capture('desktop-1366-powered-orbit');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  log('All five named upgrades render in a powered orbit with motion enabled');
  await seed(bossFixture);
  await capture('desktop-boss-orb');
  }

  for (const [width, height] of includeMobile?[[390,844],[360,740]]:[]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
    await seed('');
    await fit(`Mobile ${width}px lobby`);
    await click('#round-action');
    await click('#core');
    await fit(`Mobile ${width}px active round`);
    await capture(`mobile-${width}-orbit`);
    if(width===360) {
      await seed(bossFixture);
      await fit('Mobile360px boss and high currency');
      await capture('mobile-360-boss-high-currency');
      await seed(`game.applyAction(state,'you',{type:'start'});game.advance(state,60);`);
    }
    await click('[data-tab="skills"]');
    await selectResearch('tap-tuning');
    if(width===360){
      await click('[data-research-branch="click"]');
      await evaluate(`document.querySelector('#research-map').scrollIntoView({block:'center'})`);
      await touchTap('[data-skill-node="tap-tuning"]',false);
      await waitFor(`document.querySelector('#research-inspector').dataset.selectedSkill==='tap-tuning'`,'A touch selects the node and updates its inspector');
      await touchTap('#research-map [data-graph-action="details"]',false);
      const inspectorBounds=await evaluate(`document.querySelector('#research-inspector').getBoundingClientRect().toJSON()`);
      assert.ok(inspectorBounds.top>=-1&&inspectorBounds.top<160,'Mobile Details cue brings the selected inspector into view');
      await touchTap('[data-buy-skill="tap-tuning"]');
      await waitFor(`${readSolo}?.players?.[0]?.skills?.['tap-tuning']===1`,'Touch purchase unlocks a research rank');
      await exerciseGraph('#research-map',true);
    }
    await fit(`Mobile ${width}px skill tree`);
    await evaluate(`document.querySelector('#research-map').scrollIntoView({block:'start'})`);
    await capture(`mobile-${width}-skills`);
    await evaluate(`document.querySelector('#research-inspector').scrollIntoView({block:'start'})`);
    await capture(`mobile-${width}-skills-inspector`);
    if(width===360){
      await showResearch('eternal-spark');
      await fit('Mobile360px legacy map');
      await evaluate(`document.querySelector('#legacy-map').scrollIntoView({block:'start'})`);
      await capture('mobile-360-legacy-map');
    }
  }

  if(!graphOnly){
  await send('Emulation.setDeviceMetricsOverride', { width: 1800, height: 1100, deviceScaleFactor: 1, mobile: false });
  await freshPreview();
  assert.equal((await evaluate(session(101))).mode, 'scoreboard', 'Shared sessions default to Scoreboard');
  assert.equal(await evaluate(`${frameDoc(202)}.querySelector('[data-mode="coop"]').disabled`), true, 'Followers cannot select the session mode');
  await click('[data-mode="coop"]', frameDoc(101));
  await waitFor(`${session(202)}?.mode === 'coop'`);
  await click('[data-mode="scoreboard"]', frameDoc(101));
  await waitFor(`${session(202)}?.mode === 'scoreboard'`);
  log('Host-only lobby mode selection synchronizes to the other client');
  await click('#round-action', frameDoc(101));
  await waitFor(`${session(101)}?.phase === 'round' && ${session(202)}?.phase === 'round'`);
  await click('#core', frameDoc(202));
  await waitFor(`${session(101)}?.players?.find(p=>p.id==='202')?.clicks >= 1 && ${session(202)}?.players?.find(p=>p.id==='202')?.clicks >= 1`);
  const separateOrbs = await evaluate(session(101));
  assert.equal(orbFor(separateOrbs,'101').hp,orbFor(separateOrbs,'101').maxHp, 'Scoreboard host orb is untouched by another player');
  assert.ok(orbFor(separateOrbs,'202').hp < orbFor(separateOrbs,'202').maxHp, 'Scoreboard follower damages only their own orb');
  await click('#scoreboard-toggle',frameDoc(101));
  await waitFor(`${frameDoc(101)}.querySelector('#scoreboard-dialog').open`);
  await waitFor(`${frameDoc(101)}.querySelector('#scoreboard-list .scoreboard-row')?.dataset.playerId === '202'`);
  await click('#scoreboard-close',frameDoc(101));
  assert.equal(await evaluate(`${frameDoc(101)}.querySelector('[data-mode="coop"]').disabled`), true, 'The session mode locks after the run begins');
  log('Two independent frames share rounds and authenticated clicks');

  // Advance a persisted snapshot through public game APIs, then reload the host.
  // The normal bridge must recover its epoch and synchronize the near-round-end state.
  const sessionFixture = await evaluate(`(() => {
    const frame=${frameWindow(101)};const storage=frame.sessionStorage;
    const key=Object.keys(storage).find(key=>key.startsWith('refract-idlers:session:')&&key.endsWith(':101'));
    const state=JSON.parse(storage.getItem(key));
    return {key,state};
  })()`);
  engine.advance(sessionFixture.state,Math.max(0,sessionFixture.state.remaining-0.4));
  assert.equal(engine.validateState(sessionFixture.state),true,'Valid near-round-end multiplayer fixture');
  const { identifier: sessionScript } = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `sessionStorage.setItem(${JSON.stringify(sessionFixture.key)},${JSON.stringify(JSON.stringify(sessionFixture.state))});`,
  });
  try {
    await evaluate(`${frameWindow(101)}.location.reload()`);
    try { await waitFor(`${session(101)}?.phase === 'intermission' && ${session(202)}?.phase === 'intermission'`); }
    catch (error) {
      console.log('MULTIPLAYER FIXTURE DIAGNOSTIC', JSON.stringify(await evaluate(`({host:${session(101)},peer:${session(202)},hostConnection:${frameDoc(101)}.querySelector('#connection')?.textContent,peerConnection:${frameDoc(202)}.querySelector('#connection')?.textContent})`)));
      throw error;
    }
  } finally { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: sessionScript }); }
  await click('[data-tab="orbit"]', frameDoc(101));
  await click('[data-tab="orbit"]', frameDoc(202));
  await click('#round-action', frameDoc(101));
  await pause(300);
  assert.equal((await evaluate(session(101))).phase, 'intermission', 'One ready player waits for the crew');
  await click('#round-action', frameDoc(202));
  await waitFor(`${session(101)}?.round === 2 && ${session(202)}?.round === 2`);
  log('Multiplayer host reload, shared intermission and everyone-ready transition');

  const previous = await evaluate(session(202));
  await click('[aria-label="Leave as Alex"]');
  await waitFor(`${session(202)}?.players?.length === 1 && ${session(202)}.players[0].id === '202' && ${session(202)}.now > ${previous.now}`);
  assert.deepEqual((await evaluate(session(202))).players[0].orb,previous.players.find(player=>player.id==='202').orb,'Host handover preserves the remaining player’s orb damage');
  await waitFor(`${frameDoc(202)}.querySelectorAll('#scoreboard-list .scoreboard-row').length === 1 && !${frameDoc(202)}.querySelector('#scoreboard-list [data-player-id="101"]')`);
  const clicksBefore = (await evaluate(session(202))).players[0].clicks;
  await click('#core', frameDoc(202));
  await waitFor(`${session(202)}?.players?.[0]?.clicks > ${clicksBefore}`);
  await click('#toggle-third');
  await waitFor(`document.querySelector('iframe[data-participant-id="303"]') && ${session(303)}?.players?.length === 2 && ${session(303)}.round === 2`);
  await waitFor(`${frameDoc(202)}.querySelectorAll('#scoreboard-list .scoreboard-row').length === 2 && Boolean(${frameDoc(202)}.querySelector('#scoreboard-list [data-player-id="303"]'))`);
  await capture('multiplayer-handover');
  log('Host departure preserves the run and a late joiner catches up');

  await freshPreview();
  await click('[data-mode="coop"]', frameDoc(101));
  await waitFor(`${session(101)}?.mode === 'coop' && ${session(202)}?.mode === 'coop'`);
  await click('#round-action', frameDoc(101));
  await waitFor(`${session(202)}?.phase === 'round'`);
  assert.equal(await evaluate(`${frameDoc(101)}.querySelector('#scoreboard-dialog').open`), false, 'Co-op keeps competitive rankings out of the playfield');
  assert.equal(await evaluate(`${frameDoc(101)}.querySelector('#coop-panel').hidden`), false, 'Co-op shows shared progress');
  const fullCrewOrb=orbFor(await evaluate(session(101)),'101');
  assert.equal(fullCrewOrb.crewSize,2,'The shared core counts two active humans');
  assert.equal(fullCrewOrb.maxHp,fullCrewOrb.unscaledMaxHp*1.85,'Two pilots face a core with 85% more HP');
  await click('#core', frameDoc(202));
  await waitFor(`${session(101)}?.sharedOrb?.hp < ${fullCrewOrb.maxHp} && ${session(202)}?.sharedOrb?.hp < ${fullCrewOrb.maxHp}`);
  const firstSharedHit = (await evaluate(session(101))).sharedOrb;
  await click('#core', frameDoc(101));
  await waitFor(`[${session(101)},${session(202)}].every(state=>state?.sharedOrb?.hp<${firstSharedHit.hp}||state?.sharedOrb?.level>${firstSharedHit.level})`);
  const beforeJoinOrb=orbFor(await evaluate(session(101)),'101');
  await click('#toggle-third');
  await waitFor(`${session(101)}?.players?.length===3 && ${session(303)}?.players?.length===3`);
  const afterJoinOrb=orbFor(await evaluate(session(101)),'101');
  assert.equal(afterJoinOrb.crewSize,3,'A late join increases active co-op crew size');
  assert.equal(afterJoinOrb.maxHp,afterJoinOrb.unscaledMaxHp*2.7,'A third pilot increases the core difficulty');
  assert.ok(Math.abs(afterJoinOrb.hp/afterJoinOrb.maxHp-beforeJoinOrb.hp/beforeJoinOrb.maxHp)<1e-10,'Joining preserves the shared damage percentage');
  await click('#toggle-third');
  await waitFor(`${session(101)}?.players?.length===2 && ${session(202)}?.players?.length===2`);
  const afterLeaveOrb=orbFor(await evaluate(session(101)),'101');
  assert.equal(afterLeaveOrb.maxHp,beforeJoinOrb.maxHp,'Leaving rescales to the remaining crew');
  assert.ok(Math.abs(afterLeaveOrb.hp/afterLeaveOrb.maxHp-beforeJoinOrb.hp/beforeJoinOrb.maxHp)<1e-10,'Leaving preserves the shared damage percentage');
  for(let i=0;i<80;i++) {
    if((await evaluate(session(101))).sharedLrc>=30)break;
    await click('#core',frameDoc(101));
    await pause(90);
  }
  await waitFor(`${session(202)}?.sharedLrc >= 25`);
  const pooledBefore = await evaluate(session(202));
  assert.ok(pooledBefore.players.find(p=>p.id==='202').roundLrc < 25, 'Follower has not individually earned the generator cost');
  await waitFor(`${frameDoc(101)}.querySelector('#lrc').textContent === ${frameDoc(202)}.querySelector('#lrc').textContent`);
  await click('[data-buy-generator="mote"]', frameDoc(202));
  await waitFor(`${session(101)}?.players?.find(p=>p.id==='202')?.generators?.mote === 1 && ${session(202)}?.players?.find(p=>p.id==='202')?.generators?.mote === 1`);
  const pooledAfter = await evaluate(session(202));
  assert.ok(pooledAfter.sharedLrc < pooledBefore.sharedLrc - 15, 'Generator purchase consumes the shared bank');
  assert.equal(pooledAfter.players.find(p=>p.id==='101').generators.mote || 0, 0, 'Generator belongs to its purchaser');
  await capture('multiplayer-coop');
  log('Co-op players damage one shared orb and can invest each other’s LRC earnings');

  const cooperativePrestige = await evaluate(`(() => {
    const storage=${frameWindow(101)}.sessionStorage;
    const key=Object.keys(storage).find(key=>key.startsWith('refract-idlers:session:')&&key.endsWith(':101'));
    return {key,state:JSON.parse(storage.getItem(key))};
  })()`);
  await writeFile(path.join(output,'coop-before-prestige.json'),JSON.stringify(cooperativePrestige.state));
  for(let i=0;i<45;i++){
    engine.advance(cooperativePrestige.state,cooperativePrestige.state.remaining);
    if(i<44){engine.applyAction(cooperativePrestige.state,'101',{type:'ready'});engine.applyAction(cooperativePrestige.state,'202',{type:'ready'});}
  }
  assert.equal(engine.validateState(cooperativePrestige.state),true,'Valid co-op prestige fixture');
  const { identifier: cooperativeScript } = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `sessionStorage.setItem(${JSON.stringify(cooperativePrestige.key)},${JSON.stringify(JSON.stringify(cooperativePrestige.state))});`,
  });
  try {
    await evaluate(`${frameWindow(101)}.location.reload()`);
    await waitFor(`${session(101)}?.phase === 'intermission' && ${session(202)}?.phase === 'intermission' && ${session(202)}.players.find(p=>p.id==='101').runLrc >= 2500`);
  } finally { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: cooperativeScript }); }
  const sharedBeforePrestige = (await evaluate(session(202))).sharedLrc;
  const sharedOrbBeforePrestige = (await evaluate(session(202))).sharedOrb;
  await click('[data-tab="prestige"]', frameDoc(101));
  await click('#prestige-action', frameDoc(101));
  await click('#confirm-prestige', frameDoc(101));
  await waitFor(`${session(202)}?.players?.find(p=>p.id==='101')?.prestigeCount === 1`);
  const sharedAfterPrestige = await evaluate(session(202));
  assert.equal(sharedAfterPrestige.sharedLrc, sharedBeforePrestige, 'Personal prestige preserves the shared bank');
  assert.deepEqual(sharedAfterPrestige.sharedOrb, sharedOrbBeforePrestige, 'Personal prestige preserves the shared orb HP and level');
  assert.equal(sharedAfterPrestige.players.find(p=>p.id==='202').generators.mote, 1, 'Personal prestige preserves the other pilot\'s investment');
  log('Co-op prestige keeps the shared bank and the other pilot’s build');
  await click('[aria-label="Leave as Alex"]');
  await waitFor(`${session(202)}?.players?.length===1`);
  const sharedAfterDeparture=await evaluate(session(202));
  const departureOrb=orbFor(sharedAfterDeparture,'202');
  const previousCrewOrb=orbFor(sharedAfterPrestige,'202');
  assert.equal(departureOrb.level,previousCrewOrb.level,'Co-op host departure preserves the shared core level');
  assert.ok(Math.abs(departureOrb.hp/departureOrb.maxHp-previousCrewOrb.hp/previousCrewOrb.maxHp)<1e-10,'Co-op host departure preserves the shared damage percentage');
  assert.equal((await evaluate(session(202))).sharedLrc,sharedAfterPrestige.sharedLrc,'Co-op host departure preserves the paused shared bank');
  log('Co-op host handover preserves shared HP and the bank');
  await eightPlayerSidebars();
  }
  }
  assert.deepEqual(errors, [], 'No browser runtime exceptions');
  console.log(`Refract Idlers ${graphOnly?'research graph':'browser'} acceptance passed.`);
} catch(error) {
  if(socket?.readyState===WebSocket.OPEN)await capture('acceptance-failure').catch(()=>{});
  throw error;
} finally {
  socket?.close();
  browser?.kill();
  await pause(800);
  // Delete only the verified temporary profile underneath this test's output.
  if (profile.startsWith(output + path.sep)) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
