/** Persistent research and prestige disciplines. Effects are evaluated by game.js. */
export const SKILL_BRANCHES = Object.freeze([
  { id: 'click', name: 'Active light', description: 'Impact, critical hits, echoes and sustained combos.', currency: 'skill' },
  { id: 'idle', name: 'Living light', description: 'Farms, arrays, stars and machine synergies.', currency: 'skill' },
  { id: 'team', name: 'Shared frequency', description: 'Resonance that spreads across a co-op crew.', currency: 'skill' },
  { id: 'orbs', name: 'Orb geology', description: 'Shatter tougher orbs and extract richer boss drops.', currency: 'skill' },
  { id: 'automation', name: 'Clockwork orbit', description: 'Independent automated damage and minting.', currency: 'skill' },
  { id: 'mint', name: 'Luminous mint', description: 'Earn LRC with every manual press.', currency: 'skill' },
  { id: 'fortune', name: 'Prism fortune', description: 'Critical multipliers, extra hits and longer combos.', currency: 'skill' },
  { id: 'mastery', name: 'Long horizon', description: 'Long-term research income and cross-discipline growth.', currency: 'skill' },
  { id: 'farm', name: 'Beam’s garden', description: 'Faster vegetables, richer harvests and stronger meals for Beam.', currency: 'skill' },
  { id: 'chronos', name: 'Spacetime', description: 'Stretch active rounds from one minute to three. The longest researched duration leads the crew.', currency: 'skill' },
  { id: 'kit', name: 'Outfitting', description: 'One-rank licences that open Beam’s Garden, click technology and the Arsenal.', currency: 'skill' },
  { id: 'ascension', name: 'Eternal light', description: 'Spend prestige points on permanent disciplines.', currency: 'prestige' },
]);

const lines = {
  click: [
    ['tap-tuning', 'Focused light', '+2 base damage per manual or automatic hit.', { damageFlat: 2 }],
    ['lucky-photon', 'Critical mass', '+2.5 percentage points of manual critical chance.', { critChance: 0.025 }],
    ['singularity', 'Singularity', '+12% damage from every hit.', { damagePct: 0.12 }],
    ['echo-strike', 'Echo strike', '+6 percentage points of a bonus manual hit.', { extraHitChance: 0.06 }],
    ['combo-lens', 'Combo lens', '+1.2% damage per sustained combo stack.', { comboPower: 0.012 }],
    ['quantum-barrage', 'Quantum barrage', '+10 percentage points of a bonus hit and +8% damage.', { extraHitChance: 0.1, damagePct: 0.08 }],
  ],
  idle: [
    ['solar-cells', 'Solar cells', '+2 continuous LRC per second.', { passiveFlat: 2 }],
    ['orbital-array', 'Orbital array', '+15% continuous income and automatic attack speed.', { passivePct: 0.15, autoPct: 0.15 }],
    ['perpetuity', 'Perpetual motion', '+12% machine income and automatic attack speed.', { generatorPct: 0.12, autoPct: 0.12 }],
    ['orb-horticulture', 'Orb horticulture', '+20% farm yield; each light array adds another 0.3% farm yield.', { farmPct: 0.2, farmSynergy: 0.003 }],
    ['stellar-fusion', 'Stellar fusion', '+25% pocket-star yield and +12% light-array yield.', { starPct: 0.25, arrayPct: 0.12 }],
    ['dyson-crown', 'Dyson crown', '+30% continuous income; each owned machine adds 0.2% machine yield.', { passivePct: 0.3, generatorSynergy: 0.002 }],
  ],
  team: [
    ['shared-frequency', 'Shared frequency', '+2.5% income and damage; shared across the crew in co-op.', { frequency: 0.025 }],
    ['resonance', 'Resonance', '+1.5% shared frequency and +7% personal income and damage.', { frequency: 0.015, personalPct: 0.07 }],
    ['unity', 'Event horizon', '+9% personal income and damage. Owning any rank adds 1 SP each round.', { personalPct: 0.09 }],
    ['concordance', 'Concordance', '+1.2% frequency per active pilot in co-op; counts one pilot in scoreboard.', { crewStrength: 0.012 }],
    ['chorus-reactor', 'Chorus reactor', '+2% automatic attack speed per active co-op pilot, shared by the crew.', { crewAutomation: 0.02 }],
    ['collective-light', 'Collective light', '+8% shared frequency and +10% personal income and damage.', { frequency: 0.08, personalPct: 0.1 }],
  ],
  orbs: [
    ['chip-fracture', 'Chip fracture', '+6% damage and +1 base LRC on every shattered orb.', { damagePct: 0.06, dropFlat: 1 }],
    ['prism-bounty', 'Prism bounty', '+12% LRC from shattered orbs.', { dropPct: 0.12 }],
    ['bossbreaker', 'Bossbreaker', '+20% damage against every tenth orb: the boss.', { bossDamagePct: 0.2 }],
    ['royal-spectrum', 'Royal spectrum', '+30% additional LRC from boss orbs.', { bossDropPct: 0.3 }],
    ['orb-geology', 'Orb geology', '+0.5% orb rewards per log2 of your highest orb plus one.', { orbScaling: 0.005 }],
    ['event-harvester', 'Event harvester', '+30% orb rewards and +25% boss damage.', { dropPct: 0.3, bossDamagePct: 0.25 }],
  ],
  automation: [
    ['clockwork-core', 'Clockwork core', '+0.1 automatic attacks per second, even without an auto clicker.', { autoFlat: 0.1 }],
    ['servo-lenses', 'Servo lenses', '+12% automatic attack damage.', { autoDamagePct: 0.12 }],
    ['parallel-beams', 'Parallel beams', '+15% automatic attack speed.', { autoPct: 0.15 }],
    ['autonomous-mint', 'Autonomous mint', 'Every automatic attack also mints 10% of your manual click income.', { autoMint: 0.1 }],
    ['recursive-circuit', 'Recursive circuit', '+30% automatic attack speed and +12% automatic damage.', { autoPct: 0.3, autoDamagePct: 0.12 }],
    ['eternal-engine', 'Eternal engine', '+35% automatic speed and +15% rewards from automatic orb kills.', { autoPct: 0.35, autoDropPct: 0.15 }],
  ],
  mint: [
    ['light-press', 'Light press', '+0.5 LRC minted by every manual click.', { mintFlat: 0.5 }],
    ['coin-spectrum', 'Coin spectrum', '+20% manual click-mint income.', { mintPct: 0.2 }],
    ['compound-press', 'Compound press', '+2 minted LRC per click and +0.5 base hit damage.', { mintFlat: 2, damageFlat: 0.5 }],
    ['prism-dividends', 'Prism dividends', 'Every owned machine adds +0.2% click-mint income.', { mintSynergy: 0.002 }],
    ['brilliant-tender', 'Brilliant tender', '+10% click-mint income and another +25% during solar surge.', { mintPct: 0.1, surgeMintPct: 0.25 }],
    ['stellar-treasury', 'Stellar treasury', '+10 minted LRC per click and +30% click-mint income.', { mintFlat: 10, mintPct: 0.3 }],
  ],
  fortune: [
    ['lucky-glint', 'Lucky glint', '+1 percentage point of critical chance and +3% orb rewards.', { critChance: 0.01, dropPct: 0.03 }],
    ['prismatic-edge', 'Prismatic edge', '+0.15 to the critical damage multiplier.', { critMultiplier: 0.15 }],
    ['multispectrum', 'Multispectrum', '+3.5 percentage points of a bonus manual hit.', { extraHitChance: 0.035 }],
    ['critical-overflow', 'Critical overflow', 'Critical clicks mint an extra +20% LRC.', { criticalMintPct: 0.2 }],
    ['fortune-loop', 'Fortune loop', '+3 combo capacity and +0.8% damage per combo stack.', { comboCap: 3, comboPower: 0.008 }],
    ['supernova-luck', 'Supernova luck', '+0.35 critical damage multiplier and +1.5 percentage points of critical chance.', { critMultiplier: 0.35, critChance: 0.015 }],
  ],
  mastery: [
    ['patient-study', 'Patient study', '+1 continuous LRC per second and +0.1 minted LRC per click.', { passiveFlat: 1, mintFlat: 0.1 }],
    ['field-notes', 'Field notes', '+3.5% damage and +4% orb rewards.', { damagePct: 0.035, dropPct: 0.04 }],
    ['orb-scholar', 'Orb scholar', '+0.4% orb rewards per log2 of your highest orb plus one.', { orbScaling: 0.004 }],
    ['deep-research', 'Deep research', '+5% damage and +0.2 research insight. Each whole insight adds 1 SP per round.', { damagePct: 0.05, insight: 0.2 }],
    ['chrono-archive', 'Chrono archive', '+10% automatic speed and +0.2 research insight.', { autoPct: 0.1, insight: 0.2 }],
    ['universal-theory', 'Universal theory', '+5% personal income/damage and +0.5 research insight.', { personalPct: 0.05, insight: 0.5 }],
  ],
};
lines.farm = [
  ['seed-science', 'Seed science', '+10% vegetable growth speed per rank.', { cropSpeed: 0.1 }],
  ['long-lunch', 'Long lunch', '+10% Beam meal duration per rank.', { mealDuration: 0.1 }],
  ['garden-planning', 'Garden planning', 'Beds, equipment and new seeds cost 3% less per rank; total discount caps at 75%.', { farmDiscount: 0.03 }],
  ['abundant-harvest', 'Abundant harvest', '+1 vegetable in every harvested bed per rank.', { cropYield: 1 }],
  ['photosynthetic-feast', 'Photosynthetic feast', 'Meals add another 3 percentage points of income and damage per rank.', { beamBoost: 0.03 }],
  ['orbital-ecosystem', 'Orbital ecosystem', '+20% crop growth speed and +10% meal duration per rank.', { cropSpeed: 0.2, mealDuration: 0.1 }],
];
lines.chronos = [
  ['clock-stretch', 'Clock stretch', '+2 seconds to each future round per rank.', { roundSeconds: 2 }],
  ['orbital-intervals', 'Orbital intervals', '+2 seconds to each future round per rank.', { roundSeconds: 2 }],
  ['time-prism', 'Time prism', '+3 seconds to each future round per rank.', { roundSeconds: 3 }],
  ['chronal-reservoir', 'Chronal reservoir', '+4 seconds to each future round per rank.', { roundSeconds: 4 }],
  ['spacetime-fold', 'Spacetime fold', '+4 seconds to each future round per rank.', { roundSeconds: 4 }],
  ['infinite-afternoon', 'Infinite afternoon', '+5 seconds per rank. Complete this discipline for 180-second rounds.', { roundSeconds: 5 }],
];
const tiers = [1, 4, 15, 50, 180, 600];
const maxRanks = [8, 8, 8, 6, 5, 4];
const orbGates = [0, 10, 25, 50, 100, 175];
const roundGates = [0, 3, 15, 60, 240, 720];
const branchIds = Object.keys(lines);
const icons = ['✦', '☀', '⌁', '◈', '◎', '¤', '✧', '∞'];
const research = branchIds.flatMap((branch, branchIndex) => lines[branch].map(([id, name, description, effects], tier) => {
  const requires = tier ? [lines[branch][tier - 1][0]] : [];
  const requiredRanks = tier ? { [requires[0]]: tier < 3 ? tier + 1 : 2 } : {};
  if (tier >= 3) {
    // Keep shipped cross-branch prerequisites stable when adding disciplines.
    const cross = lines[branch === 'farm' ? 'idle' : branch === 'chronos' ? 'mastery' : branchIds[(branchIndex + 1) % 8]][tier - 2][0];
    requires.push(cross); requiredRanks[cross] = tier >= 5 ? 1 : 2;
  }
  return { id, name, branch, description, effects, cost: tiers[tier], costGrowth: 1.38,
    maxRank: maxRanks[tier], requires, requiredRanks, currency: 'skill', tier: tier + 1,
    gates: { orb: orbGates[tier], rounds: roundGates[tier], prestiges: tier >= 4 ? 3 : tier >= 3 ? 1 : 0, prestige: tier === 5 ? 10 : 0, ...(branch === 'farm' ? {farm:true} : {}) },
    icon: icons[branchIndex] || '♧' };
}));

const eternalLines = [
  [
    ['eternal-spark', 'Eternal spark', '+5% damage and minted LRC per rank.', { damagePct: 0.05, mintPct: 0.05 }],
    ['crown-of-rays', 'Crown of rays', '+10% boss damage and +5% orb rewards per rank.', { bossDamagePct: 0.1, dropPct: 0.05 }],
    ['stellar-heart', 'Stellar heart', '+0.2 critical multiplier and +3% personal power per rank.', { critMultiplier: 0.2, personalPct: 0.03 }],
    ['source-of-light', 'Source of light', '+10% damage, +5% minted LRC and +5% orb rewards per rank.', { damagePct: 0.1, mintPct: 0.05, dropPct: 0.05 }],
  ],
  [
    ['enduring-orbit', 'Enduring orbit', '+5% passive income and automatic speed per rank.', { passivePct: 0.05, autoPct: 0.05 }],
    ['timeless-machinery', 'Timeless machinery', '+8% machine production and automatic damage per rank.', { generatorPct: 0.08, autoDamagePct: 0.08 }],
    ['recursive-light', 'Recursive light', '+10% automatic speed and +5% automatic orb rewards per rank.', { autoPct: 0.1, autoDropPct: 0.05 }],
    ['everlight', 'Everlight', '+15% passive income and +10% automatic speed per rank.', { passivePct: 0.15, autoPct: 0.1 }],
  ],
  [
    ['prism-memory', 'Prism memory', '+5% orb rewards and +1% frequency per rank.', { dropPct: 0.05, frequency: 0.01 }],
    ['keepers-insight', "Keeper's insight", '+0.2 research insight and +3% personal power per rank.', { insight: 0.2, personalPct: 0.03 }],
    ['eternal-record', 'Eternal record', '+5% orb rewards and +2% frequency per rank.', { dropPct: 0.05, frequency: 0.02 }],
    ['infinite-library', 'Infinite library', '+0.2 research insight and +5% personal power per rank.', { insight: 0.2, personalPct: 0.05 }],
  ],
];
eternalLines.push([
  ['evergreen-roots', 'Evergreen roots', '+15% vegetable growth speed per rank, across every prestige.', { cropSpeed: 0.15 }],
  ['heirloom-harvest', 'Heirloom harvest', '+1 vegetable per harvested bed per rank, across every prestige.', { cropYield: 1 }],
  ['endless-lunch', 'Endless lunch', '+20% meal duration per rank, across every prestige.', { mealDuration: 0.2 }],
  ['beams-bounty', 'Beam’s bounty', 'Meals add 5 percentage points of income and damage per rank, permanently.', { beamBoost: 0.05 }],
]);
const prestige = eternalLines.flatMap((line, lineIndex) => line.map(([id, name, description, effects], tier) => ({
  id, name, description, effects, branch: 'ascension', currency: 'prestige', tier: tier + 1,
  cost: [1, 3, 8, 20][tier], costGrowth: 1.65, maxRank: 5,
  requires: tier ? [line[tier - 1][0]] : [], requiredRanks: tier ? { [line[tier - 1][0]]: 2 } : {},
  gates: { orb: [0, 30, 80, 150][tier], rounds: [0, 30, 180, 720][tier], prestiges: 1, prestige: [1, 5, 20, 100][tier], ...(lineIndex === 3 ? {farm:true} : {}) }, icon: '✧',
})));

/** Outfitting: independent one-rank licences. Each opens a whole feature rather than tuning a number. */
const kitLines = [
  ['garden-licence', 'Garden licence', 'Opens Beam’s Garden: grow vegetables, feed Beam and fuel the ship.', { garden: 1 }, 2, { orb: 0, rounds: 1 }],
  ['click-licence', 'Click tech licence', 'Opens the Click technology catalogue: wormholes, quantum foam and string theory.', { clickTech: 1 }, 3, { orb: 5, rounds: 2 }],
  ['arsenal-licence', 'Arsenal licence', 'Opens the Arsenal catalogue: autonomous weapons that strike and mint on their own.', { arsenal: 1 }, 4, { orb: 10, rounds: 4 }],
];
const kit = kitLines.map(([id, name, description, effects, cost, gates], tier) => ({ id, name, branch: 'kit', description, effects, cost, costGrowth: 1,
  maxRank: 1, requires: [], requiredRanks: {}, currency: 'skill', tier: tier + 1, gates: { ...gates, prestiges: 0, prestige: 0 }, icon: '⚿' }));

// Compact new IDs keep eight completed builds inside Refract's relay envelope.
// Original shipped IDs remain unchanged; readable keys stay in catalog metadata.
// Packed saves index this array by position, so new disciplines are appended after the prestige lines.
const legacy = new Set(['tap-tuning', 'lucky-photon', 'singularity', 'solar-cells', 'orbital-array', 'perpetuity', 'shared-frequency', 'resonance', 'unity']);
const raw = [...research, ...prestige, ...kit];
const ids = new Map(raw.map((skill, index) => [skill.id, legacy.has(skill.id) ? skill.id
  : skill.currency === 'prestige' ? `p${String(index - research.length + 1).padStart(2, '0')}` : `${skill.branch.slice(0, 2)}${skill.tier}`]));
export const SKILLS = Object.freeze(raw.map((skill) => ({ ...skill, key: skill.id, id: ids.get(skill.id),
  requires: skill.requires.map((id) => ids.get(id)),
  requiredRanks: Object.fromEntries(Object.entries(skill.requiredRanks).map(([id, value]) => [ids.get(id), value])),
})));
export const RESEARCH_TOTAL_RANKS = [...research, ...kit].reduce((sum, skill) => sum + skill.maxRank, 0);
export const RESEARCH_TOTAL_COST = [...research, ...kit].reduce((sum, skill) => sum + Array.from({ length: skill.maxRank }, (_, rank) => Math.ceil(skill.cost * skill.costGrowth ** rank)).reduce((a, b) => a + b, 0), 0);
// 2 base + 1 milestone + 1 Event horizon + floor(4.2 research + 2 prestige insight).
export const MAX_SKILL_POINTS_PER_ROUND = 10;
