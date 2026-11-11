/** Verify actual projectile pixels above the native core in Chromium. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base=process.env.TEST_URL||'http://127.0.0.1:4175/';
const executable=process.env.BROWSER_EXECUTABLE||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const output=path.resolve('test-results');await mkdir(output,{recursive:true});
const profile=await mkdtemp(path.join(output,'arena-cdp-'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),pending=new Map(),errors=[];
let browser,socket,serial=0;
function send(method,params={}){return new Promise((resolve,reject)=>{
  const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timed out: ${method}`));},15000);
  pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
  socket.send(JSON.stringify({id,method,params}));
});}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
async function waitFor(expression){for(let attempt=0;attempt<100;attempt++){if(await evaluate(expression))return;await pause(80);}throw Error(`Timed out: ${expression}`);}
async function capture(name){const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,`${name}.png`),Buffer.from(result.data,'base64'));}

try{
  browser=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  const endpoint=await new Promise((resolve,reject)=>{let stderr='';const timer=setTimeout(()=>reject(Error(`Browser did not start: ${stderr.slice(-500)}`)),15000);
    browser.once('error',error=>{clearTimeout(timer);reject(error);});browser.stderr.on('data',data=>{stderr+=data;const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
  });
  const target=await(await fetch(`http://${new URL(endpoint).host}/json/new?about:blank`,{method:'PUT'})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=({data})=>{const message=JSON.parse(data);if(message.id){const request=pending.get(message.id);pending.delete(message.id);if(request)message.error?request.reject(Error(message.error.message)):request.resolve(message.result);}
    else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);};
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base});await waitFor(`document.querySelector('#connection')?.textContent.includes('Solo')`);
  const fixture=await evaluate(`(async()=>{const game=await import('./src/game.js');const state=game.createGame();const p=game.addPlayer(state,{id:'you',name:'You'});game.applyAction(state,'you',{type:'start'});p.generators={mote:1};return state;})()`);
  const {identifier}=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('refract-idlers:solo:v1',${JSON.stringify(JSON.stringify(fixture))});`});
  await send('Page.reload',{ignoreCache:true});await pause(300);await waitFor(`document.querySelector('#connection')?.textContent.includes('Solo')`);
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier});
  await evaluate(`import('./src/arena.js').then(({OrbitArena})=>{const original=OrbitArena.prototype.render;OrbitArena.prototype.render=function(...args){globalThis.__arena=this;globalThis.__arenaArgs=args;return original.apply(this,args);};})`);
  await waitFor(`Boolean(globalThis.__arena)`);
  await waitFor(`globalThis.__arena.shots.some(shot=>shot.geometry?.progress>.2&&!shot.reached)`);
  const travelling=await evaluate(`(()=>{const a=__arena,shot=a.shots.find(shot=>shot.geometry?.progress>.2&&!shot.reached);if(!shot)return null;const point=shot.geometry.point,data=a.effectsContext.getImageData(Math.round(point.x)-2,Math.round(point.y)-2,5,5).data;return {progress:shot.geometry.progress,alpha:Array.from(data).filter((value,index)=>index%4===3&&value>0).length};})()`);
  assert.ok(travelling?.alpha>0,`The moving projectile is drawn above the board: ${JSON.stringify(travelling)}`);
  await waitFor(`globalThis.__arena.completedShots.length>0`);
  const normal=await evaluate(`(()=>{const a=__arena,canvas=a.effects.getBoundingClientRect(),core=document.querySelector('#core img').getBoundingClientRect(),target=a.completedShots.at(-1).target,data=a.effectsContext.getImageData(Math.round(target.x)-3,Math.round(target.y)-3,7,7).data;return {completed:a.completedShots.length,target,actual:{x:(core.x+core.width/2-canvas.x)/canvas.width*a.width,y:(core.y+core.height/2-canvas.y)/canvas.height*a.height},z:getComputedStyle(a.effects).zIndex,alpha:Array.from(data).filter((value,index)=>index%4===3&&value>0).length};})()`);
  assert.ok(Math.hypot(normal.target.x-normal.actual.x,normal.target.y-normal.actual.y)<1.5,`Projectile reaches visible core center: ${JSON.stringify(normal)}`);
  assert.ok(normal.alpha>0,'Normal-round arrival draws actual impact pixels over the center of the orb');
  await capture('arena-active-shot-impact');
  console.log('PASS normal automatic shots reach the visible core center above its image',JSON.stringify(normal));

  // Use the real game canvas and native core, controlling only presentation time.
  // A phase transition must complete the existing projectile, including its pixels.
  const result=await evaluate(`(()=>{const a=__arena,original=a.render.bind(a);a.render=()=>{};a.reducedMotion=false;
    const state=structuredClone(__arenaArgs[0]);state.phase='round';state.remaining=1;
    let now=performance.now();original(state,'you',now);a.completedShots=[];a.shots=[{id:'mote',index:0,size:18,started:a.instrumentTime-.2,duration:.38,reached:false}];
    state.phase='intermission';state.remaining=0;
    for(let i=0;i<9;i++){now+=40;original(state,'you',now);}
    const center=a.getFleetDiagnostics().center,c=a.effectsContext;
    const data=c.getImageData(Math.round(center.x)-3,Math.round(center.y)-3,7,7).data;
    const alpha=Array.from(data).filter((value,index)=>index%4===3&&value>0).length;
    globalThis.__arrivalContinue=()=>{for(let i=0;i<8;i++){now+=40;original(state,'you',now);}return {pending:a.shots.length,alpha:Array.from(c.getImageData(Math.round(center.x)-3,Math.round(center.y)-3,7,7).data).filter((value,index)=>index%4===3&&value>0).length};};
    return {pending:a.shots.length,arrived:a.completedShots.at(-1)?.reached,center,alpha};})()`);
  assert.ok(result.alpha>0,`In-flight shot reaches the orb and leaves a visible impact after round-end: ${JSON.stringify(result)}`);
  await capture('arena-shot-impact');
  console.log('PASS round-end projectiles finish with visible impact pixels',JSON.stringify(result));
  const cleanup=await evaluate(`__arrivalContinue()`);assert.deepEqual(cleanup,{pending:0,alpha:0},'Impact clears after its hold without leaving stuck projectiles');
  assert.deepEqual(errors,[],'No browser exceptions');
}catch(error){if(socket?.readyState===WebSocket.OPEN)await capture('arena-shot-failure').catch(()=>{});throw error;}
finally{for(const item of pending.values())item.reject(Error('Browser test ended'));pending.clear();socket?.close();browser?.kill();await pause(300);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:150}).catch(()=>{});}
