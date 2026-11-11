/**
 * The jump flight: a top-to-bottom meteorite dodge played on the flyer's own client.
 * The engine only hears the result (`completeJump`), so this module owns input, timing and drawing.
 */
import { PIXEL_PALETTE as P } from './icons.js';

export const FLIGHT_WIDTH = 192, FLIGHT_HEIGHT = 256, FLIGHT_SECONDS = 12, MAX_HITS = 3, HIT_GRACE = 0.9;
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const safe = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
/** A small seeded generator keeps a retry's rocks reproducible for the same seed. */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const KEYS = { ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right', ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down' };

export class FlightGame {
  constructor(root, { onLaunch = null, onResult = null, onAbort = null, audio = null } = {}) {
    if (!root) throw new Error('The flight needs a mount.');
    this.root = root; this.onLaunch = onLaunch; this.onResult = onResult; this.onAbort = onAbort; this.audio = audio;
    this.active = false; this.frame = null; this.keys = new Set(); this.pointer = null; this.result = null; this.resultTimer = null;
    this.root.classList.add('flight-layer');
    this.root.innerHTML = `<section class="flight-launch" data-flight-launch aria-label="Jump point">
        <span class="flight-eyebrow">JUMP POINT CLEARED</span><strong data-flight-route>Next system</strong>
        <p data-flight-status>Fuel the ship to launch.</p>
        <button class="primary-button" data-flight-launch-button type="button" disabled>Launch ↗</button>
        <small data-flight-rules>Dodge meteorites with WASD or the arrow keys. Three hits and the ship turns back with half its fuel.</small>
      </section>
      <section class="flight-stage" data-flight-stage hidden aria-label="Jump flight">
        <div class="flight-hud"><strong data-flight-hud-route></strong><span data-flight-hull aria-live="polite">HULL ◆◆◆</span><span data-flight-distance>0%</span></div>
        <canvas class="flight-canvas" width="${FLIGHT_WIDTH}" height="${FLIGHT_HEIGHT}" tabindex="0" aria-label="Jump flight. Dodge the meteorites with WASD or the arrow keys."></canvas>
        <p class="flight-hint">WASD / ARROWS OR POINTER · ESC TURNS BACK (COUNTS AS A CRASH)</p>
        <div class="flight-result" data-flight-result hidden></div>
      </section>`;
    this.launch = this.root.querySelector('[data-flight-launch]');
    this.stage = this.root.querySelector('[data-flight-stage]');
    this.canvas = this.root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.launchButton = this.root.querySelector('[data-flight-launch-button]');
    this.launchButton.addEventListener('click', () => { if (!this.launchButton.disabled) this.onLaunch?.(); });
    this.onKeyDown = (event) => {
      if (!this.active) return;
      if (event.code === 'Escape') { event.preventDefault(); this.abort(); return; }
      const direction = KEYS[event.code]; if (!direction) return;
      event.preventDefault(); this.keys.add(direction); this.pointer = null;
    };
    this.onKeyUp = (event) => { const direction = KEYS[event.code]; if (direction) this.keys.delete(direction); };
    this.onPointer = (event) => {
      if (!this.active) return;
      const rect = this.canvas.getBoundingClientRect();
      this.pointer = { x: (event.clientX - rect.left) / rect.width * FLIGHT_WIDTH, y: (event.clientY - rect.top) / rect.height * FLIGHT_HEIGHT };
    };
    this.canvas.addEventListener('pointermove', this.onPointer);
    this.canvas.addEventListener('pointerdown', this.onPointer);
    this.media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  }

  /** The waiting room between the shattered gate and the flight. `show` is called every render while a transit exists. */
  show({ from = '', to = '', fuel = 0, target = 1, isFlyer = false, flyerName = '', canLaunch = false, maxHits = MAX_HITS, keepFuel = 0.5 } = {}) {
    this.root.hidden = false;
    if (this.active || this.result) return;
    this.launch.hidden = false; this.stage.hidden = true;
    // Astrogation research hardens the hull and saves more fuel from a crash; the rules line shows the live values.
    this.rules = { maxHits: Math.max(1, Math.floor(maxHits)), keepFuel: Math.max(0, Math.min(1, keepFuel)) };
    this.root.querySelector('[data-flight-rules]').textContent = `Dodge meteorites with WASD or the arrow keys. ${this.rules.maxHits} hits and the ship turns back with ${Math.round(this.rules.keepFuel * 100)}% of its fuel.`;
    this.root.querySelector('[data-flight-route]').textContent = `${from} → ${to}`;
    const status = this.root.querySelector('[data-flight-status]');
    status.textContent = !isFlyer ? `${flyerName || 'Another pilot'} is flying the ship. Hold tight.`
      : canLaunch ? 'Tank full. Launch when ready.' : `Fuel ${Math.floor(fuel).toLocaleString('en')} / ${target.toLocaleString('en')} · feed Beam in the Farm to refuel.`;
    this.launchButton.disabled = !isFlyer || !canLaunch;
    this.launchButton.textContent = isFlyer ? (canLaunch ? 'Launch ↗' : 'Refuel to launch') : 'Spectating';
  }

  hide() { if (this.active || this.result) return; this.root.hidden = true; }

  start({ from = '', to = '', systemIndex = 0, seed = 1, maxHits = this.rules?.maxHits ?? MAX_HITS, keepFuel = this.rules?.keepFuel ?? 0.5 } = {}) {
    if (this.active) return;
    this.active = true; this.result = null; clearTimeout(this.resultTimer);
    this.maxHits = Math.max(1, Math.floor(maxHits)); this.keepFuel = Math.max(0, Math.min(1, keepFuel));
    this.root.hidden = false; this.launch.hidden = true; this.stage.hidden = false;
    this.root.querySelector('[data-flight-result]').hidden = true;
    this.root.querySelector('[data-flight-hud-route]').textContent = `${from} → ${to}`.toUpperCase();
    this.random = mulberry(seed * 7919 + systemIndex * 104729 + 17);
    this.systemIndex = systemIndex; this.time = 0; this.hits = 0; this.gracefulUntil = 0; this.spawnIn = 0.8; this.last = null;
    this.ship = { x: FLIGHT_WIDTH / 2, y: FLIGHT_HEIGHT - 40 };
    this.rocks = []; this.sparks = []; this.keys.clear(); this.pointer = null;
    this.stars = Array.from({ length: 36 }, () => ({ x: Math.floor(this.random() * FLIGHT_WIDTH), y: Math.floor(this.random() * FLIGHT_HEIGHT), speed: 18 + this.random() * 40, bright: this.random() < .3 }));
    addEventListener('keydown', this.onKeyDown); addEventListener('keyup', this.onKeyUp);
    this.canvas.focus({ preventScroll: true });
    this.updateHud();
    this.frame = requestAnimationFrame((now) => this.loop(now));
  }

  /** Bailing out mid-flight is a crash: otherwise Escape would be a free retry just before the third hit. */
  abort() {
    if (!this.active) return;
    this.onAbort?.();
    this.finish(false);
  }

  teardown() {
    this.active = false;
    if (this.frame) cancelAnimationFrame(this.frame); this.frame = null;
    removeEventListener('keydown', this.onKeyDown); removeEventListener('keyup', this.onKeyUp);
    this.keys.clear();
  }

  finish(arrived) {
    this.teardown();
    this.result = arrived ? 'arrived' : 'crashed';
    const splash = this.root.querySelector('[data-flight-result]');
    splash.hidden = false;
    splash.innerHTML = arrived ? '<strong>JUMP COMPLETE</strong><span>Welcome to the next system.</span>' : `<strong>HULL BREACH</strong><span>${this.maxHits ?? MAX_HITS} hits. The ship turns back with ${Math.round((this.keepFuel ?? 0.5) * 100)}% of its fuel.</span>`;
    splash.dataset.outcome = this.result;
    this.draw();
    this.resultTimer = setTimeout(() => { this.result = null; this.onResult?.(arrived); }, 1400);
  }

  updateHud() {
    const hull = this.root.querySelector('[data-flight-hull]');
    const maxHits = this.maxHits ?? MAX_HITS;
    hull.textContent = `HULL ${'◆'.repeat(Math.max(0, maxHits - this.hits))}${'◇'.repeat(Math.min(maxHits, this.hits))}`;
    this.root.querySelector('[data-flight-distance]').textContent = `${Math.min(100, Math.floor(this.time / FLIGHT_SECONDS * 100))}%`;
  }

  loop(now) {
    if (!this.active) return;
    const dt = clamp((now - (this.last ?? now)) / 1000, 0, 0.05); this.last = now;
    this.update(dt); this.draw();
    if (this.active) this.frame = requestAnimationFrame((next) => this.loop(next));
  }

  update(dt) {
    this.time += dt;
    const speed = 120;
    if (this.pointer) {
      this.ship.x += clamp(this.pointer.x - this.ship.x, -speed * dt, speed * dt);
      this.ship.y += clamp(this.pointer.y - this.ship.y, -speed * dt, speed * dt);
    } else {
      if (this.keys.has('left')) this.ship.x -= speed * dt;
      if (this.keys.has('right')) this.ship.x += speed * dt;
      if (this.keys.has('up')) this.ship.y -= speed * .8 * dt;
      if (this.keys.has('down')) this.ship.y += speed * .8 * dt;
    }
    this.ship.x = clamp(this.ship.x, 8, FLIGHT_WIDTH - 8); this.ship.y = clamp(this.ship.y, FLIGHT_HEIGHT * .4, FLIGHT_HEIGHT - 16);
    // Later systems throw denser, faster rock. The first jump is a gentle introduction.
    const difficulty = Math.min(1, this.systemIndex / 8);
    this.spawnIn -= dt;
    while (this.spawnIn <= 0) {
      this.spawnIn += 0.62 - difficulty * .32;
      const radius = 4 + this.random() * (5 + difficulty * 3);
      this.rocks.push({ x: 6 + this.random() * (FLIGHT_WIDTH - 12), y: -radius - 2, r: radius, vy: (70 + difficulty * 70) * (.8 + this.random() * .5), vx: (this.random() - .5) * (24 + difficulty * 30), spin: this.random() * TAU, tone: this.random() });
    }
    for (const rock of this.rocks) { rock.y += rock.vy * dt; rock.x += rock.vx * dt; rock.spin += dt * 2; }
    this.rocks = this.rocks.filter((rock) => rock.y < FLIGHT_HEIGHT + rock.r + 4);
    for (const star of this.stars) { star.y += star.speed * dt; if (star.y > FLIGHT_HEIGHT) { star.y -= FLIGHT_HEIGHT; star.x = Math.floor(this.random() * FLIGHT_WIDTH); } }
    for (const spark of this.sparks) { spark.life -= dt * 2; spark.x += spark.vx * dt; spark.y += spark.vy * dt; }
    this.sparks = this.sparks.filter((spark) => spark.life > 0);
    if (this.time >= this.gracefulUntil) {
      const hit = this.rocks.find((rock) => Math.hypot(rock.x - this.ship.x, rock.y - this.ship.y) < rock.r + 5);
      if (hit) {
        this.hits++; this.gracefulUntil = this.time + HIT_GRACE;
        this.rocks = this.rocks.filter((rock) => rock !== hit);
        for (let i = 0; i < 8; i++) { const angle = this.random() * TAU; this.sparks.push({ x: this.ship.x, y: this.ship.y, vx: Math.cos(angle) * 50, vy: Math.sin(angle) * 50, life: 1, color: i % 2 ? P.yellow : P.red }); }
        this.audio?.play?.('error', { intensity: .7 });
        this.updateHud();
        if (this.hits >= (this.maxHits ?? MAX_HITS)) { this.finish(false); return; }
      }
    }
    this.updateHud();
    if (this.time >= FLIGHT_SECONDS) this.finish(true);
  }

  draw() {
    const c = this.ctx, reduced = this.media?.matches ?? false;
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#0a0f22'; c.fillRect(0, 0, FLIGHT_WIDTH, FLIGHT_HEIGHT);
    const pixel = (x, y, color, w = 1, h = w) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); };
    for (const star of this.stars) pixel(star.x, star.y, star.bright ? '#a9c1e4' : '#43587f', 1, star.bright ? 2 : 1);
    // Distance rail on the right: the ship's progress between the two systems.
    pixel(FLIGHT_WIDTH - 7, 10, P.ink, 4, FLIGHT_HEIGHT - 20); pixel(FLIGHT_WIDTH - 6, 11, '#2c3b3f', 2, FLIGHT_HEIGHT - 22);
    const progress = clamp(this.time / FLIGHT_SECONDS, 0, 1);
    pixel(FLIGHT_WIDTH - 6, 11 + Math.round((FLIGHT_HEIGHT - 24) * (1 - progress)), P.yellow, 2, Math.round((FLIGHT_HEIGHT - 24) * progress) + 2);
    for (const rock of this.rocks) {
      const r = Math.round(rock.r), x = Math.round(rock.x), y = Math.round(rock.y);
      pixel(x - r - 1, y - r + 1, P.ink, r * 2 + 2, r * 2 - 1); pixel(x - r + 1, y - r - 1, P.ink, r * 2 - 1, r * 2 + 2);
      pixel(x - r, y - r + 2, rock.tone < .5 ? P.dirt : P.shade, r * 2, r * 2 - 3); pixel(x - r + 2, y - r, rock.tone < .5 ? P.dirt : P.shade, r * 2 - 3, r * 2);
      pixel(x - r + 2, y - r + 2, P.wood, Math.max(1, r - 1), 2); pixel(x + 1, y + 1, P.ink, Math.max(1, r - 2), Math.max(1, r - 2));
      if (rock.r > 8) pixel(x - 2, y - r + 3, P.orange, 2, 1);
    }
    const hidden = this.time < this.gracefulUntil && !reduced && Math.floor(this.time * 12) % 2 === 1;
    if (!hidden) this.drawShip(Math.round(this.ship.x), Math.round(this.ship.y), reduced);
    for (const spark of this.sparks) pixel(spark.x, spark.y, spark.color, 2, 2);
    if (this.result) { c.globalAlpha = .55; pixel(0, 0, this.result === 'arrived' ? '#1f3d2e' : '#4a1f1f', FLIGHT_WIDTH, FLIGHT_HEIGHT); c.globalAlpha = 1; }
  }

  /** Beam's little ship, nose up, flame flickering; mirrors the garden's rocket in the same ink-outlined palette. */
  drawShip(x, y, reduced) {
    const c = this.ctx, pixel = (dx, dy, color, w = 1, h = w) => { c.fillStyle = color; c.fillRect(x + dx, y + dy, w, h); };
    pixel(-1, -10, P.ink, 3, 3); pixel(-3, -8, P.ink, 7, 12); pixel(-6, -1, P.ink, 3, 6); pixel(4, -1, P.ink, 3, 6);
    pixel(0, -9, P.red, 1, 2); pixel(-2, -7, P.paper, 5, 10); pixel(-1, -6, P.sky, 3, 3); pixel(-5, 0, P.red, 2, 4); pixel(4, 0, P.red, 2, 4);
    pixel(-1, 3, P.cream, 3, 1);
    const flame = reduced ? 1 : Math.floor(this.time * 14) % 2;
    pixel(-2, 4, P.ink, 5, 2 + flame); pixel(-1, 4, P.yellow, 3, 2 + flame); pixel(0, 5 + flame, P.orange, 1, 2);
  }
}
