/** Pure, host-authoritative LRC economy. All time is measured in seconds. */
export const MAX_PLAYERS = 8;
export const ROUND_DURATION = 60;
export const PRESTIGE_THRESHOLD = 2500;
const LIMIT = 1e15;
const COLORS = ['#9a8cff', '#58ddca', '#ffb86c', '#f080b8', '#7eb8ff', '#d7e889', '#bc9cf7', '#f5d589'];
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const bounded = (value, max = LIMIT) => Number.isFinite(value) && value >= 0 && value <= max;
const integer = (value, max = LIMIT) => Number.isSafeInteger(value) && bounded(value, max);
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const cap = (value) => Math.min(LIMIT, Math.max(0, value));
const fail = (reason) => ({ ok: false, reason });

export const SKILLS = Object.freeze([
  { id: 'tap-tuning', name: 'Focused light', branch: 'click', description: '+2 LRC per click per rank.', cost: 1, maxRank: 5, requires: [], icon: '✦' },
  { id: 'lucky-photon', name: 'Critical mass', branch: 'click', description: '+5% chance of a triple-value click per rank.', cost: 2, maxRank: 5, requires: ['tap-tuning'], icon: '✧' },
  { id: 'singularity', name: 'Singularity', branch: 'click', description: '+25% click income per rank.', cost: 3, maxRank: 5, requires: ['lucky-photon'], icon: '◈' },
  { id: 'solar-cells', name: 'Solar cells', branch: 'idle', description: '+2 passive LRC per second per rank.', cost: 1, maxRank: 5, requires: [], icon: '☀' },
  { id: 'orbital-array', name: 'Orbital array', branch: 'idle', description: '+20% passive income per rank.', cost: 2, maxRank: 5, requires: ['solar-cells'], icon: '◎' },
  { id: 'perpetuity', name: 'Perpetual motion', branch: 'idle', description: '+30% generator production per rank.', cost: 3, maxRank: 5, requires: ['orbital-array'], icon: '∞' },
  { id: 'shared-frequency', name: 'Shared frequency', branch: 'team', description: '+3% income per rank. Shared with every pilot in co-op.', cost: 1, maxRank: 5, requires: [], icon: '⌁' },
  { id: 'resonance', name: 'Resonance', branch: 'team', description: '+2% income per rank, shared in co-op, plus +10% of your own income.', cost: 2, maxRank: 5, requires: ['shared-frequency'], icon: '◇' },
  { id: 'unity', name: 'Event horizon', branch: 'team', description: '+15% of your own income per rank, plus one extra skill point per completed round.', cost: 3, maxRank: 3, requires: ['resonance'], icon: '◉' },
]);

export const GENERATORS = Object.freeze([
  { id: 'mote', name: 'Auto clicker', kind: 'auto', description: 'Clicks the core automatically every two seconds. Scales with your click power.', baseCost: 25, baseRate: 0, autoRate: 0.5, icon: '✧' },
  { id: 'satellite', name: 'Refract orb farm', kind: 'passive', description: 'Grow luminous Refract orbs that yield 6 base LRC per second.', baseCost: 140, baseRate: 6, icon: '◎' },
  { id: 'prism', name: 'Light array', kind: 'passive', description: 'Harvest a broad spectrum of light for 32 base LRC per second.', baseCost: 800, baseRate: 32, icon: '◈' },
  { id: 'star', name: 'Refractometer', kind: 'multiplier', description: 'Calibrate your light: +10% to all your LRC production per unit.', baseCost: 4500, baseRate: 0, multiplier: 0.1, icon: '◇' },
  { id: 'nova', name: 'Pocket star', kind: 'passive', description: 'Your own miniature sun produces 300 base LRC per second.', baseCost: 12000, baseRate: 300, icon: '☀' },
]);
const skillById = new Map(SKILLS.map((skill) => [skill.id, skill]));
const generatorById = new Map(GENERATORS.map((generator) => [generator.id, generator]));
const rank = (player, id) => player.skills[id] || 0;

export function createGame({ seed = 0x5eed, mode = 'scoreboard' } = {}) {
  return {
    version: 1, mode: mode === 'coop' ? 'coop' : 'scoreboard', sharedLrc: 0,
    phase: 'lobby', round: 0, roundDuration: ROUND_DURATION,
    remaining: ROUND_DURATION, now: 0, players: [], teamLrc: 0,
    goal: 500, goalReached: false, lastRound: null, rng: seed >>> 0,
  };
}

function safeAvatar(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try { return ['https:', 'http:'].includes(new URL(value).protocol) ? value : null; }
  catch { return null; }
}

export function addPlayer(state, person) {
  if (!record(person) || !text(person.id, 100)) return null;
  const existing = state.players.find((player) => player.id === person.id);
  if (existing) return existing;
  if (state.players.length >= MAX_PLAYERS) return null;
  const player = {
    id: person.id, name: String(person.name || 'Pilot').slice(0, 40),
    avatarUrl: safeAvatar(person.avatarUrl), color: COLORS[state.players.length % COLORS.length],
    bot: Boolean(person.bot), lrc: 0, runLrc: 0, lifetimeLrc: 0, roundLrc: 0,
    clicks: 0, roundClicks: 0, autoClicks: 0, autoClock: 0, skillPoints: 0, skills: {}, generators: {},
    prestigePoints: 0, totalPrestige: 0, prestigeCount: 0, ready: false,
    clickTokens: 3, botClock: 0,
  };
  state.players.push(player);
  return player;
}

export function reconcilePlayers(state, people) {
  if (!Array.isArray(people)) return;
  const unique = [];
  for (const person of people) {
    if (record(person) && text(person.id, 100) && !unique.some((entry) => entry.id === person.id)) unique.push(person);
    if (unique.length === MAX_PLAYERS) break;
  }
  const previous = new Map(state.players.map((player) => [player.id, player]));
  state.players = [];
  for (const person of unique) {
    const player = previous.get(person.id) || addPlayer(state, person);
    if (!state.players.includes(player)) state.players.push(player);
    player.name = String(person.name || 'Pilot').slice(0, 40);
    player.avatarUrl = safeAvatar(person.avatarUrl);
    player.bot = Boolean(person.bot);
  }
  // A leaving player must not keep an otherwise ready crew waiting.
  if (state.phase === 'intermission') maybeStartNextRound(state);
}

export function getStats(player, state) {
  const crew = state?.mode === 'coop' ? state.players : [player];
  const crewBonus = crew.reduce((sum, member) => sum + rank(member, 'shared-frequency') * 0.03 + rank(member, 'resonance') * 0.02, 0);
  const generatorMultiplier = 1 + (player.generators.star || 0) * 0.1;
  const multiplier = (1 + player.totalPrestige * 0.1) * (1 + crewBonus)
    * (1 + rank(player, 'resonance') * 0.1 + rank(player, 'unity') * 0.15) * generatorMultiplier;
  const production = GENERATORS.filter((generator) => generator.kind === 'passive')
    .reduce((sum, generator) => sum + (player.generators[generator.id] || 0) * generator.baseRate, 0);
  const surge = Boolean(state?.phase === 'round' && state.remaining <= 10 && state.remaining > 0);
  const clickPower = cap((2 + rank(player, 'tap-tuning') * 2) * (1 + rank(player, 'singularity') * 0.25) * multiplier * (surge ? 2 : 1));
  const passiveRate = cap((1 + rank(player, 'solar-cells') * 2 + production * (1 + rank(player, 'perpetuity') * 0.3)) * (1 + rank(player, 'orbital-array') * 0.2) * multiplier);
  const autoRate = (player.generators.mote || 0) * 0.5 * (1 + rank(player, 'perpetuity') * 0.3) * (1 + rank(player, 'orbital-array') * 0.2);
  return {
    clickPower, passiveRate, autoRate, generatorMultiplier,
    idleRate: cap(passiveRate + autoRate * clickPower),
    criticalChance: 0.05 + rank(player, 'lucky-photon') * 0.05,
    multiplier: cap(multiplier), surge,
  };
}

/** The spendable wallet; personal counters remain attribution in co-op. */
export function getBalance(player, state) {
  return state?.mode === 'coop' ? state.sharedLrc : player?.lrc ?? 0;
}

/** Combined rates, not the reward from a single pilot's click. */
export function getTeamStats(state) {
  return state.players.reduce((total, player) => {
    const stats = getStats(player, state);
    return { clickPower: cap(total.clickPower + stats.clickPower), idleRate: cap(total.idleRate + stats.idleRate) };
  }, { clickPower: 0, idleRate: 0 });
}

export function getRoundTarget(state) {
  return state.mode === 'coop' ? state.goal
    : Math.min(LIMIT, Math.round(500 * 1.35 ** Math.max(0, state.round - 1)));
}

export function generatorCost(player, id) {
  const generator = generatorById.get(id);
  if (!generator) return Infinity;
  return Math.min(LIMIT, Math.ceil(generator.baseCost * 1.17 ** (player.generators[id] || 0)));
}

export function skillCost(player, id) {
  const skill = skillById.get(id);
  if (!skill) return Infinity;
  return skill.cost + rank(player, id);
}

export function prestigeGain(player) {
  return Math.floor(Math.sqrt(player.runLrc / PRESTIGE_THRESHOLD));
}

function random(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 0x100000000;
}

function earn(state, player, amount) {
  amount = Math.min(cap(amount), LIMIT - player.lrc, LIMIT - player.runLrc, LIMIT - player.lifetimeLrc, LIMIT - player.roundLrc);
  player.lrc += amount;
  player.runLrc += amount;
  player.lifetimeLrc += amount;
  player.roundLrc += amount;
  state.teamLrc = cap(state.teamLrc + amount);
  if (state.mode === 'coop') state.sharedLrc = cap(state.sharedLrc + amount);
  state.goalReached = state.teamLrc >= state.goal;
  return amount;
}

function startRound(state) {
  state.phase = 'round';
  state.round += 1;
  state.remaining = state.roundDuration;
  state.teamLrc = 0;
  state.goal = Math.min(LIMIT, Math.round(500 * Math.max(1, state.players.length) * 1.35 ** (state.round - 1)));
  state.goalReached = false;
  for (const player of state.players) {
    player.roundLrc = 0;
    player.roundClicks = 0;
    player.ready = false;
    player.clickTokens = 3;
    player.botClock = 0;
  }
}

function maybeStartNextRound(state) {
  const humans = state.players.filter((player) => !player.bot);
  if (humans.length && humans.every((player) => player.ready)) startRound(state);
}

function finishRound(state) {
  state.phase = 'intermission';
  state.remaining = 0;
  const skillPoints = 2 + (state.mode === 'coop' && state.goalReached ? 1 : 0);
  const awards = new Map(state.players.map((player) => [player.id,
    skillPoints + (state.mode === 'scoreboard' && player.roundLrc >= getRoundTarget(state) ? 1 : 0)
      + (rank(player, 'unity') > 0 ? 1 : 0)]));
  state.lastRound = {
    round: state.round, teamLrc: state.teamLrc, goal: state.goal,
    goalReached: state.goalReached, skillPoints,
    players: state.players.map((player) => ({ id: player.id, lrc: player.roundLrc, clicks: player.roundClicks, skillPoints: awards.get(player.id) })),
  };
  for (const player of state.players) {
    player.skillPoints = cap(player.skillPoints + awards.get(player.id));
    player.ready = false;
    if (player.bot) {
      const candidates = SKILLS.filter((skill) => rank(player, skill.id) < skill.maxRank
        && skill.requires.every((id) => rank(player, id) > 0) && player.skillPoints >= skillCost(player, skill.id));
      if (candidates.length) applyAction(state, player.id, { type: 'buySkill', id: candidates[Math.floor(random(state) * candidates.length)].id });
      player.ready = true;
    }
  }
}

export function applyAction(state, playerId, action) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return fail('This pilot is not in the activity.');
  if (!record(action) || typeof action.type !== 'string') return fail('Invalid action.');
  // Network callers bind each intent to the round they displayed. A late packet
  // must not spend currency or harvest in a different round after a transition.
  if (Object.hasOwn(action, 'round') && (!integer(action.round, 1e6) || action.round !== state.round)) {
    return fail('That action belongs to an earlier round. Resync and try again.');
  }
  if (action.type === 'setMode') {
    if (state.phase !== 'lobby') return fail('Choose a mode before the first round starts.');
    if (state.players[0]?.id !== playerId) return fail('Only the host can choose the session mode.');
    if (!['scoreboard', 'coop'].includes(action.mode)) return fail('Unknown game mode.');
    state.mode = action.mode;
    return { ok: true };
  }
  if (action.type === 'start') {
    if (state.phase !== 'lobby') return fail('The run has already started.');
    if (state.players[0]?.id !== playerId) return fail('Only the host can start the run.');
    startRound(state);
    return { ok: true };
  }
  if (action.type === 'click') {
    if (state.phase !== 'round') return fail('Harvesting resumes next round.');
    if (player.clickTokens < 1) return fail('The core is recharging.');
    player.clickTokens -= 1;
    const stats = getStats(player, state);
    const critical = random(state) < stats.criticalChance;
    const amount = earn(state, player, stats.clickPower * (critical ? 3 : 1));
    player.clicks = cap(player.clicks + 1);
    player.roundClicks = cap(player.roundClicks + 1);
    return { ok: true, amount, critical };
  }
  if (action.type === 'ready') {
    if (state.phase !== 'intermission') return fail('Ready up between rounds.');
    player.ready = !player.ready;
    maybeStartNextRound(state);
    return { ok: true };
  }
  if (action.type === 'buyGenerator') {
    if (!['round', 'intermission'].includes(state.phase)) return fail('Start a round to build your orbit.');
    if (!generatorById.has(action.id)) return fail('Unknown generator.');
    const owned = player.generators[action.id] || 0;
    if (owned >= 1000) return fail('This generator is at maximum capacity.');
    const cost = generatorCost(player, action.id);
    if (getBalance(player, state) < cost) return fail('Collect more LRCs to build this generator.');
    if (state.mode === 'coop') state.sharedLrc -= cost;
    else player.lrc -= cost;
    player.generators[action.id] = owned + 1;
    return { ok: true };
  }
  if (action.type === 'buySkill') {
    if (state.phase !== 'intermission') return fail('Grow your skill tree between rounds.');
    const skill = skillById.get(action.id);
    if (!skill) return fail('Unknown skill.');
    if (rank(player, skill.id) >= skill.maxRank) return fail('This skill is fully upgraded.');
    if (!skill.requires.every((id) => rank(player, id) > 0)) return fail('Unlock the previous skill first.');
    const cost = skillCost(player, skill.id);
    if (player.skillPoints < cost) return fail('Earn more skill points by completing rounds.');
    player.skillPoints -= cost;
    player.skills[skill.id] = rank(player, skill.id) + 1;
    player.ready = false;
    return { ok: true };
  }
  if (action.type === 'prestige') {
    if (state.phase !== 'intermission') return fail('Refract your core between rounds.');
    const gain = prestigeGain(player);
    if (gain < 1) return fail(`Earn ${PRESTIGE_THRESHOLD.toLocaleString('en-US')} LRCs in this run to prestige.`);
    player.prestigePoints = cap(player.prestigePoints + gain);
    player.totalPrestige = cap(player.totalPrestige + gain);
    player.prestigeCount = cap(player.prestigeCount + 1);
    player.lrc = 0;
    player.runLrc = 0;
    player.skillPoints = 0;
    player.skills = {};
    player.generators = {};
    player.autoClock = 0;
    player.ready = false;
    return { ok: true, amount: gain };
  }
  return fail('Unknown action.');
}

export function advance(state, dtSeconds) {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || state.phase !== 'round') return;
  let pending = Math.min(dtSeconds, state.remaining);
  while (pending > 0 && state.phase === 'round') {
    // Automatic pulses crossing into the last ten seconds must use the surge
    // value only for that segment, even after a suspended tab catches up.
    const elapsed = Math.min(pending, state.remaining > 10 ? state.remaining - 10 : state.remaining);
    advanceSegment(state, elapsed);
    pending = Math.max(0, pending - elapsed);
  }
}

function advanceSegment(state, elapsed) {
  state.now = cap(state.now + elapsed);
  for (const player of state.players) {
    player.clickTokens = Math.min(3, player.clickTokens + elapsed * 15);
    const stats = getStats(player, state);
    earn(state, player, stats.passiveRate * elapsed);
    // autoClock is fractional pulse progress, retained across ticks and rounds.
    player.autoClock += stats.autoRate * elapsed;
    const pulses = Math.floor(player.autoClock + 1e-9);
    player.autoClock = Math.max(0, player.autoClock - pulses);
    if (pulses > 0) {
      earn(state, player, pulses * stats.clickPower);
      player.autoClicks = cap(player.autoClicks + pulses);
    }
    if (player.bot) {
      player.botClock += elapsed;
      // Practice pilots are explicitly labeled and never added in real sessions.
      const clicks = Math.min(3, Math.floor(player.botClock / 0.8));
      player.botClock %= 0.8;
      for (let i = 0; i < clicks; i++) applyAction(state, player.id, { type: 'click' });
      if (getBalance(player, state) >= generatorCost(player, 'mote')) applyAction(state, player.id, { type: 'buyGenerator', id: 'mote' });
    }
  }
  state.remaining = Math.max(0, state.remaining - elapsed);
  if (state.remaining < 1e-8) finishRound(state);
}

function validPlayer(player) {
  if (!record(player) || !text(player.id, 100) || !text(player.name, 40)
    || !/^#[\da-f]{6}$/i.test(player.color) || typeof player.bot !== 'boolean' || typeof player.ready !== 'boolean'
    || !(player.avatarUrl === null || safeAvatar(player.avatarUrl) === player.avatarUrl)
    || !record(player.skills) || !record(player.generators)) return false;
  for (const key of ['lrc', 'runLrc', 'lifetimeLrc', 'roundLrc']) if (!bounded(player[key])) return false;
  for (const key of ['clicks', 'roundClicks', 'autoClicks', 'skillPoints', 'prestigePoints', 'totalPrestige', 'prestigeCount']) if (!integer(player[key])) return false;
  if (!bounded(player.clickTokens, 3) || !bounded(player.botClock, 0.8) || !bounded(player.autoClock, 1)) return false;
  if (player.lrc > player.runLrc || player.runLrc > player.lifetimeLrc || player.prestigePoints > player.totalPrestige) return false;
  for (const [id, value] of Object.entries(player.skills)) {
    const skill = skillById.get(id);
    if (!skill || !integer(value, skill.maxRank) || (value > 0 && !skill.requires.every((required) => rank(player, required) > 0))) return false;
  }
  for (const [id, value] of Object.entries(player.generators)) if (!generatorById.has(id) || !integer(value, 1000)) return false;
  return true;
}

export function validateState(state) {
  if (!record(state) || state.version !== 1 || !['lobby', 'round', 'intermission'].includes(state.phase)
    || !['scoreboard', 'coop'].includes(state.mode) || !bounded(state.sharedLrc)
    || (state.mode === 'scoreboard' && state.sharedLrc !== 0)
    || !integer(state.round, 1e6) || state.roundDuration !== ROUND_DURATION || !bounded(state.remaining, ROUND_DURATION)
    || !bounded(state.now) || !bounded(state.teamLrc) || !bounded(state.goal) || state.goal <= 0
    || typeof state.goalReached !== 'boolean' || state.goalReached !== (state.teamLrc >= state.goal)
    || !integer(state.rng, 0xffffffff) || !Array.isArray(state.players) || state.players.length > MAX_PLAYERS
    || !state.players.every(validPlayer) || new Set(state.players.map((player) => player.id)).size !== state.players.length) return false;
  if (state.phase === 'lobby' && state.round !== 0) return false;
  if (state.phase !== 'lobby' && state.round < 1) return false;
  if (state.phase === 'intermission' && state.remaining !== 0) return false;
  if (state.phase === 'round' && state.remaining <= 0) return false;
  if (state.lastRound !== null) {
    const result = state.lastRound;
    if (!record(result) || !integer(result.round, state.round) || result.round < 1
      || !bounded(result.teamLrc) || !bounded(result.goal) || result.goal <= 0
      || typeof result.goalReached !== 'boolean' || result.goalReached !== (result.teamLrc >= result.goal)
      || ![2, 3].includes(result.skillPoints) || !Array.isArray(result.players) || result.players.length > MAX_PLAYERS
      || !result.players.every((player) => record(player) && text(player.id, 100) && bounded(player.lrc) && integer(player.clicks) && [2, 3, 4].includes(player.skillPoints))
      || new Set(result.players.map((player) => player.id)).size !== result.players.length) return false;
  }
  try { return new TextEncoder().encode(JSON.stringify(state)).length < 15000; }
  catch { return false; }
}

/** Upgrade browser saves from before session modes; do not use on wire data. */
export function migrateState(saved) {
  if (!record(saved) || saved.version !== 1) return null;
  try {
    const next = structuredClone(saved);
    if (!Object.hasOwn(next, 'mode')) next.mode = 'scoreboard';
    if (!Object.hasOwn(next, 'sharedLrc')) next.sharedLrc = 0;
    if (Array.isArray(next.players)) for (const player of next.players) {
      if (record(player)) {
        if (!Object.hasOwn(player, 'autoClicks')) player.autoClicks = 0;
        if (!Object.hasOwn(player, 'autoClock')) player.autoClock = 0;
      }
    }
    if (record(next.lastRound) && Array.isArray(next.lastRound.players)) {
      for (const player of next.lastRound.players) {
        if (record(player) && !Object.hasOwn(player, 'skillPoints')) player.skillPoints = next.lastRound.skillPoints;
      }
    }
    return validateState(next) ? next : null;
  } catch { return null; }
}
