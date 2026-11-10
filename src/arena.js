import { drawGeneratorSprite, orbAppearance, PIXEL_PALETTE as P } from './icons.js';
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
    this.lastShatterAt = nowMs;
    const x = this.width / 2, y = this.height * 0.49;
    if (!this.reducedMotion) {
      const palette = [this.orbPalette.primary, this.orbPalette.accent, this.orbPalette.shade, P.cream];
      for (let i = 0; i < 16; i++) {
        const angle = i * TAU / 16 + Math.random() * 0.2;
        const speed = 24 + Math.random() * 28;
        this.particles.push({ x: x + Math.cos(angle) * 21, y: y + Math.sin(angle) * 21,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 18,
          life: 1.25, color: palette[i % palette.length], size: i % 3 === 0 ? 4 : 2, shard: true });
      }
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
      return { ...orb, identity: state.mode === 'coop' ? 'coop' : player.id };
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
    const active = state.phase === 'round';
    const orb = this.currentOrb(state, selfId);
    this.observeOrb(orb, nowMs);
    if (active && !this.reducedMotion) this.instrumentTime += dt;
    const visualTime = this.reducedMotion ? 3 : nowMs / 1000;
    const w = this.width, h = this.height;
    c.imageSmoothingEnabled = false;
    c.globalAlpha = 1;
    c.fillStyle = '#613a3a'; c.fillRect(0, 0, w, h);

    // Felt texture and a stitched border make this a game board, not outer space.
    for (let i = 0; i < 115; i++) {
      this.pixel(noise(i * 127.1 + 31) * w, noise(i * 311.7 + 9) * h, i % 4 ? '#684040' : '#573333');
    }
    for (let x = 8; x < w - 8; x += 7) { this.pixel(x, 5, '#966957', 3, 1); this.pixel(x, h - 6, '#966957', 3, 1); }
    for (let y = 12; y < h - 8; y += 7) { this.pixel(5, y, '#966957', 1, 3); this.pixel(w - 6, y, '#966957', 1, 3); }
    this.drawGardenCorner(12, h - 24, false);
    this.drawGardenCorner(w - 39, 14, true);
    this.pixel(15, 15, '#442c28', 8, 5); this.pixel(16, 14, P.wood, 6, 4);
    this.pixel(17, 14, P.yellow, 1, 2);

    // Discrete stitched orbital rings preserve the tilted Refract voice stage.
    for (let lane = 0; lane < RADII.length; lane++) {
      const samples = Math.round(this.width * (1.5 + lane * 0.4));
      for (let i = 0; i < samples; i++) {
        if (i % 8 > 3) continue;
        const p = this.project(i / samples * TAU, lane);
        this.pixel(p.x, p.y, lane === 1 ? '#bf9875' : '#92634f');
      }
      for (let i = 0; i < 8; i++) {
        const p = this.project(i * TAU / 8, lane);
        this.pixel(p.x - 1, p.y - 1, '#d1ae7e', 2, 2);
      }
    }

    // A little engraved stand frames the separate, keyboard-accessible core.
    const cx = Math.round(w / 2), cy = Math.round(h * 0.49);
    this.pixel(cx - 24, cy + 23, '#442d2b', 48, 8);
    this.pixel(cx - 20, cy + 29, '#4f312e', 40, 3);
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

  drawGardenCorner(x, y, flower) {
    this.pixel(x + 1, y + 8, '#392923', 27, 8);
    this.pixel(x, y + 7, '#80523b', 26, 6);
    this.pixel(x + 3, y + 10, '#a46c46', 21, 2);
    for (let i = 0; i < 4; i++) {
      const px = x + 3 + i * 6;
      this.pixel(px, y + 3 - i % 2, P.green, 2, 6);
      this.pixel(px - 2, y + 4, P.sage, 2, 2);
      this.pixel(px + 2, y + 2, P.leaf, 2, 2);
      if (flower && i % 2 === 0) {
        this.pixel(px - 1, y, P.yellow, 4, 3); this.pixel(px, y + 1, P.orange, 2, 1);
      }
    }
  }

  drawInstruments(state, selfId, nowMs, active) {
    const people = state.mode === 'coop' ? state.players ?? [] : (state.players ?? []).filter((player) => player.id === selfId);
    const counts = { mote: 0, satellite: 0, prism: 0, star: 0, nova: 0 };
    let autoClicks = 0;
    for (const player of people) {
      for (const id of Object.keys(counts)) counts[id] += Math.max(0, Number(player.generators?.[id]) || 0);
      autoClicks += Math.max(0, Number(player.autoClicks) || 0);
    }
    if (this.lastAutoClicks !== null && autoClicks > this.lastAutoClicks && active) this.autoPulseAt = nowMs;
    this.lastAutoClicks = autoClicks;
    const running = active && !this.reducedMotion;
    const anchors = { mote: 3.48, satellite: 2.18, prism: 5.6, star: 0.52, nova: 4.55 };
    const periods = { mote: 2, satellite: 5, prism: 3.5, star: 6, nova: 5 };
    const colors = { mote: P.yellow, satellite: P.sky, prism: P.cream, star: P.purple, nova: P.yellow };
    for (const [id, count] of Object.entries(counts)) {
      const previous = this.instrumentCounts.get(id);
      if (previous !== undefined && count > previous) this.purchaseTimes.set(id, nowMs);
      this.instrumentCounts.set(id, count);
      if (count < 1) { this.purchaseTimes.delete(id); continue; }
      const position = this.project(anchors[id], 2);
      const x = clamp(position.x - 16, 8, this.width - 40), y = clamp(position.y - 16, 9, this.height - 39);
      const center = { x: x + 16, y: y + 16 };
      const phase = this.reducedMotion ? 0.6 : this.instrumentTime / periods[id] % 1;
      // Every type gets one readable 32px miniature; big counts don't crowd the board.
      this.pixel(x - 2, y + 28, '#392923', 36, 6);
      this.pixel(x, y + 28, '#80523b', 32, 4);
      if (id === 'satellite') {
        this.pixel(x - 2, y + 27, P.sage, 5, 2); this.pixel(x + 29, y + 26, P.leaf, 4, 3);
      }
      drawGeneratorSprite(this.ctx, id, x, y, { phase, running });
      if (count > 1) {
        this.ctx.font = font(4); this.ctx.textAlign = 'right';
        const text = count >= 1000 ? '1k+' : String(count);
        const size = Math.ceil(this.ctx.measureText(text).width) + 4;
        this.pixel(x + 30 - size, y + 28, P.ink, size, 7);
        this.ctx.fillStyle = P.paper; this.ctx.fillText(text, x + 28, y + 33);
      }
      if (running) {
        const recentTap = id === 'mote' && nowMs - this.autoPulseAt < 350;
        const tapPhase = recentTap ? (nowMs - this.autoPulseAt) / 350 : phase / 0.18;
        if (id === 'mote' && (phase < 0.18 || recentTap)) this.drawTransfer(center, colors[id], tapPhase);
        if (id === 'satellite' && phase > 0.8) this.drawTransfer(center, colors[id], (phase - 0.8) / 0.2);
        if (id === 'prism' && phase > 0.85) this.drawTransfer(center, colors[id], (phase - 0.85) / 0.15);
      }
      const purchaseAge = nowMs - (this.purchaseTimes.get(id) ?? -Infinity);
      if (purchaseAge >= 0 && purchaseAge < 900) {
        const step = this.reducedMotion ? 0 : Math.floor(purchaseAge / 250);
        this.spark(x - 2 - step, y + 5, P.yellow, 2);
        this.spark(x + 34 + step, y + 17, P.cream, 2);
      }
    }
  }

  drawTransfer(source, color, progress) {
    const p = clamp(progress, 0, 1);
    const dx = this.width / 2 - source.x, dy = this.height * 0.49 - source.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 36) return;
    const fraction = 1 - 28 / distance;
    const x = source.x + dx * fraction * p, y = source.y + dy * fraction * p;
    this.pixel(x - 1, y - 1, P.ink, 5, 5);
    this.pixel(x, y, color, 3, 3);
    this.pixel(x, y, P.cream, 1, 1);
    for (let i = 1; i < 4; i++) {
      const trail = Math.max(0, p - i * 0.06);
      this.pixel(source.x + dx * fraction * trail, source.y + dy * fraction * trail, color);
    }
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
    this.particles = []; this.floats = [];
  }
}
