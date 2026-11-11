import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, applyAction, advance, getStats, getBalance, validateState, migrateState, compactGameState, SKILLS, GENERATORS, generatorQuote, skillAvailability } from '../src/game.js';
import { createFarm, CROPS, FARM_UPGRADES, MAX_PLOTS, getFarmUnlocked, getFarmStats, farmPlotCost, farmUpgradeCost, farmCropCost } from '../src/farm.js';

function setup(mode='scoreboard',players=1) {
  const state=createGame({mode});
  for(let i=0;i<players;i++)addPlayer(state,{id:`p${i}`,name:`Pilot ${i}`});
  applyAction(state,'p0',{type:'start'});
  return state;
}
function fund(state,amount=1000000) {
  for(const player of state.players)player.lrc=player.runLrc=player.lifetimeLrc=amount;
  if(state.mode==='coop')state.sharedLrc=amount;
}
function action(state,details,id='p0') {
  const result=applyAction(state,id,details);
  assert.equal(result.ok,true,result.reason);
  return result;
}
function unlock(state,id='p0') { action(state,{type:'buyGenerator',id:'satellite'},id); }

test('buying the first orb farm opens a complete plant, harvest and feed loop',()=>{
  const state=setup(),p=state.players[0];fund(state);
  assert.equal(getFarmUnlocked(p),false);
  const locked=structuredClone(state);
  assert.equal(applyAction(state,p.id,{type:'plantCrop',plot:0,crop:'carrot'}).ok,false);
  assert.deepEqual(state,locked);
  unlock(state);assert.equal(getFarmUnlocked(p),true);
  action(state,{type:'plantCrop',plot:0,crop:'carrot'});
  advance(state,15);assert.equal(p.farm.plots[0].progress,.5);
  assert.equal(applyAction(state,p.id,{type:'harvestCrop',plot:0}).ok,false);
  advance(state,15);assert.equal(p.farm.plots[0].progress,1);
  assert.equal(action(state,{type:'harvestCrop',plot:0}).quantity,1);
  assert.deepEqual(p.farm.plots[0],{crop:null,progress:0});
  const before=getStats(p,state);
  action(state,{type:'feedBeam',crop:'carrot'});
  assert.equal(p.farm.inventory.carrot,0);assert.equal(p.farm.meals,1);assert.equal(p.farm.fedSeconds,30);
  const after=getStats(p,state);
  assert.equal(after.clickDamage,before.clickDamage*1.25);assert.equal(after.passiveRate,before.passiveRate*1.25);
  advance(state,30);assert.equal(p.farm.fedSeconds,0);
  assert.equal(validateState(state),true);
});

test('farm costs, crop unlocks and visible equipment levels are bounded atomic purchases',()=>{
  const state=setup(),p=state.players[0];fund(state);unlock(state);
  for(const crop of CROPS.slice(1))action(state,{type:'unlockCrop',id:crop.id});
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
  assert.equal(getFarmStats(p).growthRate,2.8);assert.equal(getFarmStats(p).yield,4);
  action(state,{type:'plantCrop',plot:5,crop:'pumpkin'});advance(state,33);
  assert.equal(action(state,{type:'harvestCrop',plot:5}).quantity,4);
  assert.equal(validateState(state),true);
});

test('co-op garden spending uses the shared bank while beds, meals and bonuses stay personal',()=>{
  const state=setup('coop',2),[a,b]=state.players;fund(state,1000);unlock(state,'p1');
  const wallet=b.lrc,before=state.sharedLrc;
  action(state,{type:'buyFarmPlot'},'p1');assert.equal(state.sharedLrc,before-120);assert.equal(b.lrc,wallet);
  assert.equal(a.farm.plots.length,1);assert.equal(b.farm.plots.length,2);
  b.farm.inventory.carrot=1;action(state,{type:'feedBeam',crop:'carrot'},'p1');
  assert.equal(getStats(a,state).beamBonus,0);assert.equal(getStats(b,state).beamBonus,.25);
  state.sharedLrc=0;const snapshot=structuredClone(state);
  assert.equal(applyAction(state,b.id,{type:'buyFarmUpgrade',id:'growLights'}).ok,false);
  assert.deepEqual(state,snapshot);assert.equal(validateState(state),true);
});

test('farm controls reject malformed ids, occupied beds, duplicate harvests and stale round requests',()=>{
  const state=setup(),p=state.players[0];fund(state);unlock(state);
  for(const details of [
    {type:'unlockCrop',id:'__proto__'}, {type:'buyFarmUpgrade',id:'constructor'},
    {type:'plantCrop',plot:-1,crop:'carrot'}, {type:'plantCrop',plot:'0',crop:'carrot'},
    {type:'plantCrop',plot:1,crop:'carrot'}, {type:'plantCrop',plot:0,crop:'pumpkin'},
    {type:'feedBeam',crop:'carrot'}, {type:'buyFarmPlot',round:0},
  ]){const before=structuredClone(state);assert.equal(applyAction(state,p.id,details).ok,false);assert.deepEqual(state,before);}
  action(state,{type:'plantCrop',plot:0,crop:'carrot'});
  assert.equal(applyAction(state,p.id,{type:'plantCrop',plot:0,crop:'carrot'}).ok,false);
  advance(state,30);action(state,{type:'harvestCrop',plot:0});
  const before=structuredClone(state);
  assert.equal(applyAction(state,p.id,{type:'harvestCrop',plot:0}).ok,false);assert.deepEqual(state,before);
});

test('growth and meal timers pause between rounds; a full Beam does not consume vegetables',()=>{
  const state=setup(),p=state.players[0];fund(state);unlock(state);
  action(state,{type:'unlockCrop',id:'pumpkin'});action(state,{type:'plantCrop',plot:0,crop:'pumpkin'});
  p.farm.inventory.carrot=20;
  for(let i=0;i<10;i++)action(state,{type:'feedBeam',crop:'carrot'});
  assert.equal(p.farm.fedSeconds,300);
  const full=structuredClone(state);assert.equal(applyAction(state,p.id,{type:'feedBeam',crop:'carrot'}).ok,false);assert.deepEqual(state,full);
  advance(state,60);assert.equal(state.phase,'intermission');
  const paused=structuredClone(p.farm);advance(state,600);assert.deepEqual(p.farm,paused);
  action(state,{type:'ready'});advance(state,30);assert.equal(p.farm.plots[0].progress,1);
});

test('meal expiry splits catch-up income and automatic damage at the exact bonus boundary',()=>{
  const state=setup(),p=state.players[0];fund(state);unlock(state);
  p.generators.mote=1;p.farm.inventory.carrot=1;action(state,{type:'feedBeam',crop:'carrot'});
  const split=structuredClone(state);advance(state,40);
  for(let i=0;i<40;i++)advance(split,1);
  assert.deepEqual(state,split);assert.equal(p.farm.fedSeconds,0);assert.equal(validateState(state),true);
});

test('prestige keeps garden access, seeds, research and meals while resetting beds and produce',()=>{
  for(const mode of ['scoreboard','coop']){
    const state=setup(mode),p=state.players[0];fund(state);unlock(state);
    action(state,{type:'buyFarmPlot'});action(state,{type:'unlockCrop',id:'tomato'});action(state,{type:'buyFarmUpgrade',id:'fertiliser'});
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
    farm=>{farm.plots=[];},farm=>{farm.plots[0].progress=Infinity;},farm=>{farm.plots[0]={crop:'pumpkin',progress:.5};},
    farm=>{farm.inventory.carrot=-1;},farm=>{farm.upgrades.growLights=4;},farm=>{farm.crops.fake=true;},
    farm=>{farm.fedSeconds=301;},farm=>{farm.meals=1.5;},farm=>{farm.unlocked=false;farm.inventory.carrot=2;},
  ]){const bad=structuredClone(migrated);mutate(bad.players[0].farm);assert.equal(validateState(bad),false);assert.equal(migrateState(bad),null);}
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
    p.farm={...createFarm(),unlocked:true,plots:Array.from({length:6},()=>({crop:'pumpkin',progress:.12345678901234567})),
      crops:Object.fromEntries(CROPS.map(crop=>[crop.id,true])),inventory:Object.fromEntries(CROPS.map(crop=>[crop.id,999999])),
      upgrades:Object.fromEntries(FARM_UPGRADES.map(upgrade=>[upgrade.id,3])),fedSeconds:299.1234567890123,meals:Number.MAX_SAFE_INTEGER};
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
    packed=>{packed.players[0].farm.pop();},packed=>{packed.players[0].farm[1]=16;},
    packed=>{packed.players[0].farm[2]=[[8,.5]];},packed=>{packed.players[0].farm[2]=[[0,.5]];},
    packed=>{packed.players[0].farm[3]=[1,2,3];},packed=>{packed.players[0].farm[4]=[4,null,null];},
    packed=>{packed.players[0].farm[5]=NaN;},packed=>{packed.players[0].skills='tap-tuning:1,tap-tuning:2';},
    packed=>{packed.players[0].skills='tap-tuning:9';},packed=>{packed.players[0].skills='__proto__:1';},
    packed=>{packed.players[0].skills='tap-tuning:1e2';},
  ]){const packed=compactGameState(state);mutate(packed);assert.equal(migrateState(packed),null);}
  advance(state,60);
  for(const mutate of [
    packed=>{packed.lastRound.players[0][0]=8;},packed=>{packed.lastRound.players[0][0]=-1;},
    packed=>{packed.lastRound.players[0].pop();},packed=>{packed.lastRound.players[0][3]=0;},
  ]){const packed=compactGameState(state);mutate(packed);assert.equal(migrateState(packed),null);}
  const departed=structuredClone(state);departed.lastRound.players[0].id='departed-pilot';
  assert.deepEqual(migrateState(compactGameState(departed)),departed,'Summaries preserve pilots who have since left the roster');
});
