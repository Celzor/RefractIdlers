/** Original 32px tabletop sprites, shared by the shop and the orbital board. */
export const PIXEL_PALETTE = Object.freeze({
  ink: '#392923', shade: '#543b31', wood: '#a46c46', dirt: '#80523b',
  paper: '#efe0b6', cream: '#fff1cb', yellow: '#efbf58', orange: '#cf8546',
  sage: '#7d9d69', leaf: '#afbd77', green: '#4f704e', sky: '#81adb8',
  blue: '#4d718b', red: '#a35b50', pink: '#d3917c', purple: '#a491b1',
});

export const GENERATOR_IDS = Object.freeze(['mote', 'satellite', 'prism', 'star', 'nova', 'mouse', 'laser', 'probe', 'gate']);
const IDS = GENERATOR_IDS;

function sprite(id, phase = 0.5, running = false) {
  const shapes = [];
  const r = (x, y, w, h, color) => shapes.push([x, y, w, h, PIXEL_PALETTE[color]]);
  if (id === 'mote') {
    // A friendly wind-up clicking robot with a little brass tapping arm.
    r(9, 28, 6, 3, 'ink'); r(18, 28, 6, 3, 'ink');
    r(10, 27, 4, 2, 'wood'); r(19, 27, 4, 2, 'wood');
    r(8, 16, 17, 12, 'ink'); r(10, 17, 13, 9, 'sage');
    r(10, 23, 13, 3, 'green'); r(13, 18, 7, 6, 'ink');
    r(14, 19, 5, 4, 'yellow'); r(16, 20, 2, 2, 'orange');
    r(6, 5, 20, 12, 'ink'); r(8, 7, 16, 8, 'paper');
    r(9, 7, 14, 2, 'cream'); r(9, 13, 14, 2, 'wood');
    r(10, 10, 3, 3, 'ink'); r(19, 10, 3, 3, 'ink');
    r(11, 10, 1, 1, 'sky'); r(20, 10, 1, 1, 'sky');
    r(15, 13, 3, 1, 'red');
    r(15, 1, 2, 4, 'ink'); r(13, 1, 6, 2, 'yellow');
    r(4, 17, 4, 8, 'ink'); r(3, 21, 4, 4, 'sage');
    const tap = running && phase < 0.2 ? 2 : 0;
    r(25, 16 + tap, 4, 3, 'ink'); r(27, 18 + tap, 3, 6, 'ink');
    r(26, 23 + tap, 5, 3, 'yellow'); r(27, 23 + tap, 3, 1, 'cream');
  } else if (id === 'satellite') {
    // A raised garden bed: cultivated light grows from three small plants.
    r(2, 21, 28, 9, 'ink'); r(4, 23, 24, 5, 'wood');
    r(4, 21, 24, 3, 'dirt'); r(5, 25, 22, 1, 'orange');
    r(6, 22, 2, 7, 'shade'); r(24, 22, 2, 7, 'shade');
    r(3, 29, 5, 2, 'ink'); r(24, 29, 5, 2, 'ink');
    for (let i = 0; i < 3; i++) {
      const x = 7 + i * 9;
      const growth = running ? (phase + i * 0.15) % 1 : phase;
      const tall = growth < 0.25 ? 0 : growth < 0.55 ? 2 : 4;
      const y = 15 - tall - (i === 1 ? 2 : 0);
      r(x, y + 4, 2, 8 + tall, 'green');
      r(x - 3, y + 7, 3, 2, 'sage'); r(x + 2, y + 5, 3, 2, 'leaf');
      r(x - 3, y, 8, 6, 'ink'); r(x - 1, y - 2, 4, 10, 'ink');
      r(x - 2, y + 1, 6, 4, 'sky'); r(x, y - 1, 2, 8, 'sky');
      r(x - 1, y, 3, 2, 'cream'); r(x + 1, y + 4, 2, 2, 'blue');
    }
    r(1, 7, 1, 3, 'yellow'); r(0, 8, 3, 1, 'yellow');
  } else if (id === 'prism') {
    // Chunky hinged solar panels on a wooden stand.
    r(11, 24, 4, 5, 'ink'); r(21, 23, 4, 6, 'ink');
    r(8, 28, 9, 3, 'ink'); r(19, 28, 9, 3, 'ink');
    r(10, 28, 5, 1, 'wood'); r(21, 28, 5, 1, 'wood');
    r(2, 5, 27, 20, 'ink'); r(4, 7, 23, 16, 'wood');
    for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) {
      const glint = running && Math.floor(phase * 6) === x + y * 3;
      r(5 + x * 7, 8 + y * 7, 6, 6, 'ink');
      r(6 + x * 7, 9 + y * 7, 4, 4, glint ? 'yellow' : 'blue');
      r(6 + x * 7, 9 + y * 7, 4, 1, glint ? 'cream' : 'sky');
    }
    r(3, 3, 25, 2, 'paper'); r(29, 9, 2, 10, 'ink');
    r(30, 11, 1, 6, 'yellow');
  } else if (id === 'star') {
    // An old brass measuring instrument with a face, a prism and a hand crank.
    r(5, 25, 24, 5, 'ink'); r(7, 26, 20, 2, 'wood');
    r(9, 21, 15, 4, 'ink'); r(11, 21, 11, 3, 'orange');
    r(7, 5, 18, 17, 'ink'); r(4, 8, 24, 11, 'ink');
    r(8, 7, 16, 13, 'yellow'); r(6, 9, 20, 9, 'yellow');
    r(10, 8, 12, 11, 'ink'); r(11, 9, 10, 9, 'paper');
    r(15, 11, 2, 3, 'red'); r(13, 14, 6, 2, 'red');
    const sweep = Math.floor(phase * 3) % 3;
    r(sweep === 0 ? 12 : sweep === 1 ? 16 : 19, sweep === 1 ? 9 : 11, 1, 3, 'ink');
    r(29, 11, 2, 7, 'ink'); r(27, 13, 4, 2, 'wood');
    r(2, 12, 3, 4, 'ink'); r(1, 13, 4, 2, 'sky');
    r(15, 2, 4, 3, 'ink'); r(15, 1, 5, 2, 'yellow');
    r(8, 9, 1, 2, 'cream'); r(24, 10, 1, 5, 'orange');
  } else if (id === 'nova') {
    // A tiny star bottled in a thick glass preserving jar.
    r(9, 2, 14, 4, 'ink'); r(10, 3, 12, 2, 'wood');
    r(7, 6, 18, 3, 'ink'); r(5, 9, 22, 19, 'ink');
    r(7, 28, 18, 3, 'ink'); r(7, 9, 18, 18, 'sky');
    r(9, 7, 14, 2, 'sky'); r(9, 27, 14, 2, 'blue');
    r(8, 10, 2, 12, 'cream'); r(11, 9, 8, 1, 'paper');
    r(24, 12, 1, 12, 'blue'); r(11, 24, 12, 2, 'blue');
    r(15, 11, 3, 13, 'orange'); r(10, 16, 13, 3, 'orange');
    r(14, 14, 5, 7, 'yellow'); r(12, 16, 9, 3, 'yellow');
    r(15, 15, 3, 4, 'cream');
    if (running && phase < 0.3) { r(26, 3, 1, 5, 'yellow'); r(24, 5, 5, 1, 'yellow'); }
    r(11, 3, 2, 1, 'orange'); r(15, 3, 2, 1, 'orange'); r(19, 3, 2, 1, 'orange');
  } else if (id === 'mouse') {
    // A cream pixel pointer with a tiny thinking chip and a brass click pad.
    r(4, 24, 24, 6, 'ink'); r(6, 25, 20, 3, 'blue');
    r(7, 26, 5, 1, 'sky'); r(21, 26, 4, 1, 'sage');
    for (let i = 0; i < 7; i++) r(7, 3 + i * 3, 3 + i * 2, 3, 'ink');
    for (let i = 0; i < 5; i++) r(9, 6 + i * 3, 1 + i * 2, 3, 'cream');
    r(12, 19, 5, 3, 'paper'); r(16, 19, 4, 7, 'ink');
    r(17, 19, 2, 5, 'paper'); r(23, 5, 6, 7, 'ink');
    r(24, 6, 4, 5, running && phase < .25 ? 'yellow' : 'sage');
    r(25, 7, 2, 2, 'cream'); r(22, 7, 1, 1, 'yellow'); r(29, 7, 1, 1, 'yellow');
    r(22, 10, 1, 1, 'yellow'); r(29, 10, 1, 1, 'yellow');
  } else if (id === 'laser') {
    // A weighty red cannon. Its right-hand muzzle is the exact beam origin.
    r(3, 23, 22, 7, 'ink'); r(5, 24, 18, 4, 'shade');
    for (let i = 0; i < 4; i++) { r(5 + i * 5, 25, 3, 3, 'wood'); r(6 + i * 5, 26, 1, 1, 'ink'); }
    r(8, 17, 13, 7, 'ink'); r(10, 18, 9, 4, 'red');
    r(3, 8, 17, 12, 'ink'); r(5, 10, 13, 8, 'red');
    r(6, 10, 11, 2, 'pink'); r(4, 13, 4, 4, 'orange');
    r(17, 11, 14, 8, 'ink'); r(18, 12, 12, 6, 'wood');
    r(19, 12, 10, 2, 'paper'); r(27, 10, 4, 11, 'ink');
    r(28, 12, 3, 7, running && phase < .25 ? 'cream' : 'yellow');
    r(2, 4, 9, 4, 'ink'); r(3, 5, 7, 2, 'sky');
    r(7, 7, 2, 2, 'ink'); r(11, 13, 4, 3, 'ink'); r(12, 13, 2, 2, 'yellow');
  } else if (id === 'probe') {
    // Starlink-inspired solar wings around a small independent optical probe.
    r(1, 3, 9, 11, 'ink'); r(2, 4, 7, 9, 'blue');
    r(1, 19, 9, 11, 'ink'); r(2, 20, 7, 9, 'blue');
    r(4, 4, 1, 9, 'sky'); r(2, 8, 7, 1, 'sky');
    r(4, 20, 1, 9, 'sky'); r(2, 24, 7, 1, 'sky');
    r(8, 7, 7, 3, 'ink'); r(8, 22, 7, 3, 'ink');
    r(12, 7, 12, 19, 'ink'); r(14, 9, 8, 15, 'paper');
    r(15, 10, 6, 3, 'cream'); r(15, 19, 6, 4, 'wood');
    r(24, 11, 4, 10, 'ink'); r(25, 13, 4, 6, 'sky');
    r(29, 14, 3, 4, running && phase < .3 ? 'cream' : 'yellow');
    r(8, 14, 4, 5, 'ink'); r(7, 15, 4, 3, 'orange');
    if (running) r(3 + Math.floor(phase * 3), 16, 4, 1, 'yellow');
  } else if (id === 'gate') {
    // An eight-sided brass portal, floating motes crossing its violet aperture.
    r(7, 27, 18, 4, 'ink'); r(9, 28, 14, 2, 'wood');
    r(9, 2, 14, 3, 'ink'); r(5, 5, 22, 3, 'ink');
    r(2, 8, 28, 15, 'ink'); r(5, 23, 22, 3, 'ink'); r(9, 26, 14, 3, 'ink');
    r(10, 4, 12, 3, 'yellow'); r(6, 7, 20, 3, 'wood');
    r(4, 10, 24, 11, 'yellow'); r(6, 21, 20, 3, 'wood'); r(10, 24, 12, 3, 'yellow');
    r(10, 7, 12, 3, 'purple'); r(7, 10, 18, 11, 'purple'); r(10, 21, 12, 3, 'purple');
    r(11, 10, 10, 11, 'blue'); r(9, 12, 14, 7, 'blue');
    r(14, 11, 4, 10, 'sky'); r(11, 14, 10, 4, 'sky'); r(14, 14, 4, 4, 'cream');
    for (const [x, y] of [[14,4],[4,14],[26,14],[14,24]]) { r(x, y, 3, 3, 'ink'); r(x+1, y+1, 1, 1, 'cream'); }
    if (running) { const shift = Math.floor(phase * 3); r(10 + shift, 11, 2, 1, 'paper'); r(19 - shift, 20, 2, 1, 'paper'); }
  }
  return shapes;
}

const icons = Object.freeze(Object.fromEntries(IDS.map((id) => [id,
  `<svg viewBox="0 0 32 32" width="32" height="32" shape-rendering="crispEdges" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${sprite(id).map(([x, y, w, h, color]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`).join('')}</svg>`,
])));

/** Only prebuilt finite-palette SVG markup is returned; id is never interpolated. */
export function generatorIcon(id) { return Object.hasOwn(icons, id) ? icons[id] : ''; }

const spriteAtlas = new Map();
export function drawGeneratorSprite(context, id, x, y, { phase = 0.5, running = false, scale = 1, rotation = 0 } = {}) {
  if (!IDS.includes(id)) return;
  const frame = running ? Math.floor(Math.max(0, Math.min(.999, phase)) * 8) : 4;
  const key = `${id}:${running ? frame : 'still'}`;
  let bitmap = spriteAtlas.get(key);
  if (!bitmap) {
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(32,32) : context.canvas?.ownerDocument?.createElement('canvas');
    const painter = canvas?.getContext('2d');
    if (painter) {
      canvas.width = canvas.height = 32;
      for (const [dx,dy,w,h,color] of sprite(id,(frame+.5)/8,running)) { painter.fillStyle = color; painter.fillRect(dx,dy,w,h); }
      bitmap = canvas; spriteAtlas.set(key,bitmap);
    }
  }
  context.save(); context.translate(Math.round(x) + 16*scale,Math.round(y) + 16*scale);
  if (rotation) context.rotate(rotation);
  context.translate(-16*scale,-16*scale);
  if (bitmap) context.drawImage(bitmap,0,0,32*scale,32*scale);
  else for (const [dx,dy,w,h,color] of sprite(id,(frame+.5)/8,running)) { context.fillStyle=color; context.fillRect(dx*scale,dy*scale,w*scale,h*scale); }
  context.restore();
}

const ORB_THEMES = Object.freeze([
  { light: '#afbd77', primary: '#7d9d69', shade: '#4f704e', accent: '#efbf58' },
  { light: '#b5d0cb', primary: '#81adb8', shade: '#4d718b', accent: '#efe0b6' },
  { light: '#ffe3a0', primary: '#efbf58', shade: '#cf8546', accent: '#a35b50' },
  { light: '#e9baa0', primary: '#d3917c', shade: '#a35b50', accent: '#efbf58' },
  { light: '#d0bfcc', primary: '#a491b1', shade: '#715a79', accent: '#81adb8' },
]);

/** Maps bounded game values to finite artwork variants, never to SVG markup. */
export function orbAppearance(orb) {
  const level = Number.isSafeInteger(orb?.level) && orb.level > 0 ? orb.level : 1;
  const hp = Number.isFinite(orb?.hp) ? Math.max(0, orb.hp) : 1;
  const maxHp = Number.isFinite(orb?.maxHp) && orb.maxHp > 0 ? orb.maxHp : Math.max(1, hp);
  const health = Math.min(1, hp / maxHp);
  const damageTier = health > 0.9 + 1e-10 ? 0 : health > 0.65 + 1e-10 ? 1 : health > 0.35 + 1e-10 ? 2 : 3;
  const boss = orb?.boss === true || orb?.isBoss === true;
  const theme = (level - 1) % ORB_THEMES.length;
  return { ...ORB_THEMES[theme], damageTier, boss, key: `${theme}:${damageTier}:${boss ? 1 : 0}` };
}

export function orbAppearanceKey(orb) { return orbAppearance(orb).key; }

function makeOrbIcon(theme, damageTier, boss) {
  const { light, primary, shade, accent } = theme;
  const crown = boss ? '<path fill="#392923" d="M8 0h4v2h8V0h4v6H8z"/><path fill="#efbf58" d="M9 1h2v2h4V1h2v2h4V1h2v4H9z"/><rect x="15" y="3" width="2" height="2" fill="#a35b50"/>' : '';
  const cracks = [
    '',
    '<path fill="#392923" d="M10 8h2v4h2v4h-2v-3h-2z"/><rect x="12" y="16" width="3" height="1" fill="#fff1cb"/>',
    '<path fill="#392923" d="M10 8h2v4h2v3h4v2h-3v4h-2v-6h-1v-2h-2zM24 16h-4v2h-2v2h-2v-2h1v-2h3v-2h4z"/><path fill="#fff1cb" d="M12 14h1v2h2v1h-3zM18 20h2v1h-2z"/>',
    '<path fill="#392923" d="M10 8h2v4h2v3h4v2h-3v4h-2v-6h-1v-2h-2zM24 16h-4v2h-2v3h-2v-3h1v-2h3v-2h4zM16 22h2v4h-2zM6 16h4v2h2v2h-2v-1H8v-1H6z"/><path fill="#fff1cb" d="M12 14h1v2h2v1h-3zM18 21h2v1h-2zM14 22h1v3h-1z"/>',
  ][damageTier];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" shape-rendering="crispEdges" aria-hidden="true" focusable="false">
    <path fill="#392923" d="M14 2h4v2h2v2h2v2h2v2h2v2h2v2h2v4h-2v2h-2v2h-2v2h-2v2h-2v2h-2v2h-4v-2h-2v-2h-2v-2H8v-2H6v-2H4v-2H2v-4h2v-2h2v-2h2V8h2V6h2V4h2z"/>
    <path fill="${light}" d="M14 4h2v12H4v-2h2v-2h2v-2h2V8h2V6h2z"/>
    <path fill="${primary}" d="M16 4h2v2h2v2h2v2h2v2h2v2h2v2H16z"/>
    <path fill="${shade}" d="M4 16h12v12h-2v-2h-2v-2h-2v-2H8v-2H6v-2H4z"/>
    <path fill="${accent}" d="M16 16h12v2h-2v2h-2v2h-2v2h-2v2h-2v2h-2z"/>
    <path fill="${primary}" d="M10 10h2v2h2v2h2v2H4v-2h2v-2h2v-2z"/>
    <path fill="${shade}" d="M16 16h12v2h-2v2h-2v2h-2v-2h-2v-2h-4z"/>
    <path fill="#fff1cb" d="M14 6h2v4h-2v2h-2v2H8v-2h2v-2h2V8h2z"/>
    <rect x="16" y="14" width="2" height="4" fill="#efe0b6"/><rect x="14" y="16" width="6" height="2" fill="#efe0b6"/>
    ${cracks}${crown}
  </svg>`;
}

const ORB_ICONS = Object.freeze(Object.fromEntries(ORB_THEMES.flatMap((theme, index) =>
  [0, 1, 2, 3].flatMap((damageTier) => [false, true].map((boss) =>
    [`${index}:${damageTier}:${boss ? 1 : 0}`, makeOrbIcon(theme, damageTier, boss)])))));

/** Safe, prebuilt stage colour, crack and boss-crown variants for the core image. */
export function orbIcon(orb) { return ORB_ICONS[orbAppearanceKey(orb)]; }
