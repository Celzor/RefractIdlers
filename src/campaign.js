/** The ten-system route ends at the living Refract crystal. */
export const CAMPAIGN_VERSION = 2;
export const BOSS_DURATION = 30;
export const SECRET_HP = 1e9;
export const SECRET_DURATION = 30;
export const FINAL_LEVEL = 200;
export const FINAL_HP = 1e120;
export const FINAL_MIN_SECONDS = 10800;
export const VICTORY_PRESTIGE_REWARD = 100;
const worlds=['Ember','Lumen','Cairn','Moss','Halo','Tide','Cobalt','Vesper','Iris','Bastion','Flare','Haven','Opal','Echo','Grove','Aether','Meridian','Aurora','Zenith','Crown'];
const regions=[
  ['solace','Solace','The first light: a familiar orbit and twenty small worlds.','#d9bb70'],
  ['verdant','Verdant Reach','Garden worlds carry the first traces of living light.','#87b879'],
  ['cinder','Cinderwake','Volcanic planets shelter denser, hotter cores.','#d88b66'],
  ['azure','Azure Drift','Ocean worlds shimmer beneath an electric blue star.','#73b5c8'],
  ['gilded','Gilded Spiral','Metallic worlds bend starlight into vast golden rings.','#d6b259'],
  ['violet','Violet Expanse','Amethyst planets hold the memory of distant stars.','#ac8bc7'],
  ['hollow','Hollow Crown','Ancient hollow worlds guard the route beyond the known sky.','#9ca7ba'],
  ['chronos','Chronos Veil','Timeworn planets circle a star that seems to remember you.','#7dc5ba'],
  ['infinite','Infinite Prism','A thousand colours point towards one final home.','#cc9abc'],
  ['crystal','Crystal','Beam’s home. Its cores are the hardest substance across every parallel universe.','#a5daba'],
];
export const SYSTEMS=Object.freeze(regions.map(([id,name,description,color],index)=>Object.freeze({
  id,name,description,color,startLevel:index*20+1,endLevel:(index+1)*20,
  planets:Object.freeze(worlds.map((world,planet)=>index===9&&planet===19?'Refract — Beam’s home':`${name.split(' ')[0]} ${world}`)),
})));
export function getCampaignLocation(level){
  const core=Math.max(1,Math.min(FINAL_LEVEL,Math.floor(Number(level)||1))),index=Math.floor((core-1)/20),planetIndex=(core-1)%20;
  return {system:SYSTEMS[index],index,planetIndex,planetName:SYSTEMS[index].planets[planetIndex],final:core===FINAL_LEVEL};
}
export const getSystemHpMultiplier=level=>3**getCampaignLocation(level).index;
/**
 * Beam's meals fuel the ship. Every twentieth planet is a jump point: its core (the system boss, or
 * Refract itself at the end) is out of reach until the tank holds this system's fuel target.
 */
export const FUEL_TARGETS=Object.freeze([120,200,350,600,1000,1700,2900,4900,8400,14000]);
export const isJumpPoint=level=>Number.isSafeInteger(level)&&level>=20&&level<=FINAL_LEVEL&&level%20===0;
export const fuelTarget=level=>FUEL_TARGETS[getCampaignLocation(level).index];
/** Resonance makes astronomical HP readable without losing tiny hits to float precision. */
export function resonanceFraction(rawDamage){return Math.min(.01,Math.log10(1+Math.max(0,Number.isFinite(rawDamage)?rawDamage:0))/100000);}
