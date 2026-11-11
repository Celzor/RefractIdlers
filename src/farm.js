/** Beam's garden. Growth and meal timers advance only during active rounds. */
import { SKILLS } from './skills.js';

export const MAX_PLOTS = 6;
export const MAX_FED_SECONDS = 300;
export const MAX_VEGETABLES = 999999;
export const CROPS = Object.freeze([
  { id:'carrot', name:'Carrot', cost:0, growTime:30, feedSeconds:30, color:'#ed9a50' },
  { id:'lettuce', name:'Lettuce', cost:180, growTime:45, feedSeconds:45, color:'#99c96c' },
  { id:'tomato', name:'Tomato', cost:650, growTime:60, feedSeconds:70, color:'#dc735d' },
  { id:'pumpkin', name:'Pumpkin', cost:2200, growTime:90, feedSeconds:110, color:'#e8b050' },
]);
export const FARM_UPGRADES = Object.freeze([
  { id:'growLights', name:'Grow lights', description:'+25% growth speed per level.', baseCost:250, maxLevel:3 },
  { id:'hydroponics', name:'Hydroponics', description:'+35% growth speed per level.', baseCost:600, maxLevel:3 },
  { id:'fertiliser', name:'Fertiliser', description:'+1 vegetable per harvest per level.', baseCost:400, maxLevel:3 },
]);
const cropById = new Map(CROPS.map(crop => [crop.id,crop]));
const upgradeById = new Map(FARM_UPGRADES.map(upgrade => [upgrade.id,upgrade]));
const skillById = new Map(SKILLS.map(skill => [skill.id,skill]));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const bounded = (value,max) => Number.isFinite(value) && value >= 0 && value <= max;
const integer = (value,max=Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && bounded(value,max);
const fail = reason => ({ok:false,reason});

export function createFarm() {
  return {unlocked:false,plots:[{crop:null,progress:0}],crops:{carrot:true},inventory:{},upgrades:{},fedSeconds:0,meals:0};
}
export const getFarmUnlocked = player => Boolean(player?.farm?.unlocked || player?.generators?.satellite > 0);
function farmEffects(player) {
  const effects = {};
  for (const [id,rank] of Object.entries(player?.skills || {})) {
    for (const [key,value] of Object.entries(skillById.get(id)?.effects || {})) effects[key] = (effects[key] || 0) + value*rank;
  }
  return effects;
}
export function getFarmStats(player,effects=farmEffects(player)) {
  const upgrades = player?.farm?.upgrades || {};
  const feedBonus = .25 + (effects.beamBoost || 0);
  return {
    growthRate:1 + (upgrades.growLights || 0)*.25 + (upgrades.hydroponics || 0)*.35 + (effects.cropSpeed || 0),
    yield:1 + (upgrades.fertiliser || 0) + Math.floor((effects.cropYield || 0) + 1e-9),
    feedMultiplier:1 + (effects.mealDuration || 0),
    feedBonus,
    discount:Math.min(.75,effects.farmDiscount || 0),
  };
}
export function farmPlotCost(player) {
  const plots = player?.farm?.plots.length || 1;
  return plots >= MAX_PLOTS ? Infinity : Math.ceil(120*2.2**(plots-1)*(1-getFarmStats(player).discount));
}
export function farmCropCost(player,id) {
  const crop = cropById.get(id);
  return crop ? Math.ceil(crop.cost*(1-getFarmStats(player).discount)) : Infinity;
}
export function farmUpgradeCost(player,id) {
  const upgrade = upgradeById.get(id), level = player?.farm?.upgrades[id] || 0;
  return !upgrade || level >= upgrade.maxLevel ? Infinity : Math.ceil(upgrade.baseCost*2.5**level*(1-getFarmStats(player).discount));
}
export function advanceFarm(player,seconds) {
  if (!player.farm || !getFarmUnlocked(player)) return;
  const farm = player.farm, stats = getFarmStats(player);
  for (const plot of farm.plots) {
    if (plot.crop) {
      const next = plot.progress + seconds*stats.growthRate/cropById.get(plot.crop).growTime;
      plot.progress = next >= 1-1e-9 ? 1 : next;
    }
  }
  farm.fedSeconds = Math.max(0,farm.fedSeconds-seconds);
}
export function resetFarm(player) {
  const previous = player.farm;
  player.farm = {...createFarm(),unlocked:getFarmUnlocked(player),crops:{...previous.crops},meals:previous.meals};
}
export const FARM_ACTIONS = new Set(['unlockCrop','buyFarmPlot','buyFarmUpgrade','plantCrop','harvestCrop','feedBeam']);
/** The game supplies the current bank and commits the charge only after validation. */
export function applyFarmAction(player,action,balance,spend) {
  if (!getFarmUnlocked(player)) return fail('Buy a Refract orb farm to open Beam’s Garden.');
  const farm = player.farm;
  const purchase = (cost,commit) => {
    if (!Number.isFinite(cost)) return fail('This garden upgrade is fully built.');
    if (balance < cost) return fail('Collect more LRCs for this garden upgrade.');
    spend(cost); commit(); return {ok:true,cost};
  };
  if (action.type === 'unlockCrop') {
    const crop = cropById.get(action.id);
    if (!crop) return fail('Unknown vegetable.');
    if (farm.crops[crop.id]) return fail('These seeds are already unlocked.');
    return purchase(farmCropCost(player,crop.id),() => { farm.crops[crop.id] = true; });
  }
  if (action.type === 'buyFarmPlot') return purchase(farmPlotCost(player),() => { farm.plots.push({crop:null,progress:0}); });
  if (action.type === 'buyFarmUpgrade') {
    const upgrade = upgradeById.get(action.id);
    if (!upgrade) return fail('Unknown garden equipment.');
    return purchase(farmUpgradeCost(player,upgrade.id),() => { farm.upgrades[upgrade.id] = (farm.upgrades[upgrade.id] || 0)+1; });
  }
  if (action.type === 'plantCrop' || action.type === 'harvestCrop') {
    if (!integer(action.plot,MAX_PLOTS-1) || action.plot >= farm.plots.length) return fail('Unlock that planting bed first.');
    const plot = farm.plots[action.plot];
    if (action.type === 'plantCrop') {
      if (!cropById.has(action.crop) || !farm.crops[action.crop]) return fail('Unlock those seeds before planting.');
      if (plot.crop !== null) return fail('Harvest this bed before planting again.');
      plot.crop = action.crop; plot.progress = 0; return {ok:true};
    }
    if (!plot.crop || plot.progress < 1) return fail('This vegetable is still growing.');
    const quantity = Math.min(getFarmStats(player).yield,MAX_VEGETABLES-(farm.inventory[plot.crop] || 0));
    if (quantity <= 0) return fail('The pantry is full. Feed Beam before harvesting.');
    const crop = plot.crop;
    farm.inventory[crop] = (farm.inventory[crop] || 0)+quantity;
    plot.crop = null; plot.progress = 0;
    return {ok:true,crop,quantity};
  }
  if (action.type === 'feedBeam') {
    const crop = cropById.get(action.crop);
    if (!crop || !(farm.inventory[crop.id] > 0)) return fail('Harvest that vegetable before feeding Beam.');
    if (farm.fedSeconds >= MAX_FED_SECONDS) return fail('Beam is full for now. His boost already lasts five minutes.');
    const seconds = Math.min(MAX_FED_SECONDS-farm.fedSeconds,crop.feedSeconds*getFarmStats(player).feedMultiplier);
    farm.inventory[crop.id]--; farm.fedSeconds += seconds;
    farm.meals = Math.min(Number.MAX_SAFE_INTEGER,farm.meals+1);
    return {ok:true,crop:crop.id,seconds};
  }
  return fail('Unknown garden action.');
}

export function validateFarm(farm) {
  if (!record(farm) || typeof farm.unlocked !== 'boolean' || !Array.isArray(farm.plots) || farm.plots.length < 1 || farm.plots.length > MAX_PLOTS
    || !record(farm.crops) || farm.crops.carrot !== true || !record(farm.inventory) || !record(farm.upgrades)
    || !bounded(farm.fedSeconds,MAX_FED_SECONDS) || !integer(farm.meals)) return false;
  if (Object.keys(farm).some(key => !['unlocked','plots','crops','inventory','upgrades','fedSeconds','meals'].includes(key))) return false;
  if (Object.entries(farm.crops).some(([id,value]) => !cropById.has(id) || value !== true)) return false;
  if (Object.entries(farm.inventory).some(([id,value]) => !cropById.has(id) || !farm.crops[id] || !integer(value,MAX_VEGETABLES))) return false;
  if (Object.entries(farm.upgrades).some(([id,value]) => !upgradeById.has(id) || !integer(value,upgradeById.get(id).maxLevel))) return false;
  if (!farm.plots.every(plot => record(plot) && Object.keys(plot).every(key => ['crop','progress'].includes(key)) && bounded(plot.progress,1) && (plot.crop === null ? plot.progress === 0 : cropById.has(plot.crop) && farm.crops[plot.crop]))) return false;
  if (!farm.unlocked && (farm.plots.length !== 1 || Object.keys(farm.crops).length !== 1 || Object.keys(farm.inventory).length || Object.keys(farm.upgrades).length || farm.plots[0].crop !== null || farm.fedSeconds || farm.meals)) return false;
  return true;
}

/** Compact only on disk/on the relay; the simulation and view keep named fields. */
export function packFarm(farm) {
  return [farm.unlocked?1:0,CROPS.reduce((mask,crop,index)=>mask|(farm.crops[crop.id]?1<<index:0),0),
    farm.plots.map(plot=>[plot.crop===null?0:CROPS.findIndex(crop=>crop.id===plot.crop)+1,plot.progress]),
    CROPS.map(crop=>farm.inventory[crop.id]??null),FARM_UPGRADES.map(upgrade=>farm.upgrades[upgrade.id]??null),farm.fedSeconds,farm.meals];
}
export function unpackFarm(packed) {
  if (!Array.isArray(packed) || packed.length !== 7 || ![0,1].includes(packed[0]) || !integer(packed[1],15) || !(packed[1]&1)
    || !Array.isArray(packed[2]) || packed[2].length < 1 || packed[2].length > MAX_PLOTS
    || !packed[2].every(plot=>Array.isArray(plot) && plot.length===2 && integer(plot[0],CROPS.length) && bounded(plot[1],1))
    || !Array.isArray(packed[3]) || packed[3].length !== CROPS.length || !packed[3].every(value=>value===null || integer(value,MAX_VEGETABLES))
    || !Array.isArray(packed[4]) || packed[4].length !== FARM_UPGRADES.length || !packed[4].every(value=>value===null || integer(value,3))) return null;
  const farm={unlocked:packed[0]===1,crops:Object.fromEntries(CROPS.filter((crop,index)=>packed[1]&(1<<index)).map(crop=>[crop.id,true])),
    plots:packed[2].map(([crop,progress])=>({crop:crop?CROPS[crop-1].id:null,progress})),
    inventory:Object.fromEntries(CROPS.flatMap((crop,index)=>packed[3][index]===null?[]:[[crop.id,packed[3][index]]])),
    upgrades:Object.fromEntries(FARM_UPGRADES.flatMap((upgrade,index)=>packed[4][index]===null?[]:[[upgrade.id,packed[4][index]]])),
    fedSeconds:packed[5],meals:packed[6]};
  return validateFarm(farm)?farm:null;
}
