import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, reconcilePlayers, applyAction, advance, getStats, getBalance, getTeamStats, getRoundTarget, generatorCost, prestigeGain, validateState, migrateState, SKILLS } from '../src/game.js';

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
  assert.ok(earned >= 6);
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
  assert.equal(getStats(player, state).idleRate, 2);
  advance(state, 3);
  assert.equal(player.lrc, 80, 'Three seconds grants baseline income plus one completed automatic pulse');
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
  for (let i = 0; i < 5; i++) assert.equal(applyAction(state, player.id, { type: 'buySkill', id: 'tap-tuning' }).ok, true);
  assert.equal(applyAction(state, player.id, { type: 'buySkill', id: 'tap-tuning' }).ok, false);
  assert.equal(applyAction(state, player.id, { type: 'buySkill', id: 'lucky-photon' }).ok, true);
  assert.equal(getStats(player, state).clickPower, 12);
  assert.equal(getStats(player, state).criticalChance, 0.1);
  assert.equal(validateState(state), true);
});

test('cooperative goal awards an extra point and crew skills affect other pilots', () => {
  const state = setup(2);
  applyAction(state, 'pilot-0', { type: 'setMode', mode: 'coop' });
  start(state);
  const [a, b] = state.players;
  a.skills['shared-frequency'] = 2;
  assert.equal(getStats(b, state).multiplier, 1.06);
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
  assert.equal(a.skillPoints, 0);
  assert.deepEqual(a.generators, {});
  assert.deepEqual(a.skills, {});
  assert.equal(a.totalPrestige, 2);
  assert.equal(getStats(a, state).multiplier, 1.2);
  assert.equal(b.lrc, otherBalance);
  assert.equal(state.phase, 'intermission');
  assert.equal(applyAction(state, a.id, { type: 'prestige' }).ok, false);
  assert.equal(validateState(state), true);
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
  assert.ok(Buffer.byteLength(JSON.stringify(state)) < 15000);
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
  assert.equal(getStats(a, state).multiplier, 1.15);
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
  assert.equal(state.sharedLrc, 7);
  assert.deepEqual(getTeamStats(state), { clickPower: 4, idleRate: 3 });
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
  assert.equal(getStats(b, state).multiplier, 1.06);
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
  assert.equal(player.skillPoints, 0);
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
  assert.equal(stats.idleRate, 4);
  const rng = state.rng;
  advance(state, 1);
  assert.equal(player.lrc, 1);
  assert.equal(player.autoClicks, 0);
  assert.equal(player.autoClock, 0.5);
  advance(state, 1);
  assert.equal(player.lrc, 8);
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
  assert.equal(player.lrc, 41);
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
  assert.equal(long.players[0].lrc, 130, '60 baseline + 25 normal pulses at 2 + 5 surge pulses at 4');
  assert.equal(long.phase, 'intermission');
});

test('refractometers multiply manual clicks, passive production, and automatic pulse value', () => {
  const state = setup(2); start(state);
  const [a, b] = state.players;
  a.generators = { mote: 1, satellite: 1, star: 2 };
  const stats = getStats(a, state);
  assert.equal(stats.generatorMultiplier, 1.2);
  assert.equal(stats.clickPower, 2.4);
  assert.equal(stats.passiveRate, 8.4);
  assert.equal(stats.autoRate, 0.5);
  assert.equal(stats.idleRate, 9.6);
  assert.equal(getStats(b, state).generatorMultiplier, 1);
  advance(state, 2);
  assert.equal(a.autoClicks, 1);
  assert.equal(a.lrc, 19.2);
  assert.equal(b.lrc, 2);
});
