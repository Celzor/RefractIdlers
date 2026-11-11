import { createGame, reconcilePlayers, applyAction, advance, getStats, getBalance, getTeamStats, getRoundTarget, getOrb, migrateState, compactGameState, GENERATORS, generatorQuote, generatorAvailability, prestigeGain, prestigeNextThreshold } from './game.js';
import { createActivityBridge } from './activity.js';
import { OrbitArena } from './arena.js';
import { GameAudio } from './audio.js';
import { generatorIcon, orbIcon, orbAppearanceKey } from './icons.js';
import { initializeResearch, renderResearch } from './research.js';
import { BeamCompanion } from './beam.js';
import { FarmView } from './farm-view.js';
import { getFarmUnlocked } from './farm.js';

const $ = (selector) => document.querySelector(selector);
const fmt = (value, digits = 0) => value >= 1e15 ? value.toExponential(2).replace('+','') : new Intl.NumberFormat('en', { maximumFractionDigits:digits, ...(value >= 1e4 ? {notation:'compact',maximumFractionDigits:1} : {}) }).format(value || 0);
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const soloKey = 'refract-idlers:solo:v1';
const people = (members) => members.map((person) => ({...person, id:String(person.id)}));
let soundEnabled = true;
try { soundEnabled = localStorage.getItem('refract-idlers:sound') !== 'off'; } catch { /* preferences are optional */ }
const audio = new GameAudio({enabled:soundEnabled});
const arena = new OrbitArena($('#orbit-canvas'));
arena.onFire = ({id,pan=0}) => audio.play({mote:'ray',mouse:'mouse',laser:'laser',probe:'probe',gate:'gate'}[id] || 'ray',{intensity:id==='laser'?.42:id==='gate'?.3:.16,pan});
const beam = new BeamCompanion($('#beam-companion'));
const farmView = new FarmView($('#farm-view'), {send, onResearch: () => {
  showTab('skills');
  $('[data-research-branch="farm"]')?.click();
}});
let state = createGame();
let selfId = 'you';
let initialized = false;
let synchronized = false;
let tab = 'orbit';
let lastPhase = 'lobby';
let storageKey = soloKey;
let storageAvailable = true;
let toastTimer;
let dirty = true;
let lastTick = performance.now();
let lastPublished = 0;
let lastSaved = 0;
let lastRender = 0;
let bridge;
let crewMarkup = '';
let scoreboardMarkup = '';
let previousVisualPlayer = null;
let previousOrb = null;
let orbImageKey = '';
let buyQuantity = '1';
let shopCatalog = 'workshop';
try { buyQuantity = ['1','10','max'].includes(localStorage.getItem('refract-idlers:buy-quantity')) ? localStorage.getItem('refract-idlers:buy-quantity') : '1'; } catch { /* preferences are optional */ }
try { const savedCatalog = localStorage.getItem('refract-idlers:shop-catalog'); shopCatalog = ['arsenal','click'].includes(savedCatalog) ? savedCatalog : 'workshop'; } catch { /* preferences are optional */ }
const myPlayer = () => state.players.find((player) => player.id === selfId);

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3200);
}
function showTab(next) {
  if (next === 'farm' && !getFarmUnlocked(myPlayer())) return;
  tab = next;
  document.body.dataset.view = next;
  for (const button of document.querySelectorAll('[data-tab]')) {
    const active = button.dataset.tab === next;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
  for (const name of ['orbit','farm','skills','prestige']) $(`#${name}-view`).hidden = name !== next;
  document.dispatchEvent(new CustomEvent('game-view-change',{detail:{view:next}}));
  render(true);
}
function compactState() {
  // Refract sends identity/avatar metadata separately. Keep relay snapshots small.
  return compactGameState(state);
}
function attachAvatars() {
  const roster = new Map(people(bridge.participants).map((person) => [person.id,person]));
  for (const player of state.players) {
    const avatar = roster.get(player.id)?.avatarUrl;
    player.avatarUrl = typeof avatar === 'string' && /^https?:\/\//.test(avatar) && avatar.length < 2048 ? avatar : null;
  }
}
function loadSaved() {
  try {
    const storage = bridge.mode === 'solo' ? localStorage : sessionStorage;
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const saved = migrateState(JSON.parse(raw));
    if (saved) return saved;
    toast('An older or damaged save could not be loaded. Starting a fresh orbit.');
  } catch { storageAvailable = false; }
  return null;
}
function save() {
  if (!initialized || !synchronized) return;
  try {
    const storage = bridge.mode === 'solo' ? localStorage : sessionStorage;
    storage.setItem(storageKey, JSON.stringify({...state, players:state.players.map(player => ({...player,avatarUrl:null}))}));
    storageAvailable = true;
  } catch { storageAvailable = false; }
}
function publish() {
  if (bridge.isHost && synchronized) { bridge.publishState(compactState()); lastPublished = performance.now(); }
  dirty = false;
}
function onStateChange() {
  if (lastPhase !== state.phase) {
    dirty = true;
    if (state.phase === 'intermission') {
      audio.play('roundend');
      showTab('skills');
      toast(`Round ${state.round} done. Workshop's open!`);
    } else if (state.phase === 'round') {
      audio.play('start');
      showTab('orbit');
    }
    lastPhase = state.phase;
    save();
  }
}
function execute(fromId, action) {
  if (!synchronized) return;
  const result = applyAction(state, String(fromId), action);
  if (!result.ok) {
    if (String(fromId) === selfId && action.type !== 'click') toast(result.reason);
    return;
  }
  dirty = true;
  if (String(fromId) === selfId) {
    if (action.type === 'click') {
      arena.burst({...result,color:myPlayer()?.color});
      audio.play(result.critical ? 'critical' : 'hit');
    } else if (action.type === 'buySkill') audio.play('purchase');
    else if (['buyFarmPlot','buyFarmUpgrade','unlockCrop','plantCrop'].includes(action.type)) audio.play('purchase');
    else if (action.type === 'harvestCrop') audio.play('collect');
    else if (action.type === 'feedBeam') audio.play('boost');
    else if (action.type === 'prestige') { audio.play('levelup'); toast(`Fresh start. +${result.amount} permanent prestige points.`); }
  }
  onStateChange();
  // Click streams are batched to two snapshots per second. Structural changes
  // are published immediately so the crew sees round and build changes together.
  if (action.type !== 'click') { publish(); save(); }
  render(true);
}
function send(action) {
  void audio.unlock();
  action = {...action,round:state.round};
  if (!bridge?.sendAction(action)) { toast('Syncing your orbit. Try again in a moment.'); return; }
  if (!bridge.isHost && action.type === 'click') {
    // Visual feedback is immediate; balances always come from the host.
    arena.burst({damage:getStats(myPlayer(),state).clickDamage,color:myPlayer()?.color});
    audio.play('hit');
  }
}

bridge = createActivityBridge({
  validateState: snapshot => Boolean(migrateState(snapshot)),
  onReady(info) {
    selfId = String(info.self.id);
    storageKey = info.mode === 'solo' ? soloKey : `refract-idlers:session:${info.sessionId}:${info.self.id}`;
    const saved = loadSaved();
    if (saved) state = saved;
    if (info.isHost) {
      reconcilePlayers(state, people(info.participants));
      synchronized = true;
    }
    lastPhase = state.phase;
    initialized = true;
    lastTick = performance.now();
    attachAvatars();
    if (info.isHost) publish();
    render(true);
  },
  onParticipants(members, info) {
    if (info.isHost) {
      reconcilePlayers(state, people(members));
      synchronized = true;
      dirty = true;
      publish();
      save();
    }
    attachAvatars();
    if (info.hostChanged) toast(info.isHost ? 'You are now guiding the shared orbit.' : 'A new host is guiding the orbit.');
    onStateChange();
    render(true);
  },
  onAction:execute,
  onState(snapshot) {
    const restored = migrateState(snapshot);
    if (!restored) return;
    state = restored;
    synchronized = true;
    attachAvatars();
    onStateChange();
    save();
    render(true);
  },
  onConnection(mode) {
    $('#connection').textContent = mode === 'refract' ? 'Refract connected' : mode === 'solo' ? 'Solo orbit' : 'Connecting to Refract';
  },
  onError(error) {
    toast(error.message);
    $('#connection').textContent = 'Connection needs attention';
    $('#connection').classList.add('status-error');
  },
});

// Create stable buttons once: live numbers can update without stealing focus.
const generatorEffect = (generator) => ({wormhole:'+4 base hit damage',foamer:'+20% hit damage',string:'+1% crit chance · +0.1× crit damage',satellite:'+6 LRC / sec · unlocks the Farm',mote:'0.5 automatic hits / sec',star:'+10% damage & LRC production',mouse:'2 auto-clicks / sec · mints LRC',laser:'20× hit damage · one shot / 5 sec',probe:'3× hit / 2 sec · +1.2K LRC / sec',gate:'100× hit / 10 sec · +10K LRC / sec'}[generator.id] || `+${generator.baseRate} base LRC / sec`);
$('#generators').innerHTML = GENERATORS.map((generator) => `<div class="generator" id="generator-${generator.id}" data-category="${generator.category}"><span class="generator-symbol" aria-hidden="true">${generatorIcon(generator.id)}</span><div><div class="generator-name">${generator.name}<small id="owned-${generator.id}">×0</small></div><div class="generator-description">${generatorEffect(generator)}</div><small class="generator-unlock" id="unlock-${generator.id}" hidden></small></div><button data-buy-generator="${generator.id}" title="${generator.description}" disabled><span id="price-${generator.id}">${generator.baseCost}</span><small id="buy-label-${generator.id}">LRC · BUY 1</small></button></div>`).join('');
initializeResearch();

function render(force = false) {
  if (!force && performance.now() - lastRender < 100) return;
  lastRender = performance.now();
  const player = myPlayer();
  const playing = state.phase === 'round';
  const shopping = state.phase === 'intermission';
  const usable = initialized && synchronized && !!player;
  const farmUnlocked = getFarmUnlocked(player);
  $('[data-tab="farm"]').hidden = !farmUnlocked;
  if (tab === 'farm' && !farmUnlocked) { showTab('orbit'); return; }
  if (tab === 'farm') farmView.render(player,state,usable);
  const stats = player ? getStats(player,state) : {clickPower:2,clickDamage:2,clickIncome:0,idleRate:1,autoDps:0};
  const observedPlayer = player || state.players[0];
  const orb = observedPlayer ? getOrb(observedPlayer,state) : {level:1,hp:2000,maxHp:2000,reward:300,boss:false,fractureStage:0,crewSize:1,crewScale:1};
  const coop = state.mode === 'coop';
  const teamStats = getTeamStats(state);
  const balance = player ? getBalance(player,state) : 0;
  const target = getRoundTarget(state);
  const progress = coop ? state.teamLrc : player?.roundLrc || 0;
  const reached = progress >= target;
  document.body.dataset.phase = state.phase;
  document.body.dataset.view = tab;
  $('#mode-picker').hidden = state.phase !== 'lobby';
  $('#mode-picker-note').textContent = !initialized ? 'Connecting to your session…' : bridge.isHost ? 'You choose for the session. The mode locks when round one begins.' : 'Your host chooses for this session. Everyone joins the same mode.';
  $('#lobby-start').disabled = !usable || !bridge.isHost || state.phase !== 'lobby';
  $('#lobby-start').textContent = !initialized ? 'Connecting…' : !bridge.isHost ? 'Waiting for host' : coop ? 'Begin co-op ↗' : 'Begin scoreboard ↗';
  for (const button of document.querySelectorAll('[data-mode]')) {
    const selected = button.dataset.mode === state.mode;
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-pressed',String(selected));
    button.disabled = !usable || !bridge.isHost || state.phase !== 'lobby';
    button.querySelector('.mode-selected').textContent = selected ? 'SELECTED' : 'SELECT';
  }
  $('#session-mode').textContent = coop ? '◎ CO-OP' : '≋ SCOREBOARD';
  $('#lrc-label').textContent = coop ? 'CREW LRC POOL' : 'YOUR LRCs';
  $('#lrc-description').textContent = coop ? 'Shared by everyone in the session' : 'Light Refraction Credits';
  $('#output-label').textContent = coop ? 'CREW STEADY LRC' : 'STEADY LRC OUTPUT';
  $('#idle-rate').parentElement.title = 'Continuous machine income and automatic minting. Orb drops and manual clicks are extra.';
  $('#lrc').textContent = fmt(balance);
  $('#idle-rate').textContent = fmt(coop ? teamStats.idleRate : stats.idleRate,1);
  $('#click-power').textContent = fmt(stats.clickPower,1);
  $('#prestige-points').textContent = fmt(player?.prestigePoints);
  $('#prestige-bonus').textContent = player?.totalPrestige ? `+${fmt(player.totalPrestige * 10)}% permanent production` : 'A new beginning awaits';
  $('#sp-badge').textContent = fmt(player?.skillPoints);
  $('#skill-points').textContent = fmt(player?.skillPoints);
  $('#timer').textContent = shopping ? '—' : String(Math.ceil(state.remaining)).padStart(2,'0');
  $('#round-label').textContent = !initialized ? 'CONNECTING TO THE ORBIT' : !synchronized ? 'SYNCING WITH THE CREW' : state.phase === 'lobby' ? 'READY TO REFRACT' : shopping ? `ROUND ${String(state.round).padStart(2,'0')} / BUILD PHASE` : `ROUND ${String(state.round).padStart(2,'0')} / HARVESTING`;
  $('#core').disabled = !usable || !playing;
  $('#core-label').textContent = playing ? `${fmt(stats.clickDamage,1)} BASE DAMAGE / HIT` : shopping ? 'CLOSED FOR UPGRADES' : 'THE REFRACT ORB';
  $('#core-hint').textContent = playing ? 'CLICK / SPACE · CHIP AWAY AT THE SHELL' : shopping ? 'Beam has called a blueprint break.' : 'Stored light. Very stubborn packaging.';
  $('#orb-name').textContent = `${orb.boss ? 'BOSS' : coop ? 'SHARED ORB' : 'REFRACT ORB'} / ${String(orb.level).padStart(3,'0')}`;
  $('#orb-reward').textContent = `${orb.boss ? '50% armour · ' : ''}${fmt(orb.reward)} LRC drop`;
  $('#shell-condition').textContent = ['SHELL INTACT','FIRST FRACTURE','SHELL SPLITTING','CORE EXPOSED'][orb.fractureStage || 0];
  $('#core-difficulty').textContent = coop ? `${orb.crewSize} crew · ${fmt(orb.crewScale,2)}× toughness & drops` : orb.level === 1 ? '100 base hits to first crack' : 'Every shell holds more light';
  $('#core').dataset.fracture = String(orb.fractureStage || 0);
  const healthPercent = Math.max(0,Math.min(100,orb.hp / orb.maxHp * 100));
  $('#orb-health-fill').style.width = `${healthPercent}%`;
  $('#orb-health').setAttribute('aria-valuenow',String(Math.round(healthPercent)));
  $('#orb-health').setAttribute('aria-valuetext',`${fmt(orb.hp,1)} of ${fmt(orb.maxHp,1)} health`);
  $('#orb-health-text').textContent = `${fmt(orb.hp,1)} / ${fmt(orb.maxHp,1)} HP`;
  $('.orb-meter').classList.toggle('boss',orb.boss);
  $('#core').classList.toggle('boss',orb.boss);
  $('#core').setAttribute('aria-label',`Damage ${orb.boss ? 'boss' : 'orb'} ${orb.level}. ${fmt(orb.hp)} health remaining.`);
  $('#auto-damage').textContent = fmt(coop ? teamStats.autoDps : stats.autoDps,1);
  $('#auto-damage').parentElement.title = coop ? 'Combined automatic damage from the whole crew.' : 'Automatic damage from your machines.';
  $('#click-income').textContent = fmt(stats.clickIncome,2);
  $('#orbs-broken').textContent = fmt(player?.orbsDestroyed);
  const imageKey = orbAppearanceKey(orb);
  if (imageKey !== orbImageKey) { $('#core img').src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(orbIcon(orb))}`; orbImageKey = imageKey; }
  if (previousOrb && previousOrb.mode === state.mode && orb.level > previousOrb.level && playing) {
    audio.orbBreak(orb.level-previousOrb.level,Math.floor((orb.level-1)/10) > Math.floor((previousOrb.level-1)/10));
    $('#core').classList.remove('orb-shattered'); void $('#core').offsetWidth; $('#core').classList.add('orb-shattered');
  }
  previousOrb = {level:orb.level,mode:state.mode};
  $('#surge-label').hidden = !stats.surge;
  $('#goal-label').textContent = coop ? '◎ SHARED ROUND GOAL' : '◎ YOUR ROUND GOAL';
  $('#team-lrc').textContent = fmt(progress);
  $('#team-target').textContent = fmt(target);
  $('#goal-progress').style.width = `${Math.min(100,progress / target * 100)}%`;
  $('#goal-reward').textContent = reached ? '✓ Bonus skill point unlocked' : coop ? '+1 bonus skill point for everyone' : '+1 bonus skill point for you';
  const humans = state.players.filter((member) => !member.bot);
  const ready = humans.filter((member) => member.ready).length;
  const action = $('#round-action');
  action.disabled = !usable || playing || (!shopping && !bridge.isHost);
  action.textContent = !synchronized ? 'Syncing…' : !player ? 'Spectating' : playing ? 'Orbit in progress' : shopping ? (player.ready ? `Unready · ${ready}/${humans.length}` : 'Ready for next round ↗') : bridge.isHost ? 'Begin round ↗' : 'Waiting for host';
  $('#research-ready').disabled = action.disabled;
  $('#research-ready').textContent = action.textContent;
  $('#round-description').textContent = shopping ? 'Your next round starts when everyone is ready.' : playing ? coop ? 'One orb. Every hit helps the crew.' : 'Break the orb. The next one is tougher.' : coop ? 'One orb. One pool. A whole crew of light.' : 'Your build. Your score. Your place in the orbit.';
  $('#round-subtitle').textContent = shopping ? `${ready} / ${humans.length} pilots ready · spend or save your skill points` : playing ? `${fmt(stats.idleRate,1)} LRC / sec ${coop ? 'from your upgrades into the crew pool.' : 'from your automated orbit.'}` : '60-second rounds. A new build after every orbit.';
  $('#round-summary').hidden = !shopping;
  if (shopping && state.lastRound) {
    const result = state.lastRound.players.find((entry) => entry.id === selfId);
    $('#round-summary').textContent = `Round ${state.round} complete · ${fmt(coop ? state.lastRound.teamLrc : result?.lrc)} ${coop ? 'crew' : 'personal'} LRC earned · +${result?.skillPoints || 0} SP for you. Grow your skill tree, then return to the orbit and ready up.`;
  }
  $('#skill-phase-note').textContent = shopping ? 'The orbit is resting. Choose your upgrades, then ready up in The orbit.' : playing ? 'Your next build phase opens at the end of this round. Preview your path below.' : 'Finish your first round to earn skill points.';
  $('#save-status').textContent = !storageAvailable ? 'Storage unavailable · keep this tab open' : bridge?.mode === 'refract' ? 'Shared run · session saved' : 'Progress saved on this device';
  $('#save-status').title = $('#save-status').textContent;
  const roundResult = state.lastRound?.players.find((entry) => entry.id === selfId);
  $('#skill-reward-note').textContent = shopping ? `Round ${state.round} filed · +${roundResult?.skillPoints || 0} SP · ${fmt(coop ? state.lastRound?.teamLrc : roundResult?.lrc)} ${coop ? 'crew ' : ''}LRC. Spend, save, then ready up.` : '2 SP per round; goals and research add more. Beam has stamped the blueprints.';
  $('#generator-eyebrow').textContent = coop ? 'PAID FROM THE CREW POT' : 'MACHINES FOR SALE';
  $('.generator-panel').dataset.catalog = shopCatalog;
  $('#shop-title').textContent = shopCatalog === 'click' ? 'Click technology' : shopCatalog === 'arsenal' ? 'The arsenal' : 'The workshop';
  $('#generator-description').textContent = shopCatalog === 'click' ? 'Bend physics. Break tougher shells.' : shopCatalog === 'arsenal' ? 'A bigger build. A much bigger beam.' : coop ? 'Every machine feeds the same pot.' : 'A little less clicking. A lot more light.';
  $('#automation-note').innerHTML = shopCatalog === 'arsenal' ? 'Every purchase joins the fleet.<br><b>Research unlocks survive prestige.</b>' : coop ? 'Your machines feed the shared pool.<br><b>Personal prestige keeps the pool intact.</b>' : 'Machines work throughout each round.<br><b>They rest while you grow your skill tree.</b>';
  for (const button of document.querySelectorAll('[data-buy-quantity]')) button.setAttribute('aria-pressed',String(button.dataset.buyQuantity === buyQuantity));
  for (const button of document.querySelectorAll('[data-shop-catalog]')) button.setAttribute('aria-pressed',String(button.dataset.shopCatalog === shopCatalog));
  let arsenalUnlocked = 0;
  for (const generator of GENERATORS) {
    const owned = player?.generators[generator.id] || 0;
    const availability = player ? generatorAvailability(player,generator.id,state) : {unlocked:generator.category !== 'arsenal',reason:'Join the orbit to view your blueprints.'};
    if (generator.category === 'arsenal' && availability.unlocked) arsenalUnlocked++;
    const card = $(`#generator-${generator.id}`);
    card.hidden = generator.category !== shopCatalog;
    card.classList.toggle('is-locked',!availability.unlocked);
    $(`#unlock-${generator.id}`).hidden = availability.unlocked;
    $(`#unlock-${generator.id}`).textContent = availability.reason;
    const quote = player ? generatorQuote(player,generator.id,buyQuantity === 'max' ? 'max' : Number(buyQuantity),state) : {quantity:1,cost:generator.baseCost};
    const cost = quote.cost;
    $(`#owned-${generator.id}`).textContent = `×${owned}`;
    $(`#price-${generator.id}`).textContent = availability.unlocked ? quote.quantity ? fmt(cost) : '—' : 'LOCKED';
    $(`#buy-label-${generator.id}`).textContent = !availability.unlocked ? 'RESEARCH' : owned >= 1000 ? 'CAPACITY' : !quote.quantity ? 'SAVE LRC' : `LRC · BUY ${quote.quantity}`;
    const button = $(`[data-buy-generator="${generator.id}"]`);
    button.disabled = !usable || !availability.unlocked || state.phase === 'lobby' || !quote.quantity || balance < cost || owned >= 1000;
    button.title = availability.unlocked ? generator.description : `${generator.name}: ${availability.reason}`;
    button.setAttribute('aria-label', availability.unlocked ? `Buy ${quote.quantity} ${generator.name} for ${fmt(cost)} ${coop ? 'shared ' : ''}LRC; ${owned} owned` : `${generator.name} locked. ${availability.reason}`);
  }
  $('#arsenal-unlocks').textContent = `${arsenalUnlocked} / 4`;
  if (['skills','prestige'].includes(tab)) renderResearch(player,state,usable);
  const gain = player ? prestigeGain(player) : 0;
  $('#run-lrc').textContent = fmt(player?.runLrc);
  $('#prestige-gain').textContent = `${fmt(gain)} PP`;
  $('#prestige-next').textContent = `Next point at ${fmt(player ? prestigeNextThreshold(player) : 2500)} LRC`;
  $('#prestige-action').disabled = !usable || !shopping || gain < 1;
  $('#prestige-condition').textContent = gain >= 1 ? shopping ? `Ready to earn +${fmt(gain)} PP and +${fmt(gain*10)}% permanent production.` : 'Finish this round to refract your orbit.' : player?.totalPrestige >= Number.MAX_SAFE_INTEGER ? 'Maximum lifetime prestige reached. Keep building your research.' : 'Available between rounds once you earn 2,500 LRC.';
  $('.prestige-rules p:first-child span').textContent = coop ? 'Machines, garden equipment, crops and meals reset. The shared orb and pool stay.' : 'Wallet, machines, orb, garden equipment, crops and meals reset.';
  $('#crew-count').textContent = `${state.players.length} / 8`;
  $('#crew-mode').textContent = bridge?.mode === 'refract' ? 'Shared Refract activity' : 'Invite your people through Refract';
  $('#scoreboard-panel').hidden = coop;
  $('#scoreboard-toggle').hidden = coop;
  if (coop && $('#scoreboard-dialog').open) $('#scoreboard-dialog').close();
  $('#coop-panel').hidden = !coop;
  $('#crew-panel').hidden = !coop;
  $('#coop-contribution').textContent = fmt(player?.roundLrc);
  $('#coop-own-rate').textContent = `${fmt(stats.idleRate,1)} / sec`;
  $('#coop-team-rate').textContent = `${fmt(teamStats.idleRate,1)} / sec`;
  const ranking = [...state.players].sort((a,b) => b.lifetimeLrc-a.lifetimeLrc || a.name.localeCompare(b.name));
  const scores = ranking.map((member,index) => `<div class="scoreboard-row ${member.id === selfId ? 'is-you' : ''}" role="row" data-player-id="${escape(member.id)}"><span class="score-rank" role="cell">${String(index+1).padStart(2,'0')}</span><div class="score-pilot" role="cell"><span class="avatar" style="background:${member.color}20;color:${member.color}">${escape(member.name.slice(0,2).toUpperCase())}</span><div><strong>${escape(member.name)}</strong><small>${member.id === selfId ? 'YOU · ' : ''}${member.ready ? 'READY FOR NEXT ROUND' : member.id === state.players[0]?.id ? 'HOST' : 'IN THIS SESSION'}</small></div></div><strong class="score-total" role="cell">${fmt(member.lifetimeLrc)}</strong><span class="score-rate" role="cell">${fmt(getStats(member,state).idleRate,1)}</span></div>`).join('');
  if (scores !== scoreboardMarkup) { $('#scoreboard-list').innerHTML = scores; scoreboardMarkup = scores; }
  const markup = state.players.map((member,index) => `<div class="crew-member"><div class="avatar" style="background:${member.color}20;color:${member.color}">${member.avatarUrl ? `<img src="${escape(member.avatarUrl)}" alt="" referrerpolicy="no-referrer">` : escape(member.name.slice(0,2).toUpperCase())}</div><div><div class="crew-name">${escape(member.name)}<small>${member.id === selfId ? 'YOU' : member.bot ? 'BOT' : index === 0 ? 'HOST' : ''}</small></div><p>${fmt(member.roundLrc)} LRC this round</p></div><span title="${member.ready ? 'Ready' : 'In orbit'}">${member.ready ? '✓' : '·'}</span></div>`).join('') + (state.players.length < 4 ? `<button class="crew-member empty-crew" id="invite-crew"><span>+</span> A little brighter together</button>` : '');
  if (markup !== crewMarkup) {
    const inviteFocused = document.activeElement?.id === 'invite-crew';
    $('#crew').innerHTML = markup; crewMarkup = markup;
    if (inviteFocused) $('#invite-crew')?.focus({preventScroll:true});
  }
  if (player) {
    if (previousVisualPlayer?.id === player.id) {
      if (getFarmUnlocked(player) && !previousVisualPlayer.farmUnlocked) toast('Farm unlocked! Open the Farm tab to grow Beam’s lunch.');
      for (const generator of GENERATORS) if ((player.generators[generator.id] || 0) > (previousVisualPlayer.generators[generator.id] || 0)) {
        const card = $(`#generator-${generator.id}`);
        card.classList.remove('purchased'); void card.offsetWidth; card.classList.add('purchased');
        audio.play({mote:'purchase',satellite:'collect',prism:'levelup',star:'boost',wormhole:'boost',foamer:'collect',string:'levelup',nova:'surge',mouse:'mouse',laser:'laser',probe:'probe',gate:'gate'}[generator.id],{intensity:.55});
      }
    }
    previousVisualPlayer = {id:player.id,generators:{...player.generators},autoClicks:player.autoClicks || 0,farmUnlocked:getFarmUnlocked(player)};
  }
  beam.render(state,selfId);
}

function info(title,content) {
  $('#dialog-content').innerHTML = `<p class="eyebrow">BEAM’S HIGHLY SCIENTIFIC HANDBOOK</p><h2>${title}</h2>${content}`;
  if (!$('#info-dialog').open) $('#info-dialog').showModal();
}
function multiplayerInfo() {
  info('Find your people.', '<p>Launch <b>Refract Idlers</b> from a Refract call. The host chooses one mode for everyone before the first round.</p><p><b>Scoreboard:</b> break your own increasingly tough orbs and climb the live ranking. It only includes pilots currently in this session. Spending credits and prestiging keep your earned score.</p><p><b>Co-op:</b> attack one shared orb. All drops and machine income feed one LRC pool, which everyone can spend. Research stays personal; shared-energy skills strengthen the crew. Each extra active player adds 85% core health and drops. Crew changes preserve the damage already done.</p><p>Everyone readies up between rounds. If the host leaves, the next pilot takes over. Up to eight pilots play.</p><a class="primary-button" href="tools/preview.html">Open multiplayer lab ↗</a><p>For a real call, an instance admin must register your publicly hosted game URL under Manage instance → Activities.</p>');
}
$('#help').addEventListener('click', () => info('Welcome to the Light Works.', '<p><b>Beam, Chief Vibe Officer, reporting for duty.</b> The orbs are stored light in very stubborn shells. Beam supervises the paperwork, the vibes, and absolutely none of the heavy lifting.</p><ol><li><b>Choose your shift.</b> Your host picks Scoreboard (personal orbs and scores) or Co-op (one shared orb and wallet). Current crew only; spending never lowers your score.</li><li><b>Crack the shell.</b> Click or press Space. The first core has 2,000 HP: 100 ordinary, unupgraded hits reach its first crack. Every tenth core is armoured. Co-op adds 85% toughness and drops per extra crew member.</li><li><b>Put light to work.</b> Clickers chip shells; farms, arrays and stars earn LRCs; refractometers multiply production. Buy ×1, ×10 or Max. Each unit joins the orbit. The Arsenal unlocks AI Mice, Lazer cannons, Starlink probes and star gates through research. Click-minting research pays you for every hit.</li><li><b>Follow the blueprints.</b> Every 60-second round earns SP. Drag the connected tree, zoom, and select a node for its requirements. Research between rounds, then ready up. Everyone must be ready.</li><li><b>Refocus.</b> Trade your own run earnings for permanent prestige points. Each earned point adds 10% production. Keep research, SP and records; rebuild your machines. The Co-op pool and core survive.</li><li><b>Grow Beam’s lunch.</b> Your first orb farm opens the Farm tab. Unlock seeds, plant beds, harvest vegetables and feed Beam for +25% income and damage. Grow lights and hydroponics speed growth; fertiliser adds yield. Growth and meals pause between rounds.</li><li><b>Say hello to Beam.</b> Poke his portrait for a greeting. His little desk reacts to discoveries, bosses and breaks. The crown is earned through enthusiasm. It has no statistical value.</li></ol><p>Solo progress saves here; shared runs belong to the Refract session. Production runs during active rounds while the game is open. No offline earnings. Beam insists breaks are breaks.</p><p class="handbook-links"><a href="CREDITS.md" target="_blank" rel="noopener">Credits &amp; source</a><span>Refract Idlers v0.4</span></p>'));
$('#multiplayer').addEventListener('click', multiplayerInfo);
$('#scoreboard-toggle').addEventListener('click', () => $('#scoreboard-dialog').showModal());
$('#scoreboard-close').addEventListener('click', () => $('#scoreboard-dialog').close());
$('#scoreboard-dialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close(); } });
$('#crew').addEventListener('click', (event) => { if (event.target.closest('#invite-crew')) multiplayerInfo(); });
$('#info-dialog .dialog-close').addEventListener('click', () => $('#info-dialog').close());
$('#info-dialog').addEventListener('click', (event) => { if (event.target === $('#info-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
function syncSoundButton() {
  $('#sound').setAttribute('aria-pressed',String(audio.enabled));
  $('#sound').setAttribute('aria-label',audio.enabled ? 'Turn sound off' : 'Turn sound on');
  $('#sound').title = audio.enabled ? 'Turn sound off' : 'Turn sound on';
  $('#sound').style.color = audio.enabled ? 'var(--mint)' : '';
}
syncSoundButton();
$('#sound').addEventListener('click', () => {
  audio.setEnabled(!audio.enabled); void audio.unlock();
  try { localStorage.setItem('refract-idlers:sound',audio.enabled ? 'on' : 'off'); } catch { /* preferences are optional */ }
  syncSoundButton();
  audio.play('click');
});
for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => showTab(button.dataset.tab));
for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => send({type:'setMode',mode:button.dataset.mode}));
for (const button of document.querySelectorAll('.back-orbit')) button.addEventListener('click', () => showTab('orbit'));
$('#core').addEventListener('click', () => send({type:'click'}));
$('#round-action').addEventListener('click', () => send({type:state.phase === 'lobby' ? 'start' : 'ready'}));
$('#research-ready').addEventListener('click', () => send({type:state.phase === 'lobby' ? 'start' : 'ready'}));
$('#lobby-start').addEventListener('click', () => send({type:'start'}));
document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat || document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(event.target.tagName) || event.target.isContentEditable || tab !== 'orbit' || $('#core').disabled) return;
  event.preventDefault(); send({type:'click'});
});
for (const button of document.querySelectorAll('[data-buy-quantity]')) button.addEventListener('click', () => {
  buyQuantity = button.dataset.buyQuantity;
  try { localStorage.setItem('refract-idlers:buy-quantity',buyQuantity); } catch { /* preferences are optional */ }
  audio.play('click',{intensity:.4}); render(true);
});
for (const button of document.querySelectorAll('[data-shop-catalog]')) button.addEventListener('click', () => {
  shopCatalog = button.dataset.shopCatalog;
  try { localStorage.setItem('refract-idlers:shop-catalog',shopCatalog); } catch { /* preferences are optional */ }
  audio.play('click',{intensity:.4}); render(true);
});
$('#generators').addEventListener('click', (event) => { const button = event.target.closest('[data-buy-generator]'); if (button && !button.disabled) send({type:'buyGenerator',id:button.dataset.buyGenerator,quantity:buyQuantity === 'max' ? 'max' : Number(buyQuantity)}); });
for (const root of ['#skill-tree','#legacy-tree']) $(root).addEventListener('click', (event) => { const button = event.target.closest('[data-buy-skill]'); if (button && !button.disabled) send({type:'buySkill',id:button.dataset.buySkill}); });
$('#prestige-action').addEventListener('click', () => {
  const gain = prestigeGain(myPlayer());
  info('Start a brighter orbit?', `<p>You’ll receive <b>${fmt(gain)} prestige points</b>, adding <b>+${fmt(gain*10)}% permanent production.</b></p><p class="dialog-danger">Your personal run and machines reset.${state.mode === 'coop' ? ' The shared orb, LRC pool and everyone else’s upgrades stay intact.' : ' Your spendable LRC balance and current orb reset.'} Garden beds, equipment, growing crops, stored vegetables and the meal boost reset. Seed unlocks, farm access, research, unspent skill points, highest orb, lifetime score and prestige stay. This reset cannot be undone.</p><button id="confirm-prestige" class="primary-button">Refract for +${fmt(gain)} PP ✧</button>`);
  $('#confirm-prestige').addEventListener('click', () => { $('#info-dialog').close(); send({type:'prestige'}); });
});

const ticker = setInterval(() => {
  const now = performance.now();
  const delta = Math.max(0,(now-lastTick)/1000); lastTick = now;
  if (initialized && synchronized && bridge.isHost) {
    advance(state,delta);
    onStateChange();
    if (now-lastPublished >= 500 && (state.phase === 'round' || dirty)) publish();
  }
  if (now-lastSaved >= 1500) { save(); lastSaved = now; }
  render();
},100);
function frame(now) { if (tab === 'orbit') arena.render(state,selfId,now); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
addEventListener('pagehide',save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
// Timers stay alive for a returning page in the browser's back-forward cache.
addEventListener('beforeunload',save);
render(true);
