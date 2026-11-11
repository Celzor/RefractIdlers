import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, applyAction, advance, getStats, getBalance, getFuel, getShipStatus, validateState, migrateState, compactGameState, SKILLS, GENERATORS, generatorQuote, generatorAvailability, skillAvailability } from '../src/game.js';
import { FUEL_TARGETS } from '../src/campaign.js';
import { createFarm, emptyPlot, CROPS, FARM_UPGRADES, MAX_PLOTS, WATER_SECONDS, COOKED_SECONDS, COOKED_SCORE_MULTIPLIER, advanceFarm, packFarm, unpackFarm, migrateFarm, validateFarm, getFarmUnlocked, getFarmStats, farmPlotCost, farmUpgradeCost, farmCropCost, farmSeedCost } from '../src/farm.js';

function setup(mode='scoreboard',players=1) {
  const state=createGame({mode});
  for(let i=0;i<players;i++)addPlayer(state,{id:`p${i}`,name:`Pilot ${i}`});
  applyAction(state,'p0',{type:'start'});
  return state;
}
function fund(state,amount=100000000) {
  for(const player of state.players)player.lrc=player.runLrc=player.lifetimeLrc=amount;
  if(state.mode==='coop')state.sharedLrc=amount;
}
function action(state,details,id='p0') {
  const result=applyAction(state,id,details);
  assert.equal(result.ok,true,result.reason);
  return result;
}
/** Grants the Garden licence the way research does: the Outfitting rank plus the garden's own flag. */
function unlock(state,id='p0') { const p=state.players.find(player=>player.id===id);p.skills.ki1=1;p.farm.unlocked=true; }
const rejected=(state,details,id='p0')=>{const before=structuredClone(state);assert.equal(applyAction(state,id,details).ok,false,`${details.type} should be rejected`);assert.deepEqual(state,before,`${details.type} must not change state`);};

test('the Garden licence is Outfitting research; an orb farm machine alone no longer opens the garden',()=>{
  const state=setup(),p=state.players[0];fund(state);
  action(state,{type:'buyGenerator',id:'satellite'});
  assert.equal(getFarmUnlocked(p),false,'Buying the orb farm machine does not open the garden');
  rejected(state,{type:'plantCrop',plot:0,crop:'carrot'});
  const licence=SKILLS.find(skill=>skill.key==='garden-licence');assert.equal(licence.id,'ki1');assert.equal(licence.maxRank,1);
  assert.equal(applyAction(state,p.id,{type:'buySkill',id:'ki1'}).ok,false,'Research opens between rounds');
  advance(state,60);p.skillPoints=10;
  assert.match(skillAvailability(p,'ki1',state).reason,/Ready/);
  action(state,{type:'buySkill',id:'ki1'});
  assert.equal(p.farm.unlocked,true);assert.equal(getFarmUnlocked(p),true);assert.equal(p.skillPoints,8);
  assert.equal(applyAction(state,p.id,{type:'buySkill',id:'ki1'}).ok,false,'A licence has a single rank');
  for(const [id,gate] of [['ki2','wormhole'],['ki3','mouse']]){
    assert.match(generatorAvailability(p,gate,state).reason,/licence/i,`${gate} waits for its catalogue licence`);
    p.highestOrb=10;p.completedRounds=4;action(state,{type:'buySkill',id});
    assert.doesNotMatch(generatorAvailability(p,gate,state).reason,/licence/i);
  }
  assert.equal(validateState(state),true);
  const packed=compactGameState(state),restored=migrateState(structuredClone(packed));
  assert.deepEqual(restored.players[0].skills,{ki1:1,ki2:1,ki3:1},'Licences survive the packed save format');
});

test('the Garden licence opens a complete plant, water, harvest and feed loop',()=>{
  const state=setup(),p=state.players[0];fund(state);
  assert.equal(getFarmUnlocked(p),false);
  rejected(state,{type:'plantCrop',plot:0,crop:'carrot'});
  unlock(state);assert.equal(getFarmUnlocked(p),true);
  action(state,{type:'plantCrop',plot:0,crop:'carrot'});
  assert.deepEqual(p.farm.plots[0],{crop:'carrot',progress:0,water:1,fertilised:false},'A fresh planting starts watered and unfertilised');
  advance(state,15);assert.equal(p.farm.plots[0].progress,.5);assert.equal(p.farm.plots[0].water,.25);
  assert.equal(applyAction(state,p.id,{type:'harvestCrop',plot:0}).ok,false);
  action(state,{type:'waterCrop',plot:0});assert.equal(p.farm.plots[0].water,1);
  advance(state,15);assert.equal(p.farm.plots[0].progress,1);
  assert.equal(action(state,{type:'harvestCrop',plot:0}).quantity,1);
  assert.deepEqual(p.farm.plots[0],emptyPlot());
  const before=getStats(p,state);
  action(state,{type:'feedBeam',crop:'carrot'});
  assert.equal(p.farm.inventory.carrot,0);assert.equal(p.farm.meals,1);assert.equal(p.farm.fedSeconds,30);
  const after=getStats(p,state);
  assert.equal(after.clickDamage,before.clickDamage*1.25);assert.equal(after.passiveRate,before.passiveRate*1.25);
  advance(state,30);assert.equal(p.farm.fedSeconds,0);
  assert.equal(validateState(state),true);
});

test('dry beds stop growing until watered; fertilising a planting speeds it up and adds a vegetable',()=>{
  const state=setup(),p=state.players[0];fund(state);unlock(state);
  action(state,{type:'plantCrop',plot:0,crop:'carrot'});
  rejected(state,{type:'waterCrop',plot:0});
  advance(state,WATER_SECONDS);
  assert.ok(Math.abs(p.farm.plots[0].progress-2/3)<1e-12);assert.equal(p.farm.plots[0].water,0);
  advance(state,10);assert.ok(Math.abs(p.farm.plots[0].progress-2/3)<1e-12,'A dry bed makes no progress');
  action(state,{type:'waterCrop',plot:0});advance(state,10);assert.equal(p.farm.plots[0].progress,1);
  rejected(state,{type:'waterCrop',plot:0});rejected(state,{type:'fertiliseCrop',plot:0});
  assert.equal(action(state,{type:'harvestCrop',plot:0}).quantity,1,'Unfertilised beds give the base yield');
  rejected(state,{type:'waterCrop',plot:0});rejected(state,{type:'fertiliseCrop',plot:0});rejected(state,{type:'fertiliseCrop',plot:1});
  action(state,{type:'plantCrop',plot:0,crop:'carrot'});
  action(state,{type:'fertiliseCrop',plot:0});assert.equal(p.farm.plots[0].fertilised,true);
  rejected(state,{type:'fertiliseCrop',plot:0});
  advance(state,20);assert.equal(p.farm.plots[0].progress,1,'Fertilised beds grow 50% faster');
  assert.equal(action(state,{type:'harvestCrop',plot:0}).quantity,2,'Fertilised beds yield one extra vegetable');
  assert.equal(validateState(state),true);
});

test('hydroponics waters, tractors fertilise and picker bots harvest then buy replacement seeds from the right wallet',()=>{
  for(const mode of ['scoreboard','coop']){
    const state=setup(mode),p=state.players[0];fund(state);unlock(state);
    action(state,{type:'buyFarmUpgrade',id:'hydroponics'});
    action(state,{type:'plantCrop',plot:0,crop:'carrot'});advance(state,24);
    assert.equal(p.farm.plots[0].progress,1);assert.equal(p.farm.plots[0].water,1,'Hydroponics keeps the soil wet');
    rejected(state,{type:'waterCrop',plot:0});
    action(state,{type:'harvestCrop',plot:0});
    action(state,{type:'buyFarmUpgrade',id:'tractor'});action(state,{type:'plantCrop',plot:0,crop:'carrot'});
    advance(state,7.5);assert.equal(p.farm.plots[0].fertilised,false);assert.equal(p.farm.tractorClock,7.5);
    advance(state,.5);assert.equal(p.farm.plots[0].fertilised,true,'The tractor fertilises on its 8-second cycle');assert.equal(p.farm.tractorClock,0);
    action(state,{type:'buyFarmUpgrade',id:'picker'});p.farm.plots[0].progress=1;
    const before=getBalance(p,state),income=getStats(p,state).passiveRate*6;
    advance(state,6);
    assert.equal(p.farm.inventory.carrot,3,'The bot adds two vegetables to the earlier manual harvest');
    assert.deepEqual(p.farm.plots[0],{crop:'carrot',progress:0,water:1,fertilised:false},'The bot replants the same seed');
    assert.ok(Math.abs(getBalance(p,state)-(before+income-100))<1e-6,'Replacement seeds are paid from the active wallet');
    p.farm.inventory.carrot=999999;p.farm.plots[0].progress=1;advance(state,6);
    assert.equal(p.farm.plots[0].progress,1,'A full pantry leaves the bed ripe');
    p.farm.inventory.carrot=0;if(mode==='coop')state.sharedLrc=0;else p.lrc=0;
    advance(state,6);
    assert.equal(p.farm.inventory.carrot,1);assert.deepEqual(p.farm.plots[0],emptyPlot(),'Without seed money the bot only harvests the unfertilised bed');
    assert.equal(validateState(state),true);
  }
});

test('automation is independent of how the host slices elapsed time',()=>{
  const state=setup(),p=state.players[0];fund(state);unlock(state);
  for(const id of ['hydroponics','tractor','picker'])action(state,{type:'buyFarmUpgrade',id});
  action(state,{type:'buyFarmPlot'});action(state,{type:'plantCrop',plot:0,crop:'carrot'});action(state,{type:'plantCrop',plot:1,crop:'carrot'});
  const sliced=structuredClone(state);advance(state,30);
  for(let i=0;i<120;i++)advance(sliced,.25);
  assert.deepEqual(p.farm.inventory,sliced.players[0].farm.inventory);
  assert.equal(p.farm.plots.map(plot=>`${plot.crop}:${plot.fertilised}`).join(),sliced.players[0].farm.plots.map(plot=>`${plot.crop}:${plot.fertilised}`).join());
  for(let i=0;i<2;i++)assert.ok(Math.abs(p.farm.plots[i].progress-sliced.players[0].farm.plots[i].progress)<1e-9);
  assert.ok(Math.abs(p.farm.tractorClock-sliced.players[0].farm.tractorClock)<1e-9);assert.ok(Math.abs(p.farm.pickerClock-sliced.players[0].farm.pickerClock)<1e-9);
  assert.ok(p.farm.inventory.carrot>=2,'Thirty automated seconds harvest at least one full cycle');
});

test('farm costs, crop unlocks and visible equipment levels are bounded atomic purchases',()=>{
  const state=setup(),p=state.players[0];fund(state);unlock(state);
  for(const crop of CROPS.slice(1).filter(crop=>!crop.secret))action(state,{type:'unlockCrop',id:crop.id});
  for(let i=1;i<MAX_PLOTS;i++){
    const before=p.lrc,cost=farmPlotCost(p);action(state,{type:'buyFarmPlot'});assert.equal(p.lrc,before-cost);
  }
  assert.equal(p.farm.plots.length,6);
  assert.equal(applyAction(state,p.id,{type:'buyFarmPlot'}).ok,false);
  for(const upgrade of FARM_UPGRADES){
    for(let level=1;level<=3;level++){
      const before=p.lrc,cost=farmUpgradeCost(p,upgrade.id);
      action(state,{type:'buyFarmUpgrade',id:upgrade.id});
      assert.equal(p.farm.upgrades[upgrade.id],level);assert.equal(p.lrc,before-cost);
    }
    assert.equal(applyAction(state,p.id,{type:'buyFarmUpgrade',id:upgrade.id}).ok,false);
  }
  const stats=getFarmStats(p);
  assert.equal(stats.growthRate,2.5);assert.equal(stats.yield,1);assert.equal(stats.autoWater,true);
  assert.ok(Math.abs(stats.tractorPeriod-8/3)<1e-12);assert.equal(stats.pickerPeriod,2);
  action(state,{type:'plantCrop',plot:5,crop:'pumpkin'});advance(state,40);
  assert.equal(p.farm.inventory.pumpkin,2,'A fully equipped bed is fertilised, ripened and picked within 40 seconds');
  assert.equal(p.farm.plots[5].crop,'pumpkin');assert.ok(p.farm.plots[5].progress>0&&p.farm.plots[5].progress<1,'The picked bed is growing again');
  assert.equal(validateState(state),true);
});

test('every planting charges discounted seed prices from the correct wallet and failed plants are atomic',()=>{
  for(const mode of ['scoreboard','coop'])for(const crop of CROPS){
    const state=setup(mode),p=state.players[0];fund(state);unlock(state);p.farm.crops[crop.id]=true;
    const discount=SKILLS.find(skill=>skill.effects.farmDiscount);p.skills[discount.id]=1;
    const cost=farmSeedCost(p,crop.id);assert.equal(cost,Math.ceil(crop.seedCost*(1-getFarmStats(p).discount)));
    let before=getBalance(p,state);action(state,{type:'plantCrop',plot:0,crop:crop.id});assert.equal(getBalance(p,state),before-cost);
    const occupied=structuredClone(state);assert.equal(applyAction(state,p.id,{type:'plantCrop',plot:0,crop:crop.id}).ok,false);assert.deepEqual(state,occupied);
    p.farm.plots[0].progress=1;action(state,{type:'harvestCrop',plot:0});
    before=getBalance(p,state);action(state,{type:'plantCrop',plot:0,crop:crop.id});assert.equal(getBalance(p,state),before-cost,'Planting the same unlocked crop charges seeds again');
    p.farm.plots[0].progress=1;action(state,{type:'harvestCrop',plot:0});
    if(mode==='coop')state.sharedLrc=cost-1;else p.lrc=cost-1;
    const poor=structuredClone(state);assert.equal(applyAction(state,p.id,{type:'plantCrop',plot:0,crop:crop.id}).ok,false);assert.deepEqual(state,poor);
    assert.equal(validateState(state),true);
  }
});

test('co-op garden spending uses the shared bank while beds, meals and bonuses stay personal',()=>{
  const state=setup('coop',2),[a,b]=state.players;fund(state,100000);unlock(state,'p1');
  const wallet=b.lrc,before=state.sharedLrc;
  action(state,{type:'buyFarmPlot'},'p1');assert.equal(state.sharedLrc,before-12000);assert.equal(b.lrc,wallet);
  assert.equal(a.farm.plots.length,1);assert.equal(b.farm.plots.length,2);
  b.farm.inventory.carrot=1;action(state,{type:'feedBeam',crop:'carrot'},'p1');
  assert.equal(getStats(a,state).beamBonus,0);assert.equal(getStats(b,state).beamBonus,.25);
  state.sharedLrc=0;const snapshot=structuredClone(state);
  assert.equal(applyAction(state,b.id,{type:'buyFarmUpgrade',id:'growLights'}).ok,false);
  assert.deepEqual(state,snapshot);assert.equal(validateState(state),true);
});

test('farm controls reject malformed ids, occupied beds, duplicate harvests and stale round requests',()=>{
  const state=setup(),p=state.players[0];fund(state);unlock(state);action(state,{type:'buyFarmUpgrade',id:'hydroponics'});
  for(const details of [
    {type:'unlockCrop',id:'__proto__'}, {type:'buyFarmUpgrade',id:'constructor'}, {type:'buyFarmUpgrade',id:'fertiliser'},
    {type:'plantCrop',plot:-1,crop:'carrot'}, {type:'plantCrop',plot:'0',crop:'carrot'},
    {type:'plantCrop',plot:1,crop:'carrot'}, {type:'plantCrop',plot:0,crop:'pumpkin'},
    {type:'waterCrop',plot:0}, {type:'fertiliseCrop',plot:0}, {type:'waterCrop',plot:'0'}, {type:'fertiliseCrop',plot:6},
    {type:'feedBeam',crop:'carrot'}, {type:'buyFarmPlot',round:0},
  ])rejected(state,details);
  action(state,{type:'plantCrop',plot:0,crop:'carrot'});
  assert.equal(applyAction(state,p.id,{type:'plantCrop',plot:0,crop:'carrot'}).ok,false);
  advance(state,30);action(state,{type:'harvestCrop',plot:0});
  rejected(state,{type:'harvestCrop',plot:0});
});

test('growth, chores and meal timers pause between rounds; a full Beam does not consume vegetables',()=>{
  const state=setup(),p=state.players[0];fund(state);unlock(state);
  action(state,{type:'unlockCrop',id:'pumpkin'});action(state,{type:'buyFarmUpgrade',id:'tractor'});action(state,{type:'plantCrop',plot:0,crop:'pumpkin'});
  p.farm.inventory.carrot=20;
  for(let i=0;i<10;i++)action(state,{type:'feedBeam',crop:'carrot'});
  assert.equal(p.farm.fedSeconds,300);
  const full=structuredClone(state);assert.equal(applyAction(state,p.id,{type:'feedBeam',crop:'carrot'}).ok,false);assert.deepEqual(state,full);
  advance(state,60);assert.equal(state.phase,'intermission');assert.equal(p.farm.plots[0].fertilised,true);
  const paused=structuredClone(p.farm);advance(state,600);assert.deepEqual(p.farm,paused);
  action(state,{type:'waterCrop',plot:0});assert.equal(p.farm.plots[0].water,1,'Chores are allowed between rounds');
  action(state,{type:'ready'});advance(state,30);assert.ok(p.farm.plots[0].progress>paused.plots[0].progress);
});

test('secret weed seeds cannot be bought and unlock a paid planting and harvest loop',()=>{
  const state=setup(),p=state.players[0];fund(state);unlock(state);
  assert.equal(farmCropCost(p,'weed'),Infinity);
  rejected(state,{type:'unlockCrop',id:'weed'});
  rejected(state,{type:'plantCrop',plot:0,crop:'weed'});
  rejected(state,{type:'feedBeam',crop:'weed'});
  p.farm.crops.weed=true;
  for(const id of ['hydroponics','growLights'])for(let i=0;i<3;i++)action(state,{type:'buyFarmUpgrade',id});
  const before=p.lrc;action(state,{type:'plantCrop',plot:0,crop:'weed'});
  assert.equal(before-p.lrc,4200,'Every planting charges the secret seed price');
  assert.equal(CROPS.find(crop=>crop.id==='weed').growTime,120);
  advance(state,48);assert.equal(p.farm.plots[0].progress,1);
  action(state,{type:'harvestCrop',plot:0});assert.equal(p.farm.inventory.weed,1);
  assert.equal(validateState(state),true);
});

test('weed cooks Beam for exactly 260 active seconds independently of normal meals',()=>{
  const state=setup(),p=state.players[0];fund(state);unlock(state);p.farm.crops.weed=true;p.farm.inventory.weed=3;
  p.farm.fedSeconds=300;
  for(const skill of SKILLS.filter(skill=>skill.effects.mealDuration))p.skills[skill.id]=skill.maxRank;
  action(state,{type:'feedBeam',crop:'weed'});
  assert.equal(p.farm.cookedSeconds,COOKED_SECONDS);
  assert.equal(p.farm.fedSeconds,300,'Weed neither consumes nor extends the normal meal bonus');
  assert.equal(p.farm.inventory.weed,2);
  assert.equal(getFarmStats(p).scoreMultiplier,COOKED_SCORE_MULTIPLIER);
  rejected(state,{type:'feedBeam',crop:'weed'});
  advance(state,60);assert.equal(p.farm.cookedSeconds,200);
  const paused=structuredClone(p.farm);advance(state,600);assert.deepEqual(p.farm,paused);
  action(state,{type:'feedBeam',crop:'weed'});assert.equal(p.farm.cookedSeconds,260,'Feeding again refreshes rather than stacks time');
  assert.equal(p.farm.inventory.weed,1);
  p.farm.inventory.carrot=1;action(state,{type:'feedBeam',crop:'carrot'});
  assert.equal(p.farm.cookedSeconds,260,'Normal food does not change cooked time');
  for(let i=0;i<4;i++){action(state,{type:'ready'});advance(state,60);}
  action(state,{type:'ready'});advance(state,20);
  assert.equal(p.farm.cookedSeconds,0);assert.equal(getFarmStats(p).scoreMultiplier,1);
  assert.equal(validateState(state),true);
});

test('cooked expiry splits earned income at the boundary without changing damage or multiplying old scores',()=>{
  for(const mode of ['scoreboard','coop']){
    const state=setup(mode),p=state.players[0];fund(state);unlock(state);
    action(state,{type:'buyGenerator',id:'satellite'});// 90 LRC/s on top of the 1 LRC/s base
    p.generators.mote=1;p.farm.crops.weed=true;p.farm.inventory.weed=1;
    const damage=getStats(p,state).clickDamage,score=p.lifetimeLrc;
    action(state,{type:'feedBeam',crop:'weed'});
    assert.equal(getStats(p,state).clickDamage,damage);
    assert.equal(p.lifetimeLrc,score,'Feeding leaves existing score untouched');
    p.farm.cookedSeconds=10;
    const sliced=structuredClone(state);advance(state,20);for(let i=0;i<20;i++)advance(sliced,1);
    for(const key of ['lrc','runLrc','lifetimeLrc','roundLrc'])assert.ok(Math.abs(p[key]-sliced.players[0][key])<1e-6,`${key} is stable across catch-up slicing`);
    assert.ok(Math.abs(state.sharedLrc-sliced.sharedLrc)<1e-6);
    assert.equal(p.roundLrc,4732,'Ten seconds at 4.2× plus ten seconds at the base 91 LRC/s');
    assert.deepEqual(p.orb,sliced.players[0].orb,'Damage stays independent of the score boost');
    assert.deepEqual(p.farm,sliced.players[0].farm);
    assert.equal(p.farm.cookedSeconds,0);assert.equal(validateState(state),true);
  }
});

test('weed unlock persists through prestige while produce, cooked time and full-reset records clear',()=>{
  const state=setup(),p=state.players[0];fund(state);unlock(state);p.farm.crops.weed=true;p.farm.inventory.weed=2;
  action(state,{type:'feedBeam',crop:'weed'});advance(state,60);action(state,{type:'prestige'});
  assert.equal(p.farm.crops.weed,true);assert.equal(p.farm.cookedSeconds,0);assert.deepEqual(p.farm.inventory,{});
  action(state,{type:'resetProgress'});assert.deepEqual(state.players[0].farm,createFarm());
});

test('cooked gardens round-trip with secret crops and accept old named and packed saves',()=>{
  const farm={...createFarm(),unlocked:true,crops:{carrot:true,weed:true},inventory:{weed:7},cookedSeconds:123.456789};
  assert.deepEqual(unpackFarm(packFarm(farm)),farm);
  const olderNamed={...createFarm()};delete olderNamed.cookedSeconds;
  assert.deepEqual(migrateFarm(olderNamed),createFarm());
  const olderPacked=packFarm(createFarm()).slice(0,9);olderPacked[3]=olderPacked[3].slice(0,4);
  assert.deepEqual(unpackFarm(olderPacked),createFarm());
  for(const cookedSeconds of [-1,261,Infinity,NaN]){
    const bad={...farm,cookedSeconds};assert.equal(validateFarm(bad),false);assert.equal(unpackFarm(packFarm(bad)),null);
  }
  assert.equal(validateFarm({...farm,crops:{carrot:true},inventory:{}}),false,'Cooked time requires the secret unlock');
  const hydrated={farm:{...createFarm(),unlocked:true,crops:{carrot:true,weed:true},upgrades:{hydroponics:1},plots:[{crop:'weed',progress:0,water:1,fertilised:false}]}};
  advanceFarm(hydrated,96);assert.equal(hydrated.farm.plots[0].progress,1,'Hydroponics supports long catch-up without a false water cap');
});

test('Beam’s meals fuel the ship: every jump-point core is unreachable until the tank is full, then the jump empties it',()=>{
  for(const mode of ['scoreboard','coop']){
    const state=setup(mode),p=state.players[0];fund(state);unlock(state);
    const orb=mode==='coop'?state.sharedOrb:p.orb;orb.level=20;orb.hp=1;p.highestOrb=20;
    assert.deepEqual(getShipStatus(p,state),{fuel:0,target:FUEL_TARGETS[0],full:false,jumpPoint:true,grounded:true,systemIndex:0,transit:false,flyer:null,launchReady:false});
    p.clickTokens=3;const grounded=action(state,{type:'click'});
    assert.equal(grounded.kills,0);assert.equal(orb.level,20);assert.equal(orb.hp,1,'An unfuelled ship cannot reach the boss planet');
    assert.equal(Object.hasOwn(orb,'bossStartedAt'),false,'The boss timer does not start while grounded');
    p.farm.inventory.carrot=4;
    for(let i=0;i<4;i++)action(state,{type:'feedBeam',crop:'carrot'});
    assert.equal(getFuel(p,state),120,'Four carrots fill the first system’s 120-unit tank');
    assert.equal(getShipStatus(p,state).grounded,false);
    p.farm.inventory.carrot=1;const before=p.farm.fedSeconds;action(state,{type:'feedBeam',crop:'carrot'});
    assert.equal(getFuel(p,state),120,'A full tank holds no more');assert.equal(p.farm.fedSeconds,before+30,'Food still feeds Beam');
    p.clickTokens=3;const jump=action(state,{type:'click'});
    assert.equal(jump.kills,1);assert.equal(jump.transit,true);assert.equal(orb.level,20,'The shattered jump point becomes a launch pad');
    assert.equal(getFuel(p,state),120,'Launching, not shattering, spends the tank');assert.equal(getShipStatus(p,state).launchReady,true);
    const crash=action(state,{type:'completeJump',arrived:false});
    assert.equal(crash.arrived,false);assert.equal(getFuel(p,state),60,'Three meteorite hits cost half the tank');assert.equal(orb.level,20);
    assert.equal(getShipStatus(p,state).launchReady,false);assert.equal(getShipStatus(p,state).grounded,true);
    rejected(state,{type:'completeJump',arrived:true});
    p.farm.inventory.carrot=2;for(let i=0;i<2;i++)action(state,{type:'feedBeam',crop:'carrot'});
    assert.equal(getFuel(p,state),120,'Feeding Beam refuels for another attempt');
    assert.equal(action(state,{type:'completeJump',arrived:true}).arrived,true);
    assert.equal(orb.level,21);assert.equal(getFuel(p,state),0,'Arriving in the next system burns the whole tank');
    assert.equal(getShipStatus(p,state).target,FUEL_TARGETS[1]);assert.equal(validateState(state),true);
  }
});

test('a full Beam turns extra meals straight into fuel; a full Beam and a full tank refuse food',()=>{
  const state=setup(),p=state.players[0];fund(state);unlock(state);p.farm.fedSeconds=300;p.farm.inventory.carrot=6;
  const meal=action(state,{type:'feedBeam',crop:'carrot'});
  assert.equal(meal.seconds,0);assert.equal(meal.fuel,30);assert.equal(p.fuel,30);assert.equal(p.farm.inventory.carrot,5);
  p.fuel=120;rejected(state,{type:'feedBeam',crop:'carrot'});
  p.fuel=110;assert.equal(action(state,{type:'feedBeam',crop:'carrot'}).fuel,10,'Fuel stops at the tank’s capacity');
  assert.equal(validateState(state),true);
  p.fuel=121;assert.equal(validateState(state),false,'A tank can never exceed its system target');
});

test('prestige empties a personal tank, while co-op prestige keeps the crew tank; new journeys start empty',()=>{
  const solo=setup(),p=solo.players[0];fund(solo);unlock(solo);p.fuel=90;advance(solo,60);action(solo,{type:'prestige'});
  assert.equal(p.fuel,0);assert.equal(validateState(solo),true);
  const crew=setup('coop'),q=crew.players[0];fund(crew);unlock(crew);crew.sharedFuel=90;advance(crew,60);action(crew,{type:'prestige'});
  assert.equal(crew.sharedFuel,90);assert.equal(validateState(crew),true);
  const restored=migrateState(compactGameState(crew));assert.equal(restored.sharedFuel,90);
  const old=compactGameState(crew);delete old.sharedFuel;delete old.players[0].fuel;
  const migrated=migrateState(old);assert.equal(migrated.sharedFuel,0);assert.equal(migrated.players[0].fuel,0);assert.equal(q.fuel,0);
});

test('meal expiry splits catch-up income and automatic damage at the exact bonus boundary',()=>{
  const state=setup(),p=state.players[0];fund(state);unlock(state);
  p.generators.mote=1;p.farm.inventory.carrot=1;action(state,{type:'feedBeam',crop:'carrot'});
  const split=structuredClone(state);advance(state,40);
  for(let i=0;i<40;i++)advance(split,1);
  assert.deepEqual(state,split);assert.equal(p.farm.fedSeconds,0);assert.equal(validateState(state),true);
});

test('prestige keeps garden access, seeds, research and meals while resetting beds, equipment and produce',()=>{
  for(const mode of ['scoreboard','coop']){
    const state=setup(mode),p=state.players[0];fund(state);unlock(state);
    action(state,{type:'buyFarmPlot'});action(state,{type:'unlockCrop',id:'tomato'});action(state,{type:'buyFarmUpgrade',id:'tractor'});action(state,{type:'buyFarmUpgrade',id:'picker'});
    action(state,{type:'plantCrop',plot:1,crop:'tomato'});p.farm.inventory.carrot=2;action(state,{type:'feedBeam',crop:'carrot'});
    advance(state,60);const bank=state.sharedLrc;action(state,{type:'prestige'});
    assert.deepEqual(p.farm,{...createFarm(),unlocked:true,crops:{carrot:true,tomato:true},meals:1});
    assert.equal(state.sharedLrc,bank);assert.equal(validateState(state),true);
  }
});

test('old saves migrate to gardens without mutating originals; corrupt gardens are rejected',()=>{
  const old=setup(),p=old.players[0];p.generators.satellite=2;delete p.farm;
  const saved=structuredClone(old),migrated=migrateState(old);assert.ok(migrated);assert.deepEqual(old,saved);
  assert.equal(migrated.players[0].farm.unlocked,true);assert.equal(validateState(migrated),true);
  for(const mutate of [
    farm=>{farm.plots=[];},farm=>{farm.plots[0].progress=Infinity;},farm=>{farm.plots[0]={crop:'pumpkin',progress:.5,water:1,fertilised:false};},
    farm=>{farm.plots[0]={crop:'carrot',progress:.5,water:2,fertilised:false};},farm=>{farm.plots[0]={crop:'carrot',progress:.5,water:1,fertilised:1};},
    farm=>{farm.plots[0]={crop:null,progress:0,water:1,fertilised:false};},farm=>{farm.plots[0].extra=1;},
    farm=>{farm.inventory.carrot=-1;},farm=>{farm.upgrades.growLights=4;},farm=>{farm.upgrades.unknown=1;},farm=>{farm.crops.fake=true;},
    farm=>{farm.fedSeconds=301;},farm=>{farm.meals=1.5;},farm=>{farm.unlocked=false;farm.inventory.carrot=2;},
    farm=>{farm.tractorClock=1;},farm=>{farm.upgrades.tractor=1;farm.tractorClock=9;},farm=>{farm.upgrades.picker=1;farm.pickerClock=-1;},
  ]){const bad=structuredClone(migrated);mutate(bad.players[0].farm);assert.equal(validateState(bad),false);assert.equal(migrateState(bad),null);}
});

test('older gardens migrate: two-field beds become watered, fertiliser becomes a tractor and clocks start at zero',()=>{
  const state=setup(),p=state.players[0];fund(state);unlock(state);advance(state,1);
  const named=structuredClone(state);
  named.players[0].farm={unlocked:true,plots:[{crop:'carrot',progress:.3},{crop:null,progress:0}],crops:{carrot:true},inventory:{carrot:2},upgrades:{fertiliser:2,growLights:1},fedSeconds:12,meals:3};
  const original=structuredClone(named),fromNamed=migrateState(named);assert.ok(fromNamed);assert.deepEqual(named,original);
  assert.deepEqual(fromNamed.players[0].farm,{unlocked:true,plots:[{crop:'carrot',progress:.3,water:1,fertilised:false},emptyPlot()],crops:{carrot:true},inventory:{carrot:2},upgrades:{growLights:1,tractor:2},fedSeconds:12,cookedSeconds:0,meals:3,tractorClock:0,pickerClock:0});
  assert.equal(validateState(fromNamed),true);
  const packed=compactGameState(state);
  packed.players[0].farm=[1,3,[[1,.3],[0,0]],[2,null,null,null],[1,null,3],12,3];
  const fromPacked=migrateState(packed);assert.ok(fromPacked);
  assert.deepEqual(fromPacked.players[0].farm,{unlocked:true,plots:[{crop:'carrot',progress:.3,water:1,fertilised:false},emptyPlot()],crops:{carrot:true,lettuce:true},inventory:{carrot:2},upgrades:{growLights:1,tractor:3},fedSeconds:12,cookedSeconds:0,meals:3,tractorClock:0,pickerClock:0});
  assert.equal(validateState(fromPacked),true);
  const legacySkills=compactGameState(state);legacySkills.players[0].skills='tap-tuning:1';legacySkills.players[0].generators='mote:2,satellite:1';
  assert.deepEqual(migrateState(legacySkills).players[0].skills,{'tap-tuning':1});assert.deepEqual(migrateState(legacySkills).players[0].generators,{mote:2,satellite:1});
});

test('farm research gates the garden and improves growth, yield, meal strength and equipment prices',()=>{
  const state=setup(),p=state.players[0];fund(state);advance(state,60);p.skillPoints=100000;
  const root=SKILLS.find(skill=>skill.key==='seed-science');assert.ok(root);
  assert.match(skillAvailability(p,root.id,state).reason,/garden/);
  unlock(state);assert.equal(skillAvailability(p,root.id,state).available,true);
  const before=getFarmStats(p),price=farmPlotCost(p),seed=farmCropCost(p,'tomato');
  for(const skill of SKILLS.filter(skill=>skill.branch==='farm'||Object.keys(skill.effects).some(key=>['cropSpeed','cropYield','mealDuration','beamBoost','farmDiscount'].includes(key))))p.skills[skill.id]=skill.maxRank;
  const after=getFarmStats(p);
  assert.ok(after.growthRate>before.growthRate);assert.ok(after.yield>before.yield);
  assert.ok(after.feedMultiplier>before.feedMultiplier);assert.ok(after.feedBonus>before.feedBonus);
  assert.ok(farmPlotCost(p)<price);assert.ok(farmCropCost(p,'tomato')<seed);
  const wallet=p.lrc,cost=farmCropCost(p,'tomato');action(state,{type:'unlockCrop',id:'tomato'});assert.equal(p.lrc,wallet-cost);
});

test('wormhole, quantum foam and string tech improve hits, criticals and normal bulk ownership',()=>{
  for(const mode of ['scoreboard','coop']){
    const state=setup(mode,2),[p,other]=state.players;fund(state,1e9);
    const baseline=getStats(p,state);
    assert.match(generatorAvailability(p,'wormhole',state).reason,/Click tech licence/,'Click technology waits for its Outfitting licence');
    p.skills.ki2=1;
    for(const id of ['wormhole','foamer','string']){
      assert.ok(GENERATORS.some(generator=>generator.id===id));
      const quote=generatorQuote(p,id,10,state),before=getBalance(p,state);
      action(state,{type:'buyGenerator',id,quantity:10});assert.equal(getBalance(p,state),before-quote.cost);assert.equal(p.generators[id],10);
    }
    const after=getStats(p,state);
    assert.equal(after.clickDamage,(baseline.clickDamage+40)*3);assert.equal(after.autoDamage,after.clickDamage);
    assert.ok(Math.abs(after.criticalChance-.15)<1e-12);assert.equal(after.criticalMultiplier,4);
    assert.equal(getStats(other,state).clickDamage,baseline.clickDamage);
    p.generators.string=1000;assert.equal(getStats(p,state).criticalChance,.8);
    assert.equal(validateState(state),true);
  }
});

test('eight complete gardens and Arsenal builds round-trip under the relay limit without rounding progress',()=>{
  const state=createGame({mode:'coop'});
  for(let index=0;index<8;index++){
    const p=addPlayer(state,{id:`${index}${'x'.repeat(99)}`,name:'界'.repeat(40)});
    p.skills=Object.fromEntries(SKILLS.map(skill=>[skill.id,skill.maxRank]));
    p.generators=Object.fromEntries(GENERATORS.map(generator=>[generator.id,1000]));
    p.totalPrestige=1000;p.highestOrb=200;p.completedRounds=1000;p.prestigeCount=10;
    // Odd pilots water by hand, so their beds carry full-precision moisture as well as progress.
    const upgrades=Object.fromEntries(FARM_UPGRADES.map(upgrade=>[upgrade.id,upgrade.id==='hydroponics'&&index%2?0:3]));
    p.farm={...createFarm(),unlocked:true,plots:Array.from({length:6},()=>({crop:'pumpkin',progress:.12345678901234567,water:.98765432109876543,fertilised:true})),
      crops:Object.fromEntries(CROPS.map(crop=>[crop.id,true])),inventory:Object.fromEntries(CROPS.map(crop=>[crop.id,999999])),
      upgrades,fedSeconds:299.1234567890123,meals:Number.MAX_SAFE_INTEGER,tractorClock:1.2345678901234567,pickerClock:1.3456789012345678};
    p.arsenalClock=[.12345678901234567,.23456789012345678,.34567890123456789,.4567890123456789];
    p.arsenalShots=[123456789012345,234567890123456,345678901234567,456789012345678];p.autoClicks=Number.MAX_SAFE_INTEGER;
  }
  assert.equal(applyAction(state,state.players[0].id,{type:'start'}).ok,true);advance(state,1);
  const compact=compactGameState(state),bytes=Buffer.byteLength(JSON.stringify(compact));
  assert.ok(bytes<15000,`Eight complete builds use ${bytes} bytes`);assert.equal(validateState(state),true);
  assert.deepEqual(migrateState(JSON.parse(JSON.stringify(compact))),state);
  // End-of-round summaries and full lifetime counters must also fit.
  advance(state,59);
  const endBytes=Buffer.byteLength(JSON.stringify(compactGameState(state)));
  assert.ok(endBytes<15000,`Eight complete builds plus round summary use ${endBytes} bytes`);
  assert.deepEqual(migrateState(compactGameState(state)),state);
});

test('packed saves reject malformed array shapes, invalid crops and duplicate or corrupt skill ranks',()=>{
  const state=setup();fund(state);unlock(state);
  for(const mutate of [
    packed=>{packed.players[0].farm.pop();},packed=>{packed.players[0].farm.pop();packed.players[0].farm.pop();},packed=>{packed.players[0].farm[1]=16;},
    packed=>{packed.players[0].farm[2]=[[8,.5]];},packed=>{packed.players[0].farm[2]=[[0,.5]];},packed=>{packed.players[0].farm[2]=[[1]];},
    packed=>{packed.players[0].farm[2]=[[1,.5,2,0]];},packed=>{packed.players[0].farm[2]=[[1,.5,1,2]];},packed=>{packed.players[0].farm[2]=[[1,.5,1]];},
    packed=>{packed.players[0].farm[3]=[1,2,3];},packed=>{packed.players[0].farm[4]=[4,null,null];},packed=>{packed.players[0].farm[4]=[null,null];},
    packed=>{packed.players[0].farm[5]=NaN;},packed=>{packed.players[0].farm[7]=9;},packed=>{packed.players[0].farm[8]=-1;},
    packed=>{packed.players[0].skills='tap-tuning:1,tap-tuning:2';},
    packed=>{packed.players[0].skills='tap-tuning:9';},packed=>{packed.players[0].skills='__proto__:1';},
    packed=>{packed.players[0].skills='tap-tuning:1e2';},packed=>{packed.players[0].skills=[9];},packed=>{packed.players[0].skills=[1.5];},
    packed=>{packed.players[0].skills=new Array(SKILLS.length+1).fill(0);},packed=>{packed.players[0].generators=[1001];},
  ]){const packed=compactGameState(state);mutate(packed);assert.equal(migrateState(packed),null);}
  advance(state,60);
  for(const mutate of [
    packed=>{packed.lastRound.players[0][0]=8;},packed=>{packed.lastRound.players[0][0]=-1;},
    packed=>{packed.lastRound.players[0].pop();},packed=>{packed.lastRound.players[0][3]=0;},
  ]){const packed=compactGameState(state);mutate(packed);assert.equal(migrateState(packed),null);}
  const departed=structuredClone(state);departed.lastRound.players[0].id='departed-pilot';
  assert.deepEqual(migrateState(compactGameState(departed)),departed,'Summaries preserve pilots who have since left the roster');
});
