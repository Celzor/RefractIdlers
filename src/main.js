import { createGame, reconcilePlayers, applyAction, advance, getStats, getBalance, getTeamStats, getRoundTarget, getRoundDuration, getOrb, getShipStatus, migrateState, compactGameState, GENERATORS, generatorQuote, generatorAvailability, prestigeGain, prestigeNextThreshold } from './game.js';
import { createActivityBridge } from './activity.js';
import { OrbitArena } from './arena.js';
import { GameAudio } from './audio.js';
import { generatorIcon, orbIcon, orbAppearanceKey } from './icons.js';
import { initializeResearch, renderResearch } from './research.js';
import { BeamCompanion } from './beam.js';
import { FarmView } from './farm-view.js';
import { getFarmUnlocked } from './farm.js';
import { GalaxyView } from './galaxy-view.js';
import { FinaleScene } from './finale.js';
import { getCampaignLocation, VICTORY_PRESTIGE_REWARD, SECRET_DURATION } from './campaign.js';

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
const farmView = new FarmView($('#farm-view'), {send, onEvent: (type) => { if (type === 'autoHarvest') audio.play('collect',{intensity:.35}); }, onResearch: () => {
  showTab('skills');
  $('[data-research-branch="farm"]')?.click();
}});
const galaxyView = new GalaxyView($('#galaxy-view'), {onOrbit:()=>showTab('orbit'),onReplay:async()=>{await audio.unlock();playVictory(true);},onNewJourney:()=>send({type:'newJourney'}),onSecretChallenge:()=>{send({type:'startSecretChallenge'});showTab('orbit');},onLeaveSecret:()=>send({type:'leaveSecretChallenge'})});
const finale = new FinaleScene($('#finale-root'), {audio,onContinue:()=>{syncSoundButton();showTab('galaxy');}});
let seenVictory = '';
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
  for (const name of ['orbit','farm','galaxy','skills','prestige']) $(`#${name}-view`).hidden = name !== next;
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
function playVictory(replayed=false) {
  if (!state.victory) return;
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  finale.start({winner:state.players.find(p=>p.id===state.victory.playerId)?.name || 'The crew',reward:myPlayer()?.victories>0 ? VICTORY_PRESTIGE_REWARD : 0,rewardLabel:'prestige points',replayed});
}
function checkVictory() {
  if (state.phase !== 'victory') { if (finale.active) finale.stop(); seenVictory=''; return; }
  const key = `${state.victory?.at}:${state.victory?.playerId}`;
  if (key !== seenVictory) { seenVictory=key; playVictory(); }
}
function onStateChange() {
  checkVictory();
  if (lastPhase !== state.phase) {
    dirty = true;
    if (state.phase === 'intermission') {
      audio.play('roundend');
      toast(`Round ${state.round} complete.`);
      showTab('skills');
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
  if (state.phase === 'victory') onStateChange();
  if (String(fromId) === selfId) {
    if (action.type === 'click' && state.phase !== 'victory') {
      arena.burst({...result,color:myPlayer()?.color});
      audio.play(result.critical ? 'critical' : 'hit');
    } else if (action.type === 'buySkill') audio.play('purchase');
    else if (['buyFarmPlot','buyFarmUpgrade','unlockCrop','plantCrop'].includes(action.type)) audio.play('purchase');
    else if (action.type === 'waterCrop') audio.play('water');
    else if (action.type === 'fertiliseCrop') audio.play('sprinkle');
    else if (action.type === 'harvestCrop') audio.play('collect');
    else if (action.type === 'feedBeam') { audio.play('boost'); if(action.crop==='weed')toast('Beam is cooked! 4.20× earned scores for 4m 20s.'); }
    else if (action.type === 'prestige') { audio.play('levelup'); toast(`Fresh start. +${result.amount} permanent prestige points.`); }
    else if (action.type === 'resetProgress') { audio.play('start'); toast('Your pilot starts fresh. The session carries on.'); }
  }
  onStateChange();
  // Click streams are batched to two snapshots per second. Structural changes
  // are published immediately so the crew sees round and build changes together.
  if (action.type !== 'click' || state.phase === 'victory') { publish(); save(); }
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
  const won = state.phase === 'victory';
  if (initialized && synchronized) checkVictory();
  if (tab === 'galaxy') {
    galaxyView.render(player,state,usable);
    const next = $('[data-new-journey]');
    if(next) { next.disabled=!usable || !bridge.isHost; next.title=bridge.isHost ? 'Keep your build and begin the route again.' : 'Your host starts the next journey.'; }
  }
  const farmUnlocked = getFarmUnlocked(player);
  const companionMount = $(tab === 'farm' ? '#farm-shop-companion' : '#orbit-shop-companion');
  if (beam.root.parentElement !== companionMount) companionMount.append(beam.root);
  $('[data-tab="farm"]').hidden = !farmUnlocked;
  if (tab === 'farm' && !farmUnlocked) { showTab('orbit'); return; }
  if (tab === 'farm') farmView.render(player,state,usable && !won);
  const stats = player ? getStats(player,state) : {clickPower:2,clickDamage:2,clickIncome:0,idleRate:1,autoDps:0};
  const observedPlayer = player || state.players[0];
  const orb = observedPlayer ? getOrb(observedPlayer,state) : {level:1,hp:2000,maxHp:2000,reward:300,boss:false,fractureStage:0,crewSize:1,crewScale:1};
  const location = getCampaignLocation(orb.level);
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
  if(player?.farm?.cookedSeconds>0){const seconds=Math.ceil(player.farm.cookedSeconds);$('#lrc-description').textContent=`4.20× your earnings · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
  $('#output-label').textContent = coop ? 'CREW STEADY LRC' : 'STEADY LRC OUTPUT';
  $('#idle-rate').parentElement.title = 'Continuous machine income and automatic minting. Orb drops and manual clicks are extra.';
  $('#lrc').textContent = fmt(balance);
  $('#idle-rate').textContent = fmt(coop ? teamStats.idleRate : stats.idleRate,1);
  $('#click-power').textContent = fmt(stats.clickPower,1);
  $('#prestige-points').textContent = fmt(player?.prestigePoints);
  $('#prestige-bonus').textContent = player?.totalPrestige ? `+${fmt(player.totalPrestige * 10)}% permanent production` : '+0% permanent production';
  $('#sp-badge').textContent = fmt(player?.skillPoints);
  $('#skill-points').textContent = fmt(player?.skillPoints);
  $('#timer').textContent = shopping || won ? '—' : String(Math.ceil(state.remaining)).padStart(2,'0');
  $('#round-label').textContent = won ? 'JOURNEY COMPLETE' : !initialized ? 'CONNECTING TO THE ORBIT' : !synchronized ? 'SYNCING WITH THE CREW' : state.phase === 'lobby' ? 'READY TO START' : shopping ? `ROUND ${String(state.round).padStart(2,'0')} / BUILD PHASE` : `ROUND ${String(state.round).padStart(2,'0')} / HARVESTING`;
  $('#core').disabled = !usable || !playing;
  $('#core-label').textContent = playing ? `${fmt(stats.clickDamage,1)} BASE DAMAGE / HIT` : shopping ? 'CLOSED FOR UPGRADES' : 'THE REFRACT ORB';
  $('#core-hint').textContent = playing ? 'CLICK / SPACE' : '';
  $('#orb-name').textContent = orb.secret ? 'HAZE / THE GREEN STAR' : orb.final ? 'REFRACT / THE LAST LIGHT' : `${location.planetName.toUpperCase()} / ${String(orb.level).padStart(3,'0')}${orb.systemBoss?' · BOSS':''}`;
  $('#orb-reward').textContent = orb.secret ? 'Reward: weed unlocked in your farm' : orb.final ? '+100 permanent prestige points for each pilot' : `${orb.boss ? '50% armour · ' : ''}${fmt(orb.reward)} LRC drop`;
  // Beam's meals fuel the ship. Jump-point cores stay out of reach until the tank is full.
  const ship = player && !orb.secret ? getShipStatus(player,state) : null;
  if (ship?.grounded) {
    $('#orb-reward').textContent = `Ship fuel ${fmt(Math.floor(ship.fuel))} / ${fmt(ship.target)} · jump point`;
    if (playing) $('#core-hint').textContent = getFarmUnlocked(player) ? 'OUT OF FUEL · FEED BEAM IN THE FARM' : 'OUT OF FUEL · BUY AN ORB FARM TO GROW BEAM’S LUNCH';
  }
  $('#core').classList.toggle('grounded',Boolean(ship?.grounded));
  $('#shell-condition').textContent = ['SHELL INTACT','FIRST FRACTURE','SHELL SPLITTING','CORE EXPOSED'][orb.fractureStage || 0];
  $('#core-difficulty').textContent = orb.secret ? 'Secret planet · personal challenge' : orb.final ? `Crystal lattice: ${Math.ceil(orb.finalRemaining/60)} active min remaining` : `System ${location.index+1} / 10 \u00b7 ${location.system.name}${coop ? ` \u00b7 ${orb.crewSize} crew` : ''}`;
  $('#boss-check').hidden=!(orb.systemBoss||orb.secret);
  $('#boss-title').textContent=orb.secret?'HAZE · DPS CHECK':'SYSTEM BOSS';
  $('#boss-timer').textContent=`${Math.max(0,orb.bossRemaining||0).toFixed(1)}s${shopping?' · PAUSED':!orb.bossActive?' · READY':''}`;
  $('#boss-required').textContent=`Required ${fmt(orb.requiredDps,1)} DPS · Auto ${fmt(orb.bossDps,1)} DPS`;
  $('#boss-check').dataset.ready=String((orb.bossDps||0)>=(orb.requiredDps||1));
  $('#leave-secret').hidden=!orb.secret;
  $('#core').dataset.fracture = String(orb.fractureStage || 0);
  const healthPercent = Math.max(0,Math.min(100,orb.hp / orb.maxHp * 100));
  $('#orb-health-fill').style.width = `${healthPercent}%`;
  $('#orb-health').setAttribute('aria-valuenow',String(Math.round(healthPercent)));
  $('#orb-health').setAttribute('aria-valuetext',`${fmt(orb.hp,1)} of ${fmt(orb.maxHp,1)} health`);
  $('#orb-health-text').textContent = `${fmt(orb.hp,1)} / ${fmt(orb.maxHp,1)} HP`;
  $('.orb-meter').classList.toggle('boss',orb.boss);
  $('#core').classList.toggle('boss',orb.boss);
  $('#core').setAttribute('aria-label',`Damage ${orb.secret?'Haze':`${orb.boss ? 'boss' : 'orb'} ${orb.level}`}. ${fmt(orb.hp)} health remaining.`);
  $('#auto-damage').textContent = fmt(orb.bossDps??stats.autoDps,1);
  $('#auto-damage').parentElement.title = orb.systemBoss ? 'Automatic damage to this boss after armour. Manual hits also count.' : coop&&!orb.secret ? 'Automatic damage from pilots attacking the shared core.' : 'Automatic damage from your machines.';
  $('#click-income').textContent = fmt(stats.clickIncome,2);
  $('#orbs-broken').textContent = fmt(player?.orbsDestroyed);
  const imageKey = orb.final ? 'final-refract' : `${orb.secret?'secret:':''}${orbAppearanceKey(orb)}`;
  if (imageKey !== orbImageKey) { $('#core img').src = orb.final ? 'assets/refract-icon.png' : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(orbIcon(orb))}`; $('#core img').alt = orb.secret ? 'Haze' : orb.final ? 'Refract, the final crystal core' : location.planetName; orbImageKey = imageKey; }
  $('#core').classList.toggle('final-core',!!orb.final);
  if(orb.final) { if(!ship?.grounded)$('#core-hint').textContent=won ? 'Welcome home, Beam. Now crush it up.' : 'HITS CREATE RESONANCE. THE LATTICE OPENS OVER 3 ACTIVE HOURS.'; $('#core').title='The hardest substance in every parallel universe. Damage becomes crystal resonance; upgrades cannot bypass its three-hour active stabilisation.'; } else $('#core').title='';
  if (previousOrb && !orb.secret && !previousOrb.secret && previousOrb.mode === state.mode && orb.level > previousOrb.level && playing) {
    audio.orbBreak(orb.level-previousOrb.level,Math.floor((orb.level-1)/20) > Math.floor((previousOrb.level-1)/20));
    $('#core').classList.remove('orb-shattered'); void $('#core').offsetWidth; $('#core').classList.add('orb-shattered');
  }
  previousOrb = {level:orb.level,mode:state.mode,secret:orb.secret};
  $('#surge-label').hidden = !stats.surge;
  $('#goal-label').textContent = coop ? '◎ SHARED ROUND GOAL' : '◎ YOUR ROUND GOAL';
  $('#team-lrc').textContent = fmt(progress);
  $('#team-target').textContent = fmt(target);
  $('#goal-progress').style.width = `${Math.min(100,progress / target * 100)}%`;
  $('#goal-reward').textContent = reached ? '✓ Bonus skill point unlocked' : coop ? '+1 bonus skill point for everyone' : '+1 bonus skill point for you';
  const humans = state.players.filter((member) => !member.bot);
  const ready = humans.filter((member) => member.ready).length;
  const action = $('#round-action');
  $('#round-overlay').hidden = playing;
  action.disabled = !usable || won || playing || (!shopping && !bridge.isHost);
  action.textContent = won ? 'Galaxy complete' : !synchronized ? 'Syncing…' : !player ? 'Spectating' : playing ? 'Orbit in progress' : shopping ? (player.ready ? `Unready · ${ready}/${humans.length}` : humans.length > 1 ? 'Ready for next round ↗' : 'Start round ↗') : bridge.isHost ? 'Start round ↗' : 'Waiting for host';
  action.title = shopping ? `${ready} / ${humans.length} pilots ready · next round ${getRoundDuration(state)} sec` : '';
  $('#research-ready').disabled = action.disabled;
  $('#research-ready').textContent = action.textContent;
  $('#round-summary').hidden = !shopping;
  if (shopping && state.lastRound) {
    const result = state.lastRound.players.find((entry) => entry.id === selfId);
    $('#round-summary').textContent = `Round ${state.round} complete · ${fmt(coop ? state.lastRound.teamLrc : result?.lrc)} ${coop ? 'crew' : 'personal'} LRC earned · +${result?.skillPoints || 0} SP for you. Grow your skill tree, then return to the orbit and ready up.`;
  }
  $('#skill-phase-note').textContent = shopping ? 'Research is available between rounds.' : playing ? 'Your next build phase opens at the end of this round. Preview your path below.' : 'Finish your first round to earn skill points.';
  $('#save-status').textContent = !storageAvailable ? 'Storage unavailable · keep this tab open' : bridge?.mode === 'refract' ? 'Shared run · session saved' : 'Progress saved on this device';
  $('#save-status').title = $('#save-status').textContent;
  const roundResult = state.lastRound?.players.find((entry) => entry.id === selfId);
  $('#skill-reward-note').textContent = shopping ? `Round ${state.round} filed · +${roundResult?.skillPoints || 0} SP · ${fmt(coop ? state.lastRound?.teamLrc : roundResult?.lrc)} ${coop ? 'crew ' : ''}LRC.` : '2 SP per round; goals and research add more.';
  $('.generator-panel').dataset.catalog = shopCatalog;
  $('#shop-title').textContent = shopCatalog === 'click' ? 'Click technology' : shopCatalog === 'arsenal' ? 'Arsenal' : 'Workshop';
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
    button.disabled = !usable || won || !availability.unlocked || state.phase === 'lobby' || !quote.quantity || balance < cost || owned >= 1000;
    button.title = availability.unlocked ? generator.description : `${generator.name}: ${availability.reason}`;
    button.setAttribute('aria-label', availability.unlocked ? `Buy ${quote.quantity} ${generator.name} for ${fmt(cost)} ${coop ? 'shared ' : ''}LRC; ${owned} owned` : `${generator.name} locked. ${availability.reason}`);
  }
  $('#arsenal-unlocks').textContent = `${arsenalUnlocked} / 4`;
  if (['skills','prestige'].includes(tab)) renderResearch(player,state,usable && !won);
  const gain = player ? prestigeGain(player) : 0;
  $('#run-lrc').textContent = fmt(player?.runLrc);
  $('#prestige-gain').textContent = `${fmt(gain)} PP`;
  $('#prestige-next').textContent = `Next point at ${fmt(player ? prestigeNextThreshold(player) : 2500)} LRC`;
  $('#prestige-action').disabled = !usable || !shopping || gain < 1;
  $('#prestige-condition').textContent = gain >= 1 ? shopping ? `Ready to earn +${fmt(gain)} PP and +${fmt(gain*10)}% permanent production.` : 'Finish this round to refract your orbit.' : player?.totalPrestige >= Number.MAX_SAFE_INTEGER ? 'Maximum lifetime prestige reached. Keep building your research.' : 'Available between rounds once you earn 2,500 LRC.';
  $('.prestige-rules p:first-child span').textContent = coop ? 'Machines, garden equipment, crops and meals reset. The shared orb and pool stay.' : 'Wallet, machines, orb, garden equipment, crops and meals reset.';
  const localRun = bridge?.mode === 'solo';
  $('#reset-progress').textContent = localRun ? 'Reset all progress' : 'Reset my pilot';
  $('#reset-description').textContent = localRun ? 'Erase this saved game and all scores.' : 'Erase your pilot’s progress and scores.';
  $('#reset-progress').disabled = localRun ? !initialized : !usable || won;
  if ($('#confirm-reset')) $('#confirm-reset').disabled = $('#reset-progress').disabled || !$('#reset-acknowledge').checked;
  $('#crew-count').textContent = `${state.players.length} / 8`;
  $('#crew-mode').textContent = bridge?.mode === 'refract' ? 'Shared Refract activity' : 'Invite your people through Refract';
  $('#scoreboard-panel').hidden = coop;
  $('#scoreboard-toggle').textContent = coop ? 'Crew' : 'Scoreboard';
  $('#scoreboard-dialog').setAttribute('aria-label',coop ? 'Co-op crew and shared production' : 'Scoreboard');
  $('.session-desk').hidden = !coop;
  $('#coop-panel').hidden = !coop;
  $('#crew-panel').hidden = !coop;
  $('#coop-contribution').textContent = fmt(player?.roundLrc);
  $('#coop-own-rate').textContent = `${fmt(stats.idleRate,1)} / sec`;
  $('#coop-team-rate').textContent = `${fmt(teamStats.idleRate,1)} / sec`;
  const ranking = [...state.players].sort((a,b) => b.lifetimeLrc-a.lifetimeLrc || a.name.localeCompare(b.name));
  const scores = ranking.map((member,index) => `<div class="scoreboard-row ${member.id === selfId ? 'is-you' : ''}" role="row" data-player-id="${escape(member.id)}"><span class="score-rank" role="cell">${String(index+1).padStart(2,'0')}</span><div class="score-pilot" role="cell"><span class="avatar" style="background:${member.color}20;color:${member.color}">${escape(member.name.slice(0,2).toUpperCase())}</span><div><strong>${escape(member.name)}</strong><small>${member.id === selfId ? 'YOU · ' : ''}${member.ready ? 'READY FOR NEXT ROUND' : member.id === state.players[0]?.id ? 'HOST' : 'IN THIS SESSION'}</small></div></div><strong class="score-total" role="cell">${fmt(member.lifetimeLrc)}</strong><span class="score-rate" role="cell">${fmt(getStats(member,state).idleRate,1)}</span></div>`).join('');
  if (scores !== scoreboardMarkup) { $('#scoreboard-list').innerHTML = scores; scoreboardMarkup = scores; }
  const markup = state.players.map((member,index) => `<div class="crew-member"><div class="avatar" style="background:${member.color}20;color:${member.color}">${member.avatarUrl ? `<img src="${escape(member.avatarUrl)}" alt="" referrerpolicy="no-referrer">` : escape(member.name.slice(0,2).toUpperCase())}</div><div><div class="crew-name">${escape(member.name)}<small>${member.id === selfId ? 'YOU' : member.bot ? 'BOT' : index === 0 ? 'HOST' : ''}</small></div><p>${fmt(member.roundLrc)} LRC this round</p></div><span title="${member.ready ? 'Ready' : 'In orbit'}">${member.ready ? '✓' : '·'}</span></div>`).join('') + (state.players.length < 4 ? `<button class="crew-member empty-crew" id="invite-crew"><span>+</span> Invite players</button>` : '');
  if (markup !== crewMarkup) {
    const inviteFocused = document.activeElement?.id === 'invite-crew';
    $('#crew').innerHTML = markup; crewMarkup = markup;
    if (inviteFocused) $('#invite-crew')?.focus({preventScroll:true});
  }
  if (player) {
    if (previousVisualPlayer?.id === player.id) {
      if (getFarmUnlocked(player) && !previousVisualPlayer.farmUnlocked) toast('Farm unlocked! Open the Farm tab to grow Beam’s lunch.');
      if(player.farm?.crops?.weed&&!previousVisualPlayer.weedUnlocked){toast('Secret boss defeated! Weed is now unlocked in your farm.');audio.play('levelup');}
      else if(previousVisualPlayer.secretStart!==null&&!player.secretOrb&&state.now-previousVisualPlayer.secretStart>=SECRET_DURATION-1e-8&&!player.farm?.crops?.weed)toast('Haze survived. Improve your DPS and retry from the green star.');
      for (const generator of GENERATORS) if ((player.generators[generator.id] || 0) > (previousVisualPlayer.generators[generator.id] || 0)) {
        const card = $(`#generator-${generator.id}`);
        card.classList.remove('purchased'); void card.offsetWidth; card.classList.add('purchased');
        audio.play({mote:'purchase',satellite:'collect',prism:'levelup',star:'boost',wormhole:'boost',foamer:'collect',string:'levelup',nova:'surge',mouse:'mouse',laser:'laser',probe:'probe',gate:'gate'}[generator.id],{intensity:.55});
      }
    }
    previousVisualPlayer = {id:player.id,generators:{...player.generators},autoClicks:player.autoClicks || 0,farmUnlocked:getFarmUnlocked(player),weedUnlocked:Boolean(player.farm?.crops?.weed),secretStart:player.secretOrb?.startedAt??null};
  }
  beam.render(state,selfId);
}

function info(title,content) {
  $('#dialog-content').innerHTML = `<h2>${title}</h2>${content}`;
  if (!$('#info-dialog').open) $('#info-dialog').showModal();
  $('#info-dialog').scrollTop = 0;
}
function multiplayerInfo() {
  info('Multiplayer', '<p>Launch <b>Refract Idlers</b> from a Refract call. The host chooses one mode for everyone before the first round.</p><p><b>Scoreboard:</b> break your own increasingly tough orbs and climb the live ranking. It only includes pilots currently in this session. Spending credits and prestiging keep your earned score.</p><p><b>Co-op:</b> attack one shared orb. All drops and machine income feed one LRC pool, which everyone can spend. Research stays personal; shared-energy skills strengthen the crew. Each extra active player adds 85% core health and drops. Crew changes preserve the damage already done.</p><p>Everyone readies up between rounds. If the host leaves, the next pilot takes over. Up to eight pilots play.</p><a class="primary-button" href="tools/preview.html">Open multiplayer lab ↗</a><p>For a real call, an instance admin must register your publicly hosted game URL under Manage instance → Activities.</p>');
}
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
$('#leave-secret').addEventListener('click', () => send({type:'leaveSecretChallenge'}));
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
  info('Prestige?', `<p>You’ll receive <b>${fmt(gain)} prestige points</b>, adding <b>+${fmt(gain*10)}% permanent production.</b></p><p class="dialog-danger">Your personal run and machines reset.${state.mode === 'coop' ? ' The shared orb, LRC pool and everyone else’s upgrades stay intact.' : ' Your spendable LRC balance and current orb reset.'} Garden beds, equipment, growing crops, stored vegetables and the meal boost reset. Seed unlocks, farm access, research, unspent skill points, highest orb, lifetime score and prestige stay. This reset cannot be undone.</p><button id="confirm-prestige" class="primary-button">Refract for +${fmt(gain)} PP ✧</button>`);
  $('#confirm-prestige').addEventListener('click', () => { $('#info-dialog').close(); send({type:'prestige'}); });
});
function resetProgress() {
  if ($('#reset-progress').disabled) return;
  if (bridge.mode !== 'solo') {
    // Shared runs are host-authoritative: only the acting pilot is wiped, through the engine.
    if (!bridge.isHost) toast('Asking the host to reset your pilot…');
    send({type:'resetProgress'});
    return;
  }
  // A solo reset discards the device save and starts a brand-new game in the first lobby.
  try { localStorage.removeItem(soloKey); }
  catch { toast('Could not erase the saved game. Allow browser storage and try again.'); return; }
  state = createGame();
  reconcilePlayers(state, people(bridge.participants));
  if (finale.active) finale.stop();
  lastPhase = state.phase; seenVictory = ''; previousOrb = null; previousVisualPlayer = null; orbImageKey = '';
  synchronized = true; dirty = true;
  attachAvatars();
  publish(); save();
  audio.play('start');
  showTab('orbit');
  toast('All progress, scores and records erased. Ready for a new game.');
}
function confirmResetProgress() {
  if ($('#reset-progress').disabled) return;
  const localRun = bridge.mode === 'solo';
  const scope = localRun ? 'This permanently erases <b>all progress and scoring data for this browser’s solo game</b>: current and lifetime LRCs, clicks, round results, victories, machines, research, skill points, prestige, the garden and galaxy progress. The game returns to the first lobby.'
    : `This permanently erases <b>your pilot’s progress and scoring data</b>: current and lifetime LRCs, clicks, personal round results, victories, machines, research, skill points, prestige and garden. The shared session, its round number, crew totals and everyone else’s progress carry on.${state.mode === 'coop' ? ' The shared orb and LRC pool stay.' : ''}`;
  info(localRun ? 'Reset all progress?' : 'Reset my pilot?', `<p>${scope}</p><p class="dialog-danger">This cannot be undone.</p><label class="confirm-check"><input type="checkbox" id="reset-acknowledge"> I understand my progress and scores will be gone for good.</label><div class="reset-dialog-actions"><button id="cancel-reset" class="subtle-button">Cancel</button><button id="confirm-reset" class="subtle-button danger-button" disabled>${localRun ? 'Erase everything' : 'Reset my pilot'}</button></div>`);
  $('#cancel-reset').addEventListener('click', () => $('#info-dialog').close());
  $('#reset-acknowledge').addEventListener('change', (event) => { $('#confirm-reset').disabled = $('#reset-progress').disabled || !event.target.checked; });
  $('#confirm-reset').addEventListener('click', () => { if (!$('#reset-acknowledge').checked) return; $('#info-dialog').close(); resetProgress(); });
  $('#cancel-reset').focus({preventScroll:true});
}
$('#reset-progress').addEventListener('click', confirmResetProgress);

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
function frame(now) { if (tab === 'orbit' && !finale.active && state.phase !== 'victory') arena.render(state,selfId,now); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
addEventListener('pagehide',save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
// Timers stay alive for a returning page in the browser's back-forward cache.
addEventListener('beforeunload',save);
render(true);
