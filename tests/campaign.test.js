import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, reconcilePlayers, applyAction, advance, getOrb, getStats, getRoundDuration, validateState, migrateState, compactGameState, SKILLS, GENERATORS } from '../src/game.js';
import { SYSTEMS, FINAL_LEVEL, FINAL_HP, FINAL_MIN_SECONDS, VICTORY_PRESTIGE_REWARD, BOSS_DURATION, SECRET_HP, SECRET_DURATION, getCampaignLocation, getSystemHpMultiplier, resonanceFraction, fuelTarget } from '../src/campaign.js';
import { createFarm, CROPS, FARM_UPGRADES } from '../src/farm.js';

function setup(mode='scoreboard',size=1){const state=createGame({mode});for(let i=0;i<size;i++)addPlayer(state,{id:`p${i}`,name:`Pilot ${i}`});assert.equal(applyAction(state,'p0',{type:'start'}).ok,true);return state;}
/** Fill the ship so a placed jump-point core is reachable; Beam's fuel loop has its own tests. */
function refuel(state,p=state.players[0]){const level=(state.mode==='coop'?state.sharedOrb:p.orb).level;if(state.mode==='coop')state.sharedFuel=fuelTarget(level);else p.fuel=fuelTarget(level);}
function setFinal(state,p=state.players[0]){const orb=state.mode==='coop'?state.sharedOrb:p.orb;orb.level=FINAL_LEVEL;orb.finalElapsed=0;orb.hp=getOrb(p,state).maxHp;
  if(state.mode==='coop')for(const member of state.players)member.highestOrb=FINAL_LEVEL;else p.highestOrb=FINAL_LEVEL;refuel(state,p);return orb;}
function ready(state){for(const p of state.players.filter(p=>!p.bot)){if(state.phase==='intermission')assert.equal(applyAction(state,p.id,{type:'ready'}).ok,true);}}
function run(state,seconds){let left=seconds;while(left>0&&state.phase!=='victory'){ready(state);const elapsed=Math.min(left,state.remaining);advance(state,elapsed);left-=elapsed;}return seconds-left;}
function setCore(state,level,p=state.players[0]){const orb={level,hp:1};if(state.mode==='coop')state.sharedOrb=orb;else p.orb=orb;orb.hp=getOrb(p,state).maxHp;
  if(state.mode==='coop')for(const member of state.players)member.highestOrb=level;else p.highestOrb=level;refuel(state,p);return orb;}

test('ten solar systems have twenty named worlds each and a unique final Refract home',()=>{
  assert.equal(SYSTEMS.length,10);assert.equal(new Set(SYSTEMS.map(system=>system.id)).size,10);
  for(const [index,system]of SYSTEMS.entries()){
    assert.equal(system.planets.length,20);assert.equal(system.startLevel,index*20+1);assert.equal(system.endLevel,(index+1)*20);
    for(let level=system.startLevel;level<=system.endLevel;level++)assert.equal(getCampaignLocation(level).system.id,system.id);
  }
  assert.equal(getCampaignLocation(FINAL_LEVEL).final,true);assert.match(getCampaignLocation(FINAL_LEVEL).planetName,/Refract/);
  assert.equal(getSystemHpMultiplier(1),1);assert.equal(getSystemHpMultiplier(21),3);assert.equal(getSystemHpMultiplier(181),3**9);
});

test('core HP rises through every system boundary and astronomical final HP scales with the crew',()=>{
  const state=setup(),p=state.players[0];let previous=0;
  for(let level=1;level<=FINAL_LEVEL;level++){
    p.orb.level=level;p.highestOrb=level;const orb=getOrb(p,state);assert.ok(orb.maxHp>previous);previous=orb.maxHp;
    assert.equal(orb.systemIndex,Math.floor((level-1)/20));
  }
  assert.equal(getOrb(p,state).maxHp,FINAL_HP);assert.equal(getOrb(p,state).boss,false);
  const coop=setup('coop',3);setFinal(coop);assert.equal(getOrb(coop.players[0],coop).maxHp,FINAL_HP*2.7);
});

test('a colossal automatic attack stops at the untouched final core instead of skipping it',()=>{
  const state=setup(),p=state.players[0];setCore(state,FINAL_LEVEL-1);p.orbsDestroyed=FINAL_LEVEL-2;p.totalPrestige=Number.MAX_SAFE_INTEGER;p.generators={mote:1000,wormhole:1000,foamer:1000,star:1000};
  advance(state,1);assert.equal(p.orb.level,FINAL_LEVEL);assert.equal(p.orb.hp,FINAL_HP);assert.equal(p.orb.finalElapsed,0);
  assert.equal(p.orbsDestroyed,FINAL_LEVEL-1);assert.equal(state.phase,'round');assert.equal(validateState(state),true);
});

test('each system ends at a timed boss and excess damage stops at the next gate',()=>{
  const state=setup(),p=state.players[0];
  for(let level=1;level<FINAL_LEVEL;level++){
    setCore(state,level);const orb=getOrb(p,state);
    assert.equal(orb.boss,level%20===0,`Core ${level} is only a boss at its system boundary`);
  }
  setCore(state,19);p.orbsDestroyed=18;p.totalPrestige=Number.MAX_SAFE_INTEGER;p.generators={wormhole:1000,foamer:1000,star:1000};
  assert.equal(applyAction(state,p.id,{type:'click'}).ok,true);
  assert.equal(p.orb.level,20);assert.equal(p.orb.hp,getOrb(p,state).maxHp);assert.equal(Object.hasOwn(p.orb,'bossStartedAt'),false,'Arriving with excess damage does not start the attempt');
  assert.equal(applyAction(state,p.id,{type:'click'}).ok,true);
  assert.equal(p.orb.level,40,'Defeating the gate opens the next system');
  assert.equal(p.orb.hp,getOrb(p,state).maxHp,'Excess damage cannot chip the next gate');
  assert.equal(Object.hasOwn(p.orb,'bossStartedAt'),false);assert.equal(p.orbsDestroyed,39);assert.equal(validateState(state),true);
});

test('boss timeout restores full health, grants no kill, and waits for a new hit to retry',()=>{
  assert.equal(BOSS_DURATION,30);
  const state=setup(),p=state.players[0],orb=setCore(state,20),hp=orb.hp;
  assert.equal(applyAction(state,p.id,{type:'click'}).ok,true);assert.equal(orb.bossStartedAt,0);assert.ok(orb.hp<hp);
  advance(state,BOSS_DURATION-1);assert.ok(orb.hp<hp);assert.equal(getOrb(p,state).bossRemaining,1);
  advance(state,1);assert.equal(orb.hp,hp);assert.equal(Object.hasOwn(orb,'bossStartedAt'),false);assert.equal(orb.level,20);assert.equal(p.orbsDestroyed,0);
  advance(state,10);assert.equal(orb.hp,hp);assert.equal(Object.hasOwn(orb,'bossStartedAt'),false,'Idle time alone cannot restart the boss');
  assert.equal(applyAction(state,p.id,{type:'click'}).ok,true);assert.equal(orb.bossStartedAt,state.now);assert.ok(orb.hp<hp);assert.equal(getOrb(p,state).bossRemaining,BOSS_DURATION);assert.equal(validateState(state),true);
});

for(const mode of ['scoreboard','coop'])test(`${mode} boss clocks pause at intermission and survive saves and compact host handover`,()=>{
  const state=setup(mode,2),p=state.players[0];advance(state,55);setCore(state,20);
  assert.equal(applyAction(state,p.id,{type:'click'}).ok,true);advance(state,5);
  assert.equal(state.phase,'intermission');assert.equal(getOrb(p,state).bossRemaining,25);
  const paused=structuredClone(state);advance(state,1000);assert.deepEqual(state,paused);
  assert.deepEqual(migrateState(JSON.parse(JSON.stringify(state))),state);
  const restored=migrateState(compactGameState(state));assert.deepEqual(restored,state);
  ready(restored);advance(restored,24);assert.equal(getOrb(restored.players[0],restored).bossRemaining,1);
  advance(restored,1);const orb=getOrb(restored.players[0],restored);assert.equal(orb.hp,orb.maxHp);assert.equal(orb.bossActive,false);assert.equal(validateState(restored),true);
});

test('secret challenges require an active session, support leaving, and time out without changing campaign progress',()=>{
  assert.equal(SECRET_HP,1e9);assert.equal(SECRET_DURATION,30);
  const lobby=createGame();addPlayer(lobby,{id:'p0',name:'Pilot 0'});
  assert.equal(applyAction(lobby,'p0',{type:'startSecretChallenge'}).ok,false);
  const state=setup(),p=state.players[0],campaign=structuredClone(p.orb);
  assert.equal(applyAction(state,'stranger',{type:'startSecretChallenge'}).ok,false);
  assert.equal(applyAction(state,p.id,{type:'startSecretChallenge'}).ok,true);
  assert.deepEqual(p.secretOrb,{hp:SECRET_HP,startedAt:state.now});assert.equal(getOrb(p,state).secret,true);
  assert.equal(applyAction(state,p.id,{type:'startSecretChallenge'}).ok,false,'An active attempt cannot be restarted to refresh its timer');
  assert.equal(applyAction(state,p.id,{type:'click'}).ok,true);assert.ok(p.secretOrb.hp<SECRET_HP);assert.deepEqual(p.orb,campaign);
  advance(state,SECRET_DURATION-1);assert.ok(p.secretOrb);advance(state,1);assert.equal(p.secretOrb,null);assert.deepEqual(p.orb,campaign);assert.equal(p.farm.crops.weed,undefined);
  assert.equal(applyAction(state,p.id,{type:'startSecretChallenge'}).ok,true,'Failure leaves the challenge retryable');
  assert.equal(applyAction(state,p.id,{type:'leaveSecretChallenge'}).ok,true);assert.equal(p.secretOrb,null);assert.deepEqual(p.orb,campaign);
  advance(state,state.remaining);assert.equal(applyAction(state,p.id,{type:'startSecretChallenge'}).ok,true,'An attempt can be selected between rounds');assert.equal(validateState(state),true);
});

test('secret challenge timers pause between rounds and round-trip without resetting their deadline',()=>{
  const state=setup(),p=state.players[0];advance(state,55);assert.equal(applyAction(state,p.id,{type:'startSecretChallenge'}).ok,true);advance(state,5);
  assert.equal(getOrb(p,state).bossRemaining,25);
  const paused=structuredClone(state);advance(state,10000);assert.deepEqual(state,paused);
  const restored=migrateState(compactGameState(state));assert.deepEqual(restored,state);assert.deepEqual(migrateState(JSON.parse(JSON.stringify(state))),state);
  ready(restored);advance(restored,24);assert.equal(getOrb(restored.players[0],restored).bossRemaining,1);advance(restored,1);assert.equal(restored.players[0].secretOrb,null);
  assert.equal(restored.players[0].orbsDestroyed,0);assert.equal(restored.players[0].victories,0);assert.equal(validateState(restored),true);
});

test('a secret victory unlocks personal weed and farm access without advancing the co-op campaign or rewarding the crew',()=>{
  const state=setup('coop',2),[p,other]=state.players;setCore(state,21);const personal=structuredClone(p.orb);
  assert.equal(applyAction(state,p.id,{type:'startSecretChallenge'}).ok,true);
  const sharedBefore=structuredClone(state.sharedOrb);assert.equal(applyAction(state,p.id,{type:'click'}).ok,true);assert.deepEqual(state.sharedOrb,sharedBefore,'The challenger targets a separate core');
  const secretHp=p.secretOrb.hp;assert.equal(applyAction(state,other.id,{type:'click'}).ok,true);assert.ok(state.sharedOrb.hp<sharedBefore.hp);assert.equal(p.secretOrb.hp,secretHp,'Crew attacks remain on the campaign');
  const campaignBefore=structuredClone(state.sharedOrb),otherBefore=structuredClone(other),records={kills:p.orbsDestroyed,highest:p.highestOrb,victories:p.victories,lifetime:p.lifetimeLrc};
  p.totalPrestige=1e12;p.generators.mote=1;p.autoClock=.95;const passiveIncome=getStats(p,state).passiveRate*.1;advance(state,.1);
  assert.equal(p.secretOrb,null);assert.equal(p.farm.unlocked,true);assert.equal(p.farm.crops.weed,true);assert.deepEqual(p.orb,personal);assert.deepEqual(state.sharedOrb,campaignBefore);
  assert.equal(p.orbsDestroyed,records.kills);assert.equal(p.highestOrb,records.highest);assert.equal(p.victories,records.victories);
  assert.equal(p.lifetimeLrc,records.lifetime+passiveIncome,'The secret grants no orb-drop income');
  assert.equal(other.farm.crops.weed,undefined);assert.equal(other.highestOrb,otherBefore.highestOrb);assert.equal(other.victories,otherBefore.victories);
  assert.equal(applyAction(state,p.id,{type:'startSecretChallenge'}).ok,false,'An already unlocked secret cannot award again');assert.equal(validateState(state),true);
});

test('challenge snapshots reject fabricated health and clocks, and legacy boss saves start a fresh attempt',()=>{
  const state=setup(),p=state.players[0];advance(state,10);setCore(state,20);applyAction(state,p.id,{type:'click'});
  for(const startedAt of [-1,Infinity,state.now+1]){const bad=structuredClone(state);bad.players[0].orb.bossStartedAt=startedAt;assert.equal(migrateState(bad),null);}
  assert.equal(applyAction(state,p.id,{type:'startSecretChallenge'}).ok,true);
  for(const secretOrb of [{hp:SECRET_HP+1,startedAt:state.now},{hp:0,startedAt:state.now},{hp:SECRET_HP,startedAt:-1},{hp:SECRET_HP,startedAt:state.now+1}]){
    const bad=structuredClone(state);bad.players[0].secretOrb=secretOrb;assert.equal(migrateState(bad),null);
  }
  const legacy=structuredClone(state);legacy.campaignVersion=1;delete legacy.players[0].secretOrb;delete legacy.players[0].orb.bossStartedAt;
  const original=structuredClone(legacy),restored=migrateState(legacy);assert.ok(restored);assert.deepEqual(legacy,original);
  assert.equal(restored.players[0].secretOrb,null);assert.equal(restored.players[0].orb.hp,getOrb(restored.players[0],restored).maxHp);assert.equal(Object.hasOwn(restored.players[0].orb,'bossStartedAt'),false);
});

test('all eight extreme builds together cannot bypass three active hours at Crystal',()=>{
  const state=setup('coop',8);setFinal(state);
  for(const p of state.players){p.totalPrestige=1e12;p.generators=Object.fromEntries(GENERATORS.map(g=>[g.id,1000]));}
  run(state,FINAL_MIN_SECONDS-1);
  const orb=getOrb(state.players[0],state);assert.equal(orb.finalElapsed,FINAL_MIN_SECONDS-1);assert.equal(orb.finalRemaining,1);
  assert.ok(orb.hp>=orb.maxHp/FINAL_MIN_SECONDS*(1-1e-10));assert.notEqual(state.phase,'victory');assert.equal(validateState(state),true);
  const before=state.players.map(p=>({prestige:p.totalPrestige,available:p.prestigePoints}));
  run(state,1);assert.equal(state.phase,'victory');assert.equal(state.now,FINAL_MIN_SECONDS);assert.equal(state.sharedOrb.hp,0);
  for(const [index,p]of state.players.entries()){
    assert.equal(p.totalPrestige,before[index].prestige+VICTORY_PRESTIGE_REWARD);assert.equal(p.prestigePoints,before[index].available+VICTORY_PRESTIGE_REWARD);assert.equal(p.victories,1);
  }
  assert.equal(validateState(state),true);
});

test('intermissions, rejected clicks and snapshot restores do not age the final lattice',()=>{
  const state=setup(),p=state.players[0];setFinal(state);advance(state,60);assert.equal(p.orb.finalElapsed,60);
  const paused=structuredClone(state);advance(state,1e100);assert.deepEqual(state,paused);
  assert.equal(applyAction(state,p.id,{type:'click',finalElapsed:FINAL_MIN_SECONDS}).ok,false);assert.deepEqual(state,paused);
  const restored=migrateState(compactGameState(state));assert.deepEqual(restored,state);
  ready(restored);advance(restored,10);assert.equal(restored.players[0].orb.finalElapsed,70);
  for(const bad of [NaN,Infinity,-1,undefined]){const previous=structuredClone(restored);advance(restored,bad);assert.deepEqual(restored,previous);}
});

test('resonance converts modest hits without disappearing into floating point precision',()=>{
  const state=setup(),p=state.players[0],orb=setFinal(state);state.now=1000;orb.finalElapsed=1000;
  const previous=orb.hp,result=applyAction(state,p.id,{type:'click'});
  assert.equal(result.ok,true);assert.ok(orb.hp<previous);assert.ok(resonanceFraction(2)>0);assert.ok(resonanceFraction(1e150)<=.01);
  const floor=FINAL_HP*(1-1000/FINAL_MIN_SECONDS);
  p.totalPrestige=Number.MAX_SAFE_INTEGER;p.generators={wormhole:1000,foamer:1000,star:1000};
  for(let i=0;i<1000;i++){p.clickTokens=3;applyAction(state,p.id,{type:'click'});}
  assert.ok(orb.hp>=floor);assert.equal(orb.finalElapsed,1000);assert.equal(state.phase,'round');
});

test('final automatic resonance is stable across one long update and individual seconds',()=>{
  const state=setup(),p=state.players[0];setFinal(state);p.generators.mote=1;
  const split=structuredClone(state);advance(state,40);for(let i=0;i<40;i++)advance(split,1);
  assert.equal(state.players[0].orb.finalElapsed,split.players[0].orb.finalElapsed);
  assert.ok(Math.abs(state.players[0].orb.hp-split.players[0].orb.hp)/FINAL_HP<1e-12);
  assert.equal(state.players[0].autoClicks,split.players[0].autoClicks);
});

test('victory freezes every action and reward until the host starts a fresh journey',()=>{
  const state=setup('scoreboard',2),[p,other]=state.players,orb=setFinal(state);state.now=FINAL_MIN_SECONDS;orb.finalElapsed=FINAL_MIN_SECONDS;orb.hp=1;
  p.farm.unlocked=true;p.generators.mote=1;other.generators.mote=2;
  assert.equal(applyAction(state,p.id,{type:'click'}).ok,true);assert.equal(state.phase,'victory');assert.equal(p.victories,1);assert.equal(other.victories,1);
  const frozen=structuredClone(state);advance(state,100000);assert.deepEqual(state,frozen);
  for(const type of ['click','ready','prestige','resetProgress','start','buyGenerator','buySkill','buyFarmPlot','feedBeam']){assert.equal(applyAction(state,p.id,{type,id:'mote'}).ok,false);assert.deepEqual(state,frozen);}
  assert.equal(applyAction(state,other.id,{type:'newJourney'}).ok,false);assert.deepEqual(state,frozen);
  assert.deepEqual(migrateState(compactGameState(state)),state);
  assert.equal(applyAction(state,p.id,{type:'newJourney'}).ok,true);assert.equal(state.phase,'intermission');assert.equal(state.victory,null);
  for(const member of state.players){assert.equal(member.orb.level,1);assert.equal(member.victories,1);assert.equal(member.totalPrestige,100);assert.equal(member.ready,false);}
  assert.equal(p.generators.mote,1);assert.equal(other.generators.mote,2);assert.equal(p.farm.unlocked,true);
  assert.equal(applyAction(state,p.id,{type:'newJourney'}).ok,false);assert.equal(validateState(state),true);
});

test('co-op roster changes preserve final percentage, elapsed time and frozen victory',()=>{
  const state=setup('coop',2),p=state.players[0];setFinal(state);state.now=5400;state.sharedOrb.finalElapsed=5400;state.sharedOrb.hp=getOrb(p,state).maxHp*.7;
  reconcilePlayers(state,[{id:'p0',name:'Pilot 0'}]);assert.ok(Math.abs(state.sharedOrb.hp/FINAL_HP-.7)<1e-12);assert.equal(state.sharedOrb.finalElapsed,5400);
  addPlayer(state,{id:'p2',name:'Pilot 2'});assert.ok(Math.abs(state.sharedOrb.hp/getOrb(p,state).maxHp-.7)<1e-12);
  state.now=FINAL_MIN_SECONDS;state.sharedOrb.finalElapsed=FINAL_MIN_SECONDS;state.sharedOrb.hp=1;applyAction(state,p.id,{type:'click'});
  reconcilePlayers(state,[{id:'p2',name:'Pilot 2'}]);assert.equal(state.sharedOrb.hp,0);assert.equal(validateState(state),true);
  assert.equal(applyAction(state,'p2',{type:'newJourney'}).ok,true);assert.equal(state.sharedOrb.hp,2000);
});

test('a winning pilot can leave and rejoin a frozen scoreboard without replaying rewards',()=>{
  const state=setup('scoreboard',2),p=state.players[0],orb=setFinal(state);state.now=FINAL_MIN_SECONDS;orb.finalElapsed=FINAL_MIN_SECONDS;orb.hp=1;
  applyAction(state,p.id,{type:'click'});reconcilePlayers(state,[{id:'p1',name:'Pilot 1'}]);assert.equal(validateState(state),true);
  const returned=addPlayer(state,{id:'p0',name:'Pilot 0'});assert.equal(returned.orb.hp,0);assert.equal(returned.prestigePoints,0);
  assert.equal(state.players[0].prestigePoints,100);assert.equal(validateState(state),true);
  assert.deepEqual(migrateState(compactGameState(state)),state);
});

test('legacy saves preserve core health percentage and move beyond-route saves to a fresh final lattice',()=>{
  const state=setup(),p=state.players[0];delete state.campaignVersion;delete state.victory;delete p.victories;
  p.orb={level:41,hp:2000*1.18**40*.4};p.highestOrb=41;
  const original=structuredClone(state),migrated=migrateState(state);assert.ok(migrated);assert.deepEqual(state,original);
  const orb=getOrb(migrated.players[0],migrated);assert.ok(Math.abs(orb.hp/orb.maxHp-.4)<1e-12);assert.equal(migrated.players[0].victories,0);
  p.orb={level:300,hp:2000*1.18**299*.2};p.highestOrb=300;
  const capped=migrateState(state);assert.ok(capped);assert.deepEqual(capped.players[0].orb,{level:FINAL_LEVEL,hp:FINAL_HP,finalElapsed:0});assert.equal(capped.players[0].highestOrb,300);
  assert.equal(capped.victory,null);assert.equal(capped.players[0].prestigePoints,0);
});

test('snapshot validation rejects impossible final clocks, under-floor health and fabricated victories',()=>{
  const state=setup();setFinal(state);
  for(const mutate of [
    s=>{s.players[0].orb.finalElapsed=1;},s=>{s.players[0].orb.finalElapsed=Infinity;},s=>{s.players[0].orb.hp=FINAL_HP*.99;},
    s=>{s.players[0].orb.hp=0;},s=>{s.players[0].orb.level=201;},s=>{s.phase='victory';s.victory={playerId:'p0',at:0};s.remaining=0;},
    s=>{s.victory={playerId:'p0',at:0};},s=>{s.roundDuration=181;},s=>{s.roundDuration=59;},
  ]){const bad=structuredClone(state);mutate(bad);assert.equal(validateState(bad),false);assert.equal(migrateState(bad),null);}
  for(const mutate of [
    s=>{s.players[0].generators='mote:1,mote:2';},s=>{s.players[0].generators='constructor:1';},s=>{s.players[0].generators='mote:1001';},
    s=>{s.players[0].orb.push(0);},s=>{s.players[0].orb=[200,FINAL_HP];},s=>{s.sharedOrb=[1,2000,1];},
  ]){const bad=compactGameState(state);mutate(bad);assert.equal(migrateState(bad),null);}
});

test('round extension uses the strongest human research and locks the common clock until next round',()=>{
  const extension=SKILLS.find(skill=>skill.effects.roundSeconds);assert.ok(extension,'Round extension research exists');
  const state=createGame();const a=addPlayer(state,{id:'a',name:'A'}),b=addPlayer(state,{id:'b',name:'B'}),bot=addPlayer(state,{id:'bot',name:'Bot',bot:true});
  a.skills[extension.id]=1;b.skills[extension.id]=2;bot.skills[extension.id]=extension.maxRank;
  const expected=Math.min(180,60+extension.effects.roundSeconds*2);assert.equal(getRoundDuration(state),expected);
  applyAction(state,a.id,{type:'start'});assert.equal(state.remaining,expected);assert.equal(state.roundDuration,expected);
  assert.equal(getStats(b,state).roundBonusSeconds,extension.effects.roundSeconds*2);
  b.skills[extension.id]=extension.maxRank;assert.equal(state.roundDuration,expected);
  advance(state,expected-10);assert.equal(state.remaining,10);assert.equal(getStats(a,state).surge,true);
  advance(state,10);assert.equal(state.phase,'intermission');assert.equal(a.completedRounds,1);assert.ok(a.skillPoints<=10);
  ready(state);assert.equal(state.roundDuration,getRoundDuration(state));assert.equal(validateState(state),true);
});

test('eight complete endgame builds and the frozen victory still fit the compact relay envelope',()=>{
  const state=createGame({mode:'coop'});
  for(let index=0;index<8;index++){
    const p=addPlayer(state,{id:`${index}${'x'.repeat(99)}`,name:'界'.repeat(40)});
    p.skills=Object.fromEntries(SKILLS.map(skill=>[skill.id,skill.maxRank]));p.generators=Object.fromEntries(GENERATORS.map(g=>[g.id,1000]));
    p.totalPrestige=1000;p.highestOrb=200;p.completedRounds=1000;p.prestigeCount=10;
    p.arsenalClock=[.12345678901234567,.23456789012345678,.34567890123456789,.4567890123456789];
    p.arsenalShots=[123456789012345,234567890123456,345678901234567,456789012345678];p.autoClicks=Number.MAX_SAFE_INTEGER;
    p.farm={...createFarm(),unlocked:true,plots:Array.from({length:6},()=>({crop:'pumpkin',progress:.12345678901234567,water:.75,fertilised:true})),
      crops:Object.fromEntries(CROPS.map(crop=>[crop.id,true])),inventory:Object.fromEntries(CROPS.map(crop=>[crop.id,999999])),
      upgrades:Object.fromEntries(FARM_UPGRADES.map(upgrade=>[upgrade.id,3])),fedSeconds:299.1234567890123,meals:Number.MAX_SAFE_INTEGER};
  }
  applyAction(state,state.players[0].id,{type:'start'});assert.equal(state.roundDuration,180);
  setFinal(state);state.now=FINAL_MIN_SECONDS-1;state.sharedOrb.finalElapsed=FINAL_MIN_SECONDS-1;state.sharedOrb.hp=getOrb(state.players[0],state).maxHp/FINAL_MIN_SECONDS;
  assert.equal(validateState(state),true);
  advance(state,1);assert.equal(state.phase,'victory');
  const compact=compactGameState(state),bytes=Buffer.byteLength(JSON.stringify(compact));assert.ok(bytes<15000,`Endgame relay uses ${bytes} bytes`);
  assert.deepEqual(migrateState(compact),state);assert.equal(validateState(state),true);
});
