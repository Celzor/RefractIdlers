/** A cosmetic companion. Reads snapshots; never writes to the game or sends actions. */
const SPRITE = new URL('../assets/beam-pixel.svg', import.meta.url).href;
const PREF_KEY = 'refract-idlers:beam-collapsed';
const sum = (record) => Object.values(record || {}).reduce((total, value) => total + value, 0);
const layer = (name, className = name) => `<g class="${className}"><use href="${SPRITE}#${name}"/></g>`;
const sprite = `<svg class="beam-sprite" viewBox="0 0 64 64" width="96" height="96" aria-hidden="true" shape-rendering="crispEdges">
  ${layer('beam-night')}${layer('beam-sun')}${layer('beam-chair')}${layer('beam-wind')}
  <g class="beam-character"><g class="beam-float">
    ${layer('beam-body')}${layer('beam-head')}
    ${layer('beam-eyes')}${layer('beam-eyes-cheer')}${layer('beam-eyes-worried')}${layer('beam-eyes-windy')}${layer('beam-eyes-blink')}
    ${layer('beam-hand-left')}${layer('beam-hand-right')}${layer('beam-feet')}${layer('beam-shard')}${layer('beam-crown')}
  </g></g>${layer('beam-boat')}
</svg>`;

// New game dialogue, inspired by Beam's existing Chief Vibe Officer persona.
// These lines are an Idlers adaptation, not quotations from Refract canon.
const LINES = {
  welcome: 'Hello! I’m Beam. I’ve brought a highly scientific good feeling.',
  idle: 'I’m supervising. Floating counts.',
  coop: 'Shared light. Shared LRCs. Extremely scientific teamwork.',
  scoreboard: 'The board has numbers. I have a good feeling.',
  boss: 'That orb looks serious. I’ve prepared my serious face.',
  surge: 'Hold on to your photons. Here comes the surge!',
  roundend: 'Round complete. Time to grow a brighter idea.',
  restday: 'A little boat break. Big ideas need a small breather.',
  restnight: 'Ideas first. Armchair second. Actually, armchair first.',
  skill: 'A new idea! Peer-reviewed by me. Just me.',
  prestige: 'New orbit. Same Beam. Extremely fancy little crown.',
  poke: 'Highly scientific finding: that tickles.',
};
const MACHINE_LINES = {
  mote: 'Tiny clicker. Enormous career prospects.',
  satellite: 'An orb farm! Please remember to water it with light.',
  prism: 'More wavelengths. Fewer sensible electricity bills.',
  star: 'I measured the vibes. They are multiplying.',
  nova: 'A pocket star. I checked: pockets are optional.',
};
const EVENTS = {
  welcome: {mood:'greeting',priority:0,duration:6500},
  poke: {mood:'cheer',priority:1,duration:2600},
  machine: {mood:'cheer',priority:2,duration:6000},
  skill: {mood:'cheer',priority:2,duration:5500},
  boss: {mood:'boss',priority:3,duration:5000},
  surge: {mood:'surge',priority:4,duration:5000},
  roundend: {mood:'rest',priority:5,duration:6500},
  prestige: {mood:'prestige',priority:6,duration:8500},
};

export class BeamCompanion {
  constructor(rootElement) {
    if (!rootElement) throw new Error('Beam needs a companion mount.');
    this.root = rootElement;
    this.clock = performance.now();
    this.lastPoke = -Infinity;
    this.lastEvent = new Map();
    this.snapshot = null;
    this.active = null;
    this.visible = true;
    this.context = {mood:'greeting',line:LINES.welcome};
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

  /** `now` is a monotonic millisecond timestamp, like requestAnimationFrame. */
  render(state, selfId, now = performance.now()) {
    const visible = !document.hidden && this.root.getClientRects().length > 0;
    if (this.active && this.active.until > this.clock &&
        ['machine','skill','roundend','prestige'].includes(this.active.type) && (!visible || !this.visible)) {
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
      boss:orb?.level > 0 && orb.level % 10 === 0 ? orb.level : 0,
      surge:state?.phase === 'round' && state.remaining > 0 && state.remaining <= 10,
      generators:{...player?.generators}, skills:sum(player?.skills), prestige:player?.prestigeCount || 0,
    };
    const hour = new Date().getHours();
    this.root.dataset.time = hour >= 7 && hour < 19 ? 'day' : 'night';
    if (next.phase === 'intermission') {
      this.context = {mood:'rest',line:LINES[this.root.dataset.time === 'day' ? 'restday' : 'restnight']};
    } else if (next.surge) {
      this.context = {mood:'surge',line:LINES.surge};
    } else if (next.phase === 'round' && next.boss) {
      this.context = {mood:'boss',line:LINES.boss};
    } else if (next.phase === 'round') {
      this.context = {mood:'idle',line:LINES[state.mode === 'coop' ? 'coop' : 'idle']};
    } else {
      this.context = {mood:'greeting',line:LINES.welcome};
    }
    const previous = this.snapshot;
    if (previous && previous.id === next.id && next.id && next.round >= previous.round) {
      // Choose the highest-value event from a snapshot: never emit one bark per click.
      if (next.prestige > previous.prestige) this.react('prestige');
      else if (next.phase === 'intermission' && previous.phase !== 'intermission') this.react('roundend');
      else if (next.surge && !previous.surge) this.react('surge');
      else if (next.phase === 'round' && next.boss && next.boss !== previous.boss) this.react('boss');
      else {
        const machine = Object.keys(MACHINE_LINES).find((id) => next.generators[id] > 0 && !(previous.generators[id] > 0));
        if (machine) this.react('machine', {id:machine});
        else if (next.skills > previous.skills) this.react('skill');
      }
    }
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
    this.active = {
      ...event, type, until:now + event.duration,
      line:type === 'machine' ? MACHINE_LINES[detail.id] || 'New machine. Scientifically excellent vibes.' : LINES[type],
    };
    this.paint();
    return true;
  }

  paint() {
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
