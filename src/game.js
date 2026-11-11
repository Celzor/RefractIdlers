/** Host-authoritative orbital economy. All elapsed time is in seconds. */
import { SKILLS, SKILL_BRANCHES, RESEARCH_TOTAL_RANKS, RESEARCH_TOTAL_COST, MAX_SKILL_POINTS_PER_ROUND } from './skills.js';
import { createFarm, getFarmUnlocked, getFarmStats, advanceFarm, resetFarm, applyFarmAction, FARM_ACTIONS, validateFarm, packFarm, unpackFarm, migrateFarm } from './farm.js';
import { CAMPAIGN_VERSION, BOSS_DURATION, SECRET_HP, SECRET_DURATION, FINAL_LEVEL, FINAL_HP, FINAL_MIN_SECONDS, VICTORY_PRESTIGE_REWARD, getCampaignLocation, getSystemHpMultiplier, resonanceFraction, isJumpPoint, fuelTarget } from './campaign.js';
export { SKILLS, SKILL_BRANCHES, RESEARCH_TOTAL_RANKS, RESEARCH_TOTAL_COST, MAX_SKILL_POINTS_PER_ROUND };
export const MAX_PLAYERS = 8, ROUND_DURATION = 60, PRESTIGE_THRESHOLD = 2500, ECONOMY_LIMIT = 1e150, COMBAT_VERSION = 2;
const LIMIT = ECONOMY_LIMIT, COUNT_LIMIT = Number.MAX_SAFE_INTEGER, MAX_LEVEL = 1e6;
const BASE_HP = 2000, BASE_REWARD = 300, HP_GROWTH = 1.18, REWARD_GROWTH = 1.14;
const ARSENAL_IDS = ['mouse','laser','probe','gate'], AUTO_IDS = ['mote',...ARSENAL_IDS];
const COLORS = ['#9a8cff','#58ddca','#ffb86c','#f080b8','#7eb8ff','#d7e889','#bc9cf7','#f5d589'];
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const bounded = (v,max=LIMIT) => Number.isFinite(v) && v >= 0 && v <= max;
const integer = (v,max=COUNT_LIMIT) => Number.isSafeInteger(v) && bounded(v,max);
const text = (v,max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const cap = (v) => Math.min(LIMIT,Math.max(0,v));
const count = (v) => Math.min(COUNT_LIMIT,Math.max(0,Math.floor(v)));
const fail = (reason) => ({ok:false,reason});
const rank = (p,id) => p.skills[id] || 0;
const boss = (level) => level < FINAL_LEVEL && level % 20 === 0;
const power = (base,growth,exponent) => Math.min(LIMIT,base * growth ** exponent);
const orbHp = (level,scale=1) => level>=FINAL_LEVEL?FINAL_HP*scale:power(BASE_HP*scale*getSystemHpMultiplier(level),HP_GROWTH,level-1);
const baseReward = (level,scale=1) => power(BASE_REWARD*(boss(level)?5:1)*scale,REWARD_GROWTH,level-1);
const freshOrb = () => ({level:1,hp:BASE_HP});
export const GENERATORS = Object.freeze([
  {id:'mote',name:'Auto clicker',category:'workshop',kind:'auto',description:'Strikes the orb automatically every two seconds. Scales with your damage.',baseCost:25,baseRate:0,autoRate:0.5,attackMultiplier:1,icon:'✧'},
  {id:'satellite',name:'Refract orb farm',category:'workshop',kind:'passive',description:'Grow luminous Refract orbs for 90 base LRC per second.',baseCost:3000,baseRate:90,icon:'◎'},
  {id:'prism',name:'Light array',category:'workshop',kind:'passive',description:'Harvest a broad spectrum of light for 32 base LRC per second.',baseCost:800,baseRate:32,icon:'◈'},
  {id:'star',name:'Refractometer',category:'workshop',kind:'multiplier',description:'+10% to your damage and all LRC production per unit.',baseCost:4500,baseRate:0,multiplier:0.1,icon:'◇'},
  {id:'nova',name:'Pocket star',category:'workshop',kind:'passive',description:'Your own miniature sun produces 300 base LRC per second.',baseCost:12000,baseRate:300,icon:'☀'},
  {id:'mouse',name:'AI Mouse',category:'arsenal',kind:'auto',description:'An autonomous cursor clicks twice per second, dealing automatic damage and minting your guaranteed click income.',baseCost:2400,baseRate:0,autoRate:2,attackMultiplier:1,unlock:{orb:5,skills:{ki3:1,au1:2}},icon:'↖'},
  {id:'laser',name:'Lazer cannon',category:'arsenal',kind:'auto',description:'Charges for five seconds, then fires a beam dealing 20 automatic hits of damage.',flavor:'Immah firin mah lazor BWAAAH',baseCost:35000,baseRate:0,autoRate:0.2,attackMultiplier:20,unlock:{orb:15,skills:{ki3:1,au2:2}},icon:'⌁'},
  {id:'probe',name:'Starlink probe',category:'arsenal',kind:'hybrid',description:'Fires a 3× strength pulse every two seconds and relays 1,200 base LRC per second.',baseCost:250000,baseRate:1200,autoRate:0.5,attackMultiplier:3,unlock:{orb:30,skills:{ki3:1,perpetuity:1}},icon:'⌖'},
  {id:'gate',name:'Star gate',category:'arsenal',kind:'hybrid',description:'Opens every ten seconds for a 100× strength strike and channels 10,000 base LRC per second.',baseCost:5000000,baseRate:10000,autoRate:0.1,attackMultiplier:100,unlock:{orb:60,rounds:120,prestiges:1,skills:{ki3:1,au3:2}},icon:'◉'},
  {id:'wormhole',name:'Wormhole generator',category:'click',kind:'click',description:'+4 base damage to every manual and automatic hit.',baseCost:600,baseRate:0,damageFlat:4,unlock:{skills:{ki2:1}},icon:'◎'},
  {id:'foamer',name:'Quantum foamer',category:'click',kind:'click',description:'+20% damage to every manual and automatic hit.',baseCost:3500,baseRate:0,damagePct:.2,unlock:{skills:{ki2:1}},icon:'◌'},
  {id:'string',name:'String detheory',category:'click',kind:'click',description:'+1% critical chance and +0.1 critical damage multiplier.',baseCost:18000,baseRate:0,criticalChance:.01,criticalMultiplier:.1,unlock:{skills:{ki2:1}},icon:'≈'},
  {id:'sail',name:'Solar sail',category:'workshop',kind:'passive',description:'A kilometre of mirror film catches starlight for 2,600 base LRC per second.',baseCost:150000,baseRate:2600,unlock:{orb:15},icon:'⛵'},
  {id:'lens',name:'Lens cathedral',category:'workshop',kind:'passive',description:'A vaulted hall of prisms focuses a whole system’s light: 24,000 base LRC per second.',baseCost:1800000,baseRate:24000,unlock:{orb:40,rounds:20},icon:'◭'},
  {id:'dyson',name:'Dyson lantern',category:'workshop',kind:'passive',description:'A lantern shell around a captured star: 260,000 base LRC per second.',baseCost:25000000,baseRate:260000,unlock:{orb:80,prestiges:1},icon:'✺'},
]);
const skillById = new Map(SKILLS.map(s=>[s.id,s]));
const generatorById = new Map(GENERATORS.map(g=>[g.id,g]));
/** Collection machines beyond the pocket star: plain base rates, no dedicated research line yet. */
const DEEP_IDS=['sail','lens','dyson'];

export function createGame({seed=0x5eed,mode='scoreboard'}={}) {
  return {version:1,combatVersion:COMBAT_VERSION,campaignVersion:CAMPAIGN_VERSION,victory:null,mode:mode==='coop'?'coop':'scoreboard',sharedLrc:0,sharedFuel:0,sharedOrb:freshOrb(),phase:'lobby',round:0,
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
  state.sharedOrb.hp=state.sharedOrb.hp===0?0:Math.max(Number.MIN_VALUE,Math.min(nextMax,state.sharedOrb.hp/previousMax*nextMax));
}
function createPlayer(state,person) {
  const player={id:person.id,name:String(person.name||'Pilot').slice(0,40),avatarUrl:safeAvatar(person.avatarUrl),color:COLORS[state.players.length%8],bot:Boolean(person.bot),
    lrc:0,runLrc:0,lifetimeLrc:0,roundLrc:0,clicks:0,roundClicks:0,autoClicks:0,autoClock:0,arsenalClock:[0,0,0,0],arsenalShots:[0,0,0,0],skillPoints:0,skills:{},generators:{},
    prestigePoints:0,totalPrestige:0,prestigeCount:0,orb:freshOrb(),highestOrb:state.mode==='coop'?state.sharedOrb.level:1,orbsDestroyed:0,
    completedRounds:0,victories:0,combo:0,comboAt:0,ready:false,clickTokens:3,botClock:0,secretOrb:null,fuel:0,farm:createFarm()};
  // A returning winner still sees the frozen final core. Joining never pays a
  // victory reward again; the event itself survives roster changes.
  if(state.phase==='victory'&&state.mode==='scoreboard'&&state.victory?.playerId===player.id){player.orb={level:FINAL_LEVEL,hp:0,finalElapsed:FINAL_MIN_SECONDS};player.highestOrb=FINAL_LEVEL;}
  return player;
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
export function getRoundDuration(state){return Math.min(180,ROUND_DURATION+Math.max(0,...state.players.filter(player=>!player.bot).map(player=>Math.max(0,effectsOf(player).roundSeconds||0))));}
export function getStats(p,state) {
  const e=effectsOf(p),crew=state?.mode==='coop'?state.players:[p];let frequency=0,crewAuto=0;
  for(const member of crew){const c=member===p?e:effectsOf(member);frequency+=(c.frequency||0)+(c.crewStrength||0)*crew.length;crewAuto+=(c.crewAutomation||0)*crew.length;}
  const machines=Object.values(p.generators).reduce((a,b)=>a+b,0),generatorMultiplier=1+(p.generators.star||0)*0.1;
  const farmStats=getFarmStats(p,e),beamBonus=p.farm?.fedSeconds>0?farmStats.feedBonus:0,scoreMultiplier=farmStats.scoreMultiplier||1;
  const multiplier=cap((1+p.totalPrestige*0.1)*(1+frequency)*(1+(e.personalPct||0))*generatorMultiplier*(1+beamBonus));
  const surge=Boolean(state?.phase==='round'&&state.remaining<=10&&state.remaining>0);
  const comboCap=Math.floor(10+(e.comboCap||0)),combo=!state||state.now<p.comboAt+2?Math.min(comboCap,p.combo):0;
  const clickDamage=cap((2+(e.damageFlat||0)+(p.generators.wormhole||0)*4)*(1+(e.damagePct||0)+(p.generators.foamer||0)*.2)*multiplier*(1+combo*(e.comboPower||0))*(surge?2:1));
  const clickIncome=cap((0.25+(e.mintFlat||0))*(1+(e.mintPct||0))*(1+machines*(e.mintSynergy||0))*multiplier*(surge?1+(e.surgeMintPct||0):1)*scoreMultiplier);
  const farms=(p.generators.satellite||0)*generatorById.get('satellite').baseRate*(1+(e.farmPct||0))*(1+(p.generators.prism||0)*(e.farmSynergy||0));
  const deep=DEEP_IDS.reduce((total,id)=>total+(p.generators[id]||0)*generatorById.get(id).baseRate,0);
  const arrays=(p.generators.prism||0)*32*(1+(e.arrayPct||0)),stars=(p.generators.nova||0)*300*(1+(e.starPct||0));
  const arsenalRate=ARSENAL_IDS.reduce((total,id)=>total+(p.generators[id]||0)*generatorById.get(id).baseRate,0);
  const machineRate=(farms+arrays+stars+deep+arsenalRate)*(1+(e.generatorPct||0))*(1+machines*(e.generatorSynergy||0));
  const passiveRate=cap((1+(e.passiveFlat||0)+machineRate)*(1+(e.passivePct||0))*multiplier*scoreMultiplier);
  const autoDamage=cap(clickDamage*(1+(e.autoDamagePct||0))),autoMint=cap(clickIncome*(e.autoMint||0));
  const autoSpeed=1+(e.autoPct||0)+crewAuto,arsenalShots=p.arsenalShots||[0,0,0,0];
  const autoProfiles=AUTO_IDS.map((id,index)=>{const g=generatorById.get(id),owned=p.generators[id]||0;
    return {id,owned,rate:(owned*g.autoRate+(index===0?e.autoFlat||0:0))*autoSpeed,damage:cap(autoDamage*g.attackMultiplier),mint:id==='mouse'?clickIncome:autoMint,
      shots:index===0?Math.max(0,p.autoClicks-arsenalShots.reduce((a,b)=>a+b,0)):arsenalShots[index-1],progress:index===0?p.autoClock:p.arsenalClock?.[index-1]||0};});
  const autoRate=autoProfiles.reduce((total,profile)=>total+profile.rate,0),autoDps=cap(autoProfiles.reduce((total,profile)=>total+profile.rate*profile.damage,0));
  const automaticMintRate=autoProfiles.reduce((total,profile)=>total+profile.rate*profile.mint,0);
  return {clickPower:clickDamage,clickDamage,clickIncome,passiveRate,idleRate:cap(passiveRate+automaticMintRate),autoRate,autoDamage,autoDps,autoMint,autoProfiles,
    generatorMultiplier,multiplier,beamBonus,scoreMultiplier,surge,combo,comboCap,criticalChance:Math.min(0.8,0.05+(e.critChance||0)+(p.generators.string||0)*.01),criticalMultiplier:3+(e.critMultiplier||0)+(p.generators.string||0)*.1,
    extraHitChance:Math.min(0.9,e.extraHitChance||0),criticalMintMultiplier:1+(e.criticalMintPct||0),bossDamageMultiplier:1+(e.bossDamagePct||0),
    bossDropMultiplier:1+(e.bossDropPct||0),dropMultiplier:cap(multiplier*(1+(e.dropPct||0))*(1+Math.log2(p.highestOrb+1)*(e.orbScaling||0))*scoreMultiplier),
    dropFlat:e.dropFlat||0,autoDropMultiplier:1+(e.autoDropPct||0),roundBonusSeconds:Math.min(120,e.roundSeconds||0),
    roundSkillBonus:Math.min(MAX_SKILL_POINTS_PER_ROUND-3,Math.floor((e.insight||0)+1e-9)+(rank(p,'unity')>0?1:0))};
}
export function getBalance(p,state){return state?.mode==='coop'?state.sharedLrc:p?.lrc??0;}
export function getTeamStats(state){return state.players.reduce((total,p)=>{const s=getStats(p,state);return {clickPower:cap(total.clickPower+s.clickPower),idleRate:cap(total.idleRate+s.idleRate),autoDps:cap(total.autoDps+s.autoDps)};},{clickPower:0,idleRate:0,autoDps:0});}
const personalTarget=(round)=>cap(Math.round(500*(1+0.12*Math.max(0,round-1))**2));
export function getRoundTarget(state){return state.mode==='coop'?state.goal:personalTarget(state.round);}
export function generatorCost(p,id){const g=generatorById.get(id);return g?Math.ceil(g.baseCost*1.17**(p.generators[id]||0)):Infinity;}
export function generatorAvailability(p,id,state){
  const g=generatorById.get(id);if(!p||!g)return {unlocked:false,available:false,reason:'Unknown generator.'};
  const locked=(reason)=>({unlocked:false,available:false,reason}),u=g.unlock||{};
  if(p.highestOrb<(u.orb||0))return locked(`Reach orb ${u.orb} (best: ${p.highestOrb}).`);
  if(p.completedRounds<(u.rounds||0))return locked(`Complete ${u.rounds} rounds (${p.completedRounds} completed).`);
  if(p.prestigeCount<(u.prestiges||0))return locked(`Prestige ${u.prestiges} times (${p.prestigeCount} completed).`);
  for(const [required,needed]of Object.entries(u.skills||{}))if(rank(p,required)<needed)return locked(`Requires ${skillById.get(required)?.name||required} rank ${needed}.`);
  if((p.generators[id]||0)>=1000)return {unlocked:true,available:false,reason:'Maximum capacity reached.'};
  if(!['round','intermission'].includes(state?.phase))return {unlocked:true,available:false,reason:'Start a round to build your orbit.'};
  if(getBalance(p,state)<generatorCost(p,id))return {unlocked:true,available:false,reason:'Collect more LRCs to buy this machine.'};
  return {unlocked:true,available:true,reason:'Ready to build.'};
}
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
  if(g.farm&&!getFarmUnlocked(p))return {available:false,reason:'Research the Garden licence to unlock garden research.'};
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
/** Ship fuel for the orbit this pilot is flying: their own tank in Scoreboard, the crew tank in Co-op. */
export const getFuel=(p,state)=>state?.mode==='coop'?state.sharedFuel||0:p?.fuel||0;
function setFuel(p,state,value){if(state.mode==='coop')state.sharedFuel=value;else p.fuel=value;}
/** A jump-point core cannot be reached until the tank holds that system's fuel target. */
export function getShipStatus(p,state){const level=orbState(p||{orb:freshOrb()},state).level,target=fuelTarget(level),fuel=Math.min(target,getFuel(p,state));
  return {fuel,target,full:fuel>=target,jumpPoint:isJumpPoint(level),grounded:isJumpPoint(level)&&fuel<target,systemIndex:getCampaignLocation(level).index};}
function rewardAt(level,s,automatic=false,scale=1){return cap((baseReward(level,scale)*(boss(level)?s.bossDropMultiplier:1)+s.dropFlat*scale)*s.dropMultiplier*(automatic?s.autoDropMultiplier:1));}
export function getOrb(p,state){const campaignOrb=orbState(p||{orb:freshOrb()},state),secret=Boolean(p?.secretOrb),orb=secret?{...p.secretOrb,level:campaignOrb.level}:campaignOrb,s=p?getStats(p,state):null,location=getCampaignLocation(orb.level);
  const {crewSize,crewScale}=getCoopDifficulty(state),maxHp=secret?SECRET_HP:orbHp(orb.level,crewScale),damageFraction=Math.max(0,Math.min(1,1-orb.hp/maxHp));
  const fractureStage=[0.1,0.35,0.65].filter(threshold=>damageFraction+1e-12>=threshold).length;
  const systemBoss=!secret&&boss(orb.level),bossActive=secret||systemBoss&&Object.hasOwn(orb,'bossStartedAt'),duration=secret?SECRET_DURATION:BOSS_DURATION;
  const participants=secret?[p]:state.mode==='coop'?state.players.filter(member=>!member.secretOrb):p?[p]:[];
  const bossDps=cap(participants.reduce((total,member)=>{const stats=member===p?s:getStats(member,state);return total+stats.autoDps*(systemBoss?stats.bossDamageMultiplier/2:1);},0));
  return {...orb,maxHp,unscaledMaxHp:secret?SECRET_HP:orbHp(orb.level),crewSize:secret?1:crewSize,crewScale:secret?1:crewScale,damageFraction,fractureStage,boss:secret||systemBoss,resistance:systemBoss?0.5:0,
    secret,systemBoss,bossActive,bossRemaining:systemBoss||secret?Math.max(0,duration-(bossActive?state.now-(secret?orb.startedAt:orb.bossStartedAt):0)):0,requiredDps:systemBoss||secret?maxHp/duration:0,bossDps,
    final:!secret&&location.final,finalElapsed:orb.finalElapsed||0,finalRemaining:!secret&&location.final?Math.max(0,FINAL_MIN_SECONDS-(orb.finalElapsed||0)):0,
    systemIndex:location.index,systemName:secret?'The Green Star':location.system.name,planetName:secret?'Haze':location.planetName,reward:secret||location.final?0:s?rewardAt(orb.level,s,false,crewScale):baseReward(orb.level,crewScale)};}
// Analytical geometric sums keep enormous attacks logarithmic in orb count.
function geometricSum(base,exponent,length,step,growth){
  if(length<=0)return 0;const log=Math.log(growth),last=(Math.log(LIMIT)-Math.log(base))/log;
  const normal=Math.max(0,Math.min(length,Math.floor((last-exponent)/step)+1));
  const initial=normal?Math.exp(Math.log(base)+exponent*log):0;
  return (normal?initial*Math.expm1(normal*step*log)/Math.expm1(step*log):0)+(length-normal)*LIMIT;
}
function bossSeries(start,length,base,growth){const first=Math.ceil(start/20)*20,n=Math.max(0,Math.floor((start+length-1-first)/20)+1);return geometricSum(base,first-1,n,20,growth);}
function hpCost(start,length,s,scale){
  let total=0,remaining=Math.min(length,FINAL_LEVEL-start);
  // At most ten geometric bands, regardless of the attack's magnitude.
  while(remaining>0){const size=Math.min(remaining,20-(start-1)%20),base=BASE_HP*scale*getSystemHpMultiplier(start),bosses=bossSeries(start,size,base,HP_GROWTH);
    total+=Math.max(0,geometricSum(base,start-1,size,1,HP_GROWTH)-bosses+bosses*2/s.bossDamageMultiplier);start+=size;remaining-=size;}
  return total;
}
function rewardSum(start,length,s,automatic,scale){const raw=geometricSum(BASE_REWARD*scale,start-1,length,1,REWARD_GROWTH)-bossSeries(start,length,BASE_REWARD*scale,REWARD_GROWTH)+bossSeries(start,length,BASE_REWARD*5*scale,REWARD_GROWTH)*s.bossDropMultiplier;
  return cap((Math.max(0,raw)+length*s.dropFlat*scale)*s.dropMultiplier*(automatic?s.autoDropMultiplier:1));}
function winCampaign(state,p,at){
  if(state.phase!=='round'||state.victory)return;
  state.phase='victory';state.remaining=0;state.victory={playerId:p.id,at};
  for(const member of state.players){const reward=Math.min(VICTORY_PRESTIGE_REWARD,COUNT_LIMIT-member.totalPrestige);
    member.totalPrestige+=reward;member.prestigePoints+=reward;member.victories=count(member.victories+1);member.ready=false;member.secretOrb=null;}
}
function damageFinal(state,p,damage,hits=1,at=state.now){
  const orb=orbState(p,state),maxHp=orbHp(FINAL_LEVEL,getCoopDifficulty(state).crewScale),floor=maxHp*Math.max(0,1-(orb.finalElapsed||0)/FINAL_MIN_SECONDS);
  const fraction=Math.min(1,resonanceFraction(damage)*hits);
  orb.hp=Math.max(floor,orb.hp-maxHp*fraction);
  if(floor===0&&orb.hp<=maxHp*1e-12){orb.hp=0;p.orbsDestroyed=count(p.orbsDestroyed+1);winCampaign(state,p,at);return {kills:1,amount:0};}
  return {kills:0,amount:0};
}
function damageOrb(state,p,damage,s,automatic=false,hits=1,perHit=damage,at=state.now){
  if(p.secretOrb){
    p.secretOrb.hp=Math.max(0,p.secretOrb.hp-cap(damage));
    if(p.secretOrb.hp===0){p.secretOrb=null;p.farm.unlocked=true;p.farm.crops.weed=true;return {kills:0,amount:0,secretWon:true};}
    return {kills:0,amount:0};
  }
  const orb=orbState(p,state),scale=getCoopDifficulty(state).crewScale;let budget=cap(damage),kills=0,reward=0;
  if(isJumpPoint(orb.level)&&getFuel(p,state)<fuelTarget(orb.level))return {kills:0,amount:0,grounded:true};
  if(orb.level===FINAL_LEVEL)return damageFinal(state,p,perHit,hits,at);
  if(boss(orb.level)&&!Object.hasOwn(orb,'bossStartedAt'))orb.bossStartedAt=at;
  const factor=boss(orb.level)?s.bossDamageMultiplier/2:1,firstCost=orb.hp/factor;
  if(budget<firstCost){orb.hp=Math.max(Number.MIN_VALUE,orb.hp-budget*factor);return {kills,amount:0};}
  budget=Math.max(0,budget-firstCost);reward=rewardAt(orb.level,s,automatic,scale);kills=1;if(isJumpPoint(orb.level))setFuel(p,state,0);orb.level=Math.min(FINAL_LEVEL,orb.level+1);delete orb.bossStartedAt;
  // A new system boss always starts at full health. Overflow cannot skip its DPS check.
  const nextGate=Math.min(FINAL_LEVEL,Math.ceil(orb.level/20)*20),maxFull=nextGate-orb.level;let low=0,high=Math.min(maxFull,1);
  while(high<maxFull&&hpCost(orb.level,high,s,scale)<=budget)high=Math.min(maxFull,high*2);
  while(low<high){const middle=Math.ceil((low+high)/2);if(hpCost(orb.level,middle,s,scale)<=budget)low=middle;else high=middle-1;}
  if(low){budget=Math.max(0,budget-hpCost(orb.level,low,s,scale));reward=cap(reward+rewardSum(orb.level,low,s,automatic,scale));orb.level+=low;kills+=low;}
  const nextFactor=boss(orb.level)?s.bossDamageMultiplier/2:1,nextHp=orbHp(orb.level,scale);
  if(orb.level===FINAL_LEVEL){orb.hp=nextHp;orb.finalElapsed=0;}
  else if(boss(orb.level))orb.hp=nextHp;
  else orb.hp=Math.max(Number.MIN_VALUE,Math.min(nextHp,nextHp-budget*nextFactor));p.orbsDestroyed=count(p.orbsDestroyed+kills);
  if(state.mode==='coop')for(const member of state.players)member.highestOrb=Math.max(member.highestOrb,orb.level);else p.highestOrb=Math.max(p.highestOrb,orb.level);
  return {kills,amount:earn(state,p,reward)};
}
function startRound(state){state.phase='round';state.round++;state.roundDuration=getRoundDuration(state);state.remaining=state.roundDuration;state.teamLrc=0;state.goal=cap(personalTarget(state.round)*Math.max(1,state.players.length));state.goalReached=false;
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
  if(action.type==='newJourney'){
    if(state.phase!=='victory')return fail('Complete the current journey first.');if(state.players[0]?.id!==playerId)return fail('Only the host can begin a new journey.');
    state.victory=null;state.phase='intermission';state.remaining=0;state.sharedFuel=0;state.sharedOrb={level:1,hp:orbHp(1,getCoopDifficulty(state).crewScale)};
    for(const member of state.players){member.orb=freshOrb();member.fuel=0;member.autoClock=0;member.arsenalClock=[0,0,0,0];member.combo=0;member.ready=false;member.secretOrb=null;}return {ok:true};}
  if(state.phase==='victory')return fail('The journey is complete. The host can begin another when everyone is ready.');
  if(action.type==='startSecretChallenge'){
    if(!['round','intermission'].includes(state.phase))return fail('Start a round before entering the hidden system.');
    if(p.secretOrb)return fail('The secret challenge is already in progress.');
    if(p.farm.crops.weed)return fail('You have already unlocked the secret crop.');
    p.secretOrb={hp:SECRET_HP,startedAt:state.now};return {ok:true};}
  if(action.type==='leaveSecretChallenge'){
    if(!p.secretOrb)return fail('There is no secret challenge to leave.');p.secretOrb=null;return {ok:true};}
  if(action.type==='resetProgress'){
    // A full personal wipe: identity, colour and roster position survive; every record, rank and balance returns to a brand-new pilot.
    const fresh={...createPlayer(state,{id:p.id,name:p.name,avatarUrl:p.avatarUrl,bot:p.bot}),color:p.color};
    state.players[state.players.indexOf(p)]=fresh;
    if(state.lastRound)state.lastRound.players=state.lastRound.players.filter(result=>result.id!==p.id);
    return {ok:true};}
  if(action.type==='setMode'){if(state.phase!=='lobby')return fail('Choose a mode before the first round starts.');if(state.players[0]?.id!==playerId)return fail('Only the host can choose the session mode.');if(!['scoreboard','coop'].includes(action.mode))return fail('Unknown game mode.');const previousMax=orbHp(state.sharedOrb.level,getCoopDifficulty(state).crewScale);state.mode=action.mode;resizeSharedOrb(state,previousMax);return {ok:true};}
  if(action.type==='start'){if(state.phase!=='lobby')return fail('The run has already started.');if(state.players[0]?.id!==playerId)return fail('Only the host can start the run.');startRound(state);return {ok:true};}
  if(action.type==='click'){
    if(state.phase!=='round')return fail('Harvesting resumes next round.');if(p.clickTokens<1)return fail('The core is recharging.');p.clickTokens--;
    const before=getStats(p,state);p.combo=state.now<p.comboAt+2?Math.min(before.comboCap,p.combo+1):1;p.comboAt=state.now;
    const s=getStats(p,state),critical=random(state)<s.criticalChance,hits=1+(s.extraHitChance>0&&random(state)<s.extraHitChance?1:0);
    const damage=cap(s.clickDamage*hits*(critical?s.criticalMultiplier:1)),result=damageOrb(state,p,damage,s);
    const minted=state.phase==='victory'?0:earn(state,p,s.clickIncome*(critical?s.criticalMintMultiplier:1));p.clicks=count(p.clicks+1);p.roundClicks=count(p.roundClicks+1);
    return {ok:true,damage,amount:cap(result.amount+minted),kills:result.kills,critical};}
  if(action.type==='ready'){if(state.phase!=='intermission')return fail('Ready up between rounds.');p.ready=!p.ready;maybeStartNextRound(state);return {ok:true};}
  if(FARM_ACTIONS.has(action.type)){
    if(!['round','intermission'].includes(state.phase))return fail('Start a round to tend your garden.');
    const ship=getShipStatus(p,state),result=applyFarmAction(p,action,getBalance(p,state),cost=>{if(state.mode==='coop')state.sharedLrc-=cost;else p.lrc-=cost;},{fuelRoom:ship.target-ship.fuel});
    if(result.ok&&result.fuel>0)setFuel(p,state,Math.min(ship.target,ship.fuel+result.fuel));
    return result;}
  if(action.type==='buyGenerator'){
    const availability=generatorAvailability(p,action.id,state);if(!availability.available)return fail(availability.reason);
    const quantity=action.quantity===undefined?1:action.quantity;if(![1,10,'max'].includes(quantity))return fail('Choose Buy 1, Buy 10, or Buy Max.');
    const quote=generatorQuote(p,action.id,quantity,state);if(!quote.quantity)return fail('No affordable capacity remains for this purchase.');if(getBalance(p,state)<quote.cost)return fail('Collect more LRCs to buy that whole bundle.');
    if(state.mode==='coop')state.sharedLrc-=quote.cost;else p.lrc-=quote.cost;p.generators[action.id]=(p.generators[action.id]||0)+quote.quantity;return {ok:true,...quote};}
  if(action.type==='buySkill'){
    const availability=skillAvailability(p,action.id,state);if(!availability.available)return fail(availability.reason);const s=skillById.get(action.id),cost=skillCost(p,action.id);
    if(s.currency==='prestige')p.prestigePoints-=cost;else p.skillPoints-=cost;p.skills[s.id]=rank(p,s.id)+1;if(s.effects.garden)p.farm.unlocked=true;p.ready=false;return {ok:true};}
  if(action.type==='prestige'){
    if(state.phase!=='intermission')return fail('Refract your core between rounds.');const gain=prestigeGain(p);if(gain<1)return fail('Earn 2,500 LRCs in your own run to prestige.');
    p.prestigePoints=count(p.prestigePoints+gain);p.totalPrestige=count(p.totalPrestige+gain);p.prestigeCount=count(p.prestigeCount+1);
    resetFarm(p);p.lrc=0;p.runLrc=0;p.generators={};p.orb=freshOrb();p.fuel=0;p.secretOrb=null;p.autoClock=0;p.arsenalClock=[0,0,0,0];p.combo=0;p.ready=false;return {ok:true,amount:gain};}
  return fail('Unknown action.');
}
function expireChallenges(state){
  const orbs=state.mode==='coop'?[state.sharedOrb]:state.players.map(p=>p.orb),scale=getCoopDifficulty(state).crewScale;
  for(const orb of orbs)if(boss(orb.level)&&Object.hasOwn(orb,'bossStartedAt')&&state.now-orb.bossStartedAt>=BOSS_DURATION-1e-8){orb.hp=orbHp(orb.level,scale);delete orb.bossStartedAt;}
  for(const p of state.players)if(p.secretOrb&&state.now-p.secretOrb.startedAt>=SECRET_DURATION-1e-8)p.secretOrb=null;
}
const pulsesDuring=(profile,elapsed)=>Math.floor(profile.progress+profile.rate*elapsed+1e-9);
/** Split only at encounter events, not every projectile. This stays fast for dense fleets. */
function encounterStep(state,work,limit){
  let elapsed=limit;
  const groups=work.filter(({p})=>p.secretOrb).map(entry=>({orb:entry.p.secretOrb,entries:[entry],secret:true}));
  if(state.mode==='coop')groups.push({orb:state.sharedOrb,entries:work.filter(({p})=>!p.secretOrb)});
  else for(const entry of work)if(!entry.p.secretOrb)groups.push({orb:entry.p.orb,entries:[entry]});
  const scale=getCoopDifficulty(state).crewScale;
  for(const {orb,entries,secret}of groups){
    // A jump-point core the ship cannot reach yet takes no hits, so it never starts a timed encounter.
    if(!secret&&isJumpPoint(orb.level)&&getFuel(entries[0]?.p,state)<fuelTarget(orb.level))continue;
    const timed=secret||boss(orb.level),active=secret||Object.hasOwn(orb,'bossStartedAt');
    if(timed&&active)elapsed=Math.min(elapsed,Math.max(1e-8,(secret?orb.startedAt:orb.bossStartedAt)+(secret?SECRET_DURATION:BOSS_DURATION)-state.now));
    const profiles=entries.flatMap(({s})=>s.autoProfiles.filter(profile=>profile.rate>0).map(profile=>({...profile,damage:profile.damage*(timed&&!secret?s.bossDamageMultiplier/2:1)})));
    if(!profiles.length)continue;
    if(timed&&!active){elapsed=Math.min(elapsed,Math.max(1e-8,Math.min(...profiles.map(profile=>(1-profile.progress)/profile.rate))));continue;}
    // Normal damage may be aggregated, but the hit which reaches a system boss
    // must end this segment so earlier attacks cannot be banked into the fight.
    if(!timed&&orb.level>180)continue;
    const gate=Math.ceil(orb.level/20)*20,needed=timed?orb.hp:orb.hp+hpCost(orb.level+1,gate-orb.level-1,entries[0].s,scale);
    const damageAt=seconds=>profiles.reduce((sum,profile)=>sum+pulsesDuring(profile,seconds)*profile.damage,0);
    if(damageAt(elapsed)<needed)continue;
    let low=0,high=elapsed;
    for(let i=0;i<48;i++){const middle=(low+high)/2;if(damageAt(middle)>=needed)high=middle;else low=middle;}
    elapsed=Math.min(elapsed,Math.max(1e-8,high));
  }
  return elapsed;
}
export function advance(state,dtSeconds){
  if(!Number.isFinite(dtSeconds)||dtSeconds<=0||state.phase!=='round')return;let pending=Math.min(dtSeconds,state.remaining);
  while(pending>0&&state.phase==='round'){
    expireChallenges(state);
    // Use the same absolute deadline as the step split below. Subtracting the
    // timestamps can round differently and leave a combo stuck at a zero step.
    for(const p of state.players)if(p.combo&&state.now>=p.comboAt+2)p.combo=0;
    let elapsed=Math.min(pending,state.remaining>10?state.remaining-10:state.remaining);
    for(const p of state.players)if(p.combo)elapsed=Math.min(elapsed,Math.max(0,p.comboAt+2-state.now));
    for(const p of state.players)if(p.farm.fedSeconds>0)elapsed=Math.min(elapsed,p.farm.fedSeconds);
    for(const p of state.players)if(p.farm.cookedSeconds>0)elapsed=Math.min(elapsed,p.farm.cookedSeconds);
    const finals=(state.mode==='coop'?[state.sharedOrb]:state.players.map(p=>p.orb)).filter(orb=>orb.level===FINAL_LEVEL);
    for(const orb of finals)if(orb.finalElapsed<FINAL_MIN_SECONDS)elapsed=Math.min(elapsed,FINAL_MIN_SECONDS-orb.finalElapsed);
    const work=state.players.map(p=>({p,s:getStats(p,state),target:p.secretOrb||orbState(p,state),secret:Boolean(p.secretOrb),level:orbState(p,state).level}));
    elapsed=encounterStep(state,work,elapsed);
    for(const orb of finals)orb.finalElapsed=Math.min(FINAL_MIN_SECONDS,orb.finalElapsed+elapsed);
    for(const {p,s}of work){p.clickTokens=Math.min(3,p.clickTokens+elapsed*15);earn(state,p,s.passiveRate*elapsed);advanceFarm(p,elapsed,{balance:()=>getBalance(p,state),spend:cost=>{if(state.mode==='coop')state.sharedLrc-=cost;else p.lrc-=cost;}});}
    for(const {p,s,target,secret,level}of work){
      if(state.phase!=='round')break;
      for(let index=0;index<s.autoProfiles.length;index++){const profile=s.autoProfiles[index],clock=profile.progress+profile.rate*elapsed,pulses=Math.floor(clock+1e-9),remainder=Math.max(0,clock-pulses);
        if(index===0)p.autoClock=remainder;else p.arsenalClock[index-1]=remainder;
        if(pulses){
          const sameEncounter=secret?p.secretOrb===target:!p.secretOrb&&(!boss(level)&&!boss(target.level)||target.level===level);
          if(sameEncounter)damageOrb(state,p,cap(pulses*profile.damage),s,true,pulses,profile.damage,state.now+elapsed);
          if(state.phase==='round')earn(state,p,cap(pulses*profile.mint));p.autoClicks=count(p.autoClicks+pulses);
          if(index>0)p.arsenalShots[index-1]=count(p.arsenalShots[index-1]+pulses);if(state.phase!=='round')break;}}
      if(p.bot&&state.phase==='round'){p.botClock+=elapsed;const clicks=Math.min(3,Math.floor(p.botClock/0.8));p.botClock%=0.8;for(let i=0;i<clicks;i++)applyAction(state,p.id,{type:'click'});if(getBalance(p,state)>=generatorCost(p,'mote'))applyAction(state,p.id,{type:'buyGenerator',id:'mote'});}}
    state.now=cap(state.now+elapsed);expireChallenges(state);state.remaining=Math.max(0,state.remaining-elapsed);if(state.phase==='round'&&state.remaining<1e-8)finishRound(state);pending=Math.max(0,pending-elapsed);}
}
function validOrb(orb,scale=1,allowVictory=false,now=0){
  if(!record(orb)||!integer(orb.level,FINAL_LEVEL)||orb.level<1||!bounded(orb.hp,orbHp(orb.level,scale)*(1+1e-12)))return false;
  if(orb.level!==FINAL_LEVEL){
    if(orb.hp<=0||Object.hasOwn(orb,'finalElapsed'))return false;
    if(Object.hasOwn(orb,'bossStartedAt'))return boss(orb.level)&&bounded(orb.bossStartedAt,now)&&now-orb.bossStartedAt<BOSS_DURATION;
    return !boss(orb.level)||Math.abs(orb.hp/orbHp(orb.level,scale)-1)<1e-12;
  }
  if(Object.hasOwn(orb,'bossStartedAt'))return false;
  if(!bounded(orb.finalElapsed,Math.min(FINAL_MIN_SECONDS,now)))return false;
  const minimum=orbHp(FINAL_LEVEL,scale)*Math.max(0,1-orb.finalElapsed/FINAL_MIN_SECONDS);
  return orb.hp>=minimum*(1-1e-12)&&(orb.hp>0||allowVictory&&orb.finalElapsed===FINAL_MIN_SECONDS);
}
function validPlayer(p,state){
  if(!record(p)||!text(p.id,100)||!text(p.name,40)||!/^#[\da-f]{6}$/i.test(p.color)||typeof p.bot!=='boolean'||typeof p.ready!=='boolean'
    ||!(p.avatarUrl===null||safeAvatar(p.avatarUrl)===p.avatarUrl)||!record(p.skills)||!record(p.generators)||!validOrb(p.orb,1,state.phase==='victory'&&state.mode==='scoreboard'&&state.victory?.playerId===p.id,state.now)||!validateFarm(p.farm)
    ||!Array.isArray(p.arsenalClock)||p.arsenalClock.length!==4||!p.arsenalClock.every(value=>bounded(value,1))
    ||!Array.isArray(p.arsenalShots)||p.arsenalShots.length!==4||!p.arsenalShots.every(value=>integer(value)))return false;
  if(p.secretOrb!==null&&(!record(p.secretOrb)||Object.keys(p.secretOrb).some(key=>!['hp','startedAt'].includes(key))||!bounded(p.secretOrb.hp,SECRET_HP)||p.secretOrb.hp<=0||!bounded(p.secretOrb.startedAt,state.now)||state.now-p.secretOrb.startedAt>=SECRET_DURATION||p.farm.crops.weed))return false;
  if(!bounded(p.fuel,state.mode==='coop'?0:fuelTarget(p.orb.level)))return false;
  for(const key of ['lrc','runLrc','lifetimeLrc','roundLrc','comboAt'])if(!bounded(p[key]))return false;
  for(const key of ['clicks','roundClicks','autoClicks','skillPoints','prestigePoints','totalPrestige','prestigeCount','orbsDestroyed','completedRounds','combo','victories'])if(!integer(p[key]))return false;
  if(!integer(p.highestOrb,MAX_LEVEL)||p.highestOrb<p.orb.level||!bounded(p.clickTokens,3)||!bounded(p.botClock,0.8)||!bounded(p.autoClock,1))return false;
  if(p.lrc>p.runLrc*(1+1e-12)||p.runLrc>p.lifetimeLrc*(1+1e-12)||p.prestigePoints>p.totalPrestige)return false;
  // Older earned ranks are grandfathered; future purchases enforce all new gates.
  for(const [id,value]of Object.entries(p.skills))if(!skillById.has(id)||!integer(value,skillById.get(id).maxRank))return false;
  for(const [id,value]of Object.entries(p.generators))if(!generatorById.has(id)||!integer(value,1000))return false;return true;
}
export function validateState(state){
  if(!record(state)||state.version!==1||state.combatVersion!==COMBAT_VERSION||state.campaignVersion!==CAMPAIGN_VERSION||!Array.isArray(state.players)||!state.players.every(record)||!['lobby','round','intermission','victory'].includes(state.phase)||!['scoreboard','coop'].includes(state.mode)||!bounded(state.sharedLrc)||!validOrb(state.sharedOrb,getCoopDifficulty(state).crewScale,state.phase==='victory'&&state.mode==='coop',state.now)
    ||!bounded(state.sharedFuel,state.mode==='coop'?fuelTarget(state.sharedOrb.level):0)||(state.mode==='scoreboard'&&state.sharedLrc!==0)||!integer(state.round,1e6)||!integer(state.roundDuration,180)||state.roundDuration<60||!bounded(state.remaining,state.roundDuration)||!bounded(state.now)||!bounded(state.teamLrc)||!bounded(state.goal)||state.goal<=0
    ||typeof state.goalReached!=='boolean'||state.goalReached!==(state.teamLrc>=state.goal)||!integer(state.rng,0xffffffff)||!Array.isArray(state.players)||state.players.length>8
    ||!state.players.every(p=>validPlayer(p,state))||new Set(state.players.map(p=>p.id)).size!==state.players.length)return false;
  if(state.phase==='victory'){
    if(!record(state.victory)||!text(state.victory.playerId,100)||!bounded(state.victory.at,state.now)||state.remaining!==0)return false;
    const winner=state.players.find(p=>p.id===state.victory.playerId),orb=state.mode==='coop'?state.sharedOrb:winner?.orb;
    if(orb&&(orb.level!==FINAL_LEVEL||orb.hp!==0||orb.finalElapsed!==FINAL_MIN_SECONDS))return false;
  }else if(state.victory!==null)return false;
  if(state.phase==='lobby'&&state.round!==0)return false;if(state.phase!=='lobby'&&state.round<1)return false;
  if(state.phase==='intermission'&&state.remaining!==0)return false;if(state.phase==='round'&&state.remaining<=0)return false;
  if(state.lastRound!==null){const r=state.lastRound;if(!record(r)||!integer(r.round,state.round)||r.round<1||!bounded(r.teamLrc)||!bounded(r.goal)||r.goal<=0||typeof r.goalReached!=='boolean'||r.goalReached!==(r.teamLrc>=r.goal)
    ||![2,3].includes(r.skillPoints)||!Array.isArray(r.players)||r.players.length>8||!r.players.every(p=>record(p)&&text(p.id,100)&&bounded(p.lrc)&&integer(p.clicks)&&integer(p.skillPoints,MAX_SKILL_POINTS_PER_ROUND)&&p.skillPoints>=2)
    ||new Set(r.players.map(p=>p.id)).size!==r.players.length)return false;}
  try{return new TextEncoder().encode(JSON.stringify(compactGameState(state))).length<15000;}catch{return false;}
}
/** Ranks in catalog order with trailing zeros trimmed: far smaller on the relay than `id:rank` strings. */
const packRanks=(values,catalog)=>{const ranks=catalog.map(item=>values[item.id]||0);while(ranks.length&&ranks[ranks.length-1]===0)ranks.pop();return ranks;};
function unpackRanks(packed,catalog,maxOf){
  if(packed.length>catalog.length)return null;const result={};
  for(let index=0;index<packed.length;index++){const value=packed[index];if(value===0)continue;if(!integer(value,maxOf(catalog[index])))return null;result[catalog[index].id]=value;}
  return result;
}
const packOrb=orb=>[orb.level,orb.hp,...(Object.hasOwn(orb,'finalElapsed')?[orb.finalElapsed]:Object.hasOwn(orb,'bossStartedAt')?[orb.bossStartedAt]:[])];
function unpackOrb(orb){return Array.isArray(orb)&&[2,3].includes(orb.length)?{level:orb[0],hp:orb[1],...(orb.length===3?orb[0]===FINAL_LEVEL?{finalElapsed:orb[2]}:{bossStartedAt:orb[2]}:{})}:null;}
export function compactGameState(state){return {...state,sharedOrb:packOrb(state.sharedOrb),players:state.players.map(player=>({...player,avatarUrl:null,
  skills:packRanks(player.skills,SKILLS),generators:packRanks(player.generators,GENERATORS),orb:packOrb(player.orb),secretOrb:player.secretOrb?[player.secretOrb.hp,player.secretOrb.startedAt]:null,farm:packFarm(player.farm)})),
  lastRound:state.lastRound?{...state.lastRound,players:state.lastRound.players.map(player=>{
    const index=state.players.findIndex(member=>member.id===player.id);return [index<0?player.id:index,player.lrc,player.clicks,player.skillPoints];
  })}:null};}
function unpackSkills(packed){
  if(packed==='')return {};if(packed.length>3000)return null;const entries=packed.split(',');if(entries.length>SKILLS.length)return null;
  const result={};for(const entry of entries){const match=/^([a-z0-9-]+):(\d+)$/.exec(entry);if(!match||!skillById.has(match[1])||Object.hasOwn(result,match[1]))return null;
    const value=Number(match[2]);if(!integer(value,skillById.get(match[1]).maxRank))return null;result[match[1]]=value;}return result;
}
function unpackGenerators(packed){
  if(packed==='')return {};if(packed.length>1000)return null;const entries=packed.split(',');if(entries.length>GENERATORS.length)return null;
  const result={};for(const entry of entries){const match=/^([a-z0-9-]+):(\d+)$/.exec(entry);if(!match||!generatorById.has(match[1])||Object.hasOwn(result,match[1]))return null;
    const value=Number(match[2]);if(!integer(value,1000))return null;result[match[1]]=value;}return result;
}
export function migrateState(saved){
  if(!record(saved)||saved.version!==1||Object.hasOwn(saved,'combatVersion')&&![1,COMBAT_VERSION].includes(saved.combatVersion)
    ||Object.hasOwn(saved,'campaignVersion')&&![1,CAMPAIGN_VERSION].includes(saved.campaignVersion))return null;
  try{const next=structuredClone(saved),legacy=next.combatVersion!==COMBAT_VERSION,oldCampaign=!Object.hasOwn(next,'campaignVersion'),oldBosses=legacy||next.campaignVersion!==CAMPAIGN_VERSION;
    next.campaignVersion=CAMPAIGN_VERSION;if(!Object.hasOwn(next,'victory'))next.victory=null;
    const defaultOrb=()=>legacy?{level:1,hp:12}:freshOrb();
    if(!Object.hasOwn(next,'mode'))next.mode='scoreboard';if(!Object.hasOwn(next,'sharedLrc'))next.sharedLrc=0;if(!Object.hasOwn(next,'sharedFuel'))next.sharedFuel=0;
    if(Array.isArray(next.sharedOrb))next.sharedOrb=unpackOrb(next.sharedOrb);
    if(!Object.hasOwn(next,'sharedOrb'))next.sharedOrb=!legacy&&Array.isArray(next.players)&&next.players.every(record)?{level:1,hp:orbHp(1,getCoopDifficulty(next).crewScale)}:defaultOrb();
    if(Array.isArray(next.players))for(const p of next.players)if(record(p)){const defaults={autoClicks:0,autoClock:0,arsenalClock:[0,0,0,0],arsenalShots:[0,0,0,0],orb:defaultOrb(),highestOrb:1,orbsDestroyed:0,victories:0,completedRounds:Math.max(0,(next.round||0)-(next.phase==='round'?1:0)),combo:0,comboAt:0,secretOrb:null,fuel:0,farm:{...createFarm(),unlocked:Boolean(p.generators?.satellite>0)}};
      for(const [key,value]of Object.entries(defaults))if(!Object.hasOwn(p,key))p[key]=value;
      if(Array.isArray(p.farm))p.farm=unpackFarm(p.farm);else p.farm=migrateFarm(p.farm);
      if(typeof p.skills==='string')p.skills=unpackSkills(p.skills);else if(Array.isArray(p.skills))p.skills=unpackRanks(p.skills,SKILLS,skill=>skill.maxRank);
      if(typeof p.generators==='string')p.generators=unpackGenerators(p.generators);else if(Array.isArray(p.generators))p.generators=unpackRanks(p.generators,GENERATORS,()=>1000);
      if(Array.isArray(p.orb))p.orb=unpackOrb(p.orb);
      if(Array.isArray(p.secretOrb)){if(p.secretOrb.length!==2)return null;p.secretOrb={hp:p.secretOrb[0],startedAt:p.secretOrb[1]};}}
    if(legacy){
      const convert=(orb,scale=1)=>{if(!record(orb)||!integer(orb.level,MAX_LEVEL)||orb.level<1)return false;
        const oldMax=power(12,HP_GROWTH,orb.level-1);if(!bounded(orb.hp,oldMax*(1+1e-12))||orb.hp<=0)return false;
        if(orb.level>=FINAL_LEVEL){orb.level=FINAL_LEVEL;orb.hp=orbHp(FINAL_LEVEL,scale);orb.finalElapsed=0;}
        else orb.hp=Math.max(Number.MIN_VALUE,Math.min(1,orb.hp/oldMax)*orbHp(orb.level,scale));return true;};
      if(!Array.isArray(next.players)||!next.players.every(record)||!convert(next.sharedOrb,getCoopDifficulty(next).crewScale)||!next.players.every(p=>convert(p.orb)))return null;
      next.combatVersion=COMBAT_VERSION;
    }
    if(oldCampaign&&!legacy){
      const convert=(orb,scale=1)=>{if(!record(orb)||!integer(orb.level,MAX_LEVEL)||orb.level<1)return false;
        const oldMax=power(BASE_HP*scale,HP_GROWTH,orb.level-1);if(!bounded(orb.hp,oldMax*(1+1e-12))||orb.hp<=0)return false;
        if(orb.level>=FINAL_LEVEL){orb.level=FINAL_LEVEL;orb.hp=orbHp(FINAL_LEVEL,scale);orb.finalElapsed=0;}
        else orb.hp=Math.max(Number.MIN_VALUE,Math.min(1,orb.hp/oldMax)*orbHp(orb.level,scale));return true;};
      if(!Array.isArray(next.players)||!next.players.every(record)||!convert(next.sharedOrb,getCoopDifficulty(next).crewScale)||!next.players.every(p=>convert(p.orb)))return null;
    }
    if(oldBosses){
      const freshBoss=(orb,scale=1)=>{if(record(orb)&&boss(orb.level)){if(!bounded(orb.hp,orbHp(orb.level,scale)*(1+1e-12))||orb.hp<=0)return false;orb.hp=orbHp(orb.level,scale);delete orb.bossStartedAt;}return true;};
      if(!freshBoss(next.sharedOrb,getCoopDifficulty(next).crewScale)||!next.players.every(p=>freshBoss(p.orb)))return null;
    }
    if(record(next.lastRound)&&Array.isArray(next.lastRound.players)){
      if(next.lastRound.players.some(Array.isArray)){
        if(!Array.isArray(next.players)||!next.lastRound.players.every(row=>Array.isArray(row)&&row.length===4&&(text(row[0],100)||integer(row[0],next.players.length-1))))return null;
        next.lastRound.players=next.lastRound.players.map(([id,lrc,clicks,skillPoints])=>({id:typeof id==='number'?next.players[id].id:id,lrc,clicks,skillPoints}));
      }
      for(const p of next.lastRound.players)if(record(p)&&!Object.hasOwn(p,'skillPoints'))p.skillPoints=next.lastRound.skillPoints;
    }
    return validateState(next)?next:null;}catch{return null;}
}
