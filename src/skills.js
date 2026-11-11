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
  { id: 'arsenal', name: 'Arsenal doctrine', description: 'Targeting, overclocked mice, heavier beams, relay income and cheaper weapons.', currency: 'skill' },
  { id: 'industry', name: 'Deep industry', description: 'Sails, cathedrals, lanterns, sharper refractometers and bulk machine contracts.', currency: 'skill' },
  { id: 'engineering', name: 'Click engineering', description: 'Tune wormholes, quantum foam, strings, combo memory and the solar surge.', currency: 'skill' },
  { id: 'hull', name: 'Hull integrity', description: 'Shields against boss light rays, salvage, reflected rays and comet chasing.', currency: 'skill' },
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
    ['solar-cells', 'Solar cells', '+2 continuous LRC per second and +2% continuous income.', { passiveFlat: 2, passivePct: 0.02 }],
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
    ['bossbreaker', 'Bossbreaker', '+20% damage against system bosses, the armoured twentieth core of every system.', { bossDamagePct: 0.2 }],
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
/**
 * Later disciplines: dedicated lines for the Arsenal, the deep collection machines, Click technology
 * and the hull. They sit after every shipped node in the catalog so packed saves keep their positions.
 */
const laterLines = {
  arsenal: [
    ['targeting-array', 'Targeting array', '+6% damage from every Arsenal weapon per rank.', { arsenalDamagePct: 0.06 }],
    ['overclocked-mice', 'Overclocked mice', '+8% AI Mouse click rate per rank.', { mouseRatePct: 0.08 }],
    ['lazor-capacitors', 'Lazor capacitors', 'Each Lazer cannon beam deals +2 automatic hits of damage per rank.', { laserHits: 2 }],
    ['relay-uplink', 'Relay uplink', '+15% Starlink probe and Star gate income per rank.', { arsenalIncomePct: 0.15 }],
    ['gate-resonance', 'Gate resonance', 'Each Star gate strike deals +10 automatic hits and the Arsenal fires 4% faster per rank.', { gateHits: 10, arsenalSpeedPct: 0.04 }],
    ['fleet-doctrine', 'Fleet doctrine', '+10% Arsenal damage, and Arsenal weapons cost 5% less per rank.', { arsenalDamagePct: 0.1, arsenalDiscount: 0.05 }],
  ],
  industry: [
    ['mirror-polish', 'Mirror polish', '+10% Solar sail yield per rank.', { sailPct: 0.1 }],
    ['calibrated-optics', 'Calibrated optics', 'Each Refractometer adds another 0.5 percentage points of damage and production per rank.', { starBonus: 0.005 }],
    ['cathedral-choir', 'Cathedral choir', '+12% Lens cathedral yield per rank.', { lensPct: 0.12 }],
    ['lantern-wardens', 'Lantern wardens', '+15% Dyson lantern yield per rank.', { dysonPct: 0.15 }],
    ['bulk-contracts', 'Bulk contracts', 'Workshop machines cost 3% less per rank.', { workshopDiscount: 0.03 }],
    ['stellar-foundry', 'Stellar foundry', '+20% yield from sails, cathedrals, lanterns and forges; each owned machine adds another 0.1% machine yield per rank.', { deepPct: 0.2, generatorSynergy: 0.001 }],
  ],
  engineering: [
    ['wormhole-tuning', 'Wormhole tuning', 'Each Wormhole generator adds +1 more base damage per rank.', { wormholeFlat: 1 }],
    ['foam-density', 'Foam density', 'Each Quantum foamer adds +5 more percentage points of damage per rank.', { foamerPct: 0.05 }],
    ['string-harmonics', 'String harmonics', 'Each String detheory adds +0.05 more to the critical multiplier per rank.', { stringCrit: 0.05 }],
    ['combo-memory', 'Combo memory', 'Combos survive +0.5 seconds longer between hits per rank.', { comboSeconds: 0.5 }],
    ['flywheel-gearing', 'Flywheel gearing', '+2 combo capacity, and Click technology costs 4% less per rank.', { comboCap: 2, clickDiscount: 0.04 }],
    ['surge-engine', 'Surge engine', 'The solar surge multiplies damage by another +0.25× per rank.', { surgeDamagePct: 0.25 }],
  ],
  hull: [
    ['prism-shield', 'Prism shield', 'Blocks one more light-ray impact (LRI) per boss attempt per rank. Light rays burst from bosses when you click.', { shield: 1 }],
    ['flare-dampers', 'Flare dampers', 'Boss light rays are 10% less likely per manual hit per rank.', { flareResist: 0.1 }],
    ['salvage-drones', 'Salvage drones', 'A machine destroyed by a light ray refunds 15% of its replacement price per rank.', { salvagePct: 0.15 }],
    ['ablative-lattice', 'Ablative lattice', 'Each blocked light ray reflects 10 automatic hits of damage into the boss per rank.', { reflectHits: 10 }],
    ['comet-chaser', 'Comet chaser', 'Manual hits during a passing comet deal +1× more damage per rank.', { cometDamage: 1 }],
    ['aegis-of-light', 'Aegis of light', '+1 shield charge, and comet clicks mint +2× more per rank.', { shield: 1, cometMint: 2 }],
  ],
};
const tiers = [1, 4, 15, 50, 180, 600];
const maxRanks = [8, 8, 8, 6, 5, 4];
const hullRanks = [3, 5, 4, 4, 5, 3];
const orbGates = [0, 10, 25, 50, 100, 175];
const roundGates = [0, 3, 15, 60, 240, 720];
const branchIds = Object.keys(lines);
const laterBranchIds = Object.keys(laterLines);
/** Later lines link into the shipped discipline they extend. */
const laterCross = { arsenal: 'automation', industry: 'idle', engineering: 'click', hull: 'orbs' };
const licenceFor = { arsenal: 'arsenal-licence', engineering: 'click-licence' };
const icons = ['✦', '☀', '⌁', '◈', '◎', '¤', '✧', '∞', '♧', '⌛', '⚿', '⌖', '✺', '↻', '⛨'];
function researchNode(branch, branchIndex, [id, name, description, effects], tier, later = false) {
  const source = later ? laterLines[branch] : lines[branch];
  const requires = tier ? [source[tier - 1][0]] : [];
  const requiredRanks = tier ? { [requires[0]]: tier < 3 ? tier + 1 : 2 } : {};
  if (tier >= 3) {
    // Keep shipped cross-branch prerequisites stable when adding disciplines.
    const crossBranch = later ? laterCross[branch] : branch === 'farm' ? 'idle' : branch === 'chronos' ? 'mastery' : branchIds[(branchIndex + 1) % 8];
    const cross = lines[crossBranch][tier - 2][0];
    requires.push(cross); requiredRanks[cross] = tier >= 5 ? 1 : 2;
  }
  if (!tier && licenceFor[branch]) { requires.push(licenceFor[branch]); requiredRanks[licenceFor[branch]] = 1; }
  return { id, name, branch, description, effects, cost: tiers[tier], costGrowth: 1.38,
    maxRank: branch === 'hull' ? hullRanks[tier] : maxRanks[tier], requires, requiredRanks, currency: 'skill', tier: tier + 1,
    gates: { orb: orbGates[tier], rounds: roundGates[tier], prestiges: tier >= 4 ? 3 : tier >= 3 ? 1 : 0, prestige: tier === 5 ? 10 : 0, ...(branch === 'farm' ? {farm:true} : {}) },
    icon: icons[later ? branchIds.length + 1 + laterBranchIds.indexOf(branch) : branchIndex] || '♧' };
}
const research = branchIds.flatMap((branch, branchIndex) => lines[branch].map((entry, tier) => researchNode(branch, branchIndex, entry, tier)));
const laterResearch = laterBranchIds.flatMap((branch, index) => laterLines[branch].map((entry, tier) => researchNode(branch, index, entry, tier, true)));

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
  [
    ['evergreen-roots', 'Evergreen roots', '+15% vegetable growth speed per rank, across every prestige.', { cropSpeed: 0.15 }],
    ['heirloom-harvest', 'Heirloom harvest', '+1 vegetable per harvested bed per rank, across every prestige.', { cropYield: 1 }],
    ['endless-lunch', 'Endless lunch', '+20% meal duration per rank, across every prestige.', { mealDuration: 0.2 }],
    ['beams-bounty', 'Beam’s bounty', 'Meals add 5 percentage points of income and damage per rank, permanently.', { beamBoost: 0.05 }],
  ],
];
/** Later chains: the hangar keeps a run from starting empty; the hull chain hardens the ship against space itself. */
const laterEternalLines = [
  [
    ['launch-kit', 'Launch kit', 'Every run after a prestige begins with +2 Auto clickers per rank.', { startMotes: 2 }],
    ['standing-orders', 'Standing orders', 'Every run after a prestige begins with +1 Light array and +1 Refract orb farm per rank.', { startArrays: 1 }],
    ['hangar-lease', 'Hangar lease', 'Keep 20% of each Click technology device through prestige per rank.', { keepClickPct: 0.2 }],
    ['quartermaster', 'Quartermaster', 'Every machine costs 4% less per rank.', { machineDiscount: 0.04 }],
  ],
  [
    ['hull-plating', 'Hull plating', '+1 permanent shield charge against boss light rays per rank.', { shield: 1 }],
    ['salvage-rights', 'Salvage rights', 'Machines destroyed by light rays refund another 10% of their replacement price per rank.', { salvagePct: 0.1 }],
    ['comet-charts', 'Comet charts', 'Comet clicks deal +1× damage and mint +1× more per rank.', { cometDamage: 1, cometMint: 1 }],
    ['brighter-legacy', 'Brighter legacy', 'Each lifetime prestige point adds another +1% production per rank, on top of its +10%.', { legacyPct: 0.01 }],
  ],
];
const eternalNode = (line, [id, name, description, effects], tier, farm) => ({
  id, name, description, effects, branch: 'ascension', currency: 'prestige', tier: tier + 1,
  cost: [1, 3, 8, 20][tier], costGrowth: 1.65, maxRank: 5,
  requires: tier ? [line[tier - 1][0]] : [], requiredRanks: tier ? { [line[tier - 1][0]]: 2 } : {},
  gates: { orb: [0, 30, 80, 150][tier], rounds: [0, 30, 180, 720][tier], prestiges: 1, prestige: [1, 5, 20, 100][tier], ...(farm ? {farm:true} : {}) }, icon: '✧',
});
const prestige = eternalLines.flatMap((line, lineIndex) => line.map((entry, tier) => eternalNode(line, entry, tier, lineIndex === 3)));
const laterPrestige = laterEternalLines.flatMap((line) => line.map((entry, tier) => eternalNode(line, entry, tier, false)));

/** Outfitting: independent one-rank licences. Each opens a whole feature rather than tuning a number. */
const kitLines = [
  ['garden-licence', 'Garden licence', 'Opens Beam’s Garden: grow vegetables, feed Beam and fuel the ship.', { garden: 1 }, 2, { orb: 0, rounds: 1 }],
  ['click-licence', 'Click tech licence', 'Opens the Click technology catalogue: wormholes, quantum foam, string theory and flywheels.', { clickTech: 1 }, 3, { orb: 5, rounds: 2 }],
  ['arsenal-licence', 'Arsenal licence', 'Opens the Arsenal catalogue: autonomous weapons that strike and mint on their own.', { arsenal: 1 }, 4, { orb: 10, rounds: 4 }],
];
const kit = kitLines.map(([id, name, description, effects, cost, gates], tier) => ({ id, name, branch: 'kit', description, effects, cost, costGrowth: 1,
  maxRank: 1, requires: [], requiredRanks: {}, currency: 'skill', tier: tier + 1, gates: { ...gates, prestiges: 0, prestige: 0 }, icon: '⚿' }));

// Compact new IDs keep eight completed builds inside Refract's relay envelope.
// Original shipped IDs remain unchanged; readable keys stay in catalog metadata.
// Packed saves index this array by position, so every later discipline is appended after the
// shipped research, prestige and Outfitting nodes.
const legacy = new Set(['tap-tuning', 'lucky-photon', 'singularity', 'solar-cells', 'orbital-array', 'perpetuity', 'shared-frequency', 'resonance', 'unity']);
const raw = [...research, ...prestige, ...kit, ...laterResearch, ...laterPrestige];
let prestigeOrdinal = 0;
const ids = new Map(raw.map((skill) => [skill.id, legacy.has(skill.id) ? skill.id
  : skill.currency === 'prestige' ? `p${String(++prestigeOrdinal).padStart(2, '0')}` : `${skill.branch.slice(0, 2)}${skill.tier}`]));
if (new Set(ids.values()).size !== raw.length) throw new Error('Research IDs must be unique.');
export const SKILLS = Object.freeze(raw.map((skill) => ({ ...skill, key: skill.id, id: ids.get(skill.id),
  requires: skill.requires.map((id) => ids.get(id)),
  requiredRanks: Object.fromEntries(Object.entries(skill.requiredRanks).map(([id, value]) => [ids.get(id), value])),
})));
const regular = SKILLS.filter((skill) => skill.currency === 'skill');
export const RESEARCH_TOTAL_RANKS = regular.reduce((sum, skill) => sum + skill.maxRank, 0);
export const RESEARCH_TOTAL_COST = regular.reduce((sum, skill) => sum + Array.from({ length: skill.maxRank }, (_, rank) => Math.ceil(skill.cost * skill.costGrowth ** rank)).reduce((a, b) => a + b, 0), 0);
// 2 base + 1 milestone + 1 Event horizon + floor(4.2 research + 2 prestige insight).
export const MAX_SKILL_POINTS_PER_ROUND = 10;
