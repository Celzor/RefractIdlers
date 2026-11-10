/** UI acceptance with installed Edge/Chromium and its CDP endpoint. No npm dependency. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.TEST_URL || 'http://127.0.0.1:4175/';
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
async function pointerClick(selector) {
  const position = await evaluate(`(() => {const element=document.querySelector(${JSON.stringify(selector)});element.scrollIntoView({block:'center'});const rect=element.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...position, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...position, button: 'left', clickCount: 1 });
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
async function solo() { return evaluate(readSolo); }
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
async function capture(name) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path.join(output, `${name}.png`), Buffer.from(shot.data, 'base64'));
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
  assert.equal(await evaluate(`document.querySelector('[data-mode="scoreboard"]').getAttribute('aria-pressed')`), 'true', 'Scoreboard is the default mode');
  await fit('Desktop lobby');
  await capture('desktop-lobby');
  await click('#lobby-start');
  await waitFor(`!document.querySelector('#core').disabled`);
  await click('#core');
  await waitFor(`${readSolo}?.players?.[0]?.clicks >= 1`);
  assert.ok((await solo()).players[0].lrc >= 2, 'Core harvest earns LRC');
  log('Core click earns LRC in a live round');
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

  await seed(`game.applyAction(state,'you',{type:'start'}); game.advance(state,30);`);
  await click('[data-buy-generator="mote"]');
  await waitFor(`${readSolo}?.players?.[0]?.generators?.mote === 1`);
  const purchased = await solo();
  assert.ok(purchased.players[0].lrc < 15, 'Generator purchase spends 25 LRC');
  await waitFor(`${readSolo}?.players?.[0]?.autoClicks >= 1`);
  assert.equal((await solo()).players[0].clicks, 0, 'Automatic core pulses do not count as manual clicks');
  assert.ok((await solo()).players[0].lrc > purchased.players[0].lrc, 'Automatic core pulses produce income');
  await reload();
  await waitFor(`!document.querySelector('#core').disabled`);
  assert.equal((await solo()).players[0].generators.mote, 1, 'Generator survives mid-round reload');
  assert.equal((await solo()).phase, 'round', 'Reload resumes the current round');
  await fit('Desktop active round');
  await capture('desktop-orbit');
  log('Auto clicker purchases, automatic income and mid-round persistence');

  await seed(`game.applyAction(state,'you',{type:'start'}); for(let i=0;i<2;i++){game.advance(state,60);game.applyAction(state,'you',{type:'ready'});} game.advance(state,59.4);`);
  await waitFor(`${readSolo}?.phase === 'intermission'`);
  await click('[data-tab="skills"]');
  assert.equal(await evaluate(`document.querySelector('[data-buy-skill="lucky-photon"]').disabled`), true, 'Dependent skill starts locked');
  await click('[data-buy-skill="tap-tuning"]');
  await waitFor(`!document.querySelector('[data-buy-skill="lucky-photon"]').disabled`);
  await click('[data-buy-skill="lucky-photon"]');
  await waitFor(`${readSolo}?.players?.[0]?.skills?.['lucky-photon'] === 1`);
  await capture('desktop-skills');
  await click('[data-tab="orbit"]');
  await click('#round-action');
  await waitFor(`${readSolo}?.phase === 'round' && ${readSolo}.round === 4`);
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
  assert.equal(afterPrestige.skillPoints, 0);
  assert.deepEqual(afterPrestige.generators, {});
  assert.deepEqual(afterPrestige.skills, {});
  assert.equal(afterPrestige.lifetimeLrc, beforePrestige.players[0].lifetimeLrc);
  log('Prestige confirmation resets build and retains lifetime earnings');

  await seed(`game.applyAction(state,'you',{type:'start'});
    for(let round=0;round<10;round++){
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

  for (const [width, height] of [[390,844],[360,740]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
    await seed('');
    await fit(`Mobile ${width}px lobby`);
    await click('#round-action');
    await click('#core');
    await fit(`Mobile ${width}px active round`);
    await capture(`mobile-${width}-orbit`);
    await click('[data-tab="skills"]');
    await fit(`Mobile ${width}px skill tree`);
    await capture(`mobile-${width}-skills`);
  }

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
  assert.equal(await evaluate(`${frameDoc(101)}.querySelector('#scoreboard-panel').hidden`), false, 'Scoreboard is visible in Scoreboard mode');
  await waitFor(`${frameDoc(101)}.querySelector('#scoreboard-list .scoreboard-row')?.dataset.playerId === '202'`);
  assert.equal(await evaluate(`${frameDoc(101)}.querySelector('[data-mode="coop"]').disabled`), true, 'The session mode locks after the run begins');
  log('Two independent frames share rounds and authenticated clicks');

  // Advance a persisted snapshot through public game APIs, then reload the host.
  // The normal bridge must recover its epoch and synchronize the near-round-end state.
  const sessionFixture = await evaluate(`(async () => {
    const frame=${frameWindow(101)};const storage=frame.sessionStorage;
    const key=Object.keys(storage).find(key=>key.startsWith('refract-idlers:session:')&&key.endsWith(':101'));
    const state=JSON.parse(storage.getItem(key));const game=await import('../src/game.js');
    game.advance(state,Math.max(0,state.remaining-0.4));
    if(!game.validateState(state))throw Error('Invalid multiplayer fixture');
    return {key,state};
  })()`);
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
  assert.equal(await evaluate(`${frameDoc(101)}.querySelector('#scoreboard-panel').hidden`), true, 'Co-op hides competitive rankings');
  assert.equal(await evaluate(`${frameDoc(101)}.querySelector('#coop-panel').hidden`), false, 'Co-op shows shared progress');
  await evaluate(`(async () => {for(let i=0;i<14;i++){${frameDoc(101)}.querySelector('#core').click();await new Promise(resolve=>setTimeout(resolve,90));}})()`);
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
  log('Co-op shares one balance and lets a follower invest funds earned by the host');

  const cooperativePrestige = await evaluate(`(async () => {
    const storage=${frameWindow(101)}.sessionStorage;
    const key=Object.keys(storage).find(key=>key.startsWith('refract-idlers:session:')&&key.endsWith(':101'));
    const state=JSON.parse(storage.getItem(key));const game=await import('../src/game.js');
    for(let i=0;i<45;i++){
      game.advance(state,state.remaining);
      if(i<44){game.applyAction(state,'101',{type:'ready'});game.applyAction(state,'202',{type:'ready'});}
    }
    if(!game.validateState(state))throw Error('Invalid co-op prestige fixture');
    return {key,state};
  })()`);
  const { identifier: cooperativeScript } = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `sessionStorage.setItem(${JSON.stringify(cooperativePrestige.key)},${JSON.stringify(JSON.stringify(cooperativePrestige.state))});`,
  });
  try {
    await evaluate(`${frameWindow(101)}.location.reload()`);
    await waitFor(`${session(101)}?.phase === 'intermission' && ${session(202)}?.phase === 'intermission' && ${session(202)}.players.find(p=>p.id==='101').runLrc >= 2500`);
  } finally { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: cooperativeScript }); }
  const sharedBeforePrestige = (await evaluate(session(202))).sharedLrc;
  await click('[data-tab="prestige"]', frameDoc(101));
  await click('#prestige-action', frameDoc(101));
  await click('#confirm-prestige', frameDoc(101));
  await waitFor(`${session(202)}?.players?.find(p=>p.id==='101')?.prestigeCount === 1`);
  const sharedAfterPrestige = await evaluate(session(202));
  assert.equal(sharedAfterPrestige.sharedLrc, sharedBeforePrestige, 'Personal prestige preserves the shared bank');
  assert.equal(sharedAfterPrestige.players.find(p=>p.id==='202').generators.mote, 1, 'Personal prestige preserves the other pilot\'s investment');
  log('Co-op prestige keeps the shared bank and the other pilot’s build');
  assert.deepEqual(errors, [], 'No browser runtime exceptions');
  console.log('Refract Idlers browser acceptance passed.');
} finally {
  socket?.close();
  browser?.kill();
  await pause(800);
  // Delete only the verified temporary profile underneath this test's output.
  if (profile.startsWith(output + path.sep)) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
