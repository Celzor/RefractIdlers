/**
 * Refract Idlers orbital stage.
 * Adapted from RogueRefract's OrbitArena (AGPL-3.0-only): tilted projection,
 * deterministic starfield, spectrum, avatar rendering and burst particles.
 * The accessible HTML core button is supplied by the application at 50%, 49%.
 */
const TAU = Math.PI * 2;
const SPECTRUM = ['#fc6d9d', '#ffad69', '#ffe39a', '#b7f7b1', '#7ee8f2', '#9b9bff', '#d99dff'];
const RADII = [0.58, 0.76, 0.94, 1.12];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const safeColor = (value, fallback = '#87e6c3') => /^#[\da-f]{6}$/i.test(value) ? value : fallback;
const noise = (value) => ((Math.sin(value) * 43758.5453) % 1 + 1) % 1;

export class OrbitArena {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 600;
    this.height = 430;
    this.particles = [];
    this.floats = [];
    this.ripples = [];
    this.images = new Map();
    this.positions = new Map();
    this.instrumentCounts = new Map();
    this.upgradeFlashes = new Map();
    this.lastAutoClicks = null;
    this.autoPulseAt = -Infinity;
    this.instrumentTime = 0;
    this.lastFrame = null;
    this.destroyed = false;
    this.media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = this.media?.matches ?? false;
    this.onMotionChange = (event) => { this.reducedMotion = event.matches; };
    this.media?.addEventListener?.('change', this.onMotionChange);
    this.resizeObserver = new ResizeObserver(([entry]) => this.resize(entry.contentRect.width, entry.contentRect.height));
    this.resizeObserver.observe(canvas);
    this.stars = Array.from({ length: 96 }, (_, i) => ({
      x: noise(i * 127.1 + 31), y: noise(i * 311.7 + 9),
      r: i % 11 === 0 ? 1.3 : 0.65, color: i % 5 ? '#bed4dd' : '#b4f1d2',
    }));
  }

  resize(width, height) {
    if (this.destroyed) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  project(angle, lane = 2, extra = 1) {
    const radius = RADII[clamp(lane, 0, RADII.length - 1)] * extra;
    const rx = this.width * 0.38 * radius;
    const ry = Math.min(this.height * 0.32, this.width * 0.24) * radius;
    const x = Math.cos(angle) * rx;
    return { x: this.width / 2 + x, y: this.height * 0.49 + Math.sin(angle) * ry - x * 0.17 };
  }

  orbitPath(lane, from = 0, to = TAU, steps = 140) {
    const c = this.ctx;
    c.beginPath();
    for (let i = 0; i <= steps; i++) {
      const p = this.project(from + (to - from) * i / steps, lane);
      if (!i) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
    }
  }

  burst({ amount = 0, critical = false, color = '#99f1cd' } = {}) {
    if (this.destroyed) return;
    const tint = critical ? '#ffe39a' : safeColor(color);
    const x = this.width / 2, y = this.height * 0.49;
    if (!this.reducedMotion) {
      for (let i = 0, count = critical ? 26 : 12; i < count; i++) {
        const angle = Math.random() * TAU;
        const velocity = 30 + Math.random() * (critical ? 125 : 85);
        this.particles.push({ x: x + Math.cos(angle) * 54, y: y + Math.sin(angle) * 54,
          vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
          life: 1, color: i % 3 === 0 ? SPECTRUM[i % SPECTRUM.length] : tint });
      }
      this.ripples.push({ life: 1, color: tint });
    }
    if (Number.isFinite(amount) && amount > 0) {
      this.floats.push({ x: x + (this.reducedMotion ? 0 : (Math.random() - 0.5) * 60),
        y: y - 64, life: 1, color: tint, critical,
        text: `${critical ? 'CRIT ' : ''}+${amount >= 1000 ? `${(amount / 1000).toFixed(1)}k` : Number(amount.toFixed(1))}` });
    }
    this.particles = this.particles.slice(-160);
    this.ripples = this.ripples.slice(-5);
    this.floats = this.floats.slice(-12);
  }

  render(state, selfId, nowMs) {
    const c = this.ctx;
    if (!c || this.destroyed || !state) return;
    const { width: w, height: h } = this;
    const dt = clamp((nowMs - (this.lastFrame ?? nowMs)) / 1000, 0, 0.05);
    this.lastFrame = nowMs;
    const time = this.reducedMotion ? 8 : nowMs / 1000;
    const active = state.phase === 'round';
    const surge = active && state.remaining <= 10;
    const centerX = w / 2, centerY = h * 0.49;
    c.clearRect(0, 0, w, h);

    const glow = c.createRadialGradient(centerX, centerY, 10, centerX, centerY, w * 0.49);
    glow.addColorStop(0, surge ? '#b99a3625' : '#62d8bd1b');
    glow.addColorStop(0.5, '#24566a0d');
    glow.addColorStop(1, '#13212a00');
    c.fillStyle = glow; c.fillRect(0, 0, w, h);

    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];
      c.globalAlpha = 0.12 + (this.reducedMotion ? 0.14 : (Math.sin(time * 0.45 + i) + 1) * 0.1);
      c.fillStyle = star.color;
      c.fillRect(star.x * w, star.y * h, star.r, star.r);
      if (i % 23 === 0) {
        c.globalAlpha *= 0.45;
        c.fillRect(star.x * w - 2.5, star.y * h + 0.5, 6, 0.5);
        c.fillRect(star.x * w + 0.5, star.y * h - 2.5, 0.5, 6);
      }
    }
    c.globalAlpha = 1;

    for (let lane = RADII.length - 1; lane >= 0; lane--) {
      this.orbitPath(lane);
      c.strokeStyle = lane === 2 ? '#7ed9c23a' : '#8198ab29';
      c.lineWidth = lane === 2 ? 1 : 0.7;
      c.stroke();
      for (let j = 0; j < 60; j++) {
        const p = this.project(j / 60 * TAU, lane);
        c.fillStyle = j % 5 === 0 ? '#a9d3ce40' : '#8eaaa71a';
        c.fillRect(p.x - 0.75, p.y - 0.75, j % 5 === 0 ? 1.5 : 1, j % 5 === 0 ? 1.5 : 1);
      }
      const start = time * (0.075 + lane * 0.02) + lane * 1.9;
      this.orbitPath(lane, start, start + 0.6, 24);
      c.strokeStyle = `${SPECTRUM[(lane + 3) % SPECTRUM.length]}55`;
      c.lineWidth = 1.5;
      c.stroke();
    }

    // RogueRefract's outward spectrum rays now carry light toward the core.
    for (let i = 0; i < 7; i++) {
      const angle = i * TAU / 7 + time * 0.06;
      const end = this.project(angle, 3, 0.98);
      const color = SPECTRUM[i];
      const gradient = c.createLinearGradient(centerX, centerY, end.x, end.y);
      gradient.addColorStop(0, `${color}38`);
      gradient.addColorStop(0.7, `${color}0c`);
      gradient.addColorStop(1, `${color}00`);
      c.beginPath(); c.moveTo(centerX, centerY); c.lineTo(end.x, end.y);
      c.strokeStyle = gradient; c.lineWidth = 0.8; c.stroke();
      if (active) {
        const travel = (time * (surge ? 0.7 : 0.3) + i * 0.17) % 1;
        const x = end.x + (centerX - end.x) * travel;
        const y = end.y + (centerY - end.y) * travel;
        if (Math.hypot(x - centerX, y - centerY) > 59) {
          c.globalAlpha = 0.6; c.fillStyle = color;
          c.beginPath(); c.arc(x, y, 1.5, 0, TAU); c.fill();
          c.globalAlpha = 1;
        }
      }
    }

    if (active && !this.reducedMotion) this.instrumentTime += dt;
    this.drawInstruments(state, selfId, nowMs, active);

    // Core halo aligns with the semantic HTML harvesting button.
    const halo = c.createRadialGradient(centerX, centerY, 48, centerX, centerY, 110);
    halo.addColorStop(0, surge ? '#ffcf7224' : '#9af1d323');
    halo.addColorStop(1, '#9af1d300');
    c.fillStyle = halo; c.beginPath(); c.arc(centerX, centerY, 110, 0, TAU); c.fill();
    c.strokeStyle = surge ? '#ffe39a40' : '#a6ead02b'; c.lineWidth = 0.7;
    c.beginPath(); c.arc(centerX, centerY, 64, 0, TAU); c.stroke();
    c.setLineDash([1, 7]); c.strokeStyle = '#a6ead036';
    c.beginPath(); c.arc(centerX, centerY, 72, 0, TAU); c.stroke(); c.setLineDash([]);

    const players = (state.players ?? []).slice(0, 8);
    const visibleIds = new Set(players.map((player) => player.id));
    for (const id of this.positions.keys()) if (!visibleIds.has(id)) this.positions.delete(id);
    const positioned = players.map((player, index) => {
      const lane = [2, 3, 1, 3, 2, 1, 3, 2][index];
      const angle = index * TAU / Math.max(1, players.length) + time * (0.12 + index % 3 * 0.025) - 0.45;
      const position = this.project(angle, lane);
      this.positions.set(player.id, position);
      const color = safeColor(player.color, SPECTRUM[(index + 3) % SPECTRUM.length]);
      this.orbitPath(lane, angle - 0.48, angle, 24);
      c.strokeStyle = `${color}65`; c.lineWidth = player.id === selfId ? 2.5 : 1.8; c.lineCap = 'round'; c.stroke();
      c.lineCap = 'butt';
      return { player, position, color };
    }).sort((a, b) => a.position.y - b.position.y);
    for (const { player, position, color } of positioned) this.drawPlayer(player, position, color, selfId);

    for (const ripple of this.ripples) {
      ripple.life -= dt * 2;
      c.globalAlpha = Math.max(0, ripple.life * 0.45);
      c.strokeStyle = ripple.color; c.lineWidth = 1;
      c.beginPath(); c.arc(centerX, centerY, 58 + (1 - ripple.life) * 55, 0, TAU); c.stroke();
    }
    this.ripples = this.ripples.filter((ripple) => ripple.life > 0);
    for (const particle of this.particles) {
      particle.life -= dt * 1.6;
      particle.x += particle.vx * dt; particle.y += particle.vy * dt;
      c.globalAlpha = Math.max(0, particle.life);
      c.fillStyle = particle.color; c.fillRect(particle.x, particle.y, 2, 2);
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    for (const float of this.floats) {
      float.life -= dt * 0.85;
      if (!this.reducedMotion) float.y -= dt * 32;
      c.globalAlpha = clamp(float.life * 2, 0, 1);
      c.fillStyle = float.color; c.textAlign = 'center';
      c.font = `${float.critical ? 800 : 700} ${float.critical ? 18 : 15}px system-ui, sans-serif`;
      c.fillText(float.text, float.x, float.y);
    }
    this.floats = this.floats.filter((float) => float.life > 0);
    c.globalAlpha = 1;
  }

  /** Owned upgrades become small working instruments, capped independently of income. */
  drawInstruments(state, selfId, nowMs, active) {
    const c = this.ctx;
    const people = state.mode === 'coop' ? state.players ?? []
      : (state.players ?? []).filter((player) => player.id === selfId);
    const counts = { mote: 0, satellite: 0, prism: 0, star: 0, nova: 0 };
    let autoClicks = 0;
    for (const person of people) {
      for (const id of Object.keys(counts)) counts[id] += Math.max(0, Number(person.generators?.[id]) || 0);
      autoClicks += Math.max(0, Number(person.autoClicks) || 0);
    }
    if (this.lastAutoClicks !== null && autoClicks > this.lastAutoClicks && active) this.autoPulseAt = nowMs;
    this.lastAutoClicks = autoClicks;
    for (const [id, count] of Object.entries(counts)) {
      const previous = this.instrumentCounts.get(id);
      if (previous !== undefined && count > previous) this.upgradeFlashes.set(id, nowMs);
      if (!count) this.upgradeFlashes.delete(id);
      this.instrumentCounts.set(id, count);
    }
    const moving = active && !this.reducedMotion;
    // Stable positions between rounds also make each new purchase easy to spot.
    const rotation = this.reducedMotion ? 0 : this.instrumentTime * 0.025;
    const progress = (period, offset = 0) => this.reducedMotion ? 0.45 : (this.instrumentTime / period + offset) % 1;
    const small = this.width < 430;
    const scale = small ? 0.82 : 1;
    const begin = (id, position, color) => {
      c.save(); c.translate(position.x, position.y); c.scale(scale, scale);
      c.strokeStyle = color; c.fillStyle = '#102129'; c.lineWidth = 1;
      c.lineCap = 'round'; c.lineJoin = 'round';
      const age = nowMs - (this.upgradeFlashes.get(id) ?? -Infinity);
      if (age >= 0 && age < 1100) {
        c.save(); c.globalAlpha = this.reducedMotion ? 0.3 : (1 - age / 1100) * 0.6;
        c.strokeStyle = color;
        c.beginPath(); c.arc(0, 0, this.reducedMotion ? 20 : 17 + age / 80, 0, TAU); c.stroke();
        c.restore();
      }
    };

    // One representative drone per unit, capped at three. The tip sends one
    // quiet beam on its two-second cycle; actual automatic taps also cue it.
    for (let i = 0; i < Math.min(3, counts.mote); i++) {
      const position = this.project(0.15 + i * 1.9 + rotation, 2);
      const phase = progress(2, i / 3);
      const confirmedTap = i === 0 && nowMs - this.autoPulseAt < 240;
      const tap = moving && (phase < 0.16 || confirmedTap);
      if (tap) this.drawTransfer(position, '#a6eed5', clamp(confirmedTap ? (nowMs - this.autoPulseAt) / 240 : phase / 0.16, 0, 1), 0.48);
      begin('mote', position, '#a6eed5');
      c.rotate(-0.17);
      c.beginPath(); c.moveTo(-5, -6); c.lineTo(5, -6); c.lineTo(8, -2); c.lineTo(8, 4);
      c.lineTo(3, 7); c.lineTo(-3, 7); c.lineTo(-8, 4); c.lineTo(-8, -2); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = '#8bc6b2'; c.globalAlpha = 0.75;
      c.beginPath(); c.moveTo(-8, -2); c.lineTo(-12, -2); c.lineTo(-14, 2); c.lineTo(-10, 4);
      c.moveTo(8, -2); c.lineTo(12, -2); c.lineTo(14, 2); c.lineTo(10, 4); c.stroke();
      c.globalAlpha = 1; c.fillStyle = tap ? '#d7ffec' : '#72bba3';
      c.shadowColor = '#a6eed5'; c.shadowBlur = tap ? 9 : 0;
      c.beginPath(); c.arc(0, 0, tap ? 2.8 : 2, 0, TAU); c.fill(); c.shadowBlur = 0;
      c.strokeStyle = '#a6eed5'; c.beginPath(); c.moveTo(0, 8); c.lineTo(0, tap ? 12 : 10); c.stroke();
      c.restore();
    }

    // Farm pods cradle three growing light orbs. Harvesting moves a single
    // orb toward the core, then the cultivation cycle starts over.
    for (let i = 0; i < Math.min(2, counts.satellite); i++) {
      const position = this.project(2.6 + i * 2.5 + rotation, 3);
      const phase = progress(5, i * 0.46);
      if (moving && phase > 0.8) this.drawTransfer(position, '#a6caef', (phase - 0.8) / 0.2, 0.6);
      begin('satellite', position, '#a6caef');
      c.rotate(-0.17);
      c.beginPath(); c.ellipse(0, 7, 15, 4.5, 0, 0, TAU); c.fill(); c.stroke();
      c.globalAlpha = 0.5; c.beginPath(); c.arc(0, -2, 13, Math.PI * 1.02, TAU * 0.99); c.stroke();
      c.globalAlpha = 1;
      for (let j = 0; j < 3; j++) {
        const growing = this.reducedMotion ? 0.6 : (phase + j * 0.16) % 1;
        const orbSize = 1.8 + Math.min(1, growing / 0.75) * (j === 1 ? 3.3 : 1.8);
        const x = (j - 1) * 8, y = j === 1 ? -5 : 1;
        c.globalAlpha = growing > 0.8 ? 1 - (growing - 0.8) / 0.2 : 0.85;
        c.fillStyle = '#c3e6ff'; c.shadowColor = '#a6caef'; c.shadowBlur = moving ? 6 : 0;
        c.beginPath(); c.arc(x, y, orbSize, 0, TAU); c.fill();
        c.shadowBlur = 0; c.strokeStyle = '#e2f4ff'; c.lineWidth = 0.7; c.stroke();
        c.fillStyle = '#effaff'; c.beginPath(); c.arc(x - orbSize * 0.25, y - orbSize * 0.3, 0.9, 0, TAU); c.fill();
      }
      c.restore();
    }

    // Three collector segments glint in sequence across the array surface.
    for (let i = 0; i < Math.min(2, counts.prism); i++) {
      const position = this.project(4.1 + i * 2.7 + rotation, 3);
      const phase = progress(3.5, i * 0.5);
      if (moving && phase > 0.78) this.drawTransfer(position, '#f4d99b', (phase - 0.78) / 0.22, 0.33);
      begin('prism', position, '#e5c788');
      c.transform(1, 0.13, -0.23, 1, 0, 0);
      c.beginPath(); c.roundRect(-15, -10, 30, 19, 2); c.fill(); c.stroke();
      for (let j = 0; j < 3; j++) {
        const glow = moving ? Math.max(0, 1 - Math.abs(phase * 4 - j - 0.5) / 0.7) : 0.2;
        c.fillStyle = `rgba(245,211,146,${0.08 + glow * 0.22})`;
        c.fillRect(-12 + j * 8.5, -7, 6, 13);
        c.strokeStyle = '#a5916055'; c.lineWidth = 0.5;
        c.strokeRect(-12 + j * 8.5, -7, 6, 13);
        c.beginPath(); c.moveTo(-12 + j * 8.5, -0.5); c.lineTo(-6 + j * 8.5, -0.5); c.stroke();
      }
      c.strokeStyle = '#e5c788'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, 10); c.lineTo(0, 14); c.moveTo(-5, 14); c.lineTo(5, 14); c.stroke();
      c.restore();
    }

    // Refractometers inspect a prism with a rotating scanner; their actual
    // output multiplier is applied only by the simulation.
    for (let i = 0; i < Math.min(2, counts.star); i++) {
      const position = this.project(1.35 + i * 3 + rotation, 3);
      const phase = progress(7, i * 0.5);
      begin('star', position, '#d2b5f0');
      c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.fill();
      c.strokeStyle = '#c1a0e05c'; c.stroke();
      c.strokeStyle = '#dfc6f7'; c.beginPath(); c.arc(0, 0, 13, phase * TAU, phase * TAU + 1.2); c.stroke();
      c.fillStyle = '#a282c91f'; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 11, phase * TAU, phase * TAU + 0.65); c.closePath(); c.fill();
      c.strokeStyle = '#cdb0e9'; c.fillStyle = '#332740';
      c.beginPath(); c.moveTo(0, -7); c.lineTo(7, 6); c.lineTo(-7, 6); c.closePath(); c.fill(); c.stroke();
      c.lineWidth = 0.6; c.beginPath(); c.moveTo(0, -7); c.lineTo(1, 1); c.lineTo(7, 6); c.moveTo(1, 1); c.lineTo(-7, 6); c.stroke();
      c.globalAlpha = 0.65;
      c.beginPath(); c.moveTo(-19, 0); c.lineTo(-5, 0); c.stroke();
      for (let j = -1; j <= 1; j++) {
        c.strokeStyle = ['#9edbd4', '#ddbeeb', '#eed194'][j + 1];
        c.beginPath(); c.moveTo(5, 0); c.lineTo(19, j * 5); c.stroke();
      }
      c.restore();
    }

    if (counts.nova > 0) {
      const position = this.project(5.3 + rotation, 2);
      const phase = progress(6);
      begin('nova', position, '#ffd4a0');
      const radius = 6 + (moving ? Math.sin(phase * TAU) * 0.5 : 0);
      const halo = c.createRadialGradient(0, 0, 3, 0, 0, 24);
      halo.addColorStop(0, '#ffe0ad5c'); halo.addColorStop(1, '#ffcb8b00');
      c.fillStyle = halo; c.beginPath(); c.arc(0, 0, 24, 0, TAU); c.fill();
      c.strokeStyle = '#ffce9b70';
      c.beginPath(); c.ellipse(0, 0, 17, 8, -0.45, 0, TAU); c.stroke();
      c.fillStyle = '#fce2b7'; c.shadowColor = '#ffd099'; c.shadowBlur = 10;
      c.beginPath(); c.arc(0, 0, radius, 0, TAU); c.fill(); c.shadowBlur = 0;
      c.fillStyle = '#fff5dc'; c.beginPath(); c.arc(-1.5, -1.8, 2.3, 0, TAU); c.fill();
      c.restore();
    }
  }

  drawTransfer(source, color, progress, opacity = 0.4) {
    const c = this.ctx;
    const dx = this.width / 2 - source.x, dy = this.height * 0.49 - source.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 75) return;
    const end = { x: source.x + dx * (1 - 59 / distance), y: source.y + dy * (1 - 59 / distance) };
    c.save();
    const beam = c.createLinearGradient(source.x, source.y, end.x, end.y);
    beam.addColorStop(0, `${color}05`); beam.addColorStop(0.5, `${color}65`); beam.addColorStop(1, `${color}20`);
    c.strokeStyle = beam; c.lineWidth = 0.8; c.globalAlpha = opacity;
    c.beginPath(); c.moveTo(source.x, source.y); c.lineTo(end.x, end.y); c.stroke();
    c.fillStyle = color; c.globalAlpha = opacity * Math.sin(Math.PI * progress);
    c.shadowColor = color; c.shadowBlur = 5;
    c.beginPath(); c.arc(source.x + (end.x - source.x) * progress, source.y + (end.y - source.y) * progress, 2, 0, TAU); c.fill();
    c.restore();
  }

  drawPlayer(player, position, color, selfId) {
    const c = this.ctx;
    const { x, y } = position;
    const own = player.id === selfId;
    const size = this.width < 430 ? 16 : 20;
    c.save();
    c.shadowColor = color; c.shadowBlur = own ? 15 : 7;
    c.fillStyle = '#101d25'; c.strokeStyle = color; c.lineWidth = own ? 1.7 : 1;
    c.beginPath(); c.arc(x, y, size + 3, 0, TAU); c.fill(); c.stroke();
    c.shadowBlur = 0;
    c.save(); c.beginPath(); c.arc(x, y, size, 0, TAU); c.clip();
    const image = this.getAvatar(player.avatarUrl);
    if (image?.complete && image.naturalWidth > 0) {
      const crop = Math.min(image.naturalWidth, image.naturalHeight);
      c.drawImage(image, (image.naturalWidth - crop) / 2, (image.naturalHeight - crop) / 2, crop, crop,
        x - size, y - size, size * 2, size * 2);
    } else {
      const fill = c.createLinearGradient(x - size, y - size, x + size, y + size);
      fill.addColorStop(0, `${color}35`); fill.addColorStop(1, `${color}0c`);
      c.fillStyle = fill; c.fillRect(x - size, y - size, size * 2, size * 2);
      c.font = `700 ${size * 0.75}px system-ui, sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color;
      const initials = String(player.name ?? '?').trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0] ?? '').join('').toUpperCase();
      c.fillText(initials || '?', x, y + 0.5);
    }
    c.restore();
    if (own) {
      c.fillStyle = color; c.beginPath(); c.arc(x + size * 0.78, y - size * 0.72, 4, 0, TAU); c.fill();
      c.strokeStyle = '#101d25'; c.lineWidth = 2; c.stroke();
    }
    const name = own ? 'YOU' : String(player.name ?? 'Pilot').slice(0, 14);
    const label = player.bot ? `${name} · BOT` : name;
    c.font = '600 9px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const labelWidth = c.measureText(label).width + 12;
    const labelX = clamp(x, labelWidth / 2 + 2, this.width - labelWidth / 2 - 2);
    c.fillStyle = '#101b23e8';
    c.beginPath(); c.roundRect(labelX - labelWidth / 2, y + size + 8, labelWidth, 17, 5); c.fill();
    c.fillStyle = own ? '#b9efdb' : '#a5b7bf'; c.fillText(label, labelX, y + size + 20);
    c.restore();
  }

  getAvatar(url) {
    if (typeof url !== 'string' || !url || url.length > 4096) return null;
    if (this.images.has(url)) return this.images.get(url);
    try {
      const parsed = new URL(url, document.baseURI);
      if (!['https:', 'http:'].includes(parsed.protocol)) return null;
      const image = new Image();
      image.referrerPolicy = 'no-referrer';
      image.src = parsed.href;
      if (this.images.size >= 24) this.images.delete(this.images.keys().next().value);
      this.images.set(url, image);
      return image;
    } catch { return null; }
  }

  destroy() {
    this.destroyed = true;
    this.resizeObserver.disconnect();
    this.media?.removeEventListener?.('change', this.onMotionChange);
    this.images.clear(); this.positions.clear();
    this.instrumentCounts.clear(); this.upgradeFlashes.clear();
    this.particles = []; this.floats = []; this.ripples = [];
  }
}
