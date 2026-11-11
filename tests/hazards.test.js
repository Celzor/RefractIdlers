import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, reconcilePlayers, applyAction, advance, getStats, getOrb, getShipStatus, getTransit, getFlyer, cometWindow, generatorCost, generatorQuote, skillCost, skillAvailability, isResearchComplete, validateState, migrateState, compactGameState, SKILLS, GENERATORS, FLARE_CHANCE, COMET_SECONDS, SHIELD_LIMIT } from '../src/game.js';
import { fuelTarget } from '../src/campaign.js';

const idOf = (key) => SKILLS.find((skill) => skill.key === key).id;
function setup(mode = 'scoreboard', size = 1) {
  const state = createGame({ mode });
  for (let i = 0; i < size; i++) addPlayer(state, { id: `p${i}`, name: `Pilot ${i}` });
  assert.equal(applyAction(state, 'p0', { type: 'start' }).ok, true);
  return state;
}
/** Place a fuelled, untouched system boss in front of the pilot (or the crew). */
function setBoss(state, level = 20, p = state.players[0]) {
  const orb = { level, hp: 1 };
  if (state.mode === 'coop') state.sharedOrb = orb; else p.orb = orb;
  orb.hp = getOrb(p, state).maxHp;
  for (const member of state.players) member.highestOrb = Math.max(member.highestOrb, level);
  if (state.mode === 'coop') state.sharedFuel = fuelTarget(level); else p.fuel = fuelTarget(level);
  return orb;
}
function click(state, p = state.players[0]) { p.clickTokens = 3; const result = applyAction(state, p.id, { type: 'click' }); assert.equal(result.ok, true, result.reason); return result; }
const machines = (p) => Object.values(p.generators).reduce((a, b) => a + b, 0);

test('boss light rays only answer manual hits during an active boss attempt, and each destroys exactly one machine', () => {
  const state = setup(), p = state.players[0];
  p.generators = { mote: 10, prism: 5, wormhole: 2 };
  for (let i = 0; i < 400; i++) assert.equal(click(state).flare, null, 'Ordinary planets never fire light rays');
  const boss = setBoss(state), before = machines(p);
  let hits = 0, blocked = 0;
  for (let i = 0; i < 600 && boss.hp > 1; i++) {
    const result = click(state);
    if (result.flare?.hit) { hits++; assert.ok(GENERATORS.some((g) => g.id === result.flare.id)); assert.equal(result.flare.refund, 0, 'No salvage research, no refund'); }
    if (result.flare?.blocked) blocked++;
  }
  assert.ok(hits > 0, 'Six hundred boss clicks at a 3% ray chance produce light rays');
  assert.equal(blocked, 0, 'Without shield research nothing is blocked');
  assert.equal(machines(p), before - hits, 'Every ray that hits removes one unit');
  assert.equal(p.machinesLost, hits);
  assert.equal(validateState(state), true);
  // Automatic attacks never provoke rays, however long the fight runs.
  const lost = p.machinesLost; p.generators.mote = 20;
  const owned = machines(p); advance(state, 29); assert.equal(machines(p), owned); assert.equal(p.machinesLost, lost);
  assert.equal(FLARE_CHANCE, 0.03);
});

test('a light ray with nothing to hit passes harmlessly, and a destroyed machine type disappears from the fleet', () => {
  const state = setup(), p = state.players[0];
  setBoss(state); p.generators = {};
  for (let i = 0; i < 300; i++) { const result = click(state); if (result.flare) { assert.equal(result.flare.hit, false); assert.equal(result.flare.blocked, false); } }
  assert.deepEqual(p.generators, {}); assert.equal(p.machinesLost, 0);
  p.generators = { gate: 1 };
  let destroyed = false;
  for (let i = 0; i < 2000 && !destroyed; i++) { const result = click(state); if (result.flare?.hit) { destroyed = true; assert.equal(result.flare.id, 'gate'); assert.equal(result.flare.index, 0); } }
  assert.equal(destroyed, true); assert.deepEqual(p.generators, {}, 'The last unit of a type leaves no zero entry behind');
  assert.equal(validateState(state), true);
});

test('Prism shield charges absorb light-ray impacts, refill on every new boss attempt and at round start, and can reflect', () => {
  const state = setup(), p = state.players[0];
  p.skills[idOf('prism-shield')] = 3;
  assert.equal(getStats(p, state).shieldCapacity, 3);
  assert.equal(p.shield, 0, 'The shield only charges when an attempt or round starts');
  const boss = setBoss(state), hp = boss.hp; p.generators = { mote: 30 };
  let blocked = 0, hit = 0;
  for (let i = 0; i < 700; i++) {
    const result = click(state);
    if (i === 0) assert.equal(p.shield + (result.flare?.blocked ? 1 : 0), 3, 'The first hit of an attempt charges the shield');
    if (result.flare?.blocked) { blocked++; assert.equal(result.flare.shield, 3 - blocked); assert.ok(hit === 0, 'Nothing gets through while charges remain'); }
    if (result.flare?.hit) hit++;
  }
  assert.equal(blocked, 3, 'Three impacts are blocked per attempt'); assert.ok(hit > 0, 'Later rays get through');
  assert.equal(machines(p), 30 - hit); assert.equal(p.shield, 0);
  advance(state, 30); assert.equal(boss.hp, hp, 'The attempt timed out');
  const retry = click(state);
  assert.equal(Object.hasOwn(boss, 'bossStartedAt'), true); assert.equal(p.shield + (retry.flare?.blocked ? 1 : 0), 3, 'A fresh attempt refills the shield');
  advance(state, 60); assert.equal(state.phase, 'intermission');
  assert.equal(applyAction(state, p.id, { type: 'ready' }).ok, true); assert.equal(p.shield, 3, 'Round start refills the shield too');
  // Ablative lattice turns a blocked ray into automatic damage against the boss.
  p.skills[idOf('ablative-lattice')] = 2; const fresh = setBoss(state); p.generators = { mote: 30 };
  const stats = getStats(p, state), reflected = stats.autoDamage * stats.reflectHits;
  assert.equal(stats.reflectHits, 20);
  let seen = false;
  for (let i = 0; i < 700 && !seen; i++) {
    const beforeHp = fresh.hp, result = click(state);
    if (result.flare?.blocked) { seen = true; assert.ok(Math.abs((beforeHp - fresh.hp) - (result.damage + reflected) / 2) < 1e-6, 'A blocked ray reflects twenty automatic hits through the boss armour'); }
  }
  assert.equal(seen, true);
  assert.equal(validateState(state), true);
  assert.equal(SHIELD_LIMIT, 100);
});

test('salvage refunds a share of the replacement price, never above the run total, and shares a co-op bank', () => {
  const solo = setup(), p = solo.players[0];
  p.skills[idOf('salvage-drones')] = 4; p.generators = { nova: 3 }; p.lrc = 50; p.runLrc = 100; p.lifetimeLrc = 100;
  assert.equal(getStats(p, solo).salvagePct, 0.6);
  setBoss(solo);
  let refunded = 0;
  for (let i = 0; i < 1500 && !refunded; i++) { const result = click(solo); if (result.flare?.hit) { refunded = result.flare.refund; assert.ok(refunded > 0); assert.ok(refunded <= 100 - 50 + 1e-9, 'A personal refund is capped by unspent run earnings'); } }
  assert.ok(refunded > 0); assert.ok(p.lrc <= p.runLrc); assert.equal(validateState(solo), true);
  const crew = setup('coop', 2), a = crew.players[0];
  a.skills[idOf('salvage-drones')] = 2; a.skills[idOf('salvage-rights')] = 1; a.generators = { nova: 2 }; crew.sharedLrc = 0;
  assert.equal(getStats(a, crew).salvagePct, 0.4);
  setBoss(crew);
  let pooled = 0;
  for (let i = 0; i < 1500 && !pooled; i++) { const result = click(crew, a); if (result.flare?.hit) { pooled = result.flare.refund; assert.equal(Math.round(pooled), Math.round(generatorCost(a, 'nova') * 0.4)); } }
  assert.ok(pooled > 0); assert.ok(crew.sharedLrc >= pooled - 1e-9, 'Salvage enters the shared bank'); assert.equal(validateState(crew), true);
});

test('comets are rolled per round from the host RNG, boost only manual hits for six seconds, and validate strictly', () => {
  assert.equal(COMET_SECONDS, 6);
  let withComet = null;
  for (let seed = 1; seed < 200 && !withComet; seed++) { const state = createGame({ seed }); addPlayer(state, { id: 'p0', name: 'Pilot' }); applyAction(state, 'p0', { type: 'start' }); if (state.comet) withComet = state; }
  assert.ok(withComet, 'Some rounds have comets');
  const state = withComet, p = state.players[0], at = state.comet.at;
  assert.ok(at >= 8 && at + COMET_SECONDS <= state.roundDuration - 10, 'A comet never overlaps the solar surge');
  assert.equal(cometWindow(state).active, false);
  advance(state, at); assert.equal(cometWindow(state).active, true); assert.equal(getStats(p, state).comet, true);
  const stats = getStats(p, state), result = click(state);
  assert.equal(result.comet, true); assert.equal(result.damage, stats.clickDamage * 3); assert.ok(Math.abs(result.amount - stats.clickIncome * 5) < 1e-9);
  p.skills[idOf('comet-chaser')] = 2; p.skills[idOf('comet-charts')] = 1; p.skills[idOf('aegis-of-light')] = 1;
  assert.equal(getStats(p, state).cometDamage, 6); assert.equal(getStats(p, state).cometMint, 8);
  const before = p.lrc; advance(state, COMET_SECONDS); assert.equal(cometWindow(state).active, false);
  assert.ok(Math.abs((p.lrc - before) - getStats(p, state).passiveRate * COMET_SECONDS) < 1e-9, 'Passive income ignores the comet');
  assert.equal(click(state).comet, false);
  const restored = migrateState(compactGameState(state)); assert.deepEqual(restored.comet, state.comet);
  const broken = structuredClone(state); broken.comet = { at: state.roundDuration + 1 }; assert.equal(validateState(broken), false);
  const extra = structuredClone(state); extra.comet = { at: 10, seconds: 60 }; assert.equal(validateState(extra), false);
  advance(state, state.remaining); assert.equal(state.comet, null, 'The intermission has no comet');
  const same = createGame({ seed: 7 }), again = createGame({ seed: 7 });
  for (const s of [same, again]) { addPlayer(s, { id: 'p0', name: 'Pilot' }); applyAction(s, 'p0', { type: 'start' }); }
  assert.deepEqual(same.comet, again.comet, 'Comets are deterministic for a seed');
});

test('machine discounts apply per catalogue, quotes agree with single prices, and the quartermaster covers everything', () => {
  const state = setup(), p = state.players[0];
  assert.equal(generatorCost(p, 'prism'), 800);
  p.skills[idOf('bulk-contracts')] = 5;
  assert.equal(generatorCost(p, 'prism'), Math.ceil(800 * 0.85)); assert.equal(generatorCost(p, 'wormhole'), 600); assert.equal(generatorCost(p, 'mouse'), 2400);
  p.skills[idOf('fleet-doctrine')] = 4; p.skills[idOf('flywheel-gearing')] = 5; p.skills[idOf('quartermaster')] = 5;
  assert.deepEqual(getStats(p, state).discounts, { workshop: 0.35, arsenal: 0.4, click: 0.4 });
  assert.equal(generatorCost(p, 'gate'), Math.ceil(5000000 * 0.6));
  p.lrc = p.runLrc = p.lifetimeLrc = 1e9;
  const quote = generatorQuote(p, 'prism', 10, state);
  assert.equal(quote.cost, Array.from({ length: 10 }, (_, owned) => Math.ceil(800 * 1.17 ** owned * 0.65)).reduce((a, b) => a + b, 0));
  assert.equal(applyAction(state, p.id, { type: 'buyGenerator', id: 'prism', quantity: 10 }).cost, quote.cost);
  assert.equal(validateState(state), true);
});

test('hangar research seeds a fresh run after prestige and keeps a share of Click technology', () => {
  const state = setup(), p = state.players[0];
  p.generators = { wormhole: 7, foamer: 3, flywheel: 1, nova: 4 }; p.lrc = p.runLrc = p.lifetimeLrc = 1e6;
  p.skills[idOf('launch-kit')] = 2; p.skills[idOf('standing-orders')] = 1; p.skills[idOf('hangar-lease')] = 2;
  assert.deepEqual(getStats(p, state).startingKit, { mote: 4, prism: 1, satellite: 1 }); assert.equal(getStats(p, state).clickTechRetention, 0.4);
  advance(state, 60);
  const result = applyAction(state, p.id, { type: 'prestige' });
  assert.equal(result.ok, true);
  assert.deepEqual(p.generators, { wormhole: 2, foamer: 1, mote: 4, prism: 1, satellite: 1 }, 'Forty percent of each device survives, rounded down, plus the launch kit');
  assert.deepEqual(result.machines, p.generators);
  assert.equal(p.lrc, 0); assert.equal(validateState(state), true);
  p.skills[idOf('hangar-lease')] = 5; p.generators.string = 9; fund(p);
  advance(state, 60); for (const member of state.players) member.ready = false;
  assert.equal(applyAction(state, p.id, { type: 'prestige' }).ok, true);
  assert.equal(p.generators.string, 9, 'Five ranks keep every Click tech device');
  function fund(player) { player.lrc = player.runLrc = 1e6; player.lifetimeLrc += 1e6; }
});

test('Brighter legacy raises the production earned per lifetime prestige point without touching spendable points', () => {
  const state = setup(), p = state.players[0];
  p.totalPrestige = 10; p.prestigePoints = 4;
  assert.equal(getStats(p, state).multiplier, 2);
  p.skills[idOf('brighter-legacy')] = 5;
  assert.ok(Math.abs(getStats(p, state).prestigeBonusPerPoint - 0.15) < 1e-12); assert.ok(Math.abs(getStats(p, state).multiplier - 2.5) < 1e-12);
  assert.equal(p.prestigePoints, 4);
});

test('new machines and dedicated research change the right numbers', () => {
  const state = setup(), p = state.players[0];
  p.generators = { flywheel: 300, forge: 2, sail: 1, lens: 1, dyson: 1, laser: 1, gate: 1, mouse: 1, star: 10 };
  let stats = getStats(p, state);
  assert.equal(stats.comboCap, 250, 'Flywheels extend combo capacity up to the cap'); assert.ok(Math.abs(stats.comboPower - 0.3) < 1e-12);
  assert.equal(stats.generatorMultiplier, 2);
  const base = 2 * 3200000 + 2600 + 24000 + 260000 + 10000;
  assert.ok(Math.abs(stats.passiveRate - (1 + base) * stats.multiplier) < 1e-6);
  p.skills[idOf('stellar-foundry')] = 1; p.skills[idOf('mirror-polish')] = 2; p.skills[idOf('calibrated-optics')] = 4;
  stats = getStats(p, state);
  assert.equal(stats.generatorMultiplier, 1 + 10 * 0.12);
  const tuned = 2 * 3200000 * 1.2 + 2600 * 1.4 + 24000 * 1.2 + 260000 * 1.2 + 10000;
  assert.ok(Math.abs(stats.passiveRate - (1 + tuned * (1 + machines(p) * 0.001)) * stats.multiplier) < 1e-6);
  p.skills[idOf('lazor-capacitors')] = 3; p.skills[idOf('gate-resonance')] = 2; p.skills[idOf('targeting-array')] = 5; p.skills[idOf('overclocked-mice')] = 2;
  stats = getStats(p, state);
  const profile = (id) => stats.autoProfiles.find((entry) => entry.id === id);
  assert.ok(Math.abs(profile('laser').damage - stats.autoDamage * 26 * 1.3) < 1e-6);
  assert.ok(Math.abs(profile('gate').damage - stats.autoDamage * 120 * 1.3) < 1e-6);
  assert.ok(Math.abs(profile('mouse').rate - 2 * 1.08 * 1.16) < 1e-9, 'Mice gain their own rate bonus on top of Arsenal speed');
  assert.ok(Math.abs(profile('mote').rate - 0) < 1e-12, 'No clicker, no base pulses');
  p.skills[idOf('combo-memory')] = 4; p.skills[idOf('surge-engine')] = 2;
  assert.equal(getStats(p, state).comboSeconds, 4); assert.equal(getStats(p, state).surgeDamageMultiplier, 2.5);
  p.combo = 5; p.comboAt = state.now; advance(state, 3); assert.equal(p.combo, 5, 'Combo memory keeps a combo alive past two seconds'); advance(state, 1.5); assert.equal(p.combo, 0);
  assert.equal(validateState(state), true);
});

test('a cleared jump point enters transit: nothing damages it, the flyer alone may launch, and a crash halves the tank', () => {
  for (const mode of ['scoreboard', 'coop']) {
    const state = setup(mode, 2), [a, b] = state.players;
    const boss = setBoss(state); a.generators = { mote: 50 }; a.totalPrestige = 1e6; a.skills[idOf('bossbreaker')] = 8;
    const result = click(state, a);
    assert.equal(result.kills, 1); assert.equal(result.transit, true);
    assert.deepEqual(getTransit(a, state), { pilot: a.id }); assert.equal(boss.level, 20); assert.equal(boss.hp, getOrb(a, state).maxHp);
    assert.equal(getShipStatus(a, state).flyer, a.id); assert.equal(getShipStatus(a, state).launchReady, true);
    if (mode === 'coop') { assert.equal(getShipStatus(b, state).flyer, a.id); assert.equal(b.transit, null); } else assert.equal(getTransit(b, state), null);
    const hp = boss.hp; advance(state, 20); assert.equal(boss.hp, hp, 'Automatic attacks pass through a core in transit'); assert.equal(Object.hasOwn(boss, 'bossStartedAt'), false);
    assert.equal(click(state, a).kills, 0);
    if (mode === 'coop') assert.match(applyAction(state, b.id, { type: 'completeJump', arrived: true }).reason, /Another pilot/);
    else assert.match(applyAction(state, b.id, { type: 'completeJump', arrived: true }).reason, /not waiting/);
    assert.match(applyAction(state, a.id, { type: 'completeJump', arrived: 'yes' }).reason, /Invalid/);
    const crash = applyAction(state, a.id, { type: 'completeJump', arrived: false });
    assert.equal(crash.ok, true); assert.equal(crash.fuel, 60); assert.equal(getShipStatus(a, state).grounded, true); assert.equal(getShipStatus(a, state).launchReady, false);
    assert.match(applyAction(state, a.id, { type: 'completeJump', arrived: true }).reason, /Fuel/);
    if (mode === 'coop') state.sharedFuel = 120; else a.fuel = 120;
    assert.equal(validateState(state), true);
    const restored = migrateState(compactGameState(state)); assert.deepEqual(restored, state, 'Transit survives the compact relay format');
    const arrival = applyAction(state, a.id, { type: 'completeJump', arrived: true });
    assert.equal(arrival.ok, true); assert.equal(arrival.level, 21); assert.equal(boss.level, 21); assert.equal(getTransit(a, state), null);
    assert.equal(getShipStatus(a, state).fuel, 0); assert.equal(getShipStatus(a, state).target, fuelTarget(21));
    assert.equal(a.highestOrb, 21); if (mode === 'coop') assert.equal(b.highestOrb, 21);
    assert.equal(validateState(state), true);
  }
});

test('Overflow sinks spend LRC between rounds, hang off each tree\'s last node, and never run out of ranks', () => {
  for (const mode of ['scoreboard', 'coop']) {
    const state = setup(mode), p = state.players[0], sink = idOf('endless-light');
    const node = SKILLS.find((skill) => skill.id === sink);
    assert.equal(node.currency, 'lrc'); assert.equal(node.maxRank, 1000); assert.deepEqual(node.requires, [idOf('quantum-barrage')]);
    p.highestOrb = 175; p.completedRounds = 720; p.prestigeCount = 3; p.totalPrestige = 10; p.skills[idOf('quantum-barrage')] = 1;
    advance(state, 60);
    assert.equal(isResearchComplete(p), false);
    assert.match(skillAvailability(p, sink, state).reason, /Master every node/, 'Infinite mode waits for the whole tree');
    for (const skill of SKILLS) if (skill.currency === 'skill') p.skills[skill.id] = skill.maxRank;
    assert.equal(isResearchComplete(p), true);
    assert.match(skillAvailability(p, sink, state).reason, /LRC/, 'The sink asks for LRC, not SP');
    if (mode === 'coop') state.sharedLrc = 5e6; else { p.lrc = 5e6; p.runLrc = p.lifetimeLrc = 5e6; }
    const cost = skillCost(p, sink); assert.equal(cost, 2e6);
    const before = getStats(p, state), damageResearch = SKILLS.filter((skill) => skill.currency === 'skill').reduce((sum, skill) => sum + (skill.effects.damagePct || 0) * skill.maxRank, 0);
    assert.equal(applyAction(state, p.id, { type: 'buySkill', id: sink }).ok, true);
    assert.equal(mode === 'coop' ? state.sharedLrc : p.lrc, 5e6 - cost); assert.equal(p.skillPoints, 2, 'Skill points are untouched');
    assert.ok(Math.abs(getStats(p, state).clickDamage / before.clickDamage - (1 + damageResearch + 0.01) / (1 + damageResearch)) < 1e-12, 'One rank adds one more percentage point of damage');
    assert.equal(skillCost(p, sink), Math.ceil(2e6 * 1.3), 'Each rank costs thirty percent more');
    if (mode === 'coop') state.sharedLrc = 1e5; else p.lrc = 1e5;
    assert.match(applyAction(state, p.id, { type: 'buySkill', id: sink }).reason, /LRC/, 'An unaffordable rank is refused');
    p.skills[sink] = 1000; assert.equal(validateState(state), true); assert.match(skillAvailability(p, sink, state).reason, /Fully/);
    p.skills[sink] = 1001; assert.equal(validateState(state), false);
  }
});

test('a departed co-op flyer hands the flight to the host, and fabricated transits are rejected', () => {
  const state = setup('coop', 2), [host, other] = state.players;
  const boss = setBoss(state); other.generators = { mote: 50 }; other.totalPrestige = 1e6;
  assert.equal(click(state, other).transit, true); assert.equal(getFlyer(state, state.sharedTransit), other.id);
  reconcilePlayers(state, [{ id: host.id, name: host.name }]);
  assert.equal(getFlyer(state, state.sharedTransit), host.id, 'The host flies once the pilot who cleared the gate has gone');
  assert.equal(applyAction(state, host.id, { type: 'completeJump', arrived: true }).ok, true); assert.equal(boss.level, 21);
  assert.equal(validateState(state), true);
  const solo = setup(), p = solo.players[0];
  const fake = structuredClone(solo); fake.players[0].transit = { pilot: p.id }; assert.equal(validateState(fake), false, 'Only a jump point can be in transit');
  const gate = structuredClone(solo); gate.players[0].orb = { level: 20, hp: 1 }; gate.players[0].orb.hp = getOrb(gate.players[0], gate).maxHp; gate.players[0].highestOrb = 20; gate.players[0].transit = { pilot: p.id };
  assert.equal(validateState(gate), true);
  const wrongPilot = structuredClone(gate); wrongPilot.players[0].transit = { pilot: 'someone-else' }; assert.equal(validateState(wrongPilot), false);
  const fighting = structuredClone(gate); fighting.players[0].orb.bossStartedAt = 0; assert.equal(validateState(fighting), false, 'A transit cannot coexist with an active attempt');
  const shared = structuredClone(gate); shared.sharedTransit = { pilot: p.id }; assert.equal(validateState(shared), false, 'Scoreboard has no shared transit');
  const shield = structuredClone(solo); shield.players[0].shield = SHIELD_LIMIT + 1; assert.equal(validateState(shield), false);
  const legacy = compactGameState(solo); for (const player of legacy.players) { delete player.shield; delete player.machinesLost; delete player.transit; } delete legacy.comet; delete legacy.sharedTransit;
  const migrated = migrateState(legacy); assert.ok(migrated); assert.equal(migrated.players[0].shield, 0); assert.equal(migrated.players[0].transit, null); assert.equal(migrated.comet, null); assert.equal(migrated.sharedTransit, null);
});
