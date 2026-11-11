import { FINAL_HP, FINAL_LEVEL, getSystemHpMultiplier, fuelTarget } from '../src/campaign.js';
import { getFarmStats, getFarmUnlocked } from '../src/farm.js';
import test from 'node:test';
import { compactGameState } from '../src/game.js';
import assert from 'node:assert/strict';
import { createGame, addPlayer, reconcilePlayers, applyAction, advance, getStats, getBalance, getTeamStats, getRoundTarget, getOrb, getCoopDifficulty, generatorCost, generatorQuote, generatorAvailability, skillCost, skillAvailability, prestigeGain, prestigeNextThreshold, validateState, migrateState, GENERATORS, SKILLS, SKILL_BRANCHES, RESEARCH_TOTAL_COST, RESEARCH_TOTAL_RANKS, MAX_SKILL_POINTS_PER_ROUND, ECONOMY_LIMIT, COMBAT_VERSION } from '../src/game.js';
const idOf = (key) => SKILLS.find((skill) => skill.key === key).id;

function setup(count = 1) {
  const state = createGame();
  for (let i = 0; i < count; i++) addPlayer(state, { id: `pilot-${i}`, name: `Pilot ${i}` });
  return state;
}
function start(state) { assert.equal(applyAction(state, state.players[0].id, { type: 'start' }).ok, true); }
function fund(player, amount) { player.lrc = player.runLrc = player.lifetimeLrc = amount; }

test('host starts a synchronized 60-second round; actions obey phases and identity', () => {
  const state = setup(2);
  assert.equal(applyAction(state, 'pilot-1', { type: 'start' }).ok, false);
  assert.equal(applyAction(state, 'stranger', { type: 'click' }).ok, false);
  assert.equal(applyAction(state, 'pilot-0', { type: 'click' }).ok, false);
  start(state);
  assert.equal(state.round, 1);
  assert.equal(state.remaining, 60);
  assert.equal(state.goal, 1000);
  assert.equal(validateState(state), true);
});

test('clicks earn LRC and a host-owned token bucket limits input spam', () => {
  const state = setup(); start(state);
  const player = state.players[0];
  for (let i = 0; i < 3; i++) assert.equal(applyAction(state, player.id, { type: 'click' }).ok, true);
  const earned = player.lrc;
  assert.ok(earned >= 0.75);
  assert.ok(getOrb(player, state).hp < getOrb(player, state).maxHp);
  assert.equal(applyAction(state, player.id, { type: 'click' }).ok, false);
  assert.equal(player.lrc, earned);
  advance(state, 0.1);
  assert.equal(applyAction(state, player.id, { type: 'click' }).ok, true);
  assert.equal(player.clicks, 4);
  assert.equal(validateState(state), true);
});

test('idle income stops exactly at the round boundary and awards points only once', () => {
  const state = setup(); start(state);
  advance(state, 80);
  assert.equal(state.phase, 'intermission');
  assert.equal(state.players[0].lrc, 60);
  assert.equal(state.players[0].skillPoints, 2);
  assert.equal(state.lastRound.players[0].lrc, 60);
  advance(state, 80);
  assert.equal(state.players[0].lrc, 60);
  assert.equal(state.players[0].skillPoints, 2);
  assert.equal(validateState(state), true);
});

test('generators cost LRC, scale their next price, and produce passive income', () => {
  const state = setup(); start(state);
  const player = state.players[0];
  assert.equal(applyAction(state, player.id, { type: 'buyGenerator', id: 'mote' }).ok, false);
  fund(player, 100);
  assert.equal(applyAction(state, player.id, { type: 'buyGenerator', id: 'mote' }).ok, true);
  assert.equal(player.lrc, 75);
  assert.equal(player.runLrc, 100);
  assert.equal(generatorCost(player, 'mote'), 30);
  assert.equal(getStats(player, state).idleRate, 1);
  assert.equal(getStats(player, state).autoDps, 1);
  advance(state, 3);
  assert.equal(player.lrc, 78, 'Automatic damage pays only when an orb shatters');
  assert.equal(player.autoClicks, 1);
  assert.equal(applyAction(state, player.id, { type: 'buyGenerator', id: '__proto__' }).ok, false);
});

test('skills require an intermission, prerequisites, points, and have bounded ranks', () => {
  const state = setup(); start(state);
  const player = state.players[0];
  player.skillPoints = 100;
  assert.equal(applyAction(state, player.id, { type: 'buySkill', id: 'tap-tuning' }).ok, false);
  advance(state, 60);
  assert.equal(applyAction(state, player.id, { type: 'buySkill', id: 'lucky-photon' }).ok, false);
  for (let i = 0; i < 8; i++) assert.equal(applyAction(state, player.id, { type: 'buySkill', id: 'tap-tuning' }).ok, true);
  assert.equal(applyAction(state, player.id, { type: 'buySkill', id: 'tap-tuning' }).ok, false);
  assert.equal(applyAction(state, player.id, { type: 'buySkill', id: 'lucky-photon' }).ok, false);
  player.highestOrb = 10; player.completedRounds = 3;
  assert.equal(applyAction(state, player.id, { type: 'buySkill', id: 'lucky-photon' }).ok, true);
  assert.equal(getStats(player, state).clickPower, 18);
  assert.ok(Math.abs(getStats(player, state).criticalChance - 0.075) < 1e-10);
  assert.equal(validateState(state), true);
});

test('cooperative goal awards an extra point and crew skills affect other pilots', () => {
  const state = setup(2);
  applyAction(state, 'pilot-0', { type: 'setMode', mode: 'coop' });
  start(state);
  const [a, b] = state.players;
  a.skills['shared-frequency'] = 2;
  assert.equal(getStats(b, state).multiplier, 1.05);
  a.generators.nova = 1;
  advance(state, 60);
  assert.equal(state.goalReached, true);
  assert.equal(a.skillPoints, 3);
  assert.equal(b.skillPoints, 3);
  assert.equal(validateState(state), true);
});

test('all humans must ready up and late or leaving participants do not break progression', () => {
  const state = setup(2); start(state); advance(state, 60);
  applyAction(state, 'pilot-0', { type: 'ready' });
  assert.equal(state.phase, 'intermission');
  applyAction(state, 'pilot-1', { type: 'ready' });
  assert.equal(state.phase, 'round');
  assert.equal(state.round, 2);
  assert.equal(state.teamLrc, 0);
  assert.equal(state.players[0].roundLrc, 0);
  advance(state, 60);
  applyAction(state, 'pilot-0', { type: 'ready' });
  reconcilePlayers(state, [{ id: 'pilot-0', name: 'Renamed' }]);
  assert.equal(state.round, 3);
  assert.equal(state.players[0].name, 'Renamed');
  assert.equal(validateState(state), true);
});

test('prestige uses earned LRC, preserves lifetime progress, and resets only that pilot', () => {
  const state = setup(2); start(state);
  const [a, b] = state.players;
  fund(a, 10000);
  a.lrc = 100;
  a.generators.mote = 4;
  a.skills['solar-cells'] = 1;
  assert.equal(prestigeGain(a), 2);
  assert.equal(applyAction(state, a.id, { type: 'prestige' }).ok, false);
  advance(state, 60);
  const lifetime = a.lifetimeLrc;
  const otherBalance = b.lrc;
  const result = applyAction(state, a.id, { type: 'prestige' });
  assert.deepEqual(result, { ok: true, amount: 2 });
  assert.equal(a.lifetimeLrc, lifetime);
  assert.equal(a.runLrc, 0);
  assert.equal(a.lrc, 0);
  assert.equal(a.skillPoints, 2);
  assert.deepEqual(a.generators, {});
  assert.deepEqual(a.skills, { 'solar-cells': 1 });
  assert.equal(a.totalPrestige, 2);
  assert.equal(getStats(a, state).multiplier, 1.2);
  assert.equal(b.lrc, otherBalance);
  assert.equal(state.phase, 'intermission');
  assert.equal(applyAction(state, a.id, { type: 'prestige' }).ok, false);
  assert.equal(validateState(state), true);
});

test('a pilot can wipe their own progress without touching the crew, the round or the shared session', () => {
  const state = setup(2); start(state);
  const [a, b] = state.players;
  fund(a, 50000); fund(b, 700);
  Object.assign(a, { skillPoints: 7, prestigePoints: 3, totalPrestige: 5, prestigeCount: 2, highestOrb: 40, orbsDestroyed: 39, completedRounds: 12, clicks: 900, autoClicks: 50, victories: 1, orb: { level: 40, hp: 5, bossStartedAt:0 } });
  a.generators.mote = 4; a.skills['solar-cells'] = 1; a.farm.unlocked = true;
  b.generators.mote = 1;
  const colour = a.color;
  assert.equal(validateState(state), true);
  assert.equal(applyAction(state, 'stranger', { type: 'resetProgress' }).ok, false);
  assert.equal(applyAction(state, a.id, { type: 'resetProgress' }).ok, true, 'Resets are allowed during a round');
  const reset = state.players[0];
  assert.equal(reset.id, a.id);
  assert.equal(reset.name, a.name);
  assert.equal(reset.color, colour, 'The pilot keeps their colour');
  assert.equal(state.players[1], b, 'Roster order and the host seat survive');
  for (const key of ['lrc', 'runLrc', 'lifetimeLrc', 'roundLrc', 'clicks', 'autoClicks', 'skillPoints', 'prestigePoints', 'totalPrestige', 'prestigeCount', 'orbsDestroyed', 'completedRounds', 'victories']) assert.equal(reset[key], 0, key);
  assert.deepEqual(reset.generators, {});
  assert.deepEqual(reset.skills, {});
  assert.equal(reset.highestOrb, 1);
  assert.equal(getOrb(reset, state).level, 1);
  assert.equal(reset.farm.unlocked, false);
  assert.equal(getStats(reset, state).multiplier, 1);
  assert.equal(b.lrc, 700);
  assert.equal(b.generators.mote, 1);
  assert.equal(state.round, 1);
  assert.equal(state.phase, 'round');
  assert.equal(validateState(state), true);
  advance(state, 60);
  assert.equal(applyAction(state, reset.id, { type: 'ready' }).ok, true);
  assert.equal(state.players[0].ready, true);
  assert.equal(applyAction(state, reset.id, { type: 'resetProgress' }).ok, true, 'Resets are allowed between rounds');
  assert.equal(state.players[0].ready, false, 'A reset pilot is no longer ready');
  assert.equal(state.phase, 'intermission');
  assert.equal(state.round, 1, 'The shared round number continues');
  assert.equal(validateState(state), true);
});

test('co-op resets keep the shared bank and orb while the fresh pilot inherits the crew milestone', () => {
  const state = createGame({ mode: 'coop' });
  addPlayer(state, { id: 'pilot-0', name: 'Pilot 0' });
  addPlayer(state, { id: 'pilot-1', name: 'Pilot 1' });
  start(state);
  state.sharedLrc = 4000;
  state.sharedOrb = { level: 12, hp: 1 };
  state.players[0].generators.prism = 2; state.players[0].skills['solar-cells'] = 1; state.players[0].highestOrb = 12;
  state.players[1].generators.mote = 3;
  assert.equal(validateState(state), true);
  const sharedBefore = structuredClone({ lrc: state.sharedLrc, orb: state.sharedOrb, team: state.teamLrc });
  assert.equal(applyAction(state, 'pilot-0', { type: 'resetProgress' }).ok, true);
  assert.deepEqual({ lrc: state.sharedLrc, orb: state.sharedOrb, team: state.teamLrc }, sharedBefore, 'The shared pool and orb are untouched');
  assert.deepEqual(state.players[0].generators, {});
  assert.deepEqual(state.players[0].skills, {});
  assert.equal(state.players[0].highestOrb, 12, 'A fresh co-op pilot starts at the crew orb');
  assert.equal(state.players[1].generators.mote, 3);
  assert.equal(getBalance(state.players[0], state), 4000);
  assert.equal(validateState(state), true);
});

for (const mode of ['scoreboard', 'coop']) test(`${mode} reset removes personal round records from saves and synchronized snapshots`, () => {
  const state = setup(2);
  assert.equal(applyAction(state, 'pilot-0', { type: 'setMode', mode }).ok, true);
  start(state);
  assert.equal(applyAction(state, 'pilot-1', { type: 'click' }).ok, true);
  advance(state, 60);
  const before = structuredClone(state);
  const previousResult = before.lastRound.players.find(player => player.id === 'pilot-1');
  assert.ok(previousResult.lrc > 0);
  assert.equal(previousResult.clicks, 1);
  assert.equal(applyAction(state, 'pilot-1', { type: 'resetProgress' }).ok, true);
  assert.equal(state.players[1].lifetimeLrc, 0);
  assert.equal(state.players[1].skillPoints, 0);
  assert.deepEqual(state.players[0], before.players[0], 'The other pilot keeps their progress');
  assert.deepEqual(state.lastRound, { ...before.lastRound, players: [before.lastRound.players[0]] }, 'Only the erased pilot’s personal result is removed');
  for (const key of ['teamLrc', 'sharedLrc', 'sharedOrb', 'goalReached', 'round', 'phase']) assert.deepEqual(state[key], before[key], `The session keeps ${key}`);
  assert.equal(validateState(state), true);
  assert.deepEqual(migrateState(JSON.parse(JSON.stringify(state))), state, 'Reload cannot restore the erased round record');
  assert.deepEqual(migrateState(compactGameState(state)), state, 'Peers and a replacement host receive the erased record');
  assert.equal(applyAction(state, 'pilot-1', { type: 'resetProgress' }).ok, true);
  assert.deepEqual(state.lastRound.players, [before.lastRound.players[0]], 'Repeating a reset preserves the other pilot’s result');
});

test('final ten seconds double click yield without affecting idle income', () => {
  const state = setup(); start(state);
  assert.equal(getStats(state.players[0], state).clickPower, 2);
  advance(state, 50);
  assert.equal(getStats(state.players[0], state).surge, true);
  assert.equal(getStats(state.players[0], state).clickPower, 4);
  assert.equal(getStats(state.players[0], state).idleRate, 1);
});

test('eight fully developed pilots fit the relay envelope; bad snapshots are rejected', () => {
  const state = setup(8); start(state);
  for (const player of state.players) {
    for (const skill of SKILLS) player.skills[skill.id] = skill.maxRank;
    player.generators = { mote: 10, satellite: 10, prism: 10, star: 10, nova: 10 };
  }
  advance(state, 60);
  assert.equal(validateState(state), true);
  assert.ok(Buffer.byteLength(JSON.stringify(compactGameState(state))) < 15000);
  for (const change of [
    (copy) => { copy.players[0].lrc = Infinity; },
    (copy) => { copy.players[0].generators.mote = -1; },
    (copy) => { copy.players[0].skills.unknown = 1; },
    (copy) => { copy.players[0].avatarUrl = 'javascript:alert(1)'; },
    (copy) => { copy.players[1].id = copy.players[0].id; },
    (copy) => { copy.goalReached = !copy.goalReached; },
  ]) {
    const copy = structuredClone(state); change(copy);
    assert.equal(validateState(copy), false);
  }
});

test('invalid deltas do not corrupt state and simulation is deterministic', () => {
  const a = setup(); const b = setup(); start(a); start(b);
  for (let i = 0; i < 100; i++) {
    advance(a, 0.1); advance(b, 0.1);
    applyAction(a, 'pilot-0', { type: 'click' }); applyAction(b, 'pilot-0', { type: 'click' });
  }
  assert.deepEqual(a, b);
  const before = structuredClone(a);
  advance(a, NaN); advance(a, Infinity); advance(a, -1);
  assert.deepEqual(a, before);
});

test('practice pilots earn, upgrade, and never hold up human readiness', () => {
  const state = setup();
  const bot = addPlayer(state, { id: 'practice', name: 'Practice pilot', bot: true });
  start(state);
  for (let i = 0; i < 600; i++) advance(state, 0.1);
  assert.equal(state.phase, 'intermission');
  assert.ok(bot.clicks > 0);
  assert.ok(bot.generators.mote > 0);
  assert.ok(Object.keys(bot.skills).length > 0);
  assert.equal(bot.ready, true);
  applyAction(state, 'pilot-0', { type: 'ready' });
  assert.equal(state.round, 2);
  assert.equal(state.phase, 'round');
  assert.equal(validateState(state), true);
});

test('round-bound intents cannot affect a later round after delayed delivery', () => {
  const state = setup();
  const player = state.players[0];
  assert.equal(applyAction(state, player.id, { type: 'start', round: 0 }).ok, true);
  assert.equal(applyAction(state, player.id, { type: 'click', round: 1 }).ok, true);
  advance(state, 60);
  applyAction(state, player.id, { type: 'ready', round: 1 });
  assert.equal(state.round, 2);
  const before = structuredClone(state);
  assert.equal(applyAction(state, player.id, { type: 'click', round: 1 }).ok, false);
  assert.equal(applyAction(state, player.id, { type: 'buyGenerator', id: 'mote', round: 1 }).ok, false);
  assert.equal(applyAction(state, player.id, { type: 'click', round: '2' }).ok, false);
  assert.equal(applyAction(state, player.id, { type: 'click', round: null }).ok, false);
  assert.deepEqual(state, before);
  assert.equal(applyAction(state, player.id, { type: 'click', round: 2 }).ok, true);
});

test('host departure promotes the first remaining player without losing their build or a ready round', () => {
  const state = setup(2); start(state); advance(state, 60);
  const follower = state.players[1];
  applyAction(state, follower.id, { type: 'buyGenerator', id: 'mote' });
  applyAction(state, follower.id, { type: 'buySkill', id: 'solar-cells' });
  applyAction(state, follower.id, { type: 'ready' });
  assert.equal(state.phase, 'intermission');
  const wallet = follower.lrc;
  const earned = follower.runLrc;
  reconcilePlayers(state, [{ id: follower.id, name: 'New host' }]);
  assert.equal(state.players[0].id, follower.id);
  assert.equal(state.round, 2);
  assert.equal(state.phase, 'round');
  assert.equal(follower.lrc, wallet);
  assert.equal(follower.runLrc, earned);
  assert.equal(follower.generators.mote, 1);
  assert.equal(follower.skills['solar-cells'], 1);
  assert.equal(state.lastRound.round, 1);
  assert.equal(validateState(state), true);
});

test('only the lobby host can choose a valid session mode', () => {
  const state = setup(2);
  assert.equal(state.mode, 'scoreboard');
  assert.equal(state.sharedLrc, 0);
  assert.equal(applyAction(state, 'pilot-1', { type: 'setMode', mode: 'coop' }).ok, false);
  assert.equal(applyAction(state, 'pilot-0', { type: 'setMode', mode: 'unknown' }).ok, false);
  assert.equal(state.mode, 'scoreboard');
  assert.equal(applyAction(state, 'pilot-0', { type: 'setMode', mode: 'coop' }).ok, true);
  assert.equal(state.mode, 'coop');
  assert.equal(applyAction(state, 'pilot-0', { type: 'setMode', mode: 'scoreboard' }).ok, true);
  start(state);
  assert.equal(applyAction(state, 'pilot-0', { type: 'setMode', mode: 'coop' }).ok, false);
  advance(state, 60);
  assert.equal(applyAction(state, 'pilot-0', { type: 'setMode', mode: 'coop' }).ok, false);
  assert.equal(state.mode, 'scoreboard');
});

test('scoreboard wallets, production bonuses, and milestone rewards are individual', () => {
  const state = setup(2); start(state);
  const [a, b] = state.players;
  a.skills['shared-frequency'] = 5;
  a.generators.nova = 1;
  assert.equal(getStats(b, state).multiplier, 1);
  assert.equal(getStats(a, state).multiplier, 1.125);
  assert.equal(getRoundTarget(state), 500);
  advance(state, 60);
  assert.ok(a.roundLrc > 500);
  assert.equal(b.roundLrc, 60);
  assert.equal(a.skillPoints, 3);
  assert.equal(b.skillPoints, 2);
  assert.equal(state.lastRound.skillPoints, 2);
  assert.equal(state.lastRound.players[0].skillPoints, 3);
  assert.equal(state.lastRound.players[1].skillPoints, 2);
  assert.equal(getBalance(a, state), a.lrc);
  assert.equal(getBalance(b, state), b.lrc);
  assert.equal(state.sharedLrc, 0);
  const aWallet = a.lrc;
  applyAction(state, b.id, { type: 'buyGenerator', id: 'mote' });
  assert.equal(a.lrc, aWallet);
  assert.equal(b.lrc, 35);
  assert.equal(validateState(state), true);
});

test('co-op earnings pool together and either player can spend the pool once', () => {
  const state = setup(2);
  applyAction(state, 'pilot-0', { type: 'setMode', mode: 'coop' });
  start(state);
  const [a, b] = state.players;
  assert.equal(applyAction(state, b.id, { type: 'buyGenerator', id: 'mote' }).ok, false);
  advance(state, 13);
  assert.equal(state.sharedLrc, 26);
  assert.equal(getBalance(a, state), 26);
  assert.equal(getBalance(b, state), 26);
  const before = structuredClone(state);
  assert.equal(applyAction(state, b.id, { type: 'buyGenerator', id: 'unknown' }).ok, false);
  assert.deepEqual(state, before);
  assert.equal(applyAction(state, b.id, { type: 'buyGenerator', id: 'mote' }).ok, true);
  assert.equal(state.sharedLrc, 1);
  assert.equal(b.generators.mote, 1);
  assert.equal(a.generators.mote, undefined);
  assert.equal(b.lrc, 13, 'Personal LRC remains contribution attribution in co-op');
  assert.equal(b.runLrc, 13);
  assert.equal(applyAction(state, a.id, { type: 'buyGenerator', id: 'mote' }).ok, false);
  advance(state, 2);
  assert.equal(state.sharedLrc, 5);
  assert.deepEqual(getTeamStats(state), { clickPower: 4, idleRate: 2, autoDps: 1 });
  assert.equal(getRoundTarget(state), 1000);
  assert.equal(validateState(state), true);
});

test('co-op team totals include every active build and cross-pilot bonuses', () => {
  const state = setup(2);
  applyAction(state, 'pilot-0', { type: 'setMode', mode: 'coop' });
  start(state);
  const [a, b] = state.players;
  a.skills['shared-frequency'] = 2;
  b.skills['solar-cells'] = 1;
  a.generators.mote = 1;
  const total = getTeamStats(state);
  assert.equal(total.idleRate, getStats(a, state).idleRate + getStats(b, state).idleRate);
  assert.equal(total.clickPower, getStats(a, state).clickPower + getStats(b, state).clickPower);
  assert.equal(getStats(b, state).multiplier, 1.05);
  advance(state, 2);
  assert.ok(Math.abs(state.sharedLrc - total.idleRate * 2) < 1e-9);
  assert.equal(state.sharedLrc, a.roundLrc + b.roundLrc);
});

test('co-op prestige clears only the choosing pilot build and preserves the shared pool', () => {
  const state = setup(2);
  applyAction(state, 'pilot-0', { type: 'setMode', mode: 'coop' });
  start(state);
  const [a, b] = state.players;
  a.generators.nova = 1;
  advance(state, 60);
  assert.ok(prestigeGain(a) > 0);
  assert.equal(prestigeGain(b), 0, 'A pilot cannot prestige from another pilot contribution');
  applyAction(state, b.id, { type: 'buyGenerator', id: 'satellite' });
  const pool = state.sharedLrc;
  const other = structuredClone(b);
  const earned = a.lifetimeLrc;
  assert.equal(applyAction(state, a.id, { type: 'prestige' }).ok, true);
  assert.equal(state.sharedLrc, pool);
  assert.deepEqual(b, other);
  assert.equal(a.lifetimeLrc, earned);
  assert.equal(a.runLrc, 0);
  assert.equal(a.lrc, 0);
  assert.deepEqual(a.generators, {});
  assert.ok(a.totalPrestige > 0);
  assert.equal(getBalance(a, state), pool);
  assert.equal(validateState(state), true);
});

test('departed pilots leave the active ranking and production while co-op keeps their pooled earnings', () => {
  for (const mode of ['scoreboard', 'coop']) {
    const state = setup(2);
    applyAction(state, 'pilot-0', { type: 'setMode', mode });
    start(state);
    state.players[0].generators.nova = 1;
    advance(state, 10);
    const pool = state.sharedLrc;
    reconcilePlayers(state, [{ id: 'pilot-1', name: 'Remaining pilot' }]);
    assert.deepEqual(state.players.map((player) => player.id), ['pilot-1']);
    assert.equal(state.sharedLrc, pool);
    assert.equal(getTeamStats(state).idleRate, 1);
    assert.equal(getRoundTarget(state), mode === 'coop' ? 1000 : 500);
    assert.equal(validateState(state), true);
  }
});

test('recorded per-player round awards stay accurate after buying skills and prestige', () => {
  const state = setup(); start(state);
  const player = state.players[0];
  player.generators.nova = 1;
  player.skills = { 'shared-frequency': 1, resonance: 1, unity: 1 };
  advance(state, 60);
  const awarded = state.lastRound.players[0].skillPoints;
  assert.equal(awarded, 4);
  assert.equal(player.skillPoints, 4);
  applyAction(state, player.id, { type: 'prestige' });
  assert.equal(player.skillPoints, 4);
  assert.equal(state.lastRound.players[0].skillPoints, awarded);
  assert.equal(validateState(state), true);
});

test('legacy browser saves migrate without mutating inputs or accepting invalid new state', () => {
  const state = setup(); start(state); advance(state, 60);
  const old = structuredClone(state);
  delete old.mode; delete old.sharedLrc;
  for (const player of old.players) { delete player.autoClicks; delete player.autoClock; }
  for (const player of old.lastRound.players) delete player.skillPoints;
  assert.equal(validateState(old), false);
  const migrated = migrateState(old);
  assert.equal(validateState(migrated), true);
  assert.equal(migrated.mode, 'scoreboard');
  assert.equal(migrated.sharedLrc, 0);
  assert.equal(migrated.players[0].autoClicks, 0);
  assert.equal(migrated.players[0].autoClock, 0);
  assert.equal(migrated.lastRound.players[0].skillPoints, old.lastRound.skillPoints);
  assert.equal(Object.hasOwn(old, 'mode'), false);
  const corruptMode = structuredClone(state); corruptMode.mode = 'unknown';
  assert.equal(migrateState(corruptMode), null);
  const corruptPool = structuredClone(state); corruptPool.sharedLrc = -1;
  assert.equal(migrateState(corruptPool), null);
  const scoreboardPool = structuredClone(state); scoreboardPool.sharedLrc = 5;
  assert.equal(validateState(scoreboardPool), false);
  const corruptAward = structuredClone(state); corruptAward.lastRound.players[0].skillPoints = 99;
  assert.equal(validateState(corruptAward), false);
});

test('auto clickers fire real pulses that scale with click upgrades and do not roll critical hits', () => {
  const state = setup(); start(state);
  const player = state.players[0];
  player.generators.mote = 1;
  player.skills = { 'tap-tuning': 2, 'lucky-photon': 5 };
  const stats = getStats(player, state);
  assert.equal(stats.clickPower, 6);
  assert.equal(stats.autoRate, 0.5);
  assert.equal(stats.passiveRate, 1);
  assert.equal(stats.idleRate, 1);
  assert.equal(stats.autoDps, 3);
  const rng = state.rng;
  advance(state, 1);
  assert.equal(player.lrc, 1);
  assert.equal(player.autoClicks, 0);
  assert.equal(player.autoClock, 0.5);
  advance(state, 1);
  assert.equal(player.lrc, 2);
  assert.equal(getOrb(player, state).hp, 1994);
  assert.equal(player.autoClicks, 1);
  assert.equal(player.autoClock, 0);
  assert.equal(player.clicks, 0);
  assert.equal(player.roundClicks, 0);
  assert.equal(player.clickTokens, 3);
  assert.equal(state.rng, rng, 'Automatic pulses do not roll critical RNG');
  assert.equal(validateState(state), true);
});

test('automatic harvesting is independent of the manual click limiter', () => {
  const state = setup(); start(state);
  const player = state.players[0];
  player.generators.mote = 40;
  advance(state, 1);
  assert.equal(player.autoClicks, 20);
  assert.equal(player.lrc, 1);
  assert.equal(getOrb(player, state).hp, 1960);
  assert.equal(player.orbsDestroyed, 0);
  assert.equal(player.clickTokens, 3);
  assert.equal(player.clicks, 0);
});

test('automatic pulses respect the surge boundary during long timer catch-up', () => {
  const long = setup(); const split = setup(); start(long); start(split);
  long.players[0].generators.mote = 1;
  split.players[0].generators.mote = 1;
  advance(long, 60);
  advance(split, 50); advance(split, 10);
  assert.deepEqual(long, split);
  assert.equal(long.players[0].autoClicks, 30);
  assert.equal(long.players[0].lrc, 60, 'Income continues while automatic strikes chip the tough shell');
  assert.equal(long.players[0].orbsDestroyed, 0);
  assert.equal(getOrb(long.players[0], long).hp, 1930, '25 normal and 5 surge strikes deal 70 total damage');
  assert.equal(long.phase, 'intermission');
});

test('refractometers multiply manual clicks, passive production, and automatic pulse value', () => {
  const state = setup(2); start(state);
  const [a, b] = state.players;
  a.generators = { mote: 1, satellite: 1, star: 2 };
  const stats = getStats(a, state);
  assert.equal(stats.generatorMultiplier, 1.2);
  assert.equal(stats.clickPower, 2.4);
  assert.equal(stats.passiveRate, 109.2);// (1 base + 90 from the orb farm) × 1.2 from two refractometers
  assert.equal(stats.autoRate, 0.5);
  assert.equal(stats.idleRate, 109.2);
  assert.equal(getStats(b, state).generatorMultiplier, 1);
  advance(state, 2);
  assert.equal(a.autoClicks, 1);
  assert.equal(a.lrc, 218.4);// two seconds of (1 + 90) × 1.2
  assert.equal(getOrb(a, state).hp, 1997.6);
  assert.equal(b.lrc, 2);
});

test('Buy 10 is atomic, Buy Max spends an exact affordable prefix, and invalid quantities cannot spend', () => {
  for (const mode of ['scoreboard', 'coop']) {
    const state = setup(2); applyAction(state, 'pilot-0', { type: 'setMode', mode }); start(state);
    const player = state.players[1];
    fund(player, 10000); if (mode === 'coop') state.sharedLrc = 10000;
    const quote = generatorQuote(player, 'mote', 10, state);
    const reference = Array.from({ length: 10 }, (_, i) => Math.ceil(25 * 1.17 ** i)).reduce((a, b) => a + b, 0);
    assert.deepEqual(quote, { quantity: 10, cost: reference });
    if (mode === 'coop') state.sharedLrc = reference - 1; else player.lrc = reference - 1;
    const before = structuredClone(state);
    assert.equal(applyAction(state, player.id, { type: 'buyGenerator', id: 'mote', quantity: 10 }).ok, false);
    assert.deepEqual(state, before);
    if (mode === 'coop') state.sharedLrc = reference; else player.lrc = reference;
    assert.equal(applyAction(state, player.id, { type: 'buyGenerator', id: 'mote', quantity: 10 }).quantity, 10);
    assert.equal(getBalance(player, state), 0);
    assert.equal(player.generators.mote, 10);
    if (mode === 'coop') state.sharedLrc = 1000; else player.lrc = 1000;
    const maximum = generatorQuote(player, 'mote', 'max', state);
    const maxResult = applyAction(state, player.id, { type: 'buyGenerator', id: 'mote', quantity: 'max' });
    assert.equal(maxResult.quantity, maximum.quantity);
    assert.equal(getBalance(player, state), 1000 - maximum.cost);
    assert.ok(getBalance(player, state) < generatorCost(player, 'mote'));
    const saved = structuredClone(state);
    for (const quantity of [0, -1, 2, '10', Infinity, null]) assert.equal(applyAction(state, player.id, { type: 'buyGenerator', id: 'mote', quantity }).ok, false);
    assert.deepEqual(state, saved);
  }
});

test('orb damage is private in scoreboard and shared in co-op; destroyed orbs pay and get stronger', () => {
  for (const mode of ['scoreboard', 'coop']) {
    const state = setup(2); applyAction(state, 'pilot-0', { type: 'setMode', mode }); start(state);
    const [a, b] = state.players;
    const before = getOrb(a, state);
    const result = applyAction(state, a.id, { type: 'click' });
    assert.equal(result.damage, 2);
    assert.equal(result.amount, 0.25);
    assert.equal(getOrb(a, state).hp, before.maxHp - 2);
    assert.equal(getOrb(b, state).hp, mode === 'coop' ? before.maxHp - 2 : 2000);
    // Finish a nearly depleted core, keeping payout/spillover independent of click spam.
    const core = mode === 'coop' ? state.sharedOrb : a.orb;
    core.hp = 1;
    const finishingHit = applyAction(state, a.id, { type: 'click' });
    assert.equal(finishingHit.kills, 1);
    assert.equal(finishingHit.amount, before.reward + 0.25);
    assert.equal(a.orbsDestroyed, 1);
    assert.ok(getOrb(a, state).maxHp > before.maxHp);
    assert.ok(a.highestOrb >= 2);
    if (mode === 'coop') assert.equal(b.highestOrb, a.highestOrb);
    assert.equal(validateState(state), true);
  }
});

test('orb maximum HP is strictly increasing across every planet and system through the final core', () => {
  const state = setup(); const player = state.players[0]; let previous = 0;
  for (let level = 1; level <= FINAL_LEVEL; level++) {
    player.orb = { level, hp: 1 }; player.highestOrb = level;
    const orb = getOrb(player, state);
    assert.ok(orb.maxHp > previous, `Orb ${level} must be stronger than ${level - 1}`);
    assert.equal(orb.boss, level < FINAL_LEVEL && level % 20 === 0);
    assert.equal(orb.resistance, orb.boss ? 0.5 : 0);
    assert.ok(Number.isFinite(orb.maxHp)); previous = orb.maxHp;
  }
});

test('analytical multi-orb combat matches an iterative oracle for partial, boss and high-value attacks', () => {
  for (let trial = 0; trial < 250; trial++) {
    const state = createGame({ seed: 0, mode: trial % 2 ? 'coop' : 'scoreboard' });
    const player = addPlayer(state, { id: 'p', name: 'Pilot' });
    const crewSize = 1 + trial % 8;
    for (let i = 1; i < crewSize; i++) addPlayer(state, { id: `crew-${i}`, name: 'Crew' });
    start(state);
    const scale = state.mode === 'coop' ? 1 + 0.85 * (crewSize - 1) : 1;
    const level = 1 + trial % (FINAL_LEVEL-1);
    const core = { level, hp: 2000 * scale * getSystemHpMultiplier(level) * 1.18 ** (level - 1) * (0.2 + (trial % 7) / 10) };
    if(level%20===0)core.bossStartedAt=state.now;
    if (state.mode === 'coop') state.sharedOrb = core; else player.orb = core;
    // Jump-point bosses need a fuelled ship; this oracle checks combat arithmetic once the core is reachable.
    if (state.mode === 'coop') state.sharedFuel = fuelTarget(level); else player.fuel = fuelTarget(level);
    player.highestOrb = level; player.totalPrestige = 10 ** (trial % 14); player.generators.star = trial % 1000;
    if (trial % 3 === 0) player.skills[idOf('bossbreaker')] = 4;
    if (trial % 4 === 0) player.skills[idOf('prism-bounty')] = 3;
    if (trial % 5 === 0) player.skills[idOf('royal-spectrum')] = 2;
    if (trial % 7 === 0) player.skills[idOf('chip-fracture')] = 2;
    const stats = getStats(player, state);
    let budget = stats.clickDamage, nextLevel = level, nextHp = core.hp, reward = 0, kills = 0;
    while (nextLevel < FINAL_LEVEL) {
      const boss = nextLevel % 20 === 0, factor = boss ? stats.bossDamageMultiplier / 2 : 1;
      const cost = nextHp / factor;
      if (budget < cost) { nextHp -= budget * factor; break; }
      budget -= cost;
      reward += ((boss ? 1500 : 300) * 1.14 ** (nextLevel - 1) * (boss ? stats.bossDropMultiplier : 1) + stats.dropFlat) * scale * stats.dropMultiplier;
      kills++; nextLevel++; nextHp = nextLevel === FINAL_LEVEL ? FINAL_HP * scale : 2000 * scale * getSystemHpMultiplier(nextLevel) * 1.18 ** (nextLevel - 1);
      if(nextLevel%20===0)break;
    }
    const result = applyAction(state, player.id, { type: 'click' });
    assert.equal(result.critical, false);
    assert.equal(result.kills, kills);
    assert.equal(core.level, nextLevel);
    assert.ok(Math.abs(core.hp - nextHp) / Math.max(1, nextHp) < 1e-10);
    assert.ok(Math.abs(result.amount - stats.clickIncome - reward) / Math.max(1, reward) < 1e-10);
    assert.equal(validateState(state), true);
  }
});

test('research has functional breadth and a proven multi-day completion floor', () => {
  const research = SKILLS.filter((skill) => skill.currency === 'skill');
  const prestige = SKILLS.filter((skill) => skill.currency === 'prestige');
  assert.equal(research.length, 63); assert.equal(prestige.length, 16);
  assert.equal(SKILL_BRANCHES.filter((branch) => branch.currency === 'skill').length, 11);
  assert.equal(new Set(SKILLS.map((skill) => skill.id)).size, 79);
  assert.equal(RESEARCH_TOTAL_RANKS, 393);
  // Outfitting licences are appended after the prestige lines so packed saves keep their positions.
  assert.deepEqual(SKILLS.slice(-3).map((skill) => skill.id), ['ki1', 'ki2', 'ki3']);
  assert.equal(SKILLS[59].currency, 'skill'); assert.equal(SKILLS[60].id, 'p01');
  const independentlySummedCost = research.reduce((total, skill) => total + Array.from({ length: skill.maxRank }, (_, i) => Math.ceil(skill.cost * skill.costGrowth ** i)).reduce((a, b) => a + b, 0), 0);
  assert.equal(RESEARCH_TOTAL_COST, independentlySummedCost);
  assert.ok(RESEARCH_TOTAL_COST / MAX_SKILL_POINTS_PER_ROUND / 1440 > 4);
  const state = setup(); start(state); const player = state.players[0];
  player.skills = Object.fromEntries(SKILLS.map((skill) => [skill.id, skill.maxRank]));
  player.generators = { mote: 20, satellite: 20, prism: 20, star: 20, nova: 20 };
  player.highestOrb = 200; player.combo = 10;
  for (const skill of SKILLS) {
    const full = player.skills[skill.id]; player.skills[skill.id] = 0;
    if (skill.branch === 'kit') {
      // A licence opens a feature instead of moving a number: each one must gate something.
      const gate = { ki1: () => getFarmUnlocked({ ...player, farm: { ...player.farm, unlocked: false } }), ki2: () => generatorAvailability(player, 'wormhole', state).unlocked, ki3: () => generatorAvailability(player, 'mouse', state).unlocked }[skill.id];
      assert.equal(gate(), false, `${skill.name} must lock its feature`); player.skills[skill.id] = 1; assert.equal(gate(), true, `${skill.name} must open its feature`);
      player.skills[skill.id] = full; continue;
    }
    const before = {orbit:getStats(player, state),garden:getFarmStats(player)}; player.skills[skill.id] = 1;
    assert.notDeepEqual({orbit:getStats(player, state),garden:getFarmStats(player)}, before, `${skill.name} must have a functional effect`);
    player.skills[skill.id] = full;
  }
  advance(state, 60);
  assert.equal(state.lastRound.players[0].skillPoints, MAX_SKILL_POINTS_PER_ROUND);
  assert.equal(validateState(state), true);
});

test('research prerequisites, cross-branch gates, milestone gates, phase and currencies are enforced', () => {
  const state = setup(); start(state); const player = state.players[0]; player.skillPoints = 100000;
  const deep = SKILLS.find((skill) => skill.key === 'quantum-barrage');
  assert.match(skillAvailability(player, deep.id, state).reason, /Requires/);
  for (const [id, needed] of Object.entries(deep.requiredRanks)) player.skills[id] = needed;
  assert.match(skillAvailability(player, deep.id, state).reason, /orb 175/);
  player.highestOrb = 175;
  assert.match(skillAvailability(player, deep.id, state).reason, /720 rounds/);
  player.completedRounds = 720;
  assert.match(skillAvailability(player, deep.id, state).reason, /Prestige 3/);
  player.prestigeCount = 3;
  assert.match(skillAvailability(player, deep.id, state).reason, /10 lifetime/);
  player.totalPrestige = 10;
  assert.match(skillAvailability(player, deep.id, state).reason, /between rounds/);
  advance(state, 60);
  assert.equal(skillAvailability(player, deep.id, state).available, true);
  const cost = skillCost(player, deep.id), points = player.skillPoints;
  assert.equal(applyAction(state, player.id, { type: 'buySkill', id: deep.id }).ok, true);
  assert.equal(player.skillPoints, points - cost);
  assert.ok(skillCost(player, deep.id) > cost);
  const permanent = idOf('eternal-spark');
  assert.equal(applyAction(state, player.id, { type: 'buySkill', id: permanent }).ok, false);
  player.prestigePoints = 10;
  const multiplier = getStats(player, state).multiplier, total = player.totalPrestige;
  assert.equal(applyAction(state, player.id, { type: 'buySkill', id: permanent }).ok, true);
  assert.equal(player.prestigePoints, 9);
  assert.equal(player.totalPrestige, total);
  assert.equal(getStats(player, state).multiplier, multiplier);
});

test('click minting and automatic minting are independent from orb destruction', () => {
  const state = setup(); start(state); const player = state.players[0];
  player.skills[idOf('light-press')] = 2;
  const result = applyAction(state, player.id, { type: 'click' });
  assert.equal(result.kills, 0); assert.equal(result.amount, 1.25);
  player.generators.mote = 1; player.skills[idOf('autonomous-mint')] = 1;
  assert.equal(getStats(player, state).autoMint, 0.125);
  assert.equal(getStats(player, state).idleRate, 1.0625);
  const before = player.lrc; advance(state, 2);
  assert.equal(player.lrc - before, 2.125);
  assert.equal(player.autoClicks, 1);
});

test('prestige preserves all research, unspent SP, lifetime records, and the co-op orb', () => {
  for (const mode of ['scoreboard', 'coop']) {
    const state = setup(2); applyAction(state, 'pilot-0', { type: 'setMode', mode }); start(state);
    const player = state.players[0]; player.generators.nova = 1;
    player.skills = { 'tap-tuning': 2, [idOf('light-press')]: 2, [idOf('eternal-spark')]: 1 };
    applyAction(state, player.id, { type: 'click' }); advance(state, 60);
    const skills = structuredClone(player.skills), points = player.skillPoints, shared = structuredClone(state.sharedOrb), pool = state.sharedLrc;
    const best = player.highestOrb, kills = player.orbsDestroyed, rounds = player.completedRounds;
    assert.equal(applyAction(state, player.id, { type: 'prestige' }).ok, true);
    assert.deepEqual(player.skills, skills); assert.equal(player.skillPoints, points);
    assert.deepEqual(player.orb, { level: 1, hp: 2000 }); assert.deepEqual(player.generators, {});
    assert.equal(player.highestOrb, best); assert.equal(player.orbsDestroyed, kills); assert.equal(player.completedRounds, rounds);
    assert.equal(state.sharedLrc, pool); assert.deepEqual(state.sharedOrb, shared);
  }
});

test('eight fully ranked builds with long identities fit the relay and huge finite economy remains valid', () => {
  const state = createGame({ mode: 'coop' });
  for (let i = 0; i < 8; i++) {
    const player = addPlayer(state, { id: `${i}${'x'.repeat(99)}`, name: '界'.repeat(40) });
    player.skills = Object.fromEntries(SKILLS.map((skill) => [skill.id, skill.maxRank]));
    player.generators = Object.fromEntries(GENERATORS.map((generator) => [generator.id, 1000]));
    player.totalPrestige = 1000; player.highestOrb = 200; player.completedRounds = 1000; player.prestigeCount = 10;
  }
  start(state); advance(state, 60);
  const bytes = Buffer.byteLength(JSON.stringify(compactGameState(state)));
  assert.ok(bytes < 15000, `Full progression state is ${bytes} bytes`);
  assert.equal(validateState(state), true);
  for (const player of state.players) {
    player.arsenalClock = [0.12345678901234567, 0.23456789012345678, 0.34567890123456789, 0.4567890123456789];
    player.arsenalShots = [123456789012345, 234567890123456, 345678901234567, 456789012345678];
    player.autoClicks = Number.MAX_SAFE_INTEGER;
  }
  assert.ok(Buffer.byteLength(JSON.stringify(compactGameState(state))) < 15000, 'Fractional Arsenal clocks and large lifetime counters fit too');
  assert.equal(validateState(state), true);
  const player = state.players[0]; fund(player, 1e100); state.sharedLrc = 1e100;
  assert.equal(getBalance(player, state), 1e100);
  assert.equal(validateState(state), true);
  assert.equal(ECONOMY_LIMIT, 1e150);
});

test('legacy saves grandfather earned ranks and new saves preserve partial orb health exactly', () => {
  const state = setup(); start(state); advance(state, 60);
  const player = state.players[0];
  player.skills = { 'tap-tuning': 1, 'lucky-photon': 1, 'shared-frequency': 1, resonance: 1, unity: 1 };
  const legacy = structuredClone(state); delete legacy.sharedOrb;
  for (const field of ['orb', 'highestOrb', 'orbsDestroyed', 'completedRounds', 'combo', 'comboAt']) delete legacy.players[0][field];
  const migrated = migrateState(legacy);
  assert.ok(migrated); assert.deepEqual(migrated.players[0].skills, player.skills);
  assert.equal(migrated.players[0].completedRounds, 1);
  assert.match(skillAvailability(migrated.players[0], 'lucky-photon', migrated).reason, /rank 2/);
  applyAction(state, player.id, { type: 'ready' }); applyAction(state, player.id, { type: 'click' });
  const restored = migrateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.players[0].orb, player.orb);
  assert.equal(validateState(restored), true);
});

test('logarithmic prestige has exact thresholds and stays bounded across the finite economy', () => {
  const player = setup().players[0];
  for (let points = 1; points <= 40; points++) {
    const threshold = 2500 * (2 ** points - 1);
    player.runLrc = threshold - 1;
    assert.equal(prestigeGain(player), points - 1);
    assert.equal(prestigeNextThreshold(player), threshold);
    player.runLrc = threshold;
    assert.equal(prestigeGain(player), points);
    assert.equal(prestigeNextThreshold(player), 2500 * (2 ** (points + 1) - 1));
  }
  player.runLrc = ECONOMY_LIMIT;
  assert.ok(prestigeGain(player) < 500);
  assert.ok(Number.isFinite(prestigeNextThreshold(player)));
  // Even 10,000 impossible maximum-economy resets cannot approach the point cap.
  const impossibleUpperBound = prestigeGain(player) * 10000;
  assert.ok(impossibleUpperBound < 5e6);
  assert.ok(impossibleUpperBound < Number.MAX_SAFE_INTEGER / 1e6);
});

test('the first shell needs 100 ordinary hits for its first fracture and pays 300 LRC on destruction', () => {
  const state = setup(); start(state); const player = state.players[0];
  assert.equal(COMBAT_VERSION, 2); assert.equal(state.combatVersion, 2);
  assert.equal(getOrb(player, state).maxHp, 2000);
  assert.equal(getOrb(player, state).reward, 300);
  for (let hit = 1; hit <= 100; hit++) {
    state.rng = 0; // The first draw from this seed is noncritical; test ordinary damage exactly.
    const result = applyAction(state, player.id, { type: 'click' });
    assert.equal(result.damage, 2); assert.equal(result.kills, 0); assert.equal(result.amount, 0.25);
    assert.equal(getOrb(player, state).fractureStage, hit < 100 ? 0 : 1);
    advance(state, 0.1);
  }
  assert.equal(player.orb.hp, 1800);
  assert.ok(Math.abs(getOrb(player, state).damageFraction - 0.1) < 1e-12);
  for (const [hp, stage] of [[1301, 1], [1300, 2], [701, 2], [700, 3]]) {
    player.orb.hp = hp; assert.equal(getOrb(player, state).fractureStage, stage);
  }
  player.orb.hp = 2; state.rng = 0;
  const finish = applyAction(state, player.id, { type: 'click' });
  assert.equal(finish.kills, 1); assert.equal(finish.amount, 300.25);
  assert.deepEqual(player.orb, { level: 2, hp: 2360 });
  assert.equal(getOrb(player, state).fractureStage, 0);
  assert.equal(validateState(state), true);
});

test('co-op difficulty and drops scale with active humans while personal cores and practice bots stay independent', () => {
  const state = createGame({ mode: 'coop' });
  for (let size = 1; size <= 8; size++) {
    const player = addPlayer(state, { id: `crew-${size}`, name: `Crew ${size}` });
    const orb = getOrb(player, state), expected = 1 + 0.85 * (size - 1);
    assert.deepEqual(getCoopDifficulty(state), { crewSize: size, crewScale: expected });
    assert.equal(orb.unscaledMaxHp, 2000); assert.equal(orb.maxHp, 2000 * expected);
    assert.equal(orb.hp, orb.maxHp); assert.equal(orb.reward, 300 * expected);
    assert.equal(player.orb.hp, 2000);
    assert.ok(expected / size <= 1 && expected / size > 0.85, 'Equal participation provides a modest co-op time benefit');
    assert.equal(validateState(state), true);
  }
  const before = structuredClone(state);
  assert.equal(addPlayer(state, { id: 'spectator', name: 'Spectator' }), null);
  assert.deepEqual(state, before);
  const practice = createGame({ mode: 'coop' });
  const human = addPlayer(practice, { id: 'human', name: 'Human' });
  addPlayer(practice, { id: 'practice', name: 'Practice', bot: true });
  assert.equal(getOrb(human, practice).maxHp, 2000);
  const personal = setup(8);
  for (const player of personal.players) assert.equal(getOrb(player, personal).maxHp, 2000);
});

test('co-op joins, departures, host handover and rejoin preserve damage fraction without payouts', () => {
  const state = createGame({ mode: 'coop' });
  const first = addPlayer(state, { id: 'a', name: 'First' });
  addPlayer(state, { id: 'b', name: 'Second' }); start(state);
  applyAction(state, first.id, { type: 'click' });
  const fraction = getOrb(first, state).hp / getOrb(first, state).maxHp, pool = state.sharedLrc;
  const check = () => {
    const orb = getOrb(state.players[0], state);
    assert.ok(Math.abs(orb.hp / orb.maxHp - fraction) < 1e-12);
    assert.equal(orb.level, 1); assert.equal(state.sharedLrc, pool);
    assert.equal(validateState(state), true);
  };
  addPlayer(state, { id: 'c', name: 'Third' }); check();
  assert.equal(state.sharedOrb.hp, fraction * 5400);
  const exact = state.sharedOrb.hp;
  reconcilePlayers(state, [{ id: 'b', name: 'Second' }, { id: 'a', name: 'First' }, { id: 'c', name: 'Third' }]);
  assert.equal(state.players[0].id, 'b'); assert.equal(state.sharedOrb.hp, exact); check();
  reconcilePlayers(state, [{ id: 'b', name: 'Second' }]); check();
  assert.equal(getOrb(state.players[0], state).maxHp, 2000);
  reconcilePlayers(state, []); check();
  reconcilePlayers(state, [{ id: 'b', name: 'Returned' }, { id: 'a', name: 'Returned host' }]); check();
  assert.equal(getOrb(state.players[0], state).maxHp, 3700);
  assert.equal(state.players[0].orbsDestroyed, 0);
  assert.equal(state.players[1].orbsDestroyed, 0);
});

test('scoreboard roster changes preserve exact personal HP and lobby mode switches resize only shared HP', () => {
  const state = setup(2), player = state.players[1];
  state.sharedOrb.hp = 1500;
  applyAction(state, 'pilot-0', { type: 'setMode', mode: 'coop' });
  assert.equal(state.sharedOrb.hp, 2775);
  applyAction(state, 'pilot-0', { type: 'setMode', mode: 'scoreboard' });
  assert.equal(state.sharedOrb.hp, 1500);
  start(state); applyAction(state, player.id, { type: 'click' });
  const orb = structuredClone(player.orb);
  reconcilePlayers(state, [{ id: player.id, name: player.name }, { id: 'new', name: 'New' }]);
  assert.deepEqual(player.orb, orb);
  assert.equal(getOrb(player, state).crewScale, 1);
  assert.equal(validateState(state), true);
});

test('combat migration retains legacy damage fractions, rejects corrupt cores and preserves new saves exactly', () => {
  for (const mode of ['scoreboard', 'coop']) {
    const state = setup(3); applyAction(state, 'pilot-0', { type: 'setMode', mode }); start(state);
    const legacy = structuredClone(state); delete legacy.combatVersion;
    legacy.sharedOrb = { level: 10, hp: 12 * 1.18 ** 9 * 0.4 };
    for (const player of legacy.players) { player.orb = { level: 20, hp: 12 * 1.18 ** 19 * 0.75 }; player.highestOrb = 20; }
    const original = structuredClone(legacy), migrated = migrateState(legacy);
    assert.ok(migrated); assert.equal(migrated.combatVersion, 2);
    const scale = mode === 'coop' ? 2.7 : 1;
    assert.ok(Math.abs(migrated.sharedOrb.hp / (2000 * scale * 1.18 ** 9) - 0.4) < 1e-12);
    for (const player of migrated.players) assert.ok(Math.abs(player.orb.hp / (2000 * 1.18 ** 19) - 1) < 1e-12,'Legacy system bosses start a fresh timed attempt');
    assert.equal(validateState(legacy), false, 'Legacy network snapshots cannot bypass combat migration');
    assert.equal(validateState(migrated), true); assert.deepEqual(legacy, original);
    assert.deepEqual(migrateState(migrated), migrated);
    const corrupt = structuredClone(legacy); corrupt.sharedOrb.hp = 12 * 1.18 ** 9 * 1.5;
    assert.equal(migrateState(corrupt), null);
    legacy.combatVersion = 1; assert.deepEqual(migrateState(legacy), migrated);
    legacy.combatVersion = 3; assert.equal(migrateState(legacy), null);
  }
  const preCombat = setup(); delete preCombat.combatVersion; delete preCombat.sharedOrb;
  for (const player of preCombat.players) delete player.orb;
  const fresh = migrateState(preCombat);
  assert.equal(fresh.players[0].orb.hp, 2000); assert.equal(fresh.sharedOrb.hp, 2000);
  const capped = createGame({ mode: 'coop' });
  const player = addPlayer(capped, { id: 'cap', name: 'Cap' });
  player.highestOrb = 1000000; player.orb = { level: 1000000, hp: 1e149 };
  capped.sharedOrb = { level: 1000000, hp: 1e149 }; delete capped.combatVersion;
  const migrated = migrateState(capped);
  assert.deepEqual(migrated.players[0].orb, {level:FINAL_LEVEL,hp:FINAL_HP,finalElapsed:0});
  addPlayer(migrated, { id: 'join', name: 'Join' });
  assert.equal(migrated.sharedOrb.hp, FINAL_HP*1.85, 'The final lattice retains its full health fraction as the crew grows');
  assert.equal(validateState(migrated), true);
});

test('all four Arsenal machines require their own milestones and research before the host permits a purchase', () => {
  assert.deepEqual(GENERATORS.filter((g) => g.category === 'arsenal').map((g) => g.id), ['mouse', 'laser', 'probe', 'gate']);
  assert.equal(GENERATORS.filter((g) => g.category === 'workshop').length, 8);
  // Collection tiers are appended after the shipped machines so packed saves keep every position.
  assert.deepEqual(GENERATORS.slice(-3).map((g) => g.id), ['sail', 'lens', 'dyson']);
  for (const generator of GENERATORS.filter((g) => g.category === 'arsenal')) {
    const state = setup(); start(state); const player = state.players[0]; fund(player, 1e10);
    const before = structuredClone(state);
    assert.equal(generatorAvailability(player, generator.id, state).unlocked, false);
    assert.match(generatorAvailability(player, generator.id, state).reason, /Reach orb/);
    for (const quantity of [1, 10, 'max']) assert.equal(applyAction(state, player.id, { type: 'buyGenerator', id: generator.id, quantity }).ok, false);
    assert.deepEqual(state, before, 'Forged locked shop actions never spend currency or create a machine');
    player.highestOrb = generator.unlock.orb;
    if (generator.id === 'gate') {
      assert.match(generatorAvailability(player, generator.id, state).reason, /120 rounds/);
      player.completedRounds = 120;
      assert.match(generatorAvailability(player, generator.id, state).reason, /Prestige 1/);
      player.prestigeCount = 1;
    }
    assert.match(generatorAvailability(player, generator.id, state).reason, /Requires/);
    Object.assign(player.skills, generator.unlock.skills);
    assert.deepEqual(generatorAvailability(player, generator.id, state), { unlocked: true, available: true, reason: 'Ready to build.' });
    assert.equal(applyAction(state, player.id, { type: 'buyGenerator', id: generator.id }).ok, true);
    assert.equal(player.generators[generator.id], 1);
    assert.equal(player.lrc, 1e10 - generator.baseCost);
    assert.equal(generatorCost(player, generator.id), Math.ceil(generator.baseCost * 1.17));
    player.lrc = 0;
    assert.equal(generatorAvailability(player, generator.id, state).unlocked, true);
    assert.equal(generatorAvailability(player, generator.id, state).available, false);
    assert.equal(validateState(state), true);
  }
});

test('Arsenal bulk purchases are atomic, spend the shared wallet, and never borrow another pilot research unlock', () => {
  const state = setup(2); applyAction(state, 'pilot-0', { type: 'setMode', mode: 'coop' }); start(state);
  const [a, b] = state.players;
  a.highestOrb = 5; a.skills.au1 = 2; a.skills.ki3 = 1;
  state.sharedLrc = 1e6;
  assert.equal(generatorAvailability(b, 'mouse', state).unlocked, false);
  assert.equal(applyAction(state, b.id, { type: 'buyGenerator', id: 'mouse' }).ok, false);
  const quote = generatorQuote(a, 'mouse', 10, state);
  const expected = Array.from({ length: 10 }, (_, owned) => Math.ceil(2400 * 1.17 ** owned)).reduce((x, y) => x + y, 0);
  assert.equal(quote.cost, expected);
  state.sharedLrc = expected - 1;
  assert.equal(applyAction(state, a.id, { type: 'buyGenerator', id: 'mouse', quantity: 10 }).ok, false);
  assert.equal(a.generators.mouse, undefined); assert.equal(state.sharedLrc, expected - 1);
  state.sharedLrc = expected;
  assert.equal(applyAction(state, a.id, { type: 'buyGenerator', id: 'mouse', quantity: 10 }).quantity, 10);
  assert.equal(state.sharedLrc, 0); assert.equal(a.lrc, 0); assert.equal(b.lrc, 0);
  assert.equal(a.generators.mouse, 10);
  state.sharedLrc = 100000;
  const maximum = generatorQuote(a, 'mouse', 'max', state);
  assert.equal(applyAction(state, a.id, { type: 'buyGenerator', id: 'mouse', quantity: 'max' }).quantity, maximum.quantity);
  assert.equal(state.sharedLrc, 100000 - maximum.cost);
  assert.ok(state.sharedLrc < generatorCost(a, 'mouse'));
  assert.equal(validateState(state), true);
});

test('AI Mouse makes guaranteed paid clicks without consuming manual inputs or creating manual crits and combos', () => {
  const state = setup(); start(state); const player = state.players[0];
  player.generators.mouse = 1;
  player.skills[idOf('light-press')] = 2;
  player.skills['lucky-photon'] = 8;
  const profile = getStats(player, state).autoProfiles.find((entry) => entry.id === 'mouse');
  assert.equal(profile.rate, 2); assert.equal(profile.damage, 2); assert.equal(profile.mint, 1.25);
  assert.equal(getStats(player, state).idleRate, 3.5);
  const rng = state.rng;
  advance(state, 0.25);
  assert.equal(player.arsenalClock[0], 0.5); assert.equal(player.autoClicks, 0); assert.equal(player.lrc, 0.25);
  advance(state, 0.75);
  assert.equal(player.arsenalClock[0], 0); assert.equal(player.arsenalShots[0], 2); assert.equal(player.autoClicks, 2);
  assert.equal(player.lrc, 3.5); assert.equal(player.orb.hp, 1996);
  assert.equal(player.clicks, 0); assert.equal(player.roundClicks, 0); assert.equal(player.combo, 0);
  assert.equal(player.clickTokens, 3); assert.equal(state.rng, rng);
  assert.equal(getStats(player, state).autoProfiles.find((entry) => entry.id === 'mouse').shots, 2);
  assert.equal(validateState(state), true);
});

test('Lazer, Starlink and gates fire their advertised heavy pulses and hybrid income follows production research', () => {
  for (const [id, seconds, damage, income] of [['laser', 5, 40, 1], ['probe', 2, 6, 1201], ['gate', 10, 200, 10001]]) {
    const state = setup(); start(state); const player = state.players[0]; player.generators[id] = 1;
    const before = getStats(player, state), profile = before.autoProfiles.find((entry) => entry.id === id);
    assert.equal(profile.rate, 1 / seconds); assert.equal(profile.damage, damage); assert.equal(profile.mint, 0);
    assert.equal(before.passiveRate, income);
    advance(state, seconds - 0.25);
    assert.equal(player.autoClicks, 0); assert.equal(player.orb.hp, 2000);
    advance(state, 0.25);
    assert.equal(player.autoClicks, 1); assert.equal(player.orb.hp, 2000 - damage);
    assert.equal(player.lrc, seconds * income);
    assert.equal(getStats(player, state).autoProfiles.find((entry) => entry.id === id).shots, 1);
    assert.equal(validateState(state), true);
  }
  const state = setup(); start(state); const player = state.players[0];
  player.generators = { probe: 1, gate: 1, star: 2 };
  player.skills.perpetuity = 1;
  const stats = getStats(player, state);
  assert.ok(Math.abs(stats.passiveRate - (1 + 11200 * 1.12) * 1.2) < 1e-9);
  assert.ok(Math.abs(stats.autoRate - 0.6 * 1.12) < 1e-12);
  assert.equal(stats.autoDamage, 2.4);
  assert.ok(Math.abs(stats.autoDps - (0.5 * 3 + 0.1 * 100) * 1.12 * 2.4) < 1e-10);
});

test('per-type profiles and minting aggregate correctly through surge and deterministic catch-up', () => {
  const long = setup(), split = setup(); start(long); start(split);
  for (const state of [long, split]) {
    const player = state.players[0];
    player.generators = { mote: 1, mouse: 1, laser: 1, probe: 1, gate: 1 };
    player.skills[idOf('autonomous-mint')] = 1;
  }
  const stats = getStats(long.players[0], long);
  assert.ok(Math.abs(stats.autoRate - 3.3) < 1e-12);
  assert.equal(stats.autoDps, 36);
  assert.ok(Math.abs(stats.idleRate - (11201 + 2 * 0.25 + 1.3 * 0.025)) < 1e-9);
  advance(long, 60); advance(split, 50); advance(split, 10);
  assert.deepEqual(long, split);
  const player = long.players[0], profiles = getStats(player, long).autoProfiles;
  assert.deepEqual(profiles.map((profile) => profile.shots), [30, 120, 12, 30, 6]);
  assert.equal(player.autoClicks, 198); assert.equal(player.clicks, 0);
  assert.equal(player.orbsDestroyed, 1);
  assert.ok(player.lrc > 11201 * 60 + 300);
  assert.equal(validateState(long), true);
});

test('Arsenal prestige, restore and handover retain lifetime shots but reset only the choosing pilot machines and charge', () => {
  const state = setup(2); applyAction(state, 'pilot-0', { type: 'setMode', mode: 'coop' }); start(state);
  const [a, b] = state.players;
  a.generators = { mouse: 1, laser: 1, probe: 1, gate: 1 };
  a.highestOrb = 60; a.completedRounds = 120; a.prestigeCount = 1; a.skills = { ki3: 1, au1: 2, au2: 2, au3: 2, perpetuity: 1 };
  advance(state, 60);
  const shots = structuredClone(a.arsenalShots), count = a.autoClicks, shared = structuredClone(state.sharedOrb), bank = state.sharedLrc;
  const restored = migrateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored, state);
  assert.equal(applyAction(state, a.id, { type: 'prestige' }).ok, true);
  assert.deepEqual(a.generators, {}); assert.deepEqual(a.arsenalClock, [0, 0, 0, 0]);
  assert.deepEqual(a.arsenalShots, shots); assert.equal(a.autoClicks, count);
  assert.deepEqual(state.sharedOrb, shared); assert.equal(state.sharedLrc, bank);
  assert.equal(generatorAvailability(a, 'gate', state).unlocked, true);
  reconcilePlayers(state, [{ id: b.id, name: b.name }, { id: a.id, name: a.name }]);
  assert.deepEqual(state.players[1].arsenalShots, shots);
  const old = setup(); delete old.players[0].arsenalClock; delete old.players[0].arsenalShots;
  old.players[0].autoClicks = 123; old.players[0].autoClock = 0.75;
  const migrated = migrateState(old);
  assert.ok(migrated); assert.deepEqual(migrated.players[0].arsenalClock, [0, 0, 0, 0]);
  assert.deepEqual(migrated.players[0].arsenalShots, [0, 0, 0, 0]);
  assert.equal(migrated.players[0].autoClicks, 123); assert.equal(migrated.players[0].autoClock, 0.75);
  assert.equal(getStats(migrated.players[0], migrated).autoProfiles[0].shots, 123);
  for (const [field, value] of [['arsenalClock', [0, 0, 0, 2]], ['arsenalShots', [0, 0, -1, 0]], ['arsenalClock', []], ['arsenalShots', null]]) {
    const corrupt = structuredClone(migrated); corrupt.players[0][field] = value;
    assert.equal(validateState(corrupt), false); assert.equal(migrateState(corrupt), null);
  }
  assert.equal(validateState(state), true);
});

test('system boss automation keeps the same result across catch-up slices, including retries and gate crossings', () => {
  for(const mode of ['scoreboard','coop'])for(const owned of [1,40,400]){
    const long=setup(mode==='coop'?2:1);applyAction(long,'pilot-0',{type:'setMode',mode});start(long);
    const orb=mode==='coop'?long.sharedOrb:long.players[0].orb;orb.level=20;orb.hp=getOrb(long.players[0],long).maxHp;
    for(const p of long.players){p.highestOrb=20;p.generators={mote:owned,wormhole:20};}
    const split=structuredClone(long);advance(long,45);for(let i=0;i<450;i++)advance(split,.1);
    const a=getOrb(long.players[0],long),b=getOrb(split.players[0],split);
    assert.equal(a.level,b.level,`${mode} ${owned} clickers reach the same planet`);
    assert.ok(Math.abs(a.hp-b.hp)/a.maxHp<1e-10);
    assert.ok(Math.abs(a.bossRemaining-b.bossRemaining)<1e-8);
    assert.deepEqual(long.players.map(p=>p.autoClicks),split.players.map(p=>p.autoClicks));
    assert.equal(validateState(long),true);assert.equal(validateState(split),true);
  }
});

test('cooked boosts earned LRCs once without changing damage or multiplying a secret victory reward', () => {
  for(const mode of ['scoreboard','coop']){
    const state=setup();applyAction(state,'pilot-0',{type:'setMode',mode});start(state);const p=state.players[0];
    const ordinary=getStats(p,state);p.farm.unlocked=true;p.farm.crops.weed=true;p.farm.cookedSeconds=20;
    const boosted=getStats(p,state);assert.equal(boosted.clickDamage,ordinary.clickDamage);assert.equal(boosted.autoDamage,ordinary.autoDamage);
    assert.equal(boosted.clickIncome,ordinary.clickIncome*4.2);assert.equal(boosted.passiveRate,ordinary.passiveRate*4.2);
    (mode==='coop'?state.sharedOrb:p.orb).hp=1;
    const hit=applyAction(state,p.id,{type:'click'});
    assert.ok(Math.abs(hit.amount-(300+.25)*4.2)<1e-10,'The orb drop and click mint each receive one multiplier');
    assert.ok(Math.abs(getBalance(p,state)-hit.amount)<1e-10);assert.equal(validateState(state),true);
  }
  const state=setup();start(state);const p=state.players[0],before=structuredClone(p.orb);
  assert.equal(applyAction(state,p.id,{type:'startSecretChallenge'}).ok,true);p.secretOrb.hp=1;
  const mint=getStats(p,state).clickIncome,result=applyAction(state,p.id,{type:'click'});
  assert.equal(result.amount,mint,'The killing click earns its normal mint with no secret boss drop');
  assert.equal(p.lifetimeLrc,mint);assert.deepEqual(p.orb,before);assert.equal(p.orbsDestroyed,0);assert.equal(p.victories,0);assert.equal(p.farm.crops.weed,true);
  assert.equal(validateState(state),true);
});

test('cooked expiry splits automatic minting exactly and leaves the next manual click at its normal value', () => {
  const long=setup();start(long);const p=long.players[0];p.generators.mouse=1;p.farm.unlocked=true;p.farm.crops.weed=true;p.farm.cookedSeconds=10;
  const split=structuredClone(long);advance(long,20);advance(split,10);advance(split,10);
  assert.equal(p.lifetimeLrc,78,'Ten seconds at 1.5 LRC/s times 4.2, then ten seconds at the normal rate');
  assert.equal(p.lifetimeLrc,split.players[0].lifetimeLrc);assert.deepEqual(p.orb,split.players[0].orb);assert.equal(p.autoClicks,40);
  assert.equal(p.farm.cookedSeconds,0);const hit=applyAction(long,p.id,{type:'click'});assert.equal(hit.amount,.25);
  assert.equal(validateState(long),true);
});

test('decimal-time combo expiry advances production and resets the next click instead of stalling', () => {
  const state=setup();start(state);const p=state.players[0];
  state.now=3.3;state.remaining=56.7;p.comboAt=1.3;p.combo=8;p.generators.mote=2;
  p.skills[SKILLS.find(skill=>skill.effects.comboPower).id]=1;
  assert.equal(state.now-p.comboAt<2,true,'This decimal boundary rounds below two seconds when subtracted');
  assert.equal(getStats(p,state).combo,0,'The absolute deadline has already expired');
  const damage=getStats(p,state).autoDamage,hp=p.orb.hp;
  advance(state,1);
  assert.equal(state.now,4.3);assert.equal(state.remaining,55.7);assert.equal(p.combo,0);
  assert.equal(p.autoClicks,1);assert.equal(p.orb.hp,hp-damage);assert.ok(p.lifetimeLrc>0);
  p.combo=8;p.comboAt=state.now-2;
  assert.equal(applyAction(state,p.id,{type:'click'}).ok,true);assert.equal(p.combo,1,'A click at the expiry deadline begins a new combo');
  assert.equal(validateState(state),true);
});
