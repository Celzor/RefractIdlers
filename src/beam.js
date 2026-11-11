/** A cosmetic companion. Reads snapshots; never writes to the game or sends actions. */
import { FINAL_LEVEL } from './campaign.js';
import { getShipStatus } from './game.js';
const SPRITE = new URL('../assets/beam-pixel.svg', import.meta.url).href;
const PREF_KEY = 'refract-idlers:beam-collapsed';
const sum = (record) => Object.values(record || {}).reduce((total, value) => total + value, 0);
const layer = (name, className = name) => `<g class="${className}"><use href="${SPRITE}#${name}"/></g>`;
const sprite = `<svg class="beam-sprite" viewBox="0 0 64 64" width="96" height="96" aria-hidden="true" shape-rendering="crispEdges">
  ${layer('beam-night')}${layer('beam-sun')}${layer('beam-chair')}${layer('beam-wind')}
  <g class="beam-character"><g class="beam-float">
    ${layer('beam-body')}${layer('beam-head')}
    ${layer('beam-eyes')}${layer('beam-eyes-cheer')}${layer('beam-eyes-worried')}${layer('beam-eyes-windy')}${layer('beam-eyes-blink')}${layer('beam-eyes-baked')}
    ${layer('beam-hand-left')}${layer('beam-hand-right')}${layer('beam-feet')}${layer('beam-shard')}${layer('beam-crown')}
    <g class="beam-toke-hand">${layer('beam-hand-toke')}${layer('beam-joint')}${layer('beam-ember')}</g>
    <g class="beam-smoke-wisp">${layer('beam-smoke')}</g><g class="beam-smoke-wisp beam-smoke-wisp-late">${layer('beam-smoke')}</g>${layer('beam-exhale')}
  </g></g>${layer('beam-boat')}
</svg>`;

// New game dialogue, inspired by Beam's existing Chief Vibe Officer persona.
// These lines are an Idlers adaptation, not quotations from Refract canon.
// Every entry is a pool: the first line is the classic one, the rest are
// variations. Reactions pick a fresh line each time; ambient moods rotate
// through their pool slowly so Beam muses without ever spamming.
export const LINES = {
  welcome: [
    'Hello! I’m Beam. I’ve brought a highly scientific good feeling.',
    'Hello again! I kept the good feeling warm for you.',
    'Welcome back. The photons missed you. I asked them.',
    'Oh hey. I was just floating here. Professionally.',
    'Hi! Vibe check at the door: you pass. You always pass.',
  ],
  idle: [
    'I’m supervising. Floating counts.',
    'Vibe check complete. Results: immaculate. Sample size: one.',
    'Fun fact: light has no mass. Neither do my responsibilities.',
    'I’m not idle. I’m at rest. There’s a Newton law about it.',
    'If you listen closely, the photons hum. If you listen very closely, that’s me.',
    'I could be refracting right now. Instead I am vibing. Growth.',
    'A watched core never cracks. I checked. Twice.',
    'My doctorate is in vibes. The university is also me.',
    'Think of me as morale. Small, glowing, slightly in the way.',
    'Everything is made of light if you squint hard enough.',
    'Status report: floating. Mood: shimmer. Snacks: none. Suspicious.',
    'I had a thought and it bounced off my own head. Prism life.',
    'I am a wavelength. You are a wavelength. Let’s wave.',
    'Speed of light, speed of vibes. Same thing. Peer-reviewed.',
    'The universe is 13.8 billion years old and still hasn’t clicked a core. Amateur.',
    'Reminder: hydrate. Reminder two: I’m mostly crystal and need no water. Lucky me.',
    'The LRCs are flowing. I am also flowing. Mostly sideways.',
    'Patience is a science. I have a chart. The chart is a circle.',
    'The hum of machines is just applause with extra steps.',
    'I have no bones and therefore no bad days.',
    'Be the photon you wish to see in the world.',
    'I’m conducting an experiment. The hypothesis is “nice.”',
    'Somewhere out there, another Beam is also floating. Hi, me.',
    'Idle game, active vibes. Highly scientific balance.',
    'I rated today’s light. Five stars. It was the only light available.',
    'Do crystals dream? Yes. Mostly about being slightly shinier.',
    'Breathe in the photons. Breathe out the vibes. Repeat forever.',
    'I just thought of a joke about refraction, but it bent the wrong way.',
  ],
  scoreboard: [
    'The board has numbers. I have a good feeling.',
    'Numbers go up. Science can’t explain why that feels so good. I can: vibes.',
    'Leaderboards are just horoscopes with proof.',
    'Rank is temporary. Vibes are forever.',
    'I don’t compete. I illuminate. It just tends to look like winning.',
    'Score is a vibe you can count. Count it loudly.',
  ],
  coop: [
    'Shared light. Shared LRCs. Extremely scientific teamwork.',
    'Teamwork makes the beam work.',
    'Many hands make light work. Mine are detached, but they count.',
    'Everyone clicking together. The core hates this. I love this.',
    'Group vibe check: synchronized. Scientifically adorable.',
    'Carry me. I weigh nothing. Easiest carry of your life.',
    'A crew of lights is called a constellation. I looked it up. In my heart.',
  ],
  boss: [
    'That orb looks serious. I’ve prepared my serious face.',
    'Big orb. Bigger vibes. Smallest crystal in the room, honestly.',
    'I will be hiding behind you. Scientifically. For data.',
    'It’s glaring at us. Glare back. You have more eyes than I do.',
    'This one has a health bar with a personality. Rude.',
    'Every boss orb is a regular orb with confidence. Take it away from it.',
    'My ears are flat. That is the technical term for brave.',
  ],
  surge: [
    'Hold on to your photons. Here comes the surge!',
    'Ten seconds! Click like the light depends on it! It does!',
    'SURGE! Ears back, shard spinning, go go go!',
    'Everything is faster now, including my heart. I don’t have one. Still!',
    'Final seconds! Leave nothing in the tank except the actual fuel!',
    'The wind is picking up! That’s the vibes leaving my body!',
  ],
  flare: [
    'LIGHT RAY! It ate a machine. My serious face was right all along.',
    'A light ray! It licked a machine and the machine stopped. Rude ray.',
    'FLARE! That was one of ours! Somebody write this down!',
    'I told you it looked serious. I never said I would be ready.',
    'The orb bit back. Shield up next time? That’s a request, not a command.',
  ],
  shielded: [
    'Shield held! The light ray bounced off. Very satisfying. Do it again.',
    'BONK. The ray hit the shield. Physics has never been funnier.',
    'Blocked! Not even a scratch on the vibes.',
    'Shield says no. I say yes. To the shield.',
    'Reflected! It went into space. Somebody else’s problem now.',
  ],
  comet: [
    'A comet! Quick, click before it leaves without us.',
    'COMET! A snowball with ambition. Hit the core while it’s watching!',
    'A comet! I waved. It did not wave back. Click anyway.',
    'Comet pass-by! Extremely fast, extremely sparkly, extremely bonus.',
    'Make a wish! Then click. The wish is the click.',
  ],
  launch: [
    'Jump time! Dodge the rocks: WASD or arrows. Three hits and we limp home.',
    'Launching! Keep the ship pointy-side forward. I checked, that’s the front.',
    'Rocks ahead! Dodge them. I’m not insured.',
    'We’re flying! WASD or arrows. Three hits and the fuel goes out the airlock.',
    'Engines on. Vibes on. Seatbelt… we have no seatbelt. Dodge well.',
  ],
  crash: [
    'We bounced off three meteorites. Half the tank is gone and so is my dignity. Feed me.',
    'Three rocks. Zero style points. Half the fuel. Vegetables, please.',
    'We came back early. The meteorites started it. Snack me up and we go again.',
    'Ouch, ouch, ouch. Three for three. My shard is spinning the wrong way.',
    'Turns out space is mostly empty, except exactly where we were flying.',
  ],
  roundend: [
    'Round complete. Time to grow a brighter idea.',
    'Round done! Stretch your fingers. I’ll stretch my… hovering.',
    'Lights down, ideas up. Research time.',
    'That round had excellent vibes. Ten out of ten. The scale is vibes.',
    'Intermission! Even photons take breaks. They just take them very fast.',
    'Build phase! Buy something shiny. For science. For me.',
  ],
  restday: [
    'A little boat break. Big ideas need a small breather.',
    'Boat time. The water is imaginary. The relaxation is extremely real.',
    'I row with my mind. Mostly in circles. Nice circles.',
    'Sun on the hull, hands on the rim. This is science at rest.',
    'Gently floating in a boat, on a page, in a game. Layers of calm.',
    'If the boat tips, I float anyway. Best passenger ever.',
  ],
  restnight: [
    'Ideas first. Armchair second. Actually, armchair first.',
    'Night shift. The armchair and I are conducting a sit.',
    'The stars are out. I’m in. Perfect arrangement.',
    'Comfy chair, big thoughts. Mostly about snacks.',
    'Late-night research tastes better. That’s a vibe, not a fact. Both.',
    'Dangling my feet. They dangle beautifully. Thank you for noticing.',
  ],
  skill: [
    'A new idea! Peer-reviewed by me. Just me.',
    'Research complete! The method was vibes. The result is excellent.',
    'Knowledge acquired. I now know one more thing. It fits perfectly.',
    'A brighter idea! I had a chart ready for this. The chart is a smile.',
    'Peer review results: “wow.” The peer was me.',
    'Science! Lightly supervised! Fully celebrated!',
  ],
  prestige: [
    'New orbit. Same Beam. Extremely fancy little crown.',
    'PRESTIGE! Crown on. Standards up. Height unchanged.',
    'We reset everything and kept the vibes. Perfect loot.',
    'A new orbit! Bow to the crown. Briefly. It’s very small.',
    'Starting over with a crown is just starting over, fancier.',
  ],
  poke: [
    'Highly scientific finding: that tickles.',
    'Hello! Yes! I’m here! Still floating!',
    'Boop received. Boop logged. Boop appreciated.',
    'You poked a crystal. The crystal says hi.',
    'Was that a vibe check? I passed, right?',
    'Again! Again! Okay, once more, then back to science.',
    'My shard spun faster. That’s how you know it worked.',
    'That’s my face. Poke the core instead. Kidding. Both is fine.',
    'I felt that in my ears. Both of the uneven ones.',
    'Poke registered at the speed of light. Response speed: vibes.',
    'Warning: continued petting may result in a happier Beam.',
    'I squeaked! Did you hear it? Scientifically, no. Spiritually, yes.',
    'Ooh. Do that to the core and we’d be home by now.',
    'Oh! Hi. I was mid-thought. The thought was “snack.”',
    'Friendly contact detected. Deploying smile.',
    'Poke me a hundred times and I’ll still have zero bones. Checkmate.',
  ],
  meal: [
    'Fresh vegetables! Converting lunch into extremely productive vibes.',
    'Munch munch munch. Science munching.',
    'A vegetable has entered the Beam. The Beam approves.',
    'Vegetables! My favorite form of light.',
    'Lunch! Everything I eat becomes extra glow. Highly efficient.',
    'Nom. That one had a PhD in crunch.',
  ],
  fed: [
    'Garden-powered Beam. The science is delicious.',
    'Full of vegetables. Full of light. Those are the same thing to me.',
    'Running on lunch. Extra sparkle, give or take a leaf.',
    'This is what a well-fed vibe looks like. Study it.',
    'My core is warm. It’s either the carrots or the love.',
    'Fuelled by salad. Fear me.',
  ],
  cooked: [
    'Cooked. Score ×4.20.',
    'Whoa. The photons are… wavy. Were they always wavy?',
    'I have discovered that “orb” is a funny word. Orb. Orrrb.',
    'Everything is ×4.20 right now, including how long this sentence feels.',
    'Hey. Hey. What if the core is clicking us.',
    'I can hear colors. They sound like the LRCs going brrr.',
    'Deep thought: a prism is just a crystal that commits.',
    'Snack idea: light. Second snack idea: more light.',
  ],
  // The journey: Beam's lunch is rocket fuel, home is Crystal, and the prize is the Refract itself.
  fuelIntro: 'Fun fact: this ship runs on me. Feed me vegetables and I’ll, um, refuel it. Personally.',
  grounded: [
    'Tank’s empty. We can’t reach the jump planet until you feed me enough vegetables.',
    'No fuel, no jump. Feed me. I turn salad into thrust. It’s a whole process.',
    'The ship is coasting on vibes alone. Vibes don’t reach the jump point. Vegetables do.',
    'Dry tank. Hungry Beam. You can solve both at once.',
  ],
  refuel: [
    'HURRK. Premium light-fuel, straight into the tank. You’re welcome.',
    'BLEURGH. Don’t look. It glows. It’s fine. It’s fuel.',
    'Refuelled! That is the worst part of my job and I love it.',
    'Light in, light out. The circle of lunch.',
    'Tank’s filling! The ship purrs. Or that’s me. Nope, the ship.',
  ],
  tankFull: [
    'Tank’s full! Break the jump core and we’re off to the next system.',
    'Full tank! Crack the jump core and hold on to something.',
    'Fuelled to the brim. The jump point is in reach. So is destiny. And a snack.',
    'That’s a full tank. Smash the core at the jump point and we fly.',
  ],
  jump: [
    'New system! Every jump is one step closer to home. And the Refract. And the snack of my life.',
    'We jumped! New stars, same Beam, slightly dizzier.',
    'Jump complete! I left my stomach in the last system. I don’t have one. Still.',
    'New sky! I’ll rate it. Vibes out of ten: yes.',
    'Another system down. Home is getting brighter. I can almost taste it. Literally.',
  ],
  home: 'Crystal. Home. And the Refract, just sitting there. I’m going to crush it up and have the most wicked high in every universe.',
};
export const MACHINE_LINES = {
  wormhole: 'A shortcut through spacetime. Finally, a shorter commute.',
  foamer: 'Quantum bubbles. Please do not use them for washing up.',
  string: 'String detheory. We have scientifically untangled a knot.',
  mote: 'Tiny clicker. Enormous career prospects.',
  satellite: 'An orb farm! Please remember to water it with light.',
  prism: 'More wavelengths. Fewer sensible electricity bills.',
  star: 'I measured the vibes. They are multiplying.',
  nova: 'A pocket star. I checked: pockets are optional.',
  mouse: 'An AI mouse. Finally, someone else to click the paperwork.',
  laser: 'Immah firin mah lazor! BWAAAH! Entirely peer-reviewed.',
  probe: 'Starlink probes! The light has excellent reception now.',
  gate: 'A star gate. Please keep your fingers inside this dimension.',
  flywheel: 'A flywheel! It stores momentum. I store snacks. We all have our talents.',
  forge: 'A singularity forge. We tamed a black hole. It is on probation.',
};
export const GARDEN_LINES = {
  growLights: 'Grow lights! The vegetables are getting a scientifically approved tan.',
  hydroponics: 'Hydroponics! Water with a PhD. The beds will never go thirsty.',
  tractor: 'A tractor! I have promoted myself to Chief Agricultural Vibe Officer.',
  picker: 'Picking robots. They pick, I supervise. Teamwork.',
};
const FALLBACK_MACHINE_LINE = 'New machine. Scientifically excellent vibes.';
// Ambient moods borrow from neighbouring pools so the quiet stretches stay varied.
const AMBIENT = {
  idle: [...LINES.idle, ...LINES.scoreboard],
  coop: [...LINES.coop, ...LINES.idle],
};
// A fresh musing appears this long after a mood begins, then every 25–40 seconds.
const AMBIENT_FIRST_MS = 20000;
const AMBIENT_GAP_MS = [25000, 40000];
export const EVENTS = {
  welcome: {mood:'greeting',priority:0,duration:6500},
  poke: {mood:'cheer',priority:1,duration:2600},
  meal: {mood:'cheer',priority:4,duration:6000},
  cooked: {mood:'cooked',priority:7,duration:6000},
  fuelIntro: {mood:'greeting',priority:3,duration:9000},
  grounded: {mood:'boss',priority:4,duration:7000},
  refuel: {mood:'surge',priority:4,duration:3500},
  tankFull: {mood:'cheer',priority:4,duration:6000},
  jump: {mood:'prestige',priority:6,duration:7500},
  home: {mood:'prestige',priority:6,duration:9000},
  machine: {mood:'cheer',priority:2,duration:6000},
  skill: {mood:'cheer',priority:2,duration:5500},
  boss: {mood:'boss',priority:3,duration:5000},
  surge: {mood:'surge',priority:4,duration:5000},
  flare: {mood:'boss',priority:5,duration:4500},
  shielded: {mood:'cheer',priority:3,duration:3500},
  comet: {mood:'surge',priority:4,duration:4500},
  launch: {mood:'surge',priority:5,duration:6000},
  crash: {mood:'boss',priority:5,duration:7000},
  roundend: {mood:'rest',priority:5,duration:6500},
  prestige: {mood:'prestige',priority:6,duration:8500},
};

/** Pick one line from a pool (a string or an array), never repeating `avoid` when there is a choice. */
export function pickLine(pool, random = Math.random, avoid) {
  const lines = Array.isArray(pool) ? pool : [pool];
  if (lines.length <= 1) return lines[0];
  const options = lines.filter((line) => line !== avoid);
  const index = Math.floor(random() * options.length);
  return options[Math.min(options.length - 1, Math.max(0, index))];
}

export class BeamCompanion {
  /** `random` is injectable so previews and tests can make Beam's chatter deterministic. */
  constructor(rootElement, {random = Math.random} = {}) {
    if (!rootElement) throw new Error('Beam needs a companion mount.');
    this.root = rootElement;
    this.random = random;
    this.clock = performance.now();
    this.lastPoke = -Infinity;
    this.lastEvent = new Map();
    this.recent = new Map();
    this.ambient = {key:null,line:'',nextAt:0};
    this.snapshot = null;
    this.tokeUntil = 0;
    this.active = null;
    this.visible = true;
    this.context = {mood:'greeting',line:this.ambientLine('welcome', LINES.welcome, this.clock)};
    this.collapsed = false;
    try { this.collapsed = localStorage.getItem(PREF_KEY) === 'yes'; } catch { /* optional preference */ }
    this.root.classList.add('beam-companion');
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Beam, Chief Vibe Officer');
    this.root.innerHTML = `<button class="beam-poke" type="button" aria-label="Say hello to Beam" title="Say hello to Beam">${sprite}</button>
      <div class="beam-copy"><div class="beam-nameplate"><strong>BEAM</strong><span>CHIEF VIBE OFFICER</span></div>
      <p class="beam-line" aria-live="polite" aria-atomic="true"></p></div>
      <button class="beam-toggle" type="button" aria-label="Minimize Beam" title="Minimize Beam" aria-expanded="true">−</button>`;
    this.line = this.root.querySelector('.beam-line');
    this.status = this.root.querySelector('.beam-nameplate span');
    this.pokeButton = this.root.querySelector('.beam-poke');
    this.toggleButton = this.root.querySelector('.beam-toggle');
    this.onPoke = () => {
      const now = performance.now();
      if (now - this.lastPoke < 3000 || this.collapsed) return;
      this.lastPoke = now;
      this.clock = now;
      this.react('poke');
      this.root.classList.remove('beam-poked');
      void this.pokeButton.offsetWidth;
      this.root.classList.add('beam-poked');
    };
    this.onToggle = () => {
      this.collapsed = !this.collapsed;
      try { localStorage.setItem(PREF_KEY, this.collapsed ? 'yes' : 'no'); } catch { /* optional preference */ }
      this.updateCollapsed();
    };
    this.onVisibility = () => {
      this.root.dataset.paused = String(document.hidden);
      if (document.hidden) this.visible = false;
    };
    this.pokeButton.addEventListener('click', this.onPoke);
    this.toggleButton.addEventListener('click', this.onToggle);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.updateCollapsed();
    this.onVisibility();
    this.react('welcome');
  }

  updateCollapsed() {
    this.root.dataset.collapsed = String(this.collapsed);
    this.toggleButton.textContent = this.collapsed ? '+' : '−';
    const label = this.collapsed ? 'Show Beam' : 'Minimize Beam';
    this.toggleButton.setAttribute('aria-label', label);
    this.toggleButton.setAttribute('title', label);
    this.toggleButton.setAttribute('aria-expanded', String(!this.collapsed));
    this.pokeButton.disabled = this.collapsed;
  }

  /** A fresh line from a pool that differs from the last one Beam said for that key. */
  say(key, pool) {
    const line = pickLine(pool, this.random, this.recent.get(key));
    this.recent.set(key, line);
    return line;
  }

  /** The standing line for a mood. It changes when the mood changes, then slowly rotates while nothing else is happening. */
  ambientLine(key, pool, now) {
    if (this.ambient.key !== key) {
      // A reaction that just announced this mood keeps its wording instead of being contradicted by a second line.
      const line = this.active?.type === key && now < this.active.until ? this.active.line : this.say(key, pool);
      this.ambient = {key, line, nextAt:now + AMBIENT_FIRST_MS};
    } else if (now >= this.ambient.nextAt && !(this.active && now < this.active.until)) {
      const [min, max] = AMBIENT_GAP_MS;
      this.ambient.line = this.say(key, pool);
      this.ambient.nextAt = now + min + this.random() * (max - min);
    }
    return this.ambient.line;
  }

  /** `now` is a monotonic millisecond timestamp, like requestAnimationFrame. */
  render(state, selfId, now = performance.now()) {
    const visible = !document.hidden && this.root.getClientRects().length > 0;
    if (this.active && this.active.until > this.clock &&
        ['machine','skill','meal','roundend','prestige'].includes(this.active.type) && (!visible || !this.visible)) {
      // Keep the one current milestone while research occupies the screen. This
      // is not a queue: later higher-priority milestones replace it in place.
      this.active.until += Math.max(0, now - this.clock);
    }
    this.clock = now;
    this.visible = visible;
    const player = state?.players?.find((member) => member.id === selfId);
    const orb = state?.mode === 'coop' ? state?.sharedOrb : player?.orb;
    const next = {
      id:player?.id, phase:state?.phase || 'lobby', round:state?.round || 0,
      boss:player?.secretOrb ? 'secret' : orb?.level > 0 && orb.level < FINAL_LEVEL && orb.level % 20 === 0 ? orb.level : 0,
      surge:state?.phase === 'round' && state.remaining > 0 && state.remaining <= 10,
      generators:{...player?.generators}, skills:sum(player?.skills), prestige:player?.prestigeCount || 0,
      meals:player?.farm?.meals || 0, fed:player?.farm?.fedSeconds > 0, gear:{...player?.farm?.upgrades},
      cooked:player?.farm?.cookedSeconds || 0,
      ship:player ? getShipStatus(player,state) : null, level:orb?.level || 1, farm:Boolean(player?.farm?.unlocked || player?.generators?.satellite > 0),
    };
    const hour = new Date().getHours();
    this.root.dataset.time = hour >= 7 && hour < 19 ? 'day' : 'night';
    this.root.dataset.cooked = String(next.cooked > 0);
    const cookedSeconds = Math.ceil(next.cooked);
    this.status.textContent = cookedSeconds ? `Cooked · ${Math.floor(cookedSeconds/60)}:${String(cookedSeconds%60).padStart(2,'0')}` : 'CHIEF VIBE OFFICER';
    this.status.title = cookedSeconds ? '×4.20 earned score. Timer advances during active rounds.' : '';
    let mood = 'greeting', key = 'welcome';
    if (next.cooked > 0) { mood = 'cooked'; key = 'cooked'; }
    else if (next.phase === 'intermission') { mood = 'rest'; key = this.root.dataset.time === 'day' ? 'restday' : 'restnight'; }
    else if (next.surge) { mood = 'surge'; key = 'surge'; }
    else if (next.phase === 'round' && next.boss) { mood = 'boss'; key = 'boss'; }
    else if (next.fed) { mood = 'cheer'; key = 'fed'; }
    else if (next.phase === 'round') { mood = 'idle'; key = state.mode === 'coop' ? 'coop' : 'idle'; }
    this.context = {mood, line:this.ambientLine(key, AMBIENT[key] || LINES[key], now)};
    const previous = this.snapshot;
    if (previous && previous.id === next.id && next.id && next.round >= previous.round) {
      if (next.cooked > previous.cooked) {
        // Restart the short feeding sequence for each fresh dose. The baked
        // face below follows the saved buff, independently of reaction moods.
        this.tokeUntil = now + 6200;
        this.root.dataset.toking = 'false';
        void this.pokeButton.offsetWidth;
      }
      // Choose the highest-value event from a snapshot: never emit one bark per click.
      if (next.prestige > previous.prestige) this.react('prestige');
      else if (next.cooked > previous.cooked) this.react('cooked');
      else if (next.ship && previous.ship && next.ship.systemIndex > previous.ship.systemIndex) this.react(next.level >= FINAL_LEVEL - 19 ? 'home' : 'jump');
      else if (next.ship?.grounded && !previous.ship?.grounded) this.react('grounded');
      else if (next.ship && previous.ship && next.ship.fuel > previous.ship.fuel) this.react(next.ship.full ? 'tankFull' : 'refuel');
      else if (next.ship?.systemIndex === 0 && !previous.storyShown && (next.farm && !previous.farm || next.level >= 10 && previous.level < 10)) { next.storyShown = true; this.react('fuelIntro'); }
      else if (next.meals > previous.meals) this.react('meal');
      else if (next.phase === 'intermission' && previous.phase !== 'intermission') this.react('roundend');
      else if (next.surge && !previous.surge) this.react('surge');
      else if (next.phase === 'round' && next.boss && next.boss !== previous.boss) this.react('boss');
      else {
        const machine = Object.keys(MACHINE_LINES).find((id) => next.generators[id] > 0 && !(previous.generators[id] > 0));
        const gear = Object.keys(GARDEN_LINES).find((id) => next.gear[id] > 0 && !(previous.gear?.[id] > 0));
        if (machine) this.react('machine', {id:machine});
        else if (gear) this.react('machine', {id:gear});
        else if (next.skills > previous.skills) this.react('skill');
      }
    }
    if (!next.cooked) this.tokeUntil = 0;
    this.root.dataset.toking = String(next.cooked > 0 && now < this.tokeUntil);
    this.pokeButton.title = next.cooked > 0 ? 'Beam is cooked · 4.20× earned scores' : 'Say hello to Beam';
    if (previous?.storyShown) next.storyShown = true;
    this.snapshot = next;
    if (this.active && now >= this.active.until) this.active = null;
    this.paint();
  }

  /** Cosmetic reactions only. No game callbacks, currency changes or network messages. */
  react(type, detail = {}) {
    const aliases = {firstMachine:'machine',buyGenerator:'machine',buySkill:'skill',roundEnd:'roundend'};
    type = aliases[type] || type;
    const event = EVENTS[type];
    if (!event) return false;
    const now = this.clock;
    const newBuildIdea = !this.visible && this.active?.type === 'roundend' && ['machine','skill'].includes(type);
    if (this.active && now < this.active.until && this.active.priority > event.priority && !newBuildIdea) return false;
    const key = type === 'machine' ? `${type}:${detail.id}` : type;
    const cooldown = type === 'poke' ? 2500 : type === 'skill' ? 8000 : 4000;
    if (now - (this.lastEvent.get(key) ?? -Infinity) < cooldown) return false;
    this.lastEvent.set(key, now);
    const line = type === 'machine'
      ? pickLine(MACHINE_LINES[detail.id] || GARDEN_LINES[detail.id] || FALLBACK_MACHINE_LINE, this.random)
      : this.say(type, LINES[type]);
    // The matching ambient mood adopts this wording so Beam does not say two things about one moment.
    if (this.ambient.key === type) this.ambient.line = line;
    this.active = {...event, type, until:now + event.duration, line};
    this.paint();
    return true;
  }

  paint() {
    if (this.active?.type === 'cooked' && this.root.dataset.cooked !== 'true') this.active = null;
    const view = this.active || this.context;
    this.root.dataset.mood = view.mood;
    if (this.line.textContent !== view.line) this.line.textContent = view.line;
  }

  destroy() {
    this.pokeButton.removeEventListener('click', this.onPoke);
    this.toggleButton.removeEventListener('click', this.onToggle);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.root.replaceChildren();
  }
}
