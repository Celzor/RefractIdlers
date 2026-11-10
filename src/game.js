/** Host-authoritative orbital economy. All elapsed time is in seconds. */
import { SKILLS, SKILL_BRANCHES, RESEARCH_TOTAL_RANKS, RESEARCH_TOTAL_COST, MAX_SKILL_POINTS_PER_ROUND } from './skills.js';
export { SKILLS, SKILL_BRANCHES, RESEARCH_TOTAL_RANKS, RESEARCH_TOTAL_COST, MAX_SKILL_POINTS_PER_ROUND };
export const MAX_PLAYERS = 8, ROUND_DURATION = 60, PRESTIGE_THRESHOLD = 2500, ECONOMY_LIMIT = 1e150, COMBAT_VERSION = 2;
const LIMIT = ECONOMY_LIMIT, COUNT_LIMIT = Number.MAX_SAFE_INTEGER, MAX_LEVEL = 1e6;
const BASE_HP = 2000, BASE_REWARD = 300, HP_GROWTH = 1.18, REWARD_GROWTH = 1.14;
const COLORS = ['#9a8cff','#58ddca','#ffb86c','#f080b8','#7eb8ff','#d7e889','#bc9cf7','#f5d589'];
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const bounded = (v,max=LIMIT) => Number.isFinite(v) && v >= 0 && v <= max;
const integer = (v,max=COUNT_LIMIT) => Number.isSafeInteger(v) && bounded(v,max);
const text = (v,max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const cap = (v) => Math.min(LIMIT,Math.max(0,v));
const count = (v) => Math.min(COUNT_LIMIT,Math.max(0,Math.floor(v)));
const fail = (reason) => ({ok:false,reason});
const rank = (p,id) => p.skills[id] || 0;
const boss = (level) => level % 10 === 0;
const power = (base,growth,exponent) => Math.min(LIMIT,base * growth ** exponent);
const orbHp = (level,scale=1) => power(BASE_HP*scale,HP_GROWTH,level-1);
const baseReward = (level,scale=1) => power(BASE_REWARD*(boss(level)?5:1)*scale,REWARD_GROWTH,level-1);
const freshOrb = () => ({level:1,hp:BASE_HP});
export const GENERATORS = Object.freeze([
  {id:'mote',name:'Auto clicker',kind:'auto',description:'Strikes the orb automatically every two seconds. Scales with your damage.',baseCost:25,baseRate:0,autoRate:0.5,icon:'✧'},
  {id:'satellite',name:'Refract orb farm',kind:'passive',description:'Grow luminous Refract orbs for 6 base LRC per second.',baseCost:140,baseRate:6,icon:'◎'},
  {id:'prism',name:'Light array',kind:'passive',description:'Harvest a broad spectrum of light for 32 base LRC per second.',baseCost:800,baseRate:32,icon:'◈'},
  {id:'star',name:'Refractometer',kind:'multiplier',description:'+10% to your damage and all LRC production per unit.',baseCost:4500,baseRate:0,multiplier:0.1,icon:'◇'},
  {id:'nova',name:'Pocket star',kind:'passive',description:'Your own miniature sun produces 300 base LRC per second.',baseCost:12000,baseRate:300,icon:'☀'},
]);
const skillById = new Map(SKILLS.map(s=>[s.id,s]));
const generatorById = new Map(GENERATORS.map(g=>[g.id,g]));

export function createGame({seed=0x5eed,mode='scoreboard'}={}) {
  return {version:1,combatVersion:COMBAT_VERSION,mode:mode==='coop'?'coop':'scoreboard',sharedLrc:0,sharedOrb:freshOrb(),phase:'lobby',round:0,
    roundDuration:60,remaining:60,now:0,players:[],teamLrc:0,goal:500,goalReached:false,lastRound:null,rng:seed>>>0};
}
function safeAvatar(value) {
  if(typeof value!=='string'||value.length>2048)return null;
  try{return ['https:','http:'].includes(new URL(value).protocol)?value:null;}catch{return null;}
}
export function getCoopDifficulty(state) {
  const crewSize=state?.mode==='coop'?Math.max(1,state.players.filter(p=>!p.bot).length):1;
  return {crewSize,crewScale:1+0.85*(crewSize-1)};
}
function resizeSharedOrb(state,previousMax) {
  const nextMax=orbHp(state.sharedOrb.level,getCoopDifficulty(state).crewScale);
  if(nextMax===previousMax)return;
  state.sharedOrb.hp=Math.max(Number.MIN_VALUE,Math.min(nextMax,state.sharedOrb.hp/previousMax*nextMax));
}
function createPlayer(state,person) {
  return {id:person.id,name:String(person.name||'Pilot').slice(0,40),avatarUrl:safeAvatar(person.avatarUrl),color:COLORS[state.players.length%8],bot:Boolean(person.bot),
    lrc:0,runLrc:0,lifetimeLrc:0,roundLrc:0,clicks:0,roundClicks:0,autoClicks:0,autoClock:0,skillPoints:0,skills:{},generators:{},
    prestigePoints:0,totalPrestige:0,prestigeCount:0,orb:freshOrb(),highestOrb:state.mode==='coop'?state.sharedOrb.level:1,orbsDestroyed:0,
    completedRounds:0,combo:0,comboAt:0,ready:false,clickTokens:3,botClock:0};
}
export function addPlayer(state,person) {
  if(!record(person)||!text(person.id,100))return null;
  const existing=state.players.find(p=>p.id===person.id);if(existing)return existing;
  if(state.players.length>=8)return null;
  const previousMax=orbHp(state.sharedOrb.level,getCoopDifficulty(state).crewScale),p=createPlayer(state,person);
  state.players.push(p);resizeSharedOrb(state,previousMax);return p;
}
export function reconcilePlayers(state,people) {
  if(!Array.isArray(people))return;
  const unique=[];
  for(const person of people){if(record(person)&&text(person.id,100)&&!unique.some(p=>p.id===person.id))unique.push(person);if(unique.length===8)break;}
  const previousMax=orbHp(state.sharedOrb.level,getCoopDifficulty(state).crewScale),previous=new Map(state.players.map(p=>[p.id,p]));state.players=[];
  for(const person of unique){const p=previous.get(person.id)||createPlayer(state,person);state.players.push(p);
    p.name=String(person.name||'Pilot').slice(0,40);p.avatarUrl=safeAvatar(person.avatarUrl);p.bot=Boolean(person.bot);
    if(state.mode==='coop')p.highestOrb=Math.max(p.highestOrb,state.sharedOrb.level);}
  resizeSharedOrb(state,previousMax);if(state.phase==='intermission')maybeStartNextRound(state);
}
function effectsOf(p) {
  const e={};for(const [id,owned]of Object.entries(p.skills)){const s=skillById.get(id);if(!s||!owned)continue;
    for(const [effect,amount]of Object.entries(s.effects))e[effect]=(e[effect]||0)+amount*owned;}return e;
}
export function getStats(p,state) {
  const e=effectsOf(p),crew=state?.mode==='coop'?state.players:[p];let frequency=0,crewAuto=0;
  for(const member of crew){const c=member===p?e:effectsOf(member);frequency+=(c.frequency||0)+(c.crewStrength||0)*crew.length;crewAuto+=(c.crewAutomation||0)*crew.length;}
  const machines=Object.values(p.generators).reduce((a,b)=>a+b,0),generatorMultiplier=1+(p.generators.star||0)*0.1;
  const multiplier=cap((1+p.totalPrestige*0.1)*(1+frequency)*(1+(e.personalPct||0))*generatorMultiplier);
  const surge=Boolean(state?.phase==='round'&&state.remaining<=10&&state.remaining>0);
  const comboCap=Math.floor(10+(e.comboCap||0)),combo=!state||state.now-p.comboAt<=2?Math.min(comboCap,p.combo):0;
  const clickDamage=cap((2+(e.damageFlat||0))*(1+(e.damagePct||0))*multiplier*(1+combo*(e.comboPower||0))*(surge?2:1));
  const clickIncome=cap((0.25+(e.mintFlat||0))*(1+(e.mintPct||0))*(1+machines*(e.mintSynergy||0))*multiplier*(surge?1+(e.surgeMintPct||0):1));
  const farms=(p.generators.satellite||0)*6*(1+(e.farmPct||0))*(1+(p.generators.prism||0)*(e.farmSynergy||0));
  const arrays=(p.generators.prism||0)*32*(1+(e.arrayPct||0)),stars=(p.generators.nova||0)*300*(1+(e.starPct||0));
  const machineRate=(farms+arrays+stars)*(1+(e.generatorPct||0))*(1+machines*(e.generatorSynergy||0));
  const passiveRate=cap((1+(e.passiveFlat||0)+machineRate)*(1+(e.passivePct||0))*multiplier);
  const autoRate=((p.generators.mote||0)*0.5+(e.autoFlat||0))*(1+(e.autoPct||0)+crewAuto);
  const autoDamage=cap(clickDamage*(1+(e.autoDamagePct||0))),autoMint=cap(clickIncome*(e.autoMint||0));
  return {clickPower:clickDamage,clickDamage,clickIncome,passiveRate,idleRate:cap(passiveRate+autoRate*autoMint),autoRate,autoDamage,autoDps:cap(autoRate*autoDamage),autoMint,
    generatorMultiplier,multiplier,surge,combo,comboCap,criticalChance:Math.min(0.8,0.05+(e.critChance||0)),criticalMultiplier:3+(e.critMultiplier||0),
    extraHitChance:Math.min(0.9,e.extraHitChance||0),criticalMintMultiplier:1+(e.criticalMintPct||0),bossDamageMultiplier:1+(e.bossDamagePct||0),
    bossDropMultiplier:1+(e.bossDropPct||0),dropMultiplier:cap(multiplier*(1+(e.dropPct||0))*(1+Math.log2(p.highestOrb+1)*(e.orbScaling||0))),
    dropFlat:e.dropFlat||0,autoDropMultiplier:1+(e.autoDropPct||0),
    roundSkillBonus:Math.min(MAX_SKILL_POINTS_PER_ROUND-3,Math.floor((e.insight||0)+1e-9)+(rank(p,'unity')>0?1:0))};
}
export function getBalance(p,state){return state?.mode==='coop'?state.sharedLrc:p?.lrc??0;}
export function getTeamStats(state){return state.players.reduce((total,p)=>{const s=getStats(p,state);return {clickPower:cap(total.clickPower+s.clickPower),idleRate:cap(total.idleRate+s.idleRate),autoDps:cap(total.autoDps+s.autoDps)};},{clickPower:0,idleRate:0,autoDps:0});}
const personalTarget=(round)=>cap(Math.round(500*(1+0.12*Math.max(0,round-1))**2));
export function getRoundTarget(state){return state.mode==='coop'?state.goal:personalTarget(state.round);}
export function generatorCost(p,id){const g=generatorById.get(id);return g?Math.ceil(g.baseCost*1.17**(p.generators[id]||0)):Infinity;}
export function generatorQuote(p,id,quantity=1,state){
  const g=generatorById.get(id);if(!g||![1,10,'max'].includes(quantity))return {quantity:0,cost:0};
  const owned=p.generators[id]||0,wanted=quantity==='max'?1000-owned:quantity;
  if(wanted<=0||owned+wanted>1000)return {quantity:0,cost:0};
  const budget=getBalance(p,state);let cost=0,bought=0;
  for(let i=0;i<wanted;i++){const next=Math.ceil(g.baseCost*1.17**(owned+i));if(quantity==='max'&&cost+next>budget)break;cost+=next;bought++;}
  return {quantity:bought,cost};
}
export function skillCost(p,id){const s=skillById.get(id);return s?Math.ceil(s.cost*s.costGrowth**rank(p,id)):Infinity;}
export function skillAvailability(p,id,state){
  const s=skillById.get(id);if(!p||!s)return {available:false,reason:'Unknown research.'};
  if(rank(p,id)>=s.maxRank)return {available:false,reason:'Fully researched.'};
  for(const required of s.requires){const needed=s.requiredRanks[required]||1;if(rank(p,required)<needed)return {available:false,reason:`Requires ${skillById.get(required)?.name||required} rank ${needed}.`};}
  const g=s.gates;
  if(p.highestOrb<g.orb)return {available:false,reason:`Reach orb ${g.orb} (best: ${p.highestOrb}).`};
  if(p.completedRounds<g.rounds)return {available:false,reason:`Complete ${g.rounds} rounds (${p.completedRounds} completed).`};
  if(p.prestigeCount<g.prestiges)return {available:false,reason:`Prestige ${g.prestiges} times (${p.prestigeCount} completed).`};
  if(p.totalPrestige<g.prestige)return {available:false,reason:`Earn ${g.prestige} lifetime prestige points.`};
  if(state?.phase!=='intermission')return {available:false,reason:'Research opens between rounds.'};
  if((s.currency==='prestige'?p.prestigePoints:p.skillPoints)<skillCost(p,id))return {available:false,reason:`Requires ${skillCost(p,id)} ${s.currency==='prestige'?'PP':'SP'}.`};
  return {available:true,reason:'Ready to research.'};
}
const prestigeThreshold=(points)=>PRESTIGE_THRESHOLD*(2**points-1);
export function prestigeGain(p){
  let points=Math.floor(Math.log1p(p.runLrc/PRESTIGE_THRESHOLD)/Math.LN2);
  // Correct logarithm round-off against the actual representable thresholds.
  if(p.runLrc>=prestigeThreshold(points+1))points++;
  else if(points>0&&p.runLrc<prestigeThreshold(points))points--;
  return Math.min(COUNT_LIMIT-p.totalPrestige,Math.max(0,points));
}
export function prestigeNextThreshold(p){return prestigeThreshold(prestigeGain(p)+1);}
function random(state){state.rng=(Math.imul(state.rng,1664525)+1013904223)>>>0;return state.rng/0x100000000;}
function earn(state,p,amount){
  amount=Math.min(cap(amount),LIMIT-p.lrc,LIMIT-p.runLrc,LIMIT-p.lifetimeLrc,LIMIT-p.roundLrc);
  p.lrc+=amount;p.runLrc+=amount;p.lifetimeLrc+=amount;p.roundLrc+=amount;state.teamLrc=cap(state.teamLrc+amount);
  if(state.mode==='coop')state.sharedLrc=cap(state.sharedLrc+amount);state.goalReached=state.teamLrc>=state.goal;return amount;
}
const orbState=(p,state)=>state.mode==='coop'?state.sharedOrb:p.orb;
function rewardAt(level,s,automatic=false,scale=1){return cap((baseReward(level,scale)*(boss(level)?s.bossDropMultiplier:1)+s.dropFlat*scale)*s.dropMultiplier*(automatic?s.autoDropMultiplier:1));}
export function getOrb(p,state){const orb=state.mode==='coop'?state.sharedOrb:p?.orb||freshOrb(),s=p?getStats(p,state):null;
  const {crewSize,crewScale}=getCoopDifficulty(state),maxHp=orbHp(orb.level,crewScale),damageFraction=Math.max(0,Math.min(1,1-orb.hp/maxHp));
  const fractureStage=[0.1,0.35,0.65].filter(threshold=>damageFraction+1e-12>=threshold).length;
  return {...orb,maxHp,unscaledMaxHp:orbHp(orb.level),crewSize,crewScale,damageFraction,fractureStage,boss:boss(orb.level),resistance:boss(orb.level)?0.5:0,reward:s?rewardAt(orb.level,s,false,crewScale):baseReward(orb.level,crewScale)};}
// Analytical geometric sums keep enormous attacks logarithmic in orb count.
function geometricSum(base,exponent,length,step,growth){
  if(length<=0)return 0;const log=Math.log(growth),last=(Math.log(LIMIT)-Math.log(base))/log;
  const normal=Math.max(0,Math.min(length,Math.floor((last-exponent)/step)+1));
  const initial=normal?Math.exp(Math.log(base)+exponent*log):0;
  return (normal?initial*Math.expm1(normal*step*log)/Math.expm1(step*log):0)+(length-normal)*LIMIT;
}
function bossSeries(start,length,base,growth){const first=Math.ceil(start/10)*10,n=Math.max(0,Math.floor((start+length-1-first)/10)+1);return geometricSum(base,first-1,n,10,growth);}
function hpCost(start,length,s,scale){const bosses=bossSeries(start,length,BASE_HP*scale,HP_GROWTH);return Math.max(0,geometricSum(BASE_HP*scale,start-1,length,1,HP_GROWTH)-bosses+bosses*2/s.bossDamageMultiplier);}
function rewardSum(start,length,s,automatic,scale){const raw=geometricSum(BASE_REWARD*scale,start-1,length,1,REWARD_GROWTH)-bossSeries(start,length,BASE_REWARD*scale,REWARD_GROWTH)+bossSeries(start,length,BASE_REWARD*5*scale,REWARD_GROWTH)*s.bossDropMultiplier;
  return cap((Math.max(0,raw)+length*s.dropFlat*scale)*s.dropMultiplier*(automatic?s.autoDropMultiplier:1));}
function damageOrb(state,p,damage,s,automatic=false){
  const orb=orbState(p,state),scale=getCoopDifficulty(state).crewScale;let budget=cap(damage),kills=0,reward=0;
  const factor=boss(orb.level)?s.bossDamageMultiplier/2:1,firstCost=orb.hp/factor;
  if(budget<firstCost){orb.hp=Math.max(Number.MIN_VALUE,orb.hp-budget*factor);return {kills,amount:0};}
  budget=Math.max(0,budget-firstCost);reward=rewardAt(orb.level,s,automatic,scale);kills=1;orb.level=Math.min(MAX_LEVEL,orb.level+1);
  const maxFull=MAX_LEVEL-orb.level;let low=0,high=Math.min(maxFull,1);
  while(high<maxFull&&hpCost(orb.level,high,s,scale)<=budget)high=Math.min(maxFull,high*2);
  while(low<high){const middle=Math.ceil((low+high)/2);if(hpCost(orb.level,middle,s,scale)<=budget)low=middle;else high=middle-1;}
  if(low){budget=Math.max(0,budget-hpCost(orb.level,low,s,scale));reward=cap(reward+rewardSum(orb.level,low,s,automatic,scale));orb.level+=low;kills+=low;}
  const nextFactor=boss(orb.level)?s.bossDamageMultiplier/2:1,nextHp=orbHp(orb.level,scale);
  if(orb.level===MAX_LEVEL&&budget*nextFactor>=nextHp){const extra=Math.floor(budget/(nextHp/nextFactor));reward=cap(reward+extra*rewardAt(orb.level,s,automatic,scale));kills+=extra;budget=Math.max(0,budget-extra*nextHp/nextFactor);}
  orb.hp=Math.max(Number.MIN_VALUE,Math.min(nextHp,nextHp-budget*nextFactor));p.orbsDestroyed=count(p.orbsDestroyed+kills);
  if(state.mode==='coop')for(const member of state.players)member.highestOrb=Math.max(member.highestOrb,orb.level);else p.highestOrb=Math.max(p.highestOrb,orb.level);
  return {kills,amount:earn(state,p,reward)};
}
function startRound(state){state.phase='round';state.round++;state.remaining=60;state.teamLrc=0;state.goal=cap(personalTarget(state.round)*Math.max(1,state.players.length));state.goalReached=false;
  for(const p of state.players){p.roundLrc=0;p.roundClicks=0;p.ready=false;p.clickTokens=3;p.botClock=0;p.combo=0;}}
function maybeStartNextRound(state){const humans=state.players.filter(p=>!p.bot);if(humans.length&&humans.every(p=>p.ready))startRound(state);}
function finishRound(state){
  state.phase='intermission';state.remaining=0;const skillPoints=2+(state.mode==='coop'&&state.goalReached?1:0);
  const awards=new Map(state.players.map(p=>[p.id,Math.min(MAX_SKILL_POINTS_PER_ROUND,skillPoints+(state.mode==='scoreboard'&&p.roundLrc>=getRoundTarget(state)?1:0)+getStats(p,state).roundSkillBonus)]));
  state.lastRound={round:state.round,teamLrc:state.teamLrc,goal:state.goal,goalReached:state.goalReached,skillPoints,players:state.players.map(p=>({id:p.id,lrc:p.roundLrc,clicks:p.roundClicks,skillPoints:awards.get(p.id)}))};
  for(const p of state.players){p.skillPoints=count(p.skillPoints+awards.get(p.id));p.completedRounds=count(p.completedRounds+1);p.ready=false;
    if(p.bot){const choices=SKILLS.filter(s=>s.currency==='skill'&&skillAvailability(p,s.id,state).available);if(choices.length)applyAction(state,p.id,{type:'buySkill',id:choices[Math.floor(random(state)*choices.length)].id});p.ready=true;}}
}
export function applyAction(state,playerId,action){
  const p=state.players.find(p=>p.id===playerId);if(!p)return fail('This pilot is not in the activity.');if(!record(action)||typeof action.type!=='string')return fail('Invalid action.');
  if(Object.hasOwn(action,'round')&&(!integer(action.round,1e6)||action.round!==state.round))return fail('That action belongs to an earlier round. Resync and try again.');
  if(action.type==='setMode'){if(state.phase!=='lobby')return fail('Choose a mode before the first round starts.');if(state.players[0]?.id!==playerId)return fail('Only the host can choose the session mode.');if(!['scoreboard','coop'].includes(action.mode))return fail('Unknown game mode.');const previousMax=orbHp(state.sharedOrb.level,getCoopDifficulty(state).crewScale);state.mode=action.mode;resizeSharedOrb(state,previousMax);return {ok:true};}
  if(action.type==='start'){if(state.phase!=='lobby')return fail('The run has already started.');if(state.players[0]?.id!==playerId)return fail('Only the host can start the run.');startRound(state);return {ok:true};}
  if(action.type==='click'){
    if(state.phase!=='round')return fail('Harvesting resumes next round.');if(p.clickTokens<1)return fail('The core is recharging.');p.clickTokens--;
    const before=getStats(p,state);p.combo=state.now-p.comboAt<=2?Math.min(before.comboCap,p.combo+1):1;p.comboAt=state.now;
    const s=getStats(p,state),critical=random(state)<s.criticalChance,hits=1+(s.extraHitChance>0&&random(state)<s.extraHitChance?1:0);
    const damage=cap(s.clickDamage*hits*(critical?s.criticalMultiplier:1)),result=damageOrb(state,p,damage,s);
    const minted=earn(state,p,s.clickIncome*(critical?s.criticalMintMultiplier:1));p.clicks=count(p.clicks+1);p.roundClicks=count(p.roundClicks+1);
    return {ok:true,damage,amount:cap(result.amount+minted),kills:result.kills,critical};}
  if(action.type==='ready'){if(state.phase!=='intermission')return fail('Ready up between rounds.');p.ready=!p.ready;maybeStartNextRound(state);return {ok:true};}
  if(action.type==='buyGenerator'){
    if(!['round','intermission'].includes(state.phase))return fail('Start a round to build your orbit.');if(!generatorById.has(action.id))return fail('Unknown generator.');
    const quantity=action.quantity===undefined?1:action.quantity;if(![1,10,'max'].includes(quantity))return fail('Choose Buy 1, Buy 10, or Buy Max.');
    const quote=generatorQuote(p,action.id,quantity,state);if(!quote.quantity)return fail('No affordable capacity remains for this purchase.');if(getBalance(p,state)<quote.cost)return fail('Collect more LRCs to buy that whole bundle.');
    if(state.mode==='coop')state.sharedLrc-=quote.cost;else p.lrc-=quote.cost;p.generators[action.id]=(p.generators[action.id]||0)+quote.quantity;return {ok:true,...quote};}
  if(action.type==='buySkill'){
    const availability=skillAvailability(p,action.id,state);if(!availability.available)return fail(availability.reason);const s=skillById.get(action.id),cost=skillCost(p,action.id);
    if(s.currency==='prestige')p.prestigePoints-=cost;else p.skillPoints-=cost;p.skills[s.id]=rank(p,s.id)+1;p.ready=false;return {ok:true};}
  if(action.type==='prestige'){
    if(state.phase!=='intermission')return fail('Refract your core between rounds.');const gain=prestigeGain(p);if(gain<1)return fail('Earn 2,500 LRCs in your own run to prestige.');
    p.prestigePoints=count(p.prestigePoints+gain);p.totalPrestige=count(p.totalPrestige+gain);p.prestigeCount=count(p.prestigeCount+1);
    p.lrc=0;p.runLrc=0;p.generators={};p.orb=freshOrb();p.autoClock=0;p.combo=0;p.ready=false;return {ok:true,amount:gain};}
  return fail('Unknown action.');
}
export function advance(state,dtSeconds){
  if(!Number.isFinite(dtSeconds)||dtSeconds<=0||state.phase!=='round')return;let pending=Math.min(dtSeconds,state.remaining);
  while(pending>0&&state.phase==='round'){
    for(const p of state.players)if(p.combo&&state.now-p.comboAt>=2)p.combo=0;
    let elapsed=Math.min(pending,state.remaining>10?state.remaining-10:state.remaining);
    for(const p of state.players)if(p.combo)elapsed=Math.min(elapsed,Math.max(0,p.comboAt+2-state.now));
    for(const p of state.players){p.clickTokens=Math.min(3,p.clickTokens+elapsed*15);const s=getStats(p,state);earn(state,p,s.passiveRate*elapsed);
      p.autoClock+=s.autoRate*elapsed;const pulses=Math.floor(p.autoClock+1e-9);p.autoClock=Math.max(0,p.autoClock-pulses);
      if(pulses){damageOrb(state,p,cap(pulses*s.autoDamage),s,true);earn(state,p,cap(pulses*s.autoMint));p.autoClicks=count(p.autoClicks+pulses);}
      if(p.bot){p.botClock+=elapsed;const clicks=Math.min(3,Math.floor(p.botClock/0.8));p.botClock%=0.8;for(let i=0;i<clicks;i++)applyAction(state,p.id,{type:'click'});if(getBalance(p,state)>=generatorCost(p,'mote'))applyAction(state,p.id,{type:'buyGenerator',id:'mote'});}}
    state.now=cap(state.now+elapsed);state.remaining=Math.max(0,state.remaining-elapsed);if(state.remaining<1e-8)finishRound(state);pending=Math.max(0,pending-elapsed);}
}
function validOrb(orb,scale=1){return record(orb)&&integer(orb.level,MAX_LEVEL)&&orb.level>=1&&bounded(orb.hp,orbHp(orb.level,scale)*(1+1e-12))&&orb.hp>0;}
function validPlayer(p){
  if(!record(p)||!text(p.id,100)||!text(p.name,40)||!/^#[\da-f]{6}$/i.test(p.color)||typeof p.bot!=='boolean'||typeof p.ready!=='boolean'
    ||!(p.avatarUrl===null||safeAvatar(p.avatarUrl)===p.avatarUrl)||!record(p.skills)||!record(p.generators)||!validOrb(p.orb))return false;
  for(const key of ['lrc','runLrc','lifetimeLrc','roundLrc','comboAt'])if(!bounded(p[key]))return false;
  for(const key of ['clicks','roundClicks','autoClicks','skillPoints','prestigePoints','totalPrestige','prestigeCount','orbsDestroyed','completedRounds','combo'])if(!integer(p[key]))return false;
  if(!integer(p.highestOrb,MAX_LEVEL)||p.highestOrb<p.orb.level||!bounded(p.clickTokens,3)||!bounded(p.botClock,0.8)||!bounded(p.autoClock,1))return false;
  if(p.lrc>p.runLrc*(1+1e-12)||p.runLrc>p.lifetimeLrc*(1+1e-12)||p.prestigePoints>p.totalPrestige)return false;
  // Older earned ranks are grandfathered; future purchases enforce all new gates.
  for(const [id,value]of Object.entries(p.skills))if(!skillById.has(id)||!integer(value,skillById.get(id).maxRank))return false;
  for(const [id,value]of Object.entries(p.generators))if(!generatorById.has(id)||!integer(value,1000))return false;return true;
}
export function validateState(state){
  if(!record(state)||state.version!==1||state.combatVersion!==COMBAT_VERSION||!Array.isArray(state.players)||!state.players.every(record)||!['lobby','round','intermission'].includes(state.phase)||!['scoreboard','coop'].includes(state.mode)||!bounded(state.sharedLrc)||!validOrb(state.sharedOrb,getCoopDifficulty(state).crewScale)
    ||(state.mode==='scoreboard'&&state.sharedLrc!==0)||!integer(state.round,1e6)||state.roundDuration!==60||!bounded(state.remaining,60)||!bounded(state.now)||!bounded(state.teamLrc)||!bounded(state.goal)||state.goal<=0
    ||typeof state.goalReached!=='boolean'||state.goalReached!==(state.teamLrc>=state.goal)||!integer(state.rng,0xffffffff)||!Array.isArray(state.players)||state.players.length>8
    ||!state.players.every(validPlayer)||new Set(state.players.map(p=>p.id)).size!==state.players.length)return false;
  if(state.phase==='lobby'&&state.round!==0)return false;if(state.phase!=='lobby'&&state.round<1)return false;
  if(state.phase==='intermission'&&state.remaining!==0)return false;if(state.phase==='round'&&state.remaining<=0)return false;
  if(state.lastRound!==null){const r=state.lastRound;if(!record(r)||!integer(r.round,state.round)||r.round<1||!bounded(r.teamLrc)||!bounded(r.goal)||r.goal<=0||typeof r.goalReached!=='boolean'||r.goalReached!==(r.teamLrc>=r.goal)
    ||![2,3].includes(r.skillPoints)||!Array.isArray(r.players)||r.players.length>8||!r.players.every(p=>record(p)&&text(p.id,100)&&bounded(p.lrc)&&integer(p.clicks)&&integer(p.skillPoints,MAX_SKILL_POINTS_PER_ROUND)&&p.skillPoints>=2)
    ||new Set(r.players.map(p=>p.id)).size!==r.players.length)return false;}
  try{return new TextEncoder().encode(JSON.stringify(state)).length<15000;}catch{return false;}
}
export function migrateState(saved){
  if(!record(saved)||saved.version!==1||Object.hasOwn(saved,'combatVersion')&&![1,COMBAT_VERSION].includes(saved.combatVersion))return null;try{const next=structuredClone(saved),legacy=next.combatVersion!==COMBAT_VERSION;
    const defaultOrb=()=>legacy?{level:1,hp:12}:freshOrb();
    if(!Object.hasOwn(next,'mode'))next.mode='scoreboard';if(!Object.hasOwn(next,'sharedLrc'))next.sharedLrc=0;
    if(!Object.hasOwn(next,'sharedOrb'))next.sharedOrb=!legacy&&Array.isArray(next.players)&&next.players.every(record)?{level:1,hp:orbHp(1,getCoopDifficulty(next).crewScale)}:defaultOrb();
    if(Array.isArray(next.players))for(const p of next.players)if(record(p)){const defaults={autoClicks:0,autoClock:0,orb:defaultOrb(),highestOrb:1,orbsDestroyed:0,completedRounds:Math.max(0,(next.round||0)-(next.phase==='round'?1:0)),combo:0,comboAt:0};
      for(const [key,value]of Object.entries(defaults))if(!Object.hasOwn(p,key))p[key]=value;}
    if(legacy){
      const convert=(orb,scale=1)=>{if(!record(orb)||!integer(orb.level,MAX_LEVEL)||orb.level<1)return false;
        const oldMax=power(12,HP_GROWTH,orb.level-1);if(!bounded(orb.hp,oldMax*(1+1e-12))||orb.hp<=0)return false;
        orb.hp=Math.max(Number.MIN_VALUE,Math.min(1,orb.hp/oldMax)*orbHp(orb.level,scale));return true;};
      if(!Array.isArray(next.players)||!next.players.every(record)||!convert(next.sharedOrb,getCoopDifficulty(next).crewScale)||!next.players.every(p=>convert(p.orb)))return null;
      next.combatVersion=COMBAT_VERSION;
    }
    if(record(next.lastRound)&&Array.isArray(next.lastRound.players))for(const p of next.lastRound.players)if(record(p)&&!Object.hasOwn(p,'skillPoints'))p.skillPoints=next.lastRound.skillPoints;
    return validateState(next)?next:null;}catch{return null;}
}
