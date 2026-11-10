/** Original 32px tabletop sprites, shared by the shop and the orbital board. */
export const PIXEL_PALETTE = Object.freeze({
  ink: '#392923', shade: '#543b31', wood: '#a46c46', dirt: '#80523b',
  paper: '#efe0b6', cream: '#fff1cb', yellow: '#efbf58', orange: '#cf8546',
  sage: '#7d9d69', leaf: '#afbd77', green: '#4f704e', sky: '#81adb8',
  blue: '#4d718b', red: '#a35b50', pink: '#d3917c', purple: '#a491b1',
});

const IDS = ['mote', 'satellite', 'prism', 'star', 'nova'];

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
  }
  return shapes;
}

const icons = Object.freeze(Object.fromEntries(IDS.map((id) => [id,
  `<svg viewBox="0 0 32 32" width="32" height="32" shape-rendering="crispEdges" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${sprite(id).map(([x, y, w, h, color]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`).join('')}</svg>`,
])));

/** Only prebuilt finite-palette SVG markup is returned; id is never interpolated. */
export function generatorIcon(id) { return Object.hasOwn(icons, id) ? icons[id] : ''; }

export function drawGeneratorSprite(context, id, x, y, { phase = 0.5, running = false } = {}) {
  for (const [dx, dy, width, height, color] of sprite(id, phase, running)) {
    context.fillStyle = color;
    context.fillRect(Math.round(x) + dx, Math.round(y) + dy, width, height);
  }
}
