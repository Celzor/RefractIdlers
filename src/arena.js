import { drawGeneratorSprite, orbAppearance, GENERATOR_IDS, PIXEL_PALETTE as P } from './icons.js';
import * as Game from './game.js';

/** Original pixel tabletop, retaining RogueRefract's tilted orbit projection. */
const TAU = Math.PI * 2;
const RADII = [0.62, 0.82, 1.04];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const noise = (value) => ((Math.sin(value) * 43758.5453) % 1 + 1) % 1;
const font = (size) => `${size}px "Press Start 2P", ui-monospace, monospace`;
const compact = (amount) => amount >= 1e12 ? `${(amount / 1e12).toFixed(1)}t`
  : amount >= 1e9 ? `${(amount / 1e9).toFixed(1)}b`
    : amount >= 1e6 ? `${(amount / 1e6).toFixed(1)}m`
      : amount >= 1000 ? `${(amount / 1000).toFixed(1)}k` : String(Number(amount.toFixed(1)));

const ATTACK_IDS = ['mote','mouse','laser','probe','gate'];
const FLEET_COLORS = {mote:P.yellow,satellite:P.sky,prism:P.cream,star:P.purple,nova:P.yellow,mouse:P.paper,laser:P.red,probe:P.sky,gate:P.purple,wormhole:P.purple,foamer:P.sky,string:P.yellow,sail:P.cream,lens:P.purple,dyson:P.orange};
/** Machines that gather light release a glowing mote each cycle; floating machines bob gently. */
const COLLECTOR_IDS = ['satellite','prism','nova','probe','gate','sail','lens','dyson'];
const FLOATING_IDS = new Set(['probe','gate','sail','dyson','nova']);
const MOTE_LIMIT = 48, MOTE_SECONDS = .9;
const SHOT_DURATION = {mote:.38,mouse:.62,laser:.48,probe:.58,gate:.72};
const SHOT_IMPACT_DURATION = .24;
const FLEET_LIMIT = 256, OVERFLOW_LIMIT = 512, SHOT_LIMIT = 96;

function fleetPlayers(state,selfId){
  const players=state?.players||[],self=players.find(player=>player.id===selfId)||players[0];
  return players.filter(player=>self?.secretOrb?player.id===self.id:state.mode==='coop'?!player.secretOrb:player.id===self?.id);
}

/** Only active session members contribute; competitive fleets are personal. */
export function collectFleetCounts(state, selfId) {
  const counts = Object.fromEntries(GENERATOR_IDS.map(id=>[id,0]));
  for (const player of fleetPlayers(state,selfId)) {
    for (const id of GENERATOR_IDS) counts[id] += clamp(Math.floor(Number(player.generators?.[id]) || 0),0,1000);
  }
  return counts;
}

/** Fair sampling retains every purchased type without iterating huge holdings. */
export function buildFleet(counts, {maxUnits=FLEET_LIMIT,maxOverflow=OVERFLOW_LIMIT}={}) {
  const owned = Object.fromEntries(GENERATOR_IDS.map(id=>[id,clamp(Math.floor(Number(counts?.[id]) || 0),0,8000)]));
  const totalOwned = Object.values(owned).reduce((a,b)=>a+b,0);
  const detailed = Math.min(totalOwned,clamp(Math.floor(maxUnits),0,FLEET_LIMIT));
  const tiny = Math.min(totalOwned-detailed,clamp(Math.floor(maxOverflow),0,OVERFLOW_LIMIT));
  const units = [];
  for (let ordinal=0; units.length<detailed+tiny; ordinal++) {
    for (const id of GENERATOR_IDS) {
      if (ordinal >= owned[id]) continue;
      units.push({id,index:ordinal,key:`${id}:${ordinal}`,tiny:units.length>=detailed});
      if (units.length===detailed+tiny) break;
    }
  }
  return {owned,totalOwned,detailed,tiny,rendered:units.length,aggregated:totalOwned-units.length,units};
}

/** A unit's berth is independent of all other purchases and of session order. */
export function fleetPosition(id,index,width,height) {
  const type=Math.max(0,GENERATOR_IDS.indexOf(id)), seed=(index+1)*23.731+(type+1)*91.117;
  const angle=(index*2.399963229728653+type*TAU/GENERATOR_IDS.length+.4)%TAU;
  const radius=.35+.65*Math.sqrt(noise(seed));
  let dx=Math.cos(angle)*Math.max(40,width/2-16)*radius;
  let dy=Math.sin(angle)*Math.max(38,height/2-17)*radius;
  const inner=Math.hypot(dx/41,dy/36);
  if(inner<1){dx/=Math.max(.01,inner);dy/=Math.max(.01,inner);}
  return {x:clamp(width/2+dx,14,Math.max(14,width-14)),y:clamp(height*.49+dy,14,Math.max(14,height-14))};
}

/** Beam/projectile geometry always terminates at the exact DOM core center. */
export function shotGeometry(source,width,height,progress,{barrel=0}={}) {
  const target={x:width/2,y:height*.49};
  const dx=target.x-source.x,dy=target.y-source.y,distance=Math.hypot(dx,dy);
  const muzzle=Math.min(Math.max(0,barrel),distance);
  const start={x:source.x+(distance?dx/distance*muzzle:0),y:source.y+(distance?dy/distance*muzzle:0)};
  const p=clamp(Number(progress)||0,0,1);
  return {source:start,target,point:p===1?{...target}:{x:start.x+(target.x-start.x)*p,y:start.y+(target.y-start.y)*p},progress:p,angle:Math.atan2(dy,dx)};
}

export class OrbitArena {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 320;
    this.height = 210;
    this.cssWidth = 640;
    this.particles = [];
    this.floats = [];
    this.images = new Map();
    this.positions = new Map();
    this.instrumentCounts = new Map();
    this.purchaseTimes = new Map();
    this.instrumentTime = 0;
    this.fleet = buildFleet({});
    this.fleetKey = '';
    this.fleetByType = new Map();
    this.attackCounters = new Map();
    this.fireCursor = new Map();
    this.fireTimes = new Map();
    this.shots = [];
    this.completedShots = [];
    this.motes = [];
    this.motePhase = new Map();
    this.shatters = [];
    this.purchaseBursts = [];
    this.lastSoundAt = -Infinity;
    this.onFire = null;
    // The native core remains keyboard-accessible. This transparent effect layer
    // sits above its image, so beams really arrive rather than vanish behind it.
    this.effects = canvas.ownerDocument?.createElement('canvas') || null;
    if (this.effects && canvas.parentElement) {
      this.effects.className = 'arena-effects';
      this.effects.setAttribute('aria-hidden','true');
      this.effects.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;image-rendering:pixelated';
      canvas.parentElement.append(this.effects);
      this.effectsContext=this.effects.getContext('2d');
    }
    this.lastAutoClicks = null;
    this.autoPulseAt = -Infinity;
    this.orbIdentity = null;
    this.previousOrb = null;
    this.orbPalette = orbAppearance(null);
    this.lastBurstAt = -Infinity;
    this.lastShatterAt = -Infinity;
    this.impactUntil = -Infinity;
    this.lastFrame = null;
    this.destroyed = false;
    this.media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = this.media?.matches ?? false;
    this.onMotionChange = (event) => { this.reducedMotion = event.matches; };
    this.media?.addEventListener?.('change', this.onMotionChange);
    this.resizeObserver = new ResizeObserver(([entry]) => this.resize(entry.contentRect.width, entry.contentRect.height));
    this.resizeObserver.observe(canvas);
    canvas.style.imageRendering = 'pixelated';
  }

  resize(width, height) {
    if (this.destroyed) return;
    this.cssWidth = width;
    // Deliberately low resolution: the browser scales every pixel without blur.
    this.width = Math.max(1, Math.round(width / 2));
    this.height = Math.max(1, Math.round(height / 2));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    if(this.effects){this.effects.width=this.width;this.effects.height=this.height;}
    this.fleetKey = '';
    this.completedShots = [];
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;
  }

  project(angle, lane = 1, extra = 1) {
    const radius = RADII[clamp(Math.round(lane), 0, RADII.length - 1)] * extra;
    const x = Math.cos(angle) * this.width * 0.38 * radius;
    return { x: Math.round(this.width / 2 + x),
      y: Math.round(this.height * 0.49 + Math.sin(angle) * Math.min(this.height * 0.32, this.width * 0.3) * radius - x * 0.17) };
  }

  pixel(x, y, color, width = 1, height = width) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), width, height);
  }

  spark(x, y, color, radius = 3) {
    this.pixel(x, y - radius, color, 1, radius * 2 + 1);
    this.pixel(x - radius, y, color, radius * 2 + 1, 1);
  }

  burst({ damage = 0, amount = 0, kills = 0, critical = false } = {}) {
    if (this.destroyed) return;
    const x = this.width / 2, y = this.height * 0.49;
    const now = globalThis.performance?.now?.() ?? Date.now();
    this.lastBurstAt = now;
    this.impactUntil = now + 170;
    damage = Number.isFinite(damage) ? Math.max(0, damage) : 0;
    amount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    kills = Number.isFinite(kills) ? Math.max(0, Math.floor(kills)) : 0;
    if (!this.reducedMotion) {
      for (let i = 0, count = critical ? 9 : 4; i < count; i++) {
        const angle = Math.random() * TAU;
        const velocity = 13 + Math.random() * 22;
        this.particles.push({ x: x + Math.cos(angle) * 27, y: y + Math.sin(angle) * 27,
          vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity - 8,
          life: 1, color: i % 3 ? this.orbPalette.primary : P.cream, size: 2 });
      }
    }
    if (damage > 0) {
      this.floats.push({ x: x + (this.reducedMotion ? 0 : Math.round((Math.random() - 0.5) * 24)),
        y: y - 33, life: 1, critical, color: critical ? P.yellow : '#fff1cb',
        text: `${critical ? '!' : ''}${compact(damage)} DMG` });
    }
    if (amount > 0) {
      this.floats.push({ x: x + (this.reducedMotion ? 0 : Math.round((Math.random() - 0.5) * 18)),
        y: y - (damage > 0 ? 46 : 35), life: 1.1, color: P.yellow,
        text: `+${compact(amount)} LRC` });
    }
    if (kills > 0) this.shatter(kills, now, false);
    this.particles = this.particles.slice(-80);
    this.floats = this.floats.slice(-8);
  }

  shatter(kills, nowMs, announce = true) {
    if(this.destroyed||!Number.isFinite(kills)||kills<=0)return;
    this.lastShatterAt = nowMs;
    const x = this.width / 2, y = this.height * 0.49;
    const seed=nowMs*.017+Math.min(kills,1000);
    const palette=[this.orbPalette.primary,this.orbPalette.accent,P.sky,P.purple,P.cream];
    this.shatters.push({at:nowMs,palette,shards:Array.from({length:28},(_,index)=>({
      angle:index*TAU/28+noise(seed+index*13)*.15,
      speed:48+noise(seed+index*71)*90,size:3+noise(seed+index*19)*5,
      spin:(noise(seed+index*29)-.5)*9,color:palette[index%palette.length],
    }))});
    this.shatters=this.shatters.slice(-3);
    if (!this.reducedMotion) {
      for (let i = 0; i < 5; i++) this.particles.push({ x: x + (i - 2) * 7, y: y - 5,
        vx: (i - 2) * 11, vy: -39 - Math.random() * 17, life: 1.45, color: P.yellow, coin: true });
      this.particles = this.particles.slice(-80);
    }
    if (announce) {
      this.floats.push({ x, y: y - 45, life: 1.15, color: P.yellow,
        text: kills > 1 ? `${compact(kills)} ORBS BROKEN` : 'ORB BROKEN!' });
      this.floats = this.floats.slice(-8);
    }
  }

  currentOrb(state, selfId) {
    const player = (state.players ?? []).find((entry) => entry.id === selfId) ?? state.players?.[0];
    if (!player || typeof Game.getOrb !== 'function') return null;
    try {
      const orb = Game.getOrb(player, state);
      if (!orb || !Number.isFinite(orb.hp) || !Number.isFinite(orb.maxHp) || orb.maxHp <= 0) return null;
      return { ...orb, identity: orb.secret ? `secret:${player.id}` : state.mode === 'coop' ? 'coop' : player.id };
    } catch { return null; }
  }

  observeOrb(orb, nowMs) {
    if (!orb) { this.previousOrb = null; this.orbIdentity = null; return; }
    const healthFraction = clamp(orb.hp / orb.maxHp, 0, 1);
    if (this.orbIdentity === orb.identity && this.previousOrb) {
      if (orb.level > this.previousOrb.level && nowMs - this.lastShatterAt > 300) {
        this.shatter(orb.level - this.previousOrb.level, nowMs);
      } else if (orb.level === this.previousOrb.level && healthFraction < this.previousOrb.healthFraction - 1e-12 && nowMs - this.lastBurstAt > 200) {
        this.impactUntil = nowMs + 130;
      }
    }
    this.orbIdentity = orb.identity;
    this.previousOrb = { level: orb.level, hp: orb.hp, healthFraction };
    this.orbPalette = orbAppearance(orb);
  }

  render(state, selfId, nowMs) {
    const c = this.ctx;
    if (!c || this.destroyed || !state) return;
    const dt = clamp((nowMs - (this.lastFrame ?? nowMs)) / 1000, 0, 0.05);
    this.lastFrame = nowMs;
    const active = state.phase === 'round' && !globalThis.document?.hidden;
    const orb = this.currentOrb(state, selfId);
    this.observeOrb(orb, nowMs);
    // Production pauses at intermission, but a projectile already on its way
    // still lands. Keep its presentation clock running until the impact fades.
    if (!this.reducedMotion && !globalThis.document?.hidden && (active || this.shots.length)) this.instrumentTime += dt;
    const visualTime = this.reducedMotion ? 3 : this.instrumentTime;
    const w = this.width, h = this.height;
    c.imageSmoothingEnabled = false;
    c.globalAlpha = 1;
    this.effectsContext?.clearRect(0,0,w,h);
    this.drawSpace(w, h, visualTime);

    // Discrete dotted orbital rings preserve the tilted Refract voice stage.
    for (let lane = 0; lane < RADII.length; lane++) {
      const samples = Math.round(this.width * (1.5 + lane * 0.4));
      for (let i = 0; i < samples; i++) {
        if (i % 8 > 3) continue;
        const p = this.project(i / samples * TAU, lane);
        this.pixel(p.x, p.y, lane === 1 ? '#6b86b4' : '#43587f');
      }
      for (let i = 0; i < 8; i++) {
        const p = this.project(i * TAU / 8, lane);
        this.pixel(p.x - 1, p.y - 1, '#a9c1e4', 2, 2);
      }
    }

    const cx = Math.round(w / 2), cy = Math.round(h * 0.49);
    if (orb) this.drawOrbFrame(orb, nowMs);
    if (active && state.remaining <= 10) {
      const phase = this.reducedMotion ? 0 : Math.floor(visualTime * 2) % 2;
      this.spark(cx - 34, cy - 15 + phase, P.yellow, 3);
      this.spark(cx + 33, cy + 10 - phase, P.yellow, 3);
    }

    this.drawInstruments(state, selfId, nowMs, active);

    const players = (state.players ?? []).slice(0, 8);
    const ids = new Set(players.map((player) => player.id));
    for (const id of this.positions.keys()) if (!ids.has(id)) this.positions.delete(id);
    const positioned = players.map((player, index) => {
      const angle = index * TAU / Math.max(1, players.length) + visualTime * 0.08 - 0.3;
      const position = this.project(angle, 1);
      this.positions.set(player.id, position);
      return { player, position };
    }).sort((a, b) => a.position.y - b.position.y);
    for (const { player, position } of positioned) this.drawPlayer(player, position, selfId);

    for (const particle of this.particles) {
      particle.life -= dt * 1.8;
      particle.x += particle.vx * dt; particle.y += particle.vy * dt;
      particle.vy += dt * (particle.coin ? 45 : 26);
      if (particle.life > 0.2) {
        if (particle.coin) {
          this.pixel(particle.x - 1, particle.y - 1, P.ink, 5, 6);
          this.pixel(particle.x, particle.y, P.yellow, 3, 4);
          this.pixel(particle.x + 1, particle.y, P.cream, 1, 3);
        } else {
          const size = particle.size ?? 2;
          if (particle.shard) this.pixel(particle.x - 1, particle.y - 1, P.ink, size + 1, size + 1);
          this.pixel(particle.x, particle.y, particle.color, size, size);
        }
      }
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    for (const float of this.floats) {
      float.life -= dt * 0.9;
      if (!this.reducedMotion) float.y -= dt * 12;
      c.font = font(float.critical ? 6 : 5); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillStyle = P.ink; c.fillText(float.text, Math.round(float.x) + 1, Math.round(float.y) + 1);
      c.fillStyle = float.color ?? (float.critical ? P.yellow : P.cream);
      c.fillText(float.text, Math.round(float.x), Math.round(float.y));
    }
    this.floats = this.floats.filter((float) => float.life > 0);
    this.drawShatters(nowMs);
  }

  /** Glass facets and rays belong above the native core, beside projectile hits. */
  drawShatters(nowMs) {
    const c=this.effectsContext||this.ctx,cx=this.width/2,cy=this.height*.49;
    this.shatters=this.shatters.filter(burst=>nowMs-burst.at<1250);
    c.save();
    for(const burst of this.shatters){
      const age=Math.max(0,(nowMs-burst.at)/1000),fade=Math.max(0,1-age/1.25);
      if(this.reducedMotion){
        const glow=c.createRadialGradient(cx,cy,5,cx,cy,48);
        glow.addColorStop(0,'#fff5d9');glow.addColorStop(.55,burst.palette[0]);glow.addColorStop(1,'transparent');
        c.globalAlpha=.2*fade;c.fillStyle=glow;c.fillRect(cx-48,cy-48,96,96);continue;
      }
      const wave=26+age*105;
      c.globalAlpha=.5*fade*fade;c.strokeStyle=burst.palette[1];c.lineWidth=1.4;
      c.beginPath();c.ellipse(cx,cy,wave,wave*.78,0,0,TAU);c.stroke();
      if(age<.72){
        const reach=42+Math.sin(Math.min(1,age/.72)*Math.PI*.7)*145;
        for(let i=0;i<12;i++){
          const angle=i*TAU/12+.12,spread=.018+(i%3)*.007;
          c.globalAlpha=.3*(1-age/.72);c.fillStyle=burst.palette[i%burst.palette.length];
          c.beginPath();c.moveTo(cx+Math.cos(angle-spread)*18,cy+Math.sin(angle-spread)*18);
          c.lineTo(cx+Math.cos(angle)*reach,cy+Math.sin(angle)*reach*.78);
          c.lineTo(cx+Math.cos(angle+spread)*18,cy+Math.sin(angle+spread)*18);c.closePath();c.fill();
        }
      }
      for(const shard of burst.shards){
        const travel=22+shard.speed*age,px=cx+Math.cos(shard.angle)*travel,py=cy+Math.sin(shard.angle)*travel*.8+age*age*15;
        c.save();c.translate(px,py);c.rotate(shard.angle+shard.spin*age);c.globalAlpha=fade;
        c.fillStyle=shard.color;c.beginPath();c.moveTo(-shard.size,-shard.size*.45);c.lineTo(shard.size*.9,0);c.lineTo(-shard.size*.35,shard.size*.65);c.closePath();c.fill();
        c.fillStyle=P.cream;c.globalAlpha=fade*.8;c.beginPath();c.moveTo(-shard.size,-shard.size*.45);c.lineTo(shard.size*.9,0);c.lineTo(-shard.size*.2,0);c.closePath();c.fill();
        c.restore();
      }
      c.globalAlpha=.55*Math.max(0,1-age/.3);c.fillStyle=P.cream;
      c.fillRect(cx-13,cy-.5,26,1);c.fillRect(cx-.5,cy-13,1,26);
    }
    c.restore();
  }

  drawOrbFrame(orb, nowMs) {
    const x = Math.round(this.width / 2), y = Math.round(this.height * 0.49);
    const appearance = this.orbPalette;
    const hit = nowMs < this.impactUntil;
    const rim = hit ? P.cream : appearance.primary;
    const extent = orb.boss ? 30 : 27;
    // Pixel corner braces frame the DOM sprite without covering the click area.
    for (const side of [-1, 1]) {
      this.pixel(x + side * extent - (side < 0 ? 0 : 5), y - 17, P.ink, 7, 2);
      this.pixel(x + side * extent, y - 17, P.ink, 2, 7);
      this.pixel(x + side * extent - (side < 0 ? 0 : 4), y - 16, rim, 5, 1);
      this.pixel(x + side * extent - (side < 0 ? 0 : 5), y + 14, P.ink, 7, 2);
      this.pixel(x + side * extent, y + 9, P.ink, 2, 7);
      this.pixel(x + side * extent - (side < 0 ? 0 : 4), y + 14, rim, 5, 1);
    }
    if (orb.boss) {
      // Brass pennants and a stronger base distinguish every tenth orb.
      this.pixel(x - 31, y + 24, P.ink, 64, 7);
      this.pixel(x - 29, y + 25, P.yellow, 60, 3);
      for (const side of [-1, 1]) {
        this.pixel(x + side * 35, y - 7, P.ink, 5, 12);
        this.pixel(x + side * 35 + 1, y - 6, P.red, 3, 8);
        this.pixel(x + side * 35 + 2, y - 3, P.yellow, 1, 2);
      }
    }
    if (appearance.damageTier > 0) {
      for (let i = 0; i < appearance.damageTier + 1; i++) {
        this.pixel(x - 21 + i * 13, y + 24 - i % 2, appearance.shade, 3, 2);
        this.pixel(x - 20 + i * 13, y + 24 - i % 2, appearance.accent, 1, 1);
      }
    }
    const age = nowMs - this.lastShatterAt;
    if (age >= 0 && age < 360 && !this.reducedMotion) {
      const step = Math.floor(age / 90);
      for (let i = 0; i < 8; i++) {
        const angle = i * TAU / 8;
        this.pixel(x + Math.cos(angle) * (29 + step * 4), y + Math.sin(angle) * (29 + step * 4), P.yellow, 2, 2);
      }
    }
  }

  /** Deep space: a seeded pixel starfield with a faint dust band, drifting very slowly. */
  drawSpace(w, h, time) {
    this.pixel(0, 0, '#0a0f22', w, h);
    for (let i = 0; i < 70; i++) {
      // A diagonal band of dust pixels, like a far-off arm of the galaxy.
      const t = noise(i * 53.7 + 2), x = t * (w + 80) - 40, y = h * 0.78 - t * h * 0.55 + (noise(i * 17.3 + 5) - 0.5) * 34;
      this.pixel(x, y, i % 3 ? '#141c3a' : '#1a2448', 2, 2);
    }
    const drift = this.reducedMotion ? 0 : time * 0.9;
    for (let i = 0; i < 160; i++) {
      const depth = i % 3, x = ((noise(i * 127.1 + 31) * w + drift * (depth + 1) * 0.12) % w + w) % w, y = noise(i * 311.7 + 9) * h;
      const twinkle = this.reducedMotion ? 1 : (Math.floor(time * 1.5 + i) % 7) ? 1 : 0;
      if (depth === 0) this.pixel(x, y, '#2e3c66');
      else if (depth === 1) this.pixel(x, y, twinkle ? '#6f84b5' : '#3a4a78');
      else { this.pixel(x, y, twinkle ? '#d9e4ff' : '#8798c6'); if (i % 11 === 0 && twinkle) this.spark(x, y, '#5c6c9c', 2); }
    }
  }

  drawInstruments(state, selfId, nowMs, active) {
    const counts=collectFleetCounts(state,selfId);
    const key=`${state.mode}:${selfId}:${this.width}:${this.height}:${GENERATOR_IDS.map(id=>counts[id]).join(',')}`;
    if(key!==this.fleetKey){
      for(const id of GENERATOR_IDS){
        const previous=this.instrumentCounts.get(id);
        if(previous!==undefined&&counts[id]>previous){
          this.purchaseTimes.set(id,nowMs);
          // A new purchase still lights up its own berth after the detail cap.
          for(let i=0;i<Math.min(8,counts[id]-previous);i++)this.purchaseBursts.push({id,index:counts[id]-1-i,at:nowMs});
        }
        this.instrumentCounts.set(id,counts[id]);
      }
      this.purchaseBursts=this.purchaseBursts.slice(-32);
      this.fleet=buildFleet(counts);
      this.fleet.units=this.fleet.units.map(unit=>({...unit,...fleetPosition(unit.id,unit.index,this.width,this.height),size:unit.tiny?7:18}));
      this.fleet.units.sort((a,b)=>Number(b.tiny)-Number(a.tiny)||a.y-b.y);
      this.fleetByType=new Map(GENERATOR_IDS.map(id=>[id,this.fleet.units.filter(unit=>unit.id===id)]));
      this.fleetKey=key;
      if(this.canvas.dataset){
        this.canvas.dataset.fleetOwned=String(this.fleet.totalOwned);
        this.canvas.dataset.fleetRendered=String(this.fleet.rendered);
        this.canvas.dataset.fleetAggregated=String(this.fleet.aggregated);
      }
    }
    const running=active&&!this.reducedMotion;
    this.running=running;
    // Beyond 768 individual silhouettes, a growing particulate field conveys
    // additional mass. The true holdings never cause an unbounded render loop.
    if(this.fleet.aggregated>0){
      const density=Math.min(192,Math.ceil(this.fleet.aggregated/16));
      this.ctx.globalAlpha=.28+Math.min(.55,Math.log1p(this.fleet.aggregated)/22);
      for(let i=0;i<density;i++){
        const id=GENERATOR_IDS[i%GENERATOR_IDS.length];
        const p=fleetPosition(id,10000+i,this.width,this.height);
        const drift=running?Math.floor(this.instrumentTime*.9+i)%3:1;
        this.pixel(p.x,p.y,FLEET_COLORS[id],drift===1?2:1,2);
      }
      this.ctx.globalAlpha=1;
    }
    for(const unit of this.fleet.units){
      const phase=running?(this.instrumentTime/(unit.id==='satellite'?5:3)+noise(unit.index*37+GENERATOR_IDS.indexOf(unit.id)))%1:.6;
      const rotation=['laser','probe'].includes(unit.id)?Math.atan2(this.height*.49-unit.y,this.width/2-unit.x):0;
      const bob=running&&!unit.tiny&&FLOATING_IDS.has(unit.id)?Math.round(Math.sin(this.instrumentTime*1.7+unit.index*1.3)):0;
      if(!unit.tiny)this.pixel(unit.x-7,unit.y+7,'#392923',15,3);
      drawGeneratorSprite(this.ctx,unit.id,unit.x-unit.size/2,unit.y-unit.size/2+bob,{phase,running,scale:unit.size/32,rotation});
      // Each collection cycle ends with a mote of gathered light leaving the machine.
      if(running&&!unit.tiny&&COLLECTOR_IDS.includes(unit.id)){
        const last=this.motePhase.get(unit.key);
        if(last!==undefined&&phase<last&&this.motes.length<MOTE_LIMIT)this.motes.push({x:unit.x+(noise(unit.index*5+phase)-.5)*8,y:unit.y-unit.size/2+bob,born:this.instrumentTime,color:FLEET_COLORS[unit.id]});
        this.motePhase.set(unit.key,phase);
      }
    }
    this.drawMotes();
    for(const purchase of this.purchaseBursts){
      const age=nowMs-purchase.at;
      if(age>1100)continue;
      const position=fleetPosition(purchase.id,purchase.index,this.width,this.height);
      const spread=this.reducedMotion?10:8+Math.floor(age/140);
      this.spark(position.x-spread,position.y-5,P.yellow,2);
      this.spark(position.x+spread,position.y+4,P.cream,2);
    }
    this.purchaseBursts=this.purchaseBursts.filter(p=>nowMs-p.at<1100);
    this.observeFire(state,selfId,nowMs,running);
    if(this.reducedMotion)this.shots=[];
    else this.drawShots();
  }

  /** Gathered-light motes rise and fade; bounded in count and lifetime, cleared under reduced motion. */
  drawMotes(){
    if(this.reducedMotion){this.motes=[];return;}
    const c=this.ctx;
    this.motes=this.motes.filter(mote=>this.instrumentTime-mote.born<MOTE_SECONDS);
    for(const mote of this.motes){
      const t=(this.instrumentTime-mote.born)/MOTE_SECONDS,y=mote.y-t*16,size=t<.5?2:1;
      c.globalAlpha=.9*(1-t);this.pixel(mote.x,y,mote.color,size,size);
      if(t<.3){c.globalAlpha=.5*(1-t);this.pixel(mote.x-1,y+1,P.cream,1,1);}
    }
    c.globalAlpha=1;
  }

  observeFire(state,selfId,nowMs,running){
    const people=fleetPlayers(state,selfId);
    const deltas=Object.fromEntries(ATTACK_IDS.map(id=>[id,0])),present=new Set();
    for(const player of people){
      let profiles=[];
      try{profiles=Game.getStats(player,state).autoProfiles||[];}catch{/* no effects before synchronization */}
      for(const profile of profiles){
        if(!ATTACK_IDS.includes(profile.id))continue;
        const key=`${state.mode}:${player.id}:${profile.id}`;present.add(key);
        const previous=this.attackCounters.get(key);
        if(previous!==undefined&&profile.shots>previous)deltas[profile.id]+=profile.shots-previous;
        this.attackCounters.set(key,profile.shots);
      }
    }
    for(const key of this.attackCounters.keys())if(!present.has(key))this.attackCounters.delete(key);
    if(!running)return;
    const soundCandidates=[];
    // The visual cap must also leave opportunities for quieter weapon types.
    const firingOrder=[...ATTACK_IDS].sort((a,b)=>(this.fireTimes.get(a)??-Infinity)-(this.fireTimes.get(b)??-Infinity));
    for(const id of firingOrder){
      const units=this.fleetByType.get(id)||[];
      if(!units.length||!deltas[id])continue;
      const count=Math.min(12,deltas[id],SHOT_LIMIT-this.shots.length);
      for(let i=0;i<count;i++){
        const cursor=this.fireCursor.get(id)||0,unit=units[cursor%units.length];
        this.fireCursor.set(id,cursor+1);
        this.shots.push({id,index:unit.index,size:unit.size,started:this.instrumentTime,duration:SHOT_DURATION[id],reached:false});
        if(i===0)soundCandidates.push({id,pan:clamp(unit.x/this.width*2-1,-1,1)});
      }
    }
    if(nowMs-this.lastSoundAt>=110){
      // Mix the least recently heard type among shots that actually started.
      // Catalogue order must not let fast clickers silence the larger weapons.
      const eligible=soundCandidates.filter(candidate=>nowMs-(this.fireTimes.get(candidate.id)??-Infinity)>=330);
      eligible.sort((a,b)=>(this.fireTimes.get(a.id)??-Infinity)-(this.fireTimes.get(b.id)??-Infinity));
      if(eligible.length){
        const chosen=eligible[0];this.lastSoundAt=nowMs;this.fireTimes.set(chosen.id,nowMs);
        this.onFire?.(chosen);
      }
    }
  }

  drawShots(){
    const c=this.effectsContext||this.ctx;
    c.save();c.imageSmoothingEnabled=false;
    const pixel=(x,y,color,w=1,h=w)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);};
    const line=(a,b,color,width=1,alpha=1)=>{c.globalAlpha=alpha;c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.globalAlpha=1;};
    for(const shot of this.shots){
      const age=this.instrumentTime-shot.started,progress=clamp(age/shot.duration,0,1);
      const position=fleetPosition(shot.id,shot.index,this.width,this.height);
      const geometry=shotGeometry(position,this.width,this.height,progress,{barrel:shot.id==='laser'?shot.size*.46:shot.id==='probe'?shot.size*.48:0});
      const color=FLEET_COLORS[shot.id],point=geometry.point;
      shot.geometry=geometry;
      if(shot.id==='laser'){
        // Charge is drawn at the barrel, then a continuous beam reaches center.
        const beamProgress=clamp(progress*2,0,1);
        const tip=shotGeometry(position,this.width,this.height,beamProgress,{barrel:shot.size*.46}).point;
        shot.geometry={...geometry,point:tip,progress:beamProgress};
        line(geometry.source,tip,P.red,5,.65);line(geometry.source,tip,P.yellow,2,.85);line(geometry.source,tip,P.cream,1);
        pixel(geometry.source.x-2,geometry.source.y-2,P.cream,4,4);
      }else if(shot.id==='gate'){
        line(geometry.source,point,P.purple,3,.45);
        line(geometry.source,point,P.sky,1,.8);
        for(let i=0;i<3;i++){
          const p=shotGeometry(position,this.width,this.height,Math.max(0,progress-i*.1)).point;
          pixel(p.x-2,p.y-2,i%2?P.sky:P.paper,4,4);
        }
      }else if(shot.id==='mouse'){
        // The arrow's pointed pixel, rather than its center, touches the core.
        const x=point.x,y=point.y;
        for(let row=0;row<7;row++)pixel(x,y+row,P.ink,Math.min(6,row+1),1);
        for(let row=1;row<5;row++)pixel(x+1,y+row,P.cream,Math.min(4,row),1);
        pixel(x+3,y+6,P.ink,3,3);pixel(x+4,y+6,P.paper,1,2);
        if(progress>.85){line({x:x-5,y:y-3},{x:x-8,y:y-5},P.cream);line({x:x+2,y:y-6},{x:x+2,y:y-9},P.cream);}
      }else{
        for(let i=3;i>0;i--){const trail=shotGeometry(position,this.width,this.height,Math.max(0,progress-i*.06)).point;pixel(trail.x,trail.y,color,i===1?2:1);}
        pixel(point.x-2,point.y-2,P.ink,5,5);pixel(point.x-1,point.y-1,color,3,3);pixel(point.x,point.y,P.cream);
      }
      const arrives=shot.id==='laser'?progress>=.5:progress>=1;
      if(arrives){
        const target=geometry.target;
        if(!shot.reached){
          shot.reached=true;shot.arrivedAt=this.instrumentTime;
          this.impactUntil=(this.lastFrame??0)+SHOT_IMPACT_DURATION*1000;
          this.completedShots.push({id:shot.id,source:{...geometry.source},target:{...target},point:{...target},reached:true});
        }
        // Hold a distinct hit over the orb for a full 240ms after arrival, even
        // when a slow frame jumped past the projectile's original travel time.
        const impactAge=this.instrumentTime-shot.arrivedAt;
        const spread=3+Math.floor(clamp(impactAge/SHOT_IMPACT_DURATION,0,1)*3);
        c.globalAlpha=.25;pixel(target.x-4,target.y-4,color,9,9);c.globalAlpha=1;
        pixel(target.x-spread,target.y,P.cream,spread*2+1,1);pixel(target.x,target.y-spread,color,1,spread*2+1);
        pixel(target.x-1,target.y-1,P.cream,3,3);
        // Surface sparks sit above the native core image, at the entry point.
        const dx=geometry.source.x-target.x,dy=geometry.source.y-target.y,length=Math.hypot(dx,dy)||1;
        const surface={x:target.x+dx/length*19,y:target.y+dy/length*19};
        pixel(surface.x-2,surface.y,P.cream,5,1);pixel(surface.x,surface.y-2,color,1,5);
      }
    }
    c.restore();
    // Never discard a shot before drawing its exact endpoint at least once.
    this.shots=this.shots.filter(shot=>!shot.reached||this.instrumentTime-shot.arrivedAt<SHOT_IMPACT_DURATION);
    this.completedShots=this.completedShots.slice(-32);
  }

  getFleetDiagnostics(){
    return {owned:{...this.fleet.owned},totalOwned:this.fleet.totalOwned,detailed:this.fleet.detailed,tiny:this.fleet.tiny,
      rendered:this.fleet.rendered,aggregated:this.fleet.aggregated,activeShots:this.shots.length,
      activeShatters:this.shatters.length,shatterShards:this.reducedMotion?0:this.shatters.reduce((sum,burst)=>sum+burst.shards.length,0),shatterRays:this.reducedMotion?0:this.shatters.length*12,
      shots:this.shots.filter(s=>s.geometry).map(s=>({id:s.id,...s.geometry,source:{...s.geometry.source},target:{...s.geometry.target},point:{...s.geometry.point},reached:s.reached})),
      completedShots:this.completedShots.map(s=>({...s,source:{...s.source},target:{...s.target},point:{...s.point}})),
      center:{x:this.width/2,y:this.height*.49},reducedMotion:this.reducedMotion,running:Boolean(this.running)};
  }

  drawPlayer(player, position, selfId) {
    const c = this.ctx;
    const { x, y } = position;
    const own = player.id === selfId;
    const size = this.cssWidth < 440 ? 7 : 8;
    this.pixel(x - size - 2, y - size - 2, P.ink, size * 2 + 4, size * 2 + 4);
    this.pixel(x - size - 1, y - size - 1, own ? P.yellow : P.paper, size * 2 + 2, size * 2 + 2);
    this.pixel(x - size, y - size, P.wood, size * 2, size * 2);
    const image = this.getAvatar(player.avatarUrl);
    if (image?.complete && image.naturalWidth > 0) {
      const crop = Math.min(image.naturalWidth, image.naturalHeight);
      c.drawImage(image, (image.naturalWidth - crop) / 2, (image.naturalHeight - crop) / 2, crop, crop,
        Math.round(x - size), Math.round(y - size), size * 2, size * 2);
    } else {
      // A miniature farmer badge until a real Refract avatar is available.
      this.pixel(x - 4, y - 5, P.ink, 8, 9);
      this.pixel(x - 3, y - 4, P.paper, 6, 7);
      this.pixel(x - 5, y - 5, own ? P.sage : P.sky, 10, 3);
      this.pixel(x - 3, y - 7, own ? P.sage : P.sky, 6, 2);
      this.pixel(x - 2, y - 1, P.ink); this.pixel(x + 2, y - 1, P.ink);
      this.pixel(x - 3, y + 3, own ? P.green : P.blue, 7, 4);
    }
    const raw = own ? 'YOU' : String(player.name ?? 'PILOT').slice(0, 9).toUpperCase();
    const label = player.bot ? `${raw} BOT` : raw;
    c.font = font(4); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const textWidth = Math.ceil(c.measureText(label).width) + 5;
    const labelX = clamp(x, textWidth / 2 + 3, this.width - textWidth / 2 - 3);
    this.pixel(labelX - textWidth / 2, y + size + 3, P.ink, textWidth, 8);
    c.fillStyle = own ? P.yellow : P.paper;
    c.fillText(label, Math.round(labelX), Math.round(y + size + 9));
    if (own) { this.pixel(x + size - 1, y - size - 4, P.ink, 5, 5); this.pixel(x + size, y - size - 3, P.yellow, 3, 3); }
  }

  getAvatar(url) {
    if (typeof url !== 'string' || !url || url.length > 4096) return null;
    if (this.images.has(url)) return this.images.get(url);
    try {
      const parsed = new URL(url, document.baseURI);
      if (!['https:', 'http:'].includes(parsed.protocol)) return null;
      const image = new Image(); image.referrerPolicy = 'no-referrer'; image.src = parsed.href;
      if (this.images.size >= 24) this.images.delete(this.images.keys().next().value);
      this.images.set(url, image); return image;
    } catch { return null; }
  }

  destroy() {
    this.destroyed = true; this.resizeObserver.disconnect();
    this.media?.removeEventListener?.('change', this.onMotionChange);
    this.images.clear(); this.positions.clear(); this.instrumentCounts.clear(); this.purchaseTimes.clear();
    this.effects?.remove();this.attackCounters.clear();this.fleetByType.clear();this.fireCursor.clear();this.fireTimes.clear();
    this.shots=[];this.purchaseBursts=[];this.completedShots=[];this.onFire=null;
    this.shatters=[];
    this.particles = []; this.floats = [];
  }
}
