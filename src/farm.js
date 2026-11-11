/** Beam's garden. Growth, chores and meal timers advance only during active rounds. */
import { SKILLS } from './skills.js';

export const MAX_PLOTS = 6;
export const MAX_FED_SECONDS = 300;
export const COOKED_SECONDS = 260;
export const COOKED_SCORE_MULTIPLIER = 4.2;
export const MAX_VEGETABLES = 999999;
/** One watering keeps a bed growing for this many active seconds. Dry beds stop growing. */
export const WATER_SECONDS = 20;
/** A fertilised planting grows faster and yields one extra vegetable. */
export const FERTILISED_SPEED = 1.5;
export const FERTILISED_YIELD = 1;
/** Each tractor fertilises one bed per cycle; each picker bot harvests and replants one bed per cycle. */
export const TRACTOR_SECONDS = 8;
export const PICKER_SECONDS = 6;
export const CROPS = Object.freeze([
  { id:'carrot', name:'Carrot', cost:0, seedCost:100, growTime:30, feedSeconds:30, color:'#ed9a50' },
  { id:'lettuce', name:'Lettuce', cost:18000, seedCost:250, growTime:45, feedSeconds:45, color:'#99c96c' },
  { id:'tomato', name:'Tomato', cost:65000, seedCost:600, growTime:60, feedSeconds:70, color:'#dc735d' },
  { id:'pumpkin', name:'Pumpkin', cost:220000, seedCost:1500, growTime:90, feedSeconds:110, color:'#e8b050' },
  { id:'weed', name:'Weed', secret:true, cost:0, seedCost:4200, growTime:120, feedSeconds:COOKED_SECONDS, color:'#91c96b' },
]);
export const FARM_UPGRADES = Object.freeze([
  { id:'growLights', name:'Grow lights', description:'+25% growth speed per lamp.', baseCost:25000, maxLevel:3 },
  { id:'hydroponics', name:'Hydroponics', description:'Waters every bed for you. +25% growth per level.', baseCost:60000, maxLevel:3 },
  { id:'tractor', name:'Tractor', description:'Fertilises a bed every 8s per tractor.', baseCost:40000, maxLevel:3 },
  { id:'picker', name:'Picker bot', description:'Harvests a ripe bed every 6s per bot and replants it.', baseCost:90000, maxLevel:3 },
]);
const LEGACY_UPGRADES = ['growLights','hydroponics','fertiliser'];
const cropById = new Map(CROPS.map(crop => [crop.id,crop]));
const upgradeById = new Map(FARM_UPGRADES.map(upgrade => [upgrade.id,upgrade]));
const skillById = new Map(SKILLS.map(skill => [skill.id,skill]));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const bounded = (value,max) => Number.isFinite(value) && value >= 0 && value <= max;
const integer = (value,max=Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && bounded(value,max);
const fail = reason => ({ok:false,reason});

export const emptyPlot = () => ({crop:null,progress:0,water:0,fertilised:false});
const plantPlot = (plot,crop) => Object.assign(plot,{crop,progress:0,water:1,fertilised:false});
export function createFarm() {
  return {unlocked:false,plots:[emptyPlot()],crops:{carrot:true},inventory:{},upgrades:{},fedSeconds:0,cookedSeconds:0,meals:0,tractorClock:0,pickerClock:0};
}
/** The Garden licence (Outfitting research) opens the garden; the secret star's reward also grants it. */
export const getFarmUnlocked = player => Boolean(player?.farm?.unlocked || player?.skills?.ki1 > 0);
function farmEffects(player) {
  const effects = {};
  for (const [id,rank] of Object.entries(player?.skills || {})) {
    for (const [key,value] of Object.entries(skillById.get(id)?.effects || {})) effects[key] = (effects[key] || 0) + value*rank;
  }
  return effects;
}
export function getFarmStats(player,effects=farmEffects(player)) {
  const upgrades = player?.farm?.upgrades || {};
  const tractors = upgrades.tractor || 0, pickers = upgrades.picker || 0;
  return {
    growthRate:1 + (upgrades.growLights || 0)*.25 + (upgrades.hydroponics || 0)*.25 + (effects.cropSpeed || 0),
    yield:1 + Math.floor((effects.cropYield || 0) + 1e-9),
    autoWater:(upgrades.hydroponics || 0) > 0,
    tractorPeriod:tractors ? TRACTOR_SECONDS/tractors : 0,
    pickerPeriod:pickers ? PICKER_SECONDS/pickers : 0,
    feedMultiplier:1 + (effects.mealDuration || 0),
    feedBonus:.25 + (effects.beamBoost || 0),
    scoreMultiplier:player?.farm?.cookedSeconds > 0 ? COOKED_SCORE_MULTIPLIER : 1,
    discount:Math.min(.75,effects.farmDiscount || 0),
  };
}
/** Progress per active second for a planted bed, before any water shortage. */
export const plotGrowthRate = (plot,stats) => stats.growthRate*(plot.fertilised ? FERTILISED_SPEED : 1)/cropById.get(plot.crop).growTime;
export const plotSecondsLeft = (plot,stats) => Math.max(0,(1-plot.progress)/plotGrowthRate(plot,stats));
export function farmPlotCost(player) {
  const plots = player?.farm?.plots.length || 1;
  return plots >= MAX_PLOTS ? Infinity : Math.ceil(12000*2.2**(plots-1)*(1-getFarmStats(player).discount));
}
export function farmCropCost(player,id) {
  const crop = cropById.get(id);
  return crop && !crop.secret ? Math.ceil(crop.cost*(1-getFarmStats(player).discount)) : Infinity;
}
export function farmSeedCost(player,id) {
  const crop = cropById.get(id);
  return crop ? Math.ceil(crop.seedCost*(1-getFarmStats(player).discount)) : Infinity;
}
export function farmUpgradeCost(player,id) {
  const upgrade = upgradeById.get(id), level = player?.farm?.upgrades[id] || 0;
  return !upgrade || level >= upgrade.maxLevel ? Infinity : Math.ceil(upgrade.baseCost*2.5**level*(1-getFarmStats(player).discount));
}
/** Moves a ripe bed's vegetables into the pantry. Returns 0, changing nothing, when the pantry is full. */
function harvestPlot(farm,plot,stats) {
  const crop = plot.crop, quantity = Math.min(stats.yield+(plot.fertilised ? FERTILISED_YIELD : 0),MAX_VEGETABLES-(farm.inventory[crop] || 0));
  if (quantity <= 0) return 0;
  farm.inventory[crop] = (farm.inventory[crop] || 0)+quantity;
  Object.assign(plot,emptyPlot());
  return quantity;
}
function runTractor(farm) {
  const plot = farm.plots.find(plot => plot.crop && !plot.fertilised && plot.progress < 1);
  if (plot) plot.fertilised = true;
}
function runPicker(player,farm,stats,wallet) {
  const plot = farm.plots.find(plot => plot.crop && plot.progress >= 1 && (farm.inventory[plot.crop] || 0) < MAX_VEGETABLES);
  if (!plot) return;
  const crop = plot.crop;
  harvestPlot(farm,plot,stats);
  const cost = farmSeedCost(player,crop);
  if (wallet && wallet.balance() >= cost) { wallet.spend(cost); plantPlot(plot,crop); }
}
/**
 * Beds grow only while watered; one watering lasts WATER_SECONDS unless hydroponics keeps them wet.
 * Tractors and picker bots tick on fixed cycles, so the work is split at every cycle boundary and the
 * result does not depend on how the host slices elapsed time. `wallet` ({balance, spend}) lets picker
 * bots buy replacement seeds; without it they only harvest.
 */
export function advanceFarm(player,seconds,wallet=null) {
  if (!player.farm || !getFarmUnlocked(player) || !(seconds > 0)) return;
  const farm = player.farm, stats = getFarmStats(player);
  let remaining = seconds;
  for (let guard = 0; guard < 10000; guard++) {
    if (stats.tractorPeriod && farm.tractorClock >= stats.tractorPeriod-1e-9) { farm.tractorClock = 0; runTractor(farm); }
    if (stats.pickerPeriod && farm.pickerClock >= stats.pickerPeriod-1e-9) { farm.pickerClock = 0; runPicker(player,farm,stats,wallet); }
    if (remaining <= 0) break;
    let step = remaining;
    if (stats.tractorPeriod) step = Math.min(step,stats.tractorPeriod-farm.tractorClock);
    if (stats.pickerPeriod) step = Math.min(step,stats.pickerPeriod-farm.pickerClock);
    for (const plot of farm.plots) {
      if (!plot.crop) continue;
      if (stats.autoWater) plot.water = 1;
      if (plot.progress >= 1) continue;
      const growing = stats.autoWater ? step : Math.min(step,plot.water*WATER_SECONDS);
      if (growing > 0) {
        const next = plot.progress + growing*stats.growthRate*(plot.fertilised ? FERTILISED_SPEED : 1)/cropById.get(plot.crop).growTime;
        plot.progress = next >= 1-1e-9 ? 1 : next;
      }
      if (!stats.autoWater) plot.water = Math.max(0,plot.water-step/WATER_SECONDS);
    }
    if (stats.tractorPeriod) farm.tractorClock = Math.min(stats.tractorPeriod,farm.tractorClock+step);
    if (stats.pickerPeriod) farm.pickerClock = Math.min(stats.pickerPeriod,farm.pickerClock+step);
    remaining = step >= remaining ? 0 : remaining-step;
  }
  farm.fedSeconds = Math.max(0,farm.fedSeconds-seconds);
  farm.cookedSeconds = Math.max(0,farm.cookedSeconds-seconds);
}
export function resetFarm(player) {
  const previous = player.farm;
  player.farm = {...createFarm(),unlocked:getFarmUnlocked(player),crops:{...previous.crops},meals:previous.meals};
}
export const FARM_ACTIONS = new Set(['unlockCrop','buyFarmPlot','buyFarmUpgrade','plantCrop','waterCrop','fertiliseCrop','harvestCrop','feedBeam']);
const fuelRoomOf = context => Number.isFinite(context?.fuelRoom) ? context.fuelRoom : 0;
/**
 * The game supplies the current bank and commits the charge only after validation.
 * `context.fuelRoom` is the space left in the ship's tank; a meal's `fuel` result is what the game should add.
 * `context.fuelMultiplier` (Astrogation research) scales the fuel a meal yields before the tank's room caps it.
 */
export function applyFarmAction(player,action,balance,spend,context={}) {
  if (!getFarmUnlocked(player)) return fail('Research the Garden licence to open Beam’s Garden.');
  const farm = player.farm;
  const purchase = (cost,commit) => {
    if (!Number.isFinite(cost)) return fail('This garden upgrade is fully built.');
    if (balance < cost) return fail('Collect more LRCs for this garden purchase.');
    spend(cost); commit(); return {ok:true,cost};
  };
  if (action.type === 'unlockCrop') {
    const crop = cropById.get(action.id);
    if (!crop) return fail('Unknown vegetable.');
    if (crop.secret) return fail('These seeds are earned from the secret planet.');
    if (farm.crops[crop.id]) return fail('These seeds are already unlocked.');
    return purchase(farmCropCost(player,crop.id),() => { farm.crops[crop.id] = true; });
  }
  if (action.type === 'buyFarmPlot') return purchase(farmPlotCost(player),() => { farm.plots.push(emptyPlot()); });
  if (action.type === 'buyFarmUpgrade') {
    const upgrade = upgradeById.get(action.id);
    if (!upgrade) return fail('Unknown garden equipment.');
    return purchase(farmUpgradeCost(player,upgrade.id),() => { farm.upgrades[upgrade.id] = (farm.upgrades[upgrade.id] || 0)+1; });
  }
  if (['plantCrop','waterCrop','fertiliseCrop','harvestCrop'].includes(action.type)) {
    if (!integer(action.plot,MAX_PLOTS-1) || action.plot >= farm.plots.length) return fail('Unlock that planting bed first.');
    const plot = farm.plots[action.plot], stats = getFarmStats(player);
    if (action.type === 'plantCrop') {
      if (!cropById.has(action.crop) || !farm.crops[action.crop]) return fail('Unlock those seeds before planting.');
      if (plot.crop !== null) return fail('Harvest this bed before planting again.');
      return purchase(farmSeedCost(player,action.crop),() => plantPlot(plot,action.crop));
    }
    if (!plot.crop) return fail('Plant this bed first.');
    if (action.type === 'waterCrop') {
      if (stats.autoWater) return fail('Hydroponics already keeps this bed watered.');
      if (plot.progress >= 1) return fail('This bed is ready to harvest.');
      if (plot.water >= 1-1e-9) return fail('This soil is still soaked.');
      plot.water = 1; return {ok:true};
    }
    if (action.type === 'fertiliseCrop') {
      if (plot.progress >= 1) return fail('This bed is ready to harvest.');
      if (plot.fertilised) return fail('This bed is already fertilised.');
      plot.fertilised = true; return {ok:true};
    }
    if (plot.progress < 1) return fail('This vegetable is still growing.');
    const crop = plot.crop, quantity = harvestPlot(farm,plot,stats);
    if (quantity <= 0) return fail('The pantry is full. Feed Beam before harvesting.');
    return {ok:true,crop,quantity};
  }
  if (action.type === 'feedBeam') {
    const crop = cropById.get(action.crop);
    if (!crop || !farm.crops[crop.id] || !(farm.inventory[crop.id] > 0)) return fail('Harvest that vegetable before feeding Beam.');
    // Every meal also fuels the ship. When Beam is already full, the food goes straight into the tank.
    const fuelRoom = Math.max(0,fuelRoomOf(context)), mealValue = crop.secret ? COOKED_SECONDS : crop.feedSeconds*getFarmStats(player).feedMultiplier;
    const fuelMultiplier = Number.isFinite(context?.fuelMultiplier) && context.fuelMultiplier > 0 ? context.fuelMultiplier : 1;
    const fuel = Math.min(fuelRoom,mealValue*fuelMultiplier), eat = () => { farm.inventory[crop.id]--; farm.meals = Math.min(Number.MAX_SAFE_INTEGER,farm.meals+1); };
    if (crop.secret) {
      if (farm.cookedSeconds >= COOKED_SECONDS && fuel <= 0) return fail('Beam is already cooked for 4m 20s, and the ship’s tank is full.');
      eat(); const seconds = COOKED_SECONDS-farm.cookedSeconds; farm.cookedSeconds = COOKED_SECONDS;
      return {ok:true,crop:crop.id,seconds,fuel,scoreMultiplier:COOKED_SCORE_MULTIPLIER};
    }
    if (farm.fedSeconds >= MAX_FED_SECONDS && fuel <= 0) return fail('Beam is full for now, and so is the ship’s tank.');
    const seconds = Math.min(MAX_FED_SECONDS-farm.fedSeconds,mealValue);
    eat(); farm.fedSeconds += seconds;
    return {ok:true,crop:crop.id,seconds,fuel};
  }
  return fail('Unknown garden action.');
}

const FARM_KEYS = ['unlocked','plots','crops','inventory','upgrades','fedSeconds','cookedSeconds','meals','tractorClock','pickerClock'];
const PLOT_KEYS = ['crop','progress','water','fertilised'];
export function validateFarm(farm) {
  if (!record(farm) || typeof farm.unlocked !== 'boolean' || !Array.isArray(farm.plots) || farm.plots.length < 1 || farm.plots.length > MAX_PLOTS
    || !record(farm.crops) || farm.crops.carrot !== true || !record(farm.inventory) || !record(farm.upgrades)
    || !bounded(farm.fedSeconds,MAX_FED_SECONDS) || !bounded(farm.cookedSeconds,COOKED_SECONDS) || !integer(farm.meals)
    || !bounded(farm.tractorClock,TRACTOR_SECONDS) || !bounded(farm.pickerClock,PICKER_SECONDS)) return false;
  if (Object.keys(farm).some(key => !FARM_KEYS.includes(key))) return false;
  if (Object.entries(farm.crops).some(([id,value]) => !cropById.has(id) || value !== true)) return false;
  if (farm.cookedSeconds > 0 && !farm.crops.weed) return false;
  if (Object.entries(farm.inventory).some(([id,value]) => !cropById.has(id) || !farm.crops[id] || !integer(value,MAX_VEGETABLES))) return false;
  if (Object.entries(farm.upgrades).some(([id,value]) => !upgradeById.has(id) || !integer(value,upgradeById.get(id).maxLevel))) return false;
  if ((!farm.upgrades.tractor && farm.tractorClock !== 0) || (!farm.upgrades.picker && farm.pickerClock !== 0)) return false;
  if (!farm.plots.every(plot => record(plot) && Object.keys(plot).every(key => PLOT_KEYS.includes(key)) && bounded(plot.progress,1) && bounded(plot.water,1) && typeof plot.fertilised === 'boolean'
    && (plot.crop === null ? plot.progress === 0 && plot.water === 0 && plot.fertilised === false : cropById.has(plot.crop) && farm.crops[plot.crop]))) return false;
  if (!farm.unlocked && (farm.plots.length !== 1 || Object.keys(farm.crops).length !== 1 || Object.keys(farm.inventory).length || Object.keys(farm.upgrades).length || farm.plots[0].crop !== null || farm.fedSeconds || farm.cookedSeconds || farm.meals)) return false;
  return true;
}

/** The retired fertiliser upgrade becomes a tractor that fertilises for you. */
function migrateUpgrades(upgrades) {
  if (!record(upgrades) || !Object.hasOwn(upgrades,'fertiliser')) return upgrades;
  const {fertiliser,...rest} = upgrades;
  return {...rest,tractor:Math.max(rest.tractor || 0,Math.min(3,fertiliser))};
}
/** Older named saves: `{crop,progress}` plots, a `fertiliser` upgrade and no automation clocks. Validation follows. */
export function migrateFarm(farm) {
  if (!record(farm)) return farm;
  const next = {...farm};
  if (Array.isArray(farm.plots)) next.plots = farm.plots.map(plot => record(plot) && !Object.hasOwn(plot,'water')
    ? {...plot,water:plot.crop === null ? 0 : 1,fertilised:false} : plot);
  if (record(farm.upgrades)) next.upgrades = migrateUpgrades(farm.upgrades);
  if (!Object.hasOwn(next,'tractorClock')) next.tractorClock = 0;
  if (!Object.hasOwn(next,'pickerClock')) next.pickerClock = 0;
  if (!Object.hasOwn(next,'cookedSeconds')) next.cookedSeconds = 0;
  return next;
}

/** Compact only on disk/on the relay; the simulation and view keep named fields. */
export function packFarm(farm) {
  return [farm.unlocked?1:0,CROPS.reduce((mask,crop,index)=>mask|(farm.crops[crop.id]?1<<index:0),0),
    farm.plots.map(plot=>plot.crop===null?[0]:[CROPS.findIndex(crop=>crop.id===plot.crop)+1,plot.progress,plot.water,plot.fertilised?1:0]),
    CROPS.map(crop=>farm.inventory[crop.id]??null),FARM_UPGRADES.map(upgrade=>farm.upgrades[upgrade.id]??null),farm.fedSeconds,farm.meals,farm.tractorClock,farm.pickerClock,farm.cookedSeconds];
}
/** Legacy seven-field farms hold `[crop,progress]` beds; current nine-field farms hold `[0]` or `[crop,progress,water,fertilised]`. */
const packedPlotOk = (plot,legacy,cropCount) => Array.isArray(plot) && integer(plot[0],cropCount)
  && (legacy ? plot.length===2 && (plot[0]===0 ? plot[1]===0 : bounded(plot[1],1))
    : plot[0]===0 ? plot.length===1 : plot.length===4 && bounded(plot[1],1) && bounded(plot[2],1) && [0,1].includes(plot[3]));
export function unpackFarm(packed) {
  if (!Array.isArray(packed) || ![7,9,10].includes(packed.length)) return null;
  const legacy = packed.length===7, cropCount = packed.length===10 ? CROPS.length : 4, crops = CROPS.slice(0,cropCount), upgradeIds = legacy ? LEGACY_UPGRADES : FARM_UPGRADES.map(upgrade=>upgrade.id);
  if (![0,1].includes(packed[0]) || !integer(packed[1],(1<<cropCount)-1) || !(packed[1]&1)
    || !Array.isArray(packed[2]) || packed[2].length < 1 || packed[2].length > MAX_PLOTS || !packed[2].every(plot=>packedPlotOk(plot,legacy,cropCount))
    || !Array.isArray(packed[3]) || packed[3].length !== cropCount || !packed[3].every(value=>value===null || integer(value,MAX_VEGETABLES))
    || !Array.isArray(packed[4]) || packed[4].length !== upgradeIds.length || !packed[4].every(value=>value===null || integer(value,3))
    || (!legacy && (!bounded(packed[7],TRACTOR_SECONDS) || !bounded(packed[8],PICKER_SECONDS)))) return null;
  const farm={unlocked:packed[0]===1,crops:Object.fromEntries(crops.filter((crop,index)=>packed[1]&(1<<index)).map(crop=>[crop.id,true])),
    plots:packed[2].map(plot=>plot[0]===0?emptyPlot():{crop:CROPS[plot[0]-1].id,progress:plot[1],water:plot.length===4?plot[2]:1,fertilised:plot.length===4&&plot[3]===1}),
    inventory:Object.fromEntries(crops.flatMap((crop,index)=>packed[3][index]===null?[]:[[crop.id,packed[3][index]]])),
    upgrades:migrateUpgrades(Object.fromEntries(upgradeIds.flatMap((id,index)=>packed[4][index]===null?[]:[[id,packed[4][index]]]))),
    fedSeconds:packed[5],meals:packed[6],tractorClock:packed[7]??0,pickerClock:packed[8]??0,cookedSeconds:packed.length===10?packed[9]:0};
  return validateFarm(farm)?farm:null;
}
