/** The frontier disciplines: Observatory sky events, the Light vault, Surge science, Astrogation and the Siege clock. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, applyAction, advance, getStats, getOrb, getShipStatus, skyEvents, hasObservatory, bossDuration, shipTarget, validateState, migrateState, compactGameState, SKILLS, STAR_SECONDS, QUASAR_SECONDS, TAILWIND_SECONDS, TAILWIND_PCT, LENS_SECONDS, LENS_PCT, WINDFALL_SECONDS, MAX_STARS, BOSS_CLOCK_LIMIT } from '../src/game.js';
import { BOSS_DURATION, fuelTarget } from '../src/campaign.js';

const idOf = (key) => SKILLS.find((skill) => skill.key === key).id;
function setup(mode = 'scoreboard', size = 1, research = {}) {
  const state = createGame({ mode });
  for (let i = 0; i < size; i++) { const p = addPlayer(state, { id: `p${i}`, name: `Pilot ${i}` }); if (i === 0) for (const [key, rank] of Object.entries(research)) p.skills[idOf(key)] = rank; }
  assert.equal(applyAction(state, 'p0', { type: 'start' }).ok, true);
  return state;
}
const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} ≈ ${b}`);

test('the Observatory licence opens the sky: no sky without it, a deterministic one with it, and only licensed pilots see it', () => {
  const quiet = setup(); assert.equal(quiet.sky, null); assert.equal(skyEvents(quiet, quiet.players[0]), null); assert.equal(hasObservatory(quiet.players[0]), false);
  assert.equal(applyAction(quiet, 'p0', { type: 'catchStar', index: 0 }).ok, false);
  const state = setup('scoreboard', 2, { 'observatory-licence': 1 });
  assert.equal(hasObservatory(state.players[0]), true);
  assert.ok(state.sky && state.sky.stars.length === 1, 'One shooting star per round without Meteor shower');
  assert.ok(state.sky.stars.every((at) => Number.isInteger(at) && at >= 4 && at + STAR_SECONDS <= state.roundDuration));
  assert.ok(state.sky.quasar === null || Number.isInteger(state.sky.quasar));
  const again = setup('scoreboard', 2, { 'observatory-licence': 1 });
  assert.deepEqual(again.sky, state.sky, 'The sky is fixed from the round number and host RNG');
  assert.equal(skyEvents(state, state.players[1]), null, 'An unlicensed crewmate sees nothing');
  assert.equal(skyEvents(state, state.players[0]).stars.length, 1);
  assert.equal(validateState(state), true);
  assert.deepEqual(migrateState(JSON.parse(JSON.stringify(compactGameState(state)))), state, 'A rolled sky round-trips through the relay');
  advance(state, 60); assert.equal(state.phase, 'intermission'); assert.equal(state.sky, null, 'The sky clears with the round');
});

test('Meteor shower adds stars for the whole crew from the best-researched pilot, capped at six', () => {
  const shower = setup('coop', 2, { 'observatory-licence': 1, 'meteor-shower': 2 });
  assert.equal(shower.sky.stars.length, 3);
  const flooded = setup('coop', 1, { 'observatory-licence': 1, 'meteor-shower': 4, constellation: 4 });
  assert.ok(flooded.sky.stars.length <= MAX_STARS);
  assert.equal(getStats(flooded.players[0], flooded).starCount, 5);
});

test('catching a shooting star grants a tailwind that speeds machines, mints stardust when researched and cannot be caught twice', () => {
  const state = setup('scoreboard', 1, { 'observatory-licence': 1, stardust: 2, slipstream: 1 }), p = state.players[0];
  p.generators = { mote: 4, prism: 2 };
  const at = state.sky.stars[0];
  assert.equal(applyAction(state, 'p0', { type: 'catchStar', index: 0 }).ok, at === 0, 'A star cannot be caught before it appears');
  advance(state, at + 0.5);
  const before = getStats(p, state), events = skyEvents(state, p);
  assert.equal(events.stars[0].active, true); assert.equal(events.stars[0].caught, false);
  assert.equal(applyAction(state, 'p0', { type: 'catchStar', index: 7 }).ok, false, 'Unknown stars are rejected');
  const lrc = p.lrc, result = applyAction(state, 'p0', { type: 'catchStar', index: 0 });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.seconds, TAILWIND_SECONDS); close(result.tailwindPct, TAILWIND_PCT);
  close(result.amount, before.passiveRate * 10, 1e-9); close(p.lrc, lrc + result.amount, 1e-9);
  assert.equal(p.starsCaught, 1); assert.equal(skyEvents(state, p).stars[0].caught, true);
  assert.equal(applyAction(state, 'p0', { type: 'catchStar', index: 0 }).ok, false, 'Each star is caught once per pilot');
  const during = getStats(p, state);
  assert.equal(during.tailwind, true);
  close(during.autoRate, before.autoRate * (1 + TAILWIND_PCT)); close(during.passiveRate, 1 + (before.passiveRate - 1) * (1 + TAILWIND_PCT));
  close(during.clickDamage, before.clickDamage * 1.1, 1e-9);
  close(p.tailwindUntil, state.now + TAILWIND_SECONDS);
  assert.equal(validateState(state), true);
  advance(state, TAILWIND_SECONDS + 0.01);
  const after = getStats(p, state);
  assert.equal(after.tailwind, false); close(after.autoRate, before.autoRate); close(after.passiveRate, before.passiveRate);
  assert.equal(validateState(state), true);
});

test('a flaring quasar pays a windfall of steady output and lenses orb drops; Redshift keeps it visible longer', () => {
  const state = setup('scoreboard', 1, { 'observatory-licence': 1, windfall: 2, 'gravitational-focus': 1 }), p = state.players[0];
  state.sky.quasar = 12; p.generators = { prism: 3 };
  assert.equal(validateState(state), true);
  assert.equal(applyAction(state, 'p0', { type: 'tapQuasar' }).ok, false, 'The quasar has not flared yet');
  advance(state, 12);
  const stats = getStats(p, state), events = skyEvents(state, p);
  assert.equal(events.quasar.active, true); assert.equal(events.quasar.seconds, QUASAR_SECONDS);
  const lrc = p.lrc, result = applyAction(state, 'p0', { type: 'tapQuasar' });
  assert.equal(result.ok, true, result.reason);
  close(result.amount, stats.idleRate * (WINDFALL_SECONDS + 6)); close(p.lrc, lrc + result.amount);
  assert.equal(result.seconds, LENS_SECONDS); close(result.lensPct, LENS_PCT + 0.25);
  assert.equal(p.quasarsTapped, 1);
  assert.equal(applyAction(state, 'p0', { type: 'tapQuasar' }).ok, false, 'A quasar is tapped once per pilot');
  const lensed = getStats(p, state);
  assert.equal(lensed.lens, true); close(lensed.dropMultiplier, stats.dropMultiplier * (1 + LENS_PCT + 0.25));
  close(getOrb(p, state).reward, getOrb(p, { ...state, now: p.lensUntil + 1 }).reward * (1 + LENS_PCT + 0.25), 1e-9);
  assert.equal(validateState(state), true);
  const late = setup('scoreboard', 1, { 'observatory-licence': 1, redshift: 3 });
  late.sky.quasar = 10; advance(late, 10 + QUASAR_SECONDS + 1);
  assert.equal(skyEvents(late, late.players[0]).quasar.active, true, 'Redshift extends the flare by six seconds');
  assert.equal(applyAction(late, 'p0', { type: 'tapQuasar' }).ok, true);
  advance(late, 6); assert.equal(skyEvents(late, late.players[0]).quasar.active, false);
});

test('the Light vault pays interest on the wallet up to a share of continuous output, and the Closing bell adds a round dividend', () => {
  const state = setup('scoreboard', 2, { 'light-vault': 1 }), p = state.players[0], other = state.players[1];
  p.lrc = p.runLrc = p.lifetimeLrc = 1000;
  const stats = getStats(p, state);
  close(stats.vaultRate, 0.001); close(stats.vaultCap, 0.5); close(stats.interestRate, 0.5, 1e-12);
  close(stats.idleRate, 1.5); assert.equal(getStats(other, state).interestRate, 0);
  advance(state, 10);
  close(p.lrc, 1000 + 10 * 1.5, 1e-9); close(other.lrc, 10, 1e-9);
  p.skills[idOf('compound-ledger')] = 3; close(getStats(p, state).interestRate, Math.min(p.lrc * 0.001, 0.8), 1e-9);
  const bell = setup('scoreboard', 1, { 'closing-bell': 2 }), q = bell.players[0];
  advance(bell, 60);
  assert.equal(bell.phase, 'intermission');
  close(q.roundLrc, 60 * 1.04, 1e-9); close(q.lrc, q.roundLrc, 1e-9);
  assert.equal(bell.lastRound.players[0].lrc, q.roundLrc);
  assert.equal(validateState(bell), true);
});

test('Surge science starts the solar surge earlier per pilot and boosts speed, criticals, drops and income only while it lasts', () => {
  const state = setup('scoreboard', 2, { 'early-dawn': 2, 'surge-coils': 1, 'flash-point': 1, 'surge-bounty': 1, 'solar-dynamo': 1 }), p = state.players[0], other = state.players[1];
  p.generators = { mote: 2, prism: 2 }; other.generators = { mote: 2, prism: 2 };
  assert.equal(getStats(p, state).surgeWindow, 13); assert.equal(getStats(other, state).surgeWindow, 10);
  const calm = getStats(p, state);
  advance(state, 60 - 12.5);
  close(state.remaining, 12.5, 1e-9);
  const hot = getStats(p, state), cold = getStats(other, state);
  assert.equal(hot.surge, true); assert.equal(cold.surge, false);
  close(hot.autoRate, calm.autoRate * 1.1); close(hot.criticalChance, calm.criticalChance + 0.02);
  close(hot.dropMultiplier, calm.dropMultiplier * 1.1); close(hot.passiveRate, 1 + (calm.passiveRate - 1) * 1.15);
  close(hot.clickDamage, calm.clickDamage * 2);
  advance(state, 2.5); assert.equal(getStats(other, state).surge, true, 'The unresearched pilot surges at ten seconds');
  advance(state, 20); assert.equal(state.phase, 'intermission'); assert.equal(validateState(state), true);
});

test('Astrogation: meals fuel more, fuel targets fall for the crew, crashes keep more fuel, hulls take more hits and arrival pays', () => {
  const state = setup('scoreboard', 1, { 'fuel-injectors': 1, 'crash-recovery': 1, 'reinforced-hull': 1, 'arrival-bonus': 1, 'efficient-routes': 1 }), p = state.players[0];
  p.farm.unlocked = true; p.farm.inventory.carrot = 2;
  const stats = getStats(p, state);
  close(stats.fuelMultiplier, 1.1); close(stats.crashRetain, 0.6); assert.equal(stats.flightHits, 4); assert.equal(stats.arrivalSeconds, 20); close(stats.fuelTargetDiscount, 0.05);
  assert.equal(shipTarget(p, state, 20), Math.ceil(fuelTarget(20) * 0.95)); assert.equal(getShipStatus(p, state).target, Math.ceil(fuelTarget(1) * 0.95));
  const meal = applyAction(state, 'p0', { type: 'feedBeam', crop: 'carrot' });
  assert.equal(meal.ok, true, meal.reason); close(meal.fuel, 33); close(p.fuel, 33);
  // A cleared jump point: the flight result applies the researched crash fraction and arrival pay.
  p.orb = { level: 20, hp: 1 }; p.orb.hp = getOrb(p, state).maxHp; p.highestOrb = 20; p.transit = { pilot: 'p0' }; p.fuel = shipTarget(p, state, 20);
  assert.equal(validateState(state), true);
  const crash = applyAction(state, 'p0', { type: 'completeJump', arrived: false });
  assert.equal(crash.ok, true, crash.reason); close(crash.kept, 0.6); close(p.fuel, shipTarget(p, state, 20) * 0.6);
  p.fuel = shipTarget(p, state, 20); const lrc = p.lrc, idle = getStats(p, state).idleRate;
  const arrival = applyAction(state, 'p0', { type: 'completeJump', arrived: true });
  assert.equal(arrival.ok, true, arrival.reason); assert.equal(arrival.level, 21); close(arrival.bonus, idle * 20); close(p.lrc, lrc + idle * 20);
  assert.equal(p.fuel, 0); assert.equal(p.transit, null); assert.equal(validateState(state), true);
  const coop = setup('coop', 2, { 'efficient-routes': 3 });
  assert.equal(shipTarget(coop.players[1], coop, 40), Math.ceil(fuelTarget(40) * 0.85), 'The best-researched pilot sets the crew target');
  assert.equal(getStats(coop.players[1], coop).fuelTargetDiscount, 0, 'Personal stats still show personal research');
});

test('the Siege clock lengthens system-boss attempts by five seconds per rank, capped at a minute, and the crew shares the best clock', () => {
  const state = setup('scoreboard', 1, { 'siege-clock': 1 }), p = state.players[0];
  assert.equal(bossDuration(state, p), BOSS_DURATION + 5); assert.equal(getStats(p, state).bossDuration, 35);
  p.orb = { level: 20, hp: 1 }; p.orb.hp = getOrb(p, state).maxHp; p.highestOrb = 20; p.fuel = fuelTarget(20);
  const full = p.orb.hp;
  assert.equal(getOrb(p, state).bossRemaining, 35); close(getOrb(p, state).requiredDps, full / 35);
  assert.equal(applyAction(state, 'p0', { type: 'click' }).ok, true); assert.ok(p.orb.hp < full);
  advance(state, 32); assert.ok(p.orb.hp < full, 'At 32 seconds a 35-second attempt is still live'); assert.ok(Object.hasOwn(p.orb, 'bossStartedAt'));
  advance(state, 4); assert.equal(p.orb.hp, full, 'The attempt expires at 35 seconds'); assert.equal(Object.hasOwn(p.orb, 'bossStartedAt'), false);
  assert.equal(validateState(state), true);
  p.skills[idOf('siege-clock')] = 6; assert.equal(bossDuration(state, p), BOSS_CLOCK_LIMIT);
  const coop = setup('coop', 2, { 'siege-clock': 2 });
  assert.equal(bossDuration(coop, coop.players[1]), 40, 'A crewmate benefits from the best Siege research');
});

test('sky state is validated: skies outside rounds, overlong buffs and malformed stars are rejected, and old saves migrate', () => {
  const state = setup('scoreboard', 1, { 'observatory-licence': 1 }), p = state.players[0];
  const snapshot = JSON.parse(JSON.stringify(state));
  for (const [mutate, label] of [
    [(s) => { s.sky.stars = []; }, 'empty stars'],
    [(s) => { s.sky.stars = [1.5]; }, 'fractional star'],
    [(s) => { s.sky.stars = Array(MAX_STARS + 1).fill(5); }, 'too many stars'],
    [(s) => { s.sky.quasar = s.roundDuration + 1; }, 'quasar after the round'],
    [(s) => { s.sky.extra = true; }, 'unknown sky field'],
    [(s) => { s.players[0].tailwindUntil = s.now + 61; }, 'tailwind beyond the limit'],
    [(s) => { s.players[0].lensUntil = -1; }, 'negative lens'],
    [(s) => { s.players[0].skyCaught = 2 ** 31; }, 'oversized catch mask'],
    [(s) => { s.players[0].starsCaught = 1.5; }, 'fractional catches'],
  ]) { const broken = JSON.parse(JSON.stringify(snapshot)); mutate(broken); assert.equal(validateState(broken), false, `${label} must be rejected`); }
  advance(state, 60); state.sky = snapshot.sky; assert.equal(validateState(state), false, 'A sky outside a round is rejected');
  state.sky = null; assert.equal(validateState(state), true);
  const old = JSON.parse(JSON.stringify(state)); delete old.sky;
  for (const key of ['tailwindUntil', 'lensUntil', 'skyCaught', 'starsCaught', 'quasarsTapped']) delete old.players[0][key];
  const migrated = migrateState(old);
  assert.ok(migrated, 'A save without sky fields migrates'); assert.equal(migrated.sky, null); assert.equal(migrated.players[0].starsCaught, 0);
  assert.deepEqual(migrated, state);
  assert.equal(Object.hasOwn(compactGameState(state), 'sky'), false, 'A quiet sky is left out of the relay');
  assert.equal(Object.hasOwn(compactGameState(state).players[0], 'starsCaught'), false, 'Zero counters are left out of the relay');
  p.starsCaught = 3; assert.equal(compactGameState(state).players[0].starsCaught, 3);
});
