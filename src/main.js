import { createGame, reconcilePlayers, applyAction, advance, getStats, getBalance, getTeamStats, getRoundTarget, migrateState, validateState, GENERATORS, SKILLS, generatorCost, skillCost, prestigeGain } from './game.js';
import { createActivityBridge } from './activity.js';
import { OrbitArena } from './arena.js';
import { GameAudio } from './audio.js';
import { generatorIcon } from './icons.js';

const $ = (selector) => document.querySelector(selector);
const fmt = (value, digits = 0) => new Intl.NumberFormat('en', { maximumFractionDigits:digits, ...(value >= 1e6 ? {notation:'compact',maximumFractionDigits:1} : {}) }).format(value || 0);
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const soloKey = 'refract-idlers:solo:v1';
const people = (members) => members.map((person) => ({...person, id:String(person.id)}));
let soundEnabled = true;
try { soundEnabled = localStorage.getItem('refract-idlers:sound') !== 'off'; } catch { /* preferences are optional */ }
const audio = new GameAudio({enabled:soundEnabled});
const arena = new OrbitArena($('#orbit-canvas'));
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
const myPlayer = () => state.players.find((player) => player.id === selfId);

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3200);
}
function showTab(next) {
  tab = next;
  for (const button of document.querySelectorAll('[data-tab]')) {
    const active = button.dataset.tab === next;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
  for (const name of ['orbit','skills','prestige']) $(`#${name}-view`).hidden = name !== next;
  render(true);
}
function compactState() {
  // Refract sends identity/avatar metadata separately. Keep relay snapshots small.
  return {...state, players:state.players.map((player) => ({...player,avatarUrl:null}))};
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
    storage.setItem(storageKey, JSON.stringify(compactState()));
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
      arena.burst({amount:result.amount,critical:result.critical,color:myPlayer()?.color});
      audio.play(result.critical ? 'critical' : 'click');
    } else if (action.type === 'buySkill') audio.play('purchase');
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
    arena.burst({amount:getStats(myPlayer(),state).clickPower,color:myPlayer()?.color});
    audio.play('click');
  }
}

bridge = createActivityBridge({
  validateState,
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
    state = snapshot;
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
const generatorEffect = (generator) => generator.id === 'mote' ? 'Automates 0.5 core taps / sec' : generator.id === 'star' ? '+10% to all your LRC production' : `+${generator.baseRate} base LRC / sec`;
$('#generators').innerHTML = GENERATORS.map((generator) => `<div class="generator" id="generator-${generator.id}"><span class="generator-symbol" aria-hidden="true">${generatorIcon(generator.id)}</span><div><div class="generator-name">${generator.name}<small id="owned-${generator.id}">×0</small></div><div class="generator-description">${generatorEffect(generator)}</div></div><button data-buy-generator="${generator.id}" title="${generator.description}" disabled><span id="price-${generator.id}">${generator.baseCost}</span><small>LRC · BUILD</small></button></div>`).join('');
const branches = [{id:'click',name:'01 / Active light'}, {id:'idle',name:'02 / Idle orbit'}, {id:'team',name:'03 / Shared energy'}];
$('#skill-tree').innerHTML = branches.map((branch) => `<div class="skill-branch"><h3>${branch.name}</h3>${SKILLS.filter((skill) => skill.branch === branch.id).map((skill) => `<button class="skill-node" data-buy-skill="${skill.id}" disabled><span class="skill-node-icon">${skill.icon}</span><div><strong>${skill.name}</strong><span class="rank" id="rank-${skill.id}">0 / ${skill.maxRank}</span><p>${skill.description}</p><small id="skill-cost-${skill.id}">${skill.cost} SP</small></div></button>`).join('')}</div>`).join('');

function render(force = false) {
  if (!force && performance.now() - lastRender < 100) return;
  lastRender = performance.now();
  const player = myPlayer();
  const playing = state.phase === 'round';
  const shopping = state.phase === 'intermission';
  const usable = initialized && synchronized && !!player;
  const stats = player ? getStats(player,state) : {clickPower:2,idleRate:1};
  const coop = state.mode === 'coop';
  const teamStats = getTeamStats(state);
  const balance = player ? getBalance(player,state) : 0;
  const target = getRoundTarget(state);
  const progress = coop ? state.teamLrc : player?.roundLrc || 0;
  const reached = progress >= target;
  document.body.dataset.phase = state.phase;
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
  $('#output-label').textContent = coop ? 'CREW ORBIT OUTPUT' : 'YOUR ORBIT OUTPUT';
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
  $('#core-label').textContent = playing ? `+${fmt(stats.clickPower,1)} LRC PER CLICK` : shopping ? 'CLOSED FOR UPGRADES' : 'THE REFRACT CORE';
  $('#core-hint').textContent = playing ? 'CLICK THE PRISM / PRESS SPACE' : shopping ? 'The machines are taking a break.' : 'Click the prism. Collect the light.';
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
  $('#round-description').textContent = shopping ? 'Your next round starts when everyone is ready.' : playing ? coop ? 'Every click feeds the same pool.' : 'Keep the light flowing. Climb the scoreboard.' : coop ? 'One pool. Every pilot makes it brighter.' : 'Your build. Your score. Your place in the orbit.';
  $('#round-subtitle').textContent = shopping ? `${ready} / ${humans.length} pilots ready · spend or save your skill points` : playing ? `${fmt(stats.idleRate,1)} LRC / sec ${coop ? 'from your upgrades into the crew pool.' : 'from your automated orbit.'}` : '60-second rounds. A new build after every orbit.';
  $('#round-summary').hidden = !shopping;
  if (shopping && state.lastRound) {
    const result = state.lastRound.players.find((entry) => entry.id === selfId);
    $('#round-summary').textContent = `Round ${state.round} complete · ${fmt(coop ? state.lastRound.teamLrc : result?.lrc)} ${coop ? 'crew' : 'personal'} LRC earned · +${result?.skillPoints || 0} SP for you. Grow your skill tree, then return to the orbit and ready up.`;
  }
  $('#skill-phase-note').textContent = shopping ? 'The orbit is resting. Choose your upgrades, then ready up in The orbit.' : playing ? 'Your next build phase opens at the end of this round. Preview your path below.' : 'Finish your first round to earn skill points.';
  $('#save-status').textContent = !storageAvailable ? 'Storage unavailable · keep this tab open' : bridge?.mode === 'refract' ? 'Shared run · session saved' : 'Progress saved on this device';
  $('#skill-reward-note').textContent = `Each completed round grants 2 SP. Reach ${coop ? 'the shared' : 'your personal'} goal for +1 more.`;
  $('#generator-eyebrow').textContent = coop ? 'PAID FROM THE CREW POT' : 'MACHINES FOR SALE';
  $('#generator-description').textContent = coop ? 'Every machine feeds the same pot.' : 'A little less clicking. A lot more light.';
  $('#automation-note').innerHTML = coop ? 'Your machines feed the shared pool.<br><b>Personal prestige keeps the pool intact.</b>' : 'Machines work throughout each round.<br><b>They rest while you grow your skill tree.</b>';
  for (const generator of GENERATORS) {
    const owned = player?.generators[generator.id] || 0;
    const cost = player ? generatorCost(player,generator.id) : generator.baseCost;
    $(`#owned-${generator.id}`).textContent = `×${owned}`;
    $(`#price-${generator.id}`).textContent = fmt(cost);
    const button = $(`[data-buy-generator="${generator.id}"]`);
    button.disabled = !usable || state.phase === 'lobby' || balance < cost || owned >= 1000;
    button.setAttribute('aria-label', `Build ${generator.name} for ${fmt(cost)} ${coop ? 'shared ' : ''}LRC; ${owned} owned`);
  }
  for (const skill of SKILLS) {
    const rank = player?.skills[skill.id] || 0;
    const cost = player ? skillCost(player,skill.id) : skill.cost;
    const locked = skill.requires.some((id) => !player?.skills[id]);
    const button = $(`[data-buy-skill="${skill.id}"]`);
    button.disabled = !usable || !shopping || locked || player.skillPoints < cost || rank >= skill.maxRank;
    button.classList.toggle('owned',rank > 0);
    $(`#rank-${skill.id}`).textContent = `${rank} / ${skill.maxRank}`;
    $(`#skill-cost-${skill.id}`).textContent = rank >= skill.maxRank ? 'Fully evolved' : locked ? `Requires ${SKILLS.find((item) => item.id === skill.requires[0]).name}` : `${cost} SP · ${rank ? 'Upgrade' : 'Unlock'}`;
    if (skill.branch === 'team') button.querySelector('p').textContent = coop ? skill.description : skill.description.replaceAll('for every player','for you').replace('Crew bonuses stack.','Strengthens your own orbit.');
  }
  const gain = player ? prestigeGain(player) : 0;
  $('#run-lrc').textContent = fmt(player?.runLrc);
  $('#prestige-gain').textContent = `${gain} PP`;
  $('#prestige-next').textContent = `Next point at ${fmt(2500 * (gain + 1) ** 2)} LRC`;
  $('#prestige-action').disabled = !usable || !shopping || gain < 1;
  $('#prestige-condition').textContent = gain >= 1 ? shopping ? `Ready to earn +${gain} PP and +${gain*10}% permanent production.` : 'Finish this round to refract your orbit.' : 'Available between rounds once you earn 2,500 LRC.';
  $('.prestige-rules p:first-child span').textContent = coop ? 'Your personal run, generators, skills and skill points reset. The shared pool stays.' : 'Your LRC balance, generators, skills and skill points reset.';
  $('#crew-count').textContent = `${state.players.length} / 8`;
  $('#crew-mode').textContent = bridge?.mode === 'refract' ? 'Shared Refract activity' : 'Invite your people through Refract';
  $('#scoreboard-panel').hidden = coop;
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
      for (const generator of GENERATORS) if ((player.generators[generator.id] || 0) > (previousVisualPlayer.generators[generator.id] || 0)) {
        const card = $(`#generator-${generator.id}`);
        card.classList.remove('purchased'); void card.offsetWidth; card.classList.add('purchased');
        audio.play({mote:'purchase',satellite:'collect',prism:'levelup',star:'boost',nova:'surge'}[generator.id],{intensity:.55});
      }
      if (playing && player.autoClicks > previousVisualPlayer.autoClicks) audio.play('ray',{intensity:.15,pitch:-12});
    }
    previousVisualPlayer = {id:player.id,generators:{...player.generators},autoClicks:player.autoClicks || 0};
  }
}

function info(title,content) {
  $('#dialog-content').innerHTML = `<p class="eyebrow">THE FACTORY HANDBOOK</p><h2>${title}</h2>${content}`;
  if (!$('#info-dialog').open) $('#info-dialog').showModal();
}
function multiplayerInfo() {
  info('Find your people.', '<p>Launch <b>Refract Idlers</b> from a Refract call. The host chooses one mode for everyone before the first round.</p><p><b>Scoreboard:</b> build your own orbit and climb the live ranking. It only includes pilots currently in this session. Spending credits and prestiging keep your earned score.</p><p><b>Co-op:</b> every click and machine feeds one LRC pool. Everyone can spend it to build upgrades. Skills stay personal, and shared-energy skills help the crew.</p><p>Everyone readies up between rounds. If the host leaves, the next pilot takes over. Up to eight pilots play.</p><a class="primary-button" href="tools/preview.html">Open multiplayer lab ↗</a><p>For a real call, an instance admin must register your publicly hosted game URL under Manage instance → Activities.</p>');
}
$('#help').addEventListener('click', () => info('Chase a little light.', '<ol><li><b>Choose an orbit.</b> The host selects Scoreboard for personal builds and live rankings, or Co-op for one shared LRC pool.</li><li><b>Harvest.</b> Click the core, tap on touch, or press Space. Your core also generates 1 LRC per second. The final 10 seconds double click income.</li><li><b>Build.</b> Automate taps, grow refract orbs, collect light through arrays, and multiply output with refractometers. In Co-op, all production feeds the same pool.</li><li><b>Evolve.</b> Each completed 60-second round earns 2 skill points. Reach your personal goal in Scoreboard, or the crew goal in Co-op, for +1 SP. Spend points between rounds, then ready up.</li><li><b>Prestige.</b> Contribute 2,500 LRCs in your run to unlock your first permanent point. Each adds 10% to your future production. Personal prestige keeps the co-op pool intact.</li></ol><p>Solo progress saves on this device. Shared runs belong to the Refract session. Production runs during harvesting rounds while the activity is open; there are no offline earnings.</p>'));
$('#multiplayer').addEventListener('click', multiplayerInfo);
$('#crew').addEventListener('click', (event) => { if (event.target.closest('#invite-crew')) multiplayerInfo(); });
$('.dialog-close').addEventListener('click', () => $('#info-dialog').close());
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
$('#lobby-start').addEventListener('click', () => send({type:'start'}));
document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat || $('#info-dialog').open || /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(event.target.tagName) || event.target.isContentEditable || tab !== 'orbit' || $('#core').disabled) return;
  event.preventDefault(); send({type:'click'});
});
$('#generators').addEventListener('click', (event) => { const button = event.target.closest('[data-buy-generator]'); if (button && !button.disabled) send({type:'buyGenerator',id:button.dataset.buyGenerator}); });
$('#skill-tree').addEventListener('click', (event) => { const button = event.target.closest('[data-buy-skill]'); if (button && !button.disabled) send({type:'buySkill',id:button.dataset.buySkill}); });
$('#prestige-action').addEventListener('click', () => {
  const gain = prestigeGain(myPlayer());
  info('Start a brighter orbit?', `<p>You’ll receive <b>${gain} prestige points</b>, adding <b>+${gain*10}% permanent LRC production.</b></p><p class="dialog-danger">Your personal run, generators, skills and unspent skill points reset. Lifetime earnings and prestige stay.${state.mode === 'coop' ? ' The shared LRC pool and everyone else’s upgrades stay intact.' : ' Your spendable LRC balance resets; your scoreboard total stays.'} This cannot be undone.</p><button id="confirm-prestige" class="primary-button">Refract for +${gain} PP ✧</button>`);
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
