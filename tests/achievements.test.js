import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, getAchievements, unlockedAchievements } from '../src/achievements.js';
import { createGame, addPlayer, applyAction, advance, SKILLS } from '../src/game.js';

function setup() { const state = createGame(); addPlayer(state, { id: 'p0', name: 'Pilot' }); return state; }
const ids = (list) => list.map((entry) => entry.id);

test('the catalogue is well formed and a new pilot has every badge locked as ???', () => {
  assert.ok(ACHIEVEMENTS.length >= 30);
  assert.equal(new Set(ids(ACHIEVEMENTS)).size, ACHIEVEMENTS.length);
  for (const entry of ACHIEVEMENTS) { assert.match(entry.id, /^[a-z0-9-]+$/); assert.ok(entry.name.length > 2 && entry.description.length > 8 && entry.icon.length >= 1); assert.equal(typeof entry.test, 'function'); }
  const state = setup(), list = getAchievements(state.players[0], state);
  assert.equal(list.length, ACHIEVEMENTS.length);
  assert.equal(list.every((entry) => entry.unlocked === false), true);
  assert.deepEqual(ids(list), ids(ACHIEVEMENTS), 'Catalogue order is preserved for the interface');
  assert.equal(getAchievements(null, state).every((entry) => !entry.unlocked), true, 'No pilot, no badges');
  assert.equal(unlockedAchievements(state.players[0], state).length, 0);
});

test('badges unlock from lifetime records: hits, orbs, rounds, earnings, research and the sky', () => {
  const state = setup(), p = state.players[0];
  assert.equal(applyAction(state, 'p0', { type: 'start' }).ok, true);
  assert.equal(applyAction(state, 'p0', { type: 'click' }).ok, true);
  assert.deepEqual(ids(unlockedAchievements(p, state)), ['first-light']);
  p.clicks = 100; p.orbsDestroyed = 25; p.lifetimeLrc = 1e6; p.runLrc = p.lrc = 1e6;
  assert.deepEqual(ids(unlockedAchievements(p, state)), ['first-light', 'hundred-hands', 'shellbreaker', 'demolition-crew', 'pocket-change', 'light-millionaire']);
  advance(state, 60);
  assert.ok(ids(unlockedAchievements(p, state)).includes('shift-complete'), 'Completing a round unlocks Shift complete');
  p.highestOrb = 101; p.orb.level = 101;
  assert.ok(ids(unlockedAchievements(p, state)).includes('gatekeeper') && ids(unlockedAchievements(p, state)).includes('halfway-home'));
  for (const skill of SKILLS.filter((entry) => entry.currency === 'skill').slice(0, 4)) p.skills[skill.id] = 8;
  assert.ok(ids(unlockedAchievements(p, state)).includes('scholar'), '32 research ranks unlock Scholar');
  p.starsCaught = 1; p.quasarsTapped = 1; p.farm.meals = 1; p.farm.unlocked = true; p.machinesLost = 1; p.autoClicks = 1000;
  for (const id of ['star-catcher', 'quasar-tapped', 'lunch-is-served', 'green-thumb', 'collateral', 'clockwork']) assert.ok(ids(unlockedAchievements(p, state)).includes(id), id);
});

test('unlocked badges survive prestige because every test reads a lifetime record', () => {
  const state = setup(), p = state.players[0];
  assert.equal(applyAction(state, 'p0', { type: 'start' }).ok, true);
  p.clicks = 1000; p.orbsDestroyed = 100; p.farm.unlocked = true; p.farm.meals = 50; p.generators = { mote: 5 };
  p.lrc = p.runLrc = p.lifetimeLrc = 5000;
  advance(state, 60);
  const before = ids(unlockedAchievements(p, state));
  assert.ok(before.includes('head-chef') && before.includes('orb-century') && before.includes('thousand-hands'));
  const prestige = applyAction(state, 'p0', { type: 'prestige' });
  assert.equal(prestige.ok, true, prestige.reason);
  const after = ids(unlockedAchievements(p, state));
  for (const id of before) assert.ok(after.includes(id), `${id} stays unlocked after prestige`);
  assert.ok(after.includes('refracted'), 'Prestiging unlocks Refracted');
  // A full personal reset is the only way back to a blank slate.
  assert.equal(applyAction(state, 'p0', { type: 'resetProgress' }).ok, true);
  assert.equal(unlockedAchievements(state.players[0], state).length, 0);
});
