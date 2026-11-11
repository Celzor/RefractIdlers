/**
 * Original pixel art for Beam's garden. Every sprite is drawn on a small integer grid, outlined in the
 * same warm ink as the orbit machines, and emitted as crisp SVG paths (one path per colour).
 * Plants are drawn from their exact growth progress, so they visibly grow pixel by pixel.
 */
const INK = '#392923';
const C = Object.freeze({
  leafDark:'#3f6b3a', leaf:'#6d9b4a', leafLight:'#a6c96a', leafShine:'#d4e58c', stem:'#4f7b3e',
  carrot:'#e8873a', carrotDark:'#b55f2c', carrotLight:'#f6b968',
  tomato:'#d4503e', tomatoDark:'#8f3430', tomatoLight:'#f29a7a', unripe:'#9cc45e',
  pumpkin:'#e89a3a', pumpkinDark:'#b0662a', pumpkinLight:'#f6c66a', vine:'#5e8a40',
  lettuce:'#8dbb5a', lettucePale:'#c8e08c', lettuceDark:'#4d7a3c',
  weed:'#5e9a48', weedDark:'#3a6b34', weedLight:'#93c96b', bud:'#c9df8a', hair:'#e39a4a',
  flower:'#f2d45a', petal:'#fff1cb', wood:'#a46c46', woodDark:'#6e4630',
  soil:'#6b4d33', soilDark:'#4a3626', cream:'#fff1cb', paper:'#efe0b6',
  water:'#5fa8c8', waterDark:'#3c6f8f', aqua:'#a8dde6', metal:'#8c9a92', metalDark:'#4f5b56', metalLight:'#cdd6cc',
  red:'#c9503c', redDark:'#8e3428', yellow:'#efbf58', orange:'#cf8546', tyre:'#2e2a2c', hub:'#b9a88a',
  pink:'#e58ad0', violet:'#a491b1', violetDark:'#6d5a85', glow:'#ffe9a0', sky:'#81adb8', blue:'#4d718b',
  sackLight:'#d5c185', sack:'#a98a5a', sackDark:'#7a5f3e', green:'#4f704e', sage:'#7d9d69',
});

/** A tiny raster: draw with rect/px, then outline and serialise. */
function canvas(width,height) {
  const cells = new Array(width*height).fill(null);
  const api = {
    width,height,cells,
    px(x,y,color) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < width && y < height) cells[y*width+x] = color; return api; },
    rect(x,y,w,h,color) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) api.px(x+i,y+j,color); return api; },
    /** Filled ellipse inside the box (x,y,w,h). */
    oval(x,y,w,h,color) {
      const cx = x+w/2-.5, cy = y+h/2-.5, rx = w/2, ry = h/2;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (((x+i-cx)/rx)**2+((y+j-cy)/ry)**2 <= 1.02) api.px(x+i,y+j,color);
      return api;
    },
    get(x,y) { return x >= 0 && y >= 0 && x < width && y < height ? cells[y*width+x] : null; },
    /** Ink every empty cell that touches a filled one (4-neighbour), like a hand-drawn outline. */
    outline(color=INK) {
      const add = [];
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (cells[y*width+x]) continue;
        if ([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => { const c = api.get(x+dx,y+dy); return c && c !== color; })) add.push(y*width+x);
      }
      for (const index of add) cells[index] = color;
      return api;
    },
    /** One <path> per colour, built from horizontal runs. */
    paths() {
      const byColor = new Map();
      for (let y = 0; y < height; y++) {
        let x = 0;
        while (x < width) {
          const color = cells[y*width+x];
          if (!color) { x++; continue; }
          let end = x+1; while (end < width && cells[y*width+end] === color) end++;
          if (!byColor.has(color)) byColor.set(color,[]);
          byColor.get(color).push(`M${x} ${y}h${end-x}v1h${x-end}z`);
          x = end;
        }
      }
      return [...byColor].map(([color,d]) => `<path fill="${color}" d="${d.join('')}"/>`).join('');
    },
    svg(className='',label='') {
      const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
      return `<svg ${className ? `class="${className}" ` : ''}viewBox="0 0 ${width} ${height}" ${a11y} shape-rendering="crispEdges" preserveAspectRatio="xMidYMax meet">${api.paths()}</svg>`;
    },
  };
  return api;
}
const clamp01 = value => Math.max(0,Math.min(1,Number.isFinite(value) ? value : 0));
const lerp = (from,to,t) => Math.round(from+(to-from)*t);

/* ------------------------------------------------------------------ plants */
export const PLANT_W = 18, PLANT_H = 22;
const GROUND = PLANT_H-1;

function seedling(g,p) {
  // A tiny mound with a seed coat splitting, then a two-leaf sprout.
  const mid = 9;
  if (p < .06) { g.rect(mid-2,GROUND,4,1,C.soil).rect(mid-1,GROUND-1,2,1,C.soil).px(mid,GROUND-1,C.leafLight); return; }
  const t = clamp01((p-.06)/.12), h = lerp(2,5,t);
  g.rect(mid,GROUND-h+1,1,h,C.stem);
  const leaf = lerp(1,3,t);
  g.rect(mid-leaf,GROUND-h,leaf,1,C.leaf).rect(mid+1,GROUND-h,leaf,1,C.leafLight);
  if (leaf > 1) g.px(mid-leaf,GROUND-h-1,C.leafLight).px(mid+leaf,GROUND-h-1,C.leaf);
}
function carrot(g,p) {
  if (p < .18) return seedling(g,p);
  const t = clamp01((p-.18)/.7), tall = lerp(5,15,t), mid = 9;
  // Three feathery fronds that lengthen and branch as the root swells below.
  for (const [dx,scale,lean] of [[-3,.72,-1],[0,1,0],[3,.82,1]]) {
    const h = Math.max(3,Math.round(tall*scale));
    const stalkX = y => mid+dx+(lean && y > h*.55 ? lean : 0);
    for (let y = 0; y < h; y++) g.px(stalkX(y),GROUND-1-y,C.stem);
    // Feathery leaflets angle upward, alternating sides like real carrot tops.
    for (let y = 2, side = lean || 1; y < h; y += 3, side = -side) {
      const x = stalkX(y), len = y > h-3 ? 1 : 2;
      for (let i = 1; i <= len; i++) g.px(x+side*i,GROUND-1-y-i+1,i === len ? C.leafLight : C.leaf);
      g.px(x-side,GROUND-2-y,C.leafDark);
    }
    g.px(stalkX(h-1),GROUND-h,C.leafShine);
  }
  if (p >= .5) {
    // The orange shoulder pushes out of the soil.
    const s = clamp01((p-.5)/.5), w = lerp(3,6,s), h = lerp(1,3,s);
    g.rect(mid-Math.floor(w/2),GROUND-h+1,w,h,C.carrot).rect(mid-Math.floor(w/2),GROUND-h+1,1,h,C.carrotLight).px(mid+Math.ceil(w/2)-1,GROUND,C.carrotDark);
    if (p >= 1) g.rect(mid-3,GROUND-3,1,1,C.carrotLight).px(mid+2,GROUND-1,C.carrotDark);
  }
}
function lettuce(g,p) {
  if (p < .15) return seedling(g,p);
  const t = clamp01((p-.15)/.85), w = lerp(5,16,t), h = lerp(3,10,t), x = Math.round((PLANT_W-w)/2);
  g.oval(x,GROUND-h+1,w,h,C.lettuceDark);
  g.oval(x+1,GROUND-h+1,w-2,h-1,C.lettuce);
  if (w > 7) g.oval(x+3,GROUND-h+2,w-6,Math.max(2,h-3),C.lettucePale);
  if (w > 10) g.oval(x+5,GROUND-h+3,w-10,Math.max(2,h-6),C.leafShine);
  // Frilled outer leaves and visible veins once it fills out.
  for (let i = x; i < x+w; i += 2) g.px(i,GROUND-h+2+((i>>1)%2),C.lettuceDark);
  if (h > 5) for (const vx of [x+2,x+w-3]) g.rect(vx,GROUND-Math.floor(h/2),1,Math.floor(h/2)-1,C.lettuceDark);
}
function tomato(g,p) {
  if (p < .15) return seedling(g,p);
  const t = clamp01((p-.15)/.85), h = lerp(6,19,t), mid = 9;
  g.rect(13,GROUND-Math.min(20,h+1),1,Math.min(21,h+2),C.wood).px(13,GROUND-Math.min(20,h+1),C.woodDark);
  for (let y = 0; y < h; y++) g.px(mid+(Math.floor(y/4)%2),GROUND-y,C.stem);
  for (let y = 3; y < h; y += 3) {
    const side = (y/3)%2 ? -1 : 1, x = mid+(Math.floor(y/4)%2);
    g.rect(side < 0 ? x-3 : x+1,GROUND-y,3,1,C.leaf).px(side < 0 ? x-3 : x+3,GROUND-y-1,C.leafLight).px(side < 0 ? x-2 : x+2,GROUND-y+1,C.leafDark);
  }
  if (p >= .45 && p < .75) for (const y of [7,12]) if (y < h) g.px(mid-2,GROUND-y,C.flower).px(mid+3,GROUND-y-2,C.flower);
  if (p >= .65) {
    const ripe = p >= 1, size = p >= .85 ? 3 : 2;
    for (const [fx,fy] of [[4,6],[11,8],[5,12],[11,14]]) if (fy < h) {
      g.rect(fx,GROUND-fy,size,size,ripe ? C.tomato : C.unripe);
      g.px(fx,GROUND-fy,ripe ? C.tomatoLight : C.leafShine);
      if (size > 2) g.px(fx+2,GROUND-fy+2,ripe ? C.tomatoDark : C.leaf);
      g.px(fx+1,GROUND-fy-1,C.leafDark);
    }
  }
}
function pumpkin(g,p) {
  if (p < .15) return seedling(g,p);
  const t = clamp01((p-.15)/.85), reach = lerp(3,8,t), mid = 9;
  // A vine creeps along the soil with broad leaves, then a fruit swells from green to orange.
  g.rect(mid-reach,GROUND,reach*2,1,C.vine);
  for (let i = 0; i < Math.min(4,1+Math.floor(t*4)); i++) {
    const lx = mid+[-5,3,-8,6][i], size = 2+(t > .5 ? 1 : 0);
    g.rect(lx,GROUND-size,size+1,size,i%2 ? C.leaf : C.leafDark).px(lx+1,GROUND-size,C.leafLight).rect(lx+1,GROUND-1,1,1,C.vine);
  }
  if (p >= .35 && p < .6) g.px(mid,GROUND-2,C.flower).px(mid+1,GROUND-2,C.flower).px(mid,GROUND-3,C.petal);
  if (p >= .5) {
    const s = clamp01((p-.5)/.5), w = lerp(4,11,s), h = lerp(3,8,s), x = mid-Math.floor(w/2), ripe = p >= 1;
    const body = s < .55 ? C.unripe : ripe ? C.pumpkin : C.pumpkinLight;
    g.oval(x,GROUND-h+1,w,h,body);
    for (let rib = x+2; rib < x+w-1; rib += 3) g.rect(rib,GROUND-h+2,1,h-2,s < .55 ? C.leaf : C.pumpkinDark);
    if (ripe) g.rect(x+1,GROUND-h+2,1,Math.max(1,h-4),C.pumpkinLight);
    g.rect(mid,GROUND-h-1,1,2,C.woodDark).px(mid+1,GROUND-h-1,C.vine);
  }
}
function weed(g,p) {
  if (p < .15) return seedling(g,p);
  const t = clamp01((p-.15)/.85), h = lerp(6,20,t), mid = 9;
  for (let y = 0; y < h; y++) g.px(mid,GROUND-y,C.weedDark);
  // Serrated fan leaves at alternating nodes.
  for (let y = 3, node = 0; y < h-1; y += 3, node++) {
    const span = Math.max(2,Math.min(6,Math.round((h-y)/3)+1)), side = node%2 ? 1 : -1;
    for (let i = 1; i <= span; i++) { g.px(mid+side*i,GROUND-y-Math.floor(i/2),i%2 ? C.weed : C.weedLight); g.px(mid-side*i,GROUND-y-Math.floor(i/3),C.weed); }
    g.px(mid+side*span,GROUND-y-Math.floor(span/2)-1,C.weedLight);
  }
  if (p >= .7) {
    const top = GROUND-h+1, buds = p >= 1 ? 5 : 3;
    g.rect(mid-1,top,3,buds,C.bud).px(mid,top-1,C.bud);
    if (p >= .85) for (const [hx,hy] of [[-1,1],[1,2],[0,3],[1,0]]) g.px(mid+hx,top+hy,C.hair);
  }
}
const PLANTS = {carrot,lettuce,tomato,pumpkin,weed};

/** Plants are quantised to 1/48 of growth: fine enough to see every pixel of progress, coarse enough to cache. */
export const plantFrame = progress => Math.round(clamp01(progress)*48);
const plantCache = new Map();
export function plantSprite(crop,progress) {
  const frame = plantFrame(progress), key = `${crop}:${frame}`;
  if (!plantCache.has(key)) {
    const g = canvas(PLANT_W,PLANT_H);
    (PLANTS[crop] || carrot)(g,frame/48);
    plantCache.set(key,g.outline().svg('garden-plant'));
  }
  return plantCache.get(key);
}

/* ---------------------------------------------------------------- produce */
const produceCache = new Map();
export function produceIcon(crop) {
  if (produceCache.has(crop)) return produceCache.get(crop);
  const g = canvas(16,16);
  if (crop === 'carrot') {
    for (let i = 0; i < 9; i++) g.rect(4+Math.floor(i/2),6+i,Math.max(1,6-Math.floor(i*.6)),1,C.carrot);
    g.rect(4,6,2,5,C.carrotLight).px(8,9,C.carrotDark).px(6,12,C.carrotDark).px(9,7,C.carrotDark);
    g.rect(6,2,1,4,C.leafDark).rect(8,1,1,5,C.leaf).rect(10,3,1,3,C.leafDark).px(5,3,C.leafLight).px(9,2,C.leafLight).px(11,4,C.leafLight);
  } else if (crop === 'lettuce') {
    g.oval(1,4,14,11,C.lettuceDark).oval(2,4,12,10,C.lettuce).oval(4,6,8,7,C.lettucePale).oval(6,8,4,4,C.leafShine);
    for (const x of [3,6,9,12]) g.px(x,5,C.lettuceDark);
    g.rect(7,9,1,5,C.lettuceDark);
  } else if (crop === 'tomato') {
    g.oval(2,4,12,11,C.tomato).rect(4,6,2,3,C.tomatoLight).rect(10,11,3,2,C.tomatoDark);
    g.rect(6,3,4,2,C.leaf).px(5,4,C.leafDark).px(10,4,C.leafDark).rect(7,1,2,2,C.stem);
  } else if (crop === 'pumpkin') {
    g.oval(1,5,14,10,C.pumpkin);
    for (const x of [4,7,10]) g.rect(x,6,1,8,C.pumpkinDark);
    g.rect(2,7,1,5,C.pumpkinLight).rect(7,2,2,4,C.woodDark).rect(9,2,3,2,C.vine);
  } else {
    // A fan leaf with a lit bud: the secret crop.
    g.rect(7,4,2,11,C.weedDark);
    for (let i = 0; i < 6; i++) { g.px(6-i,9-Math.floor(i/2),C.weed).px(9+i,9-Math.floor(i/2),C.weed); g.px(5-i,8-Math.floor(i/2),C.weedLight).px(10+i,8-Math.floor(i/2),C.weedLight); }
    for (let i = 0; i < 4; i++) { g.px(6-Math.floor(i/2),5-i,C.weed).px(9+Math.floor(i/2),5-i,C.weed); }
    g.rect(7,1,2,3,C.bud).px(8,1,C.hair);
  }
  const svg = g.outline().svg('garden-produce');
  produceCache.set(crop,svg);
  return svg;
}

/* -------------------------------------------------------------- equipment */
const once = new Map();
const memo = (key,draw) => { if (!once.has(key)) once.set(key,draw()); return once.get(key); };

/** A ceiling grow light: chains, a steel hood and a strip of pink-violet LEDs. */
export const lampSprite = () => memo('lamp',() => {
  const g = canvas(30,10);
  g.rect(5,0,1,3,C.metalDark).rect(24,0,1,3,C.metalDark);
  g.rect(2,3,26,4,C.metalDark).rect(3,3,24,2,C.metal).rect(4,3,22,1,C.metalLight);
  g.rect(3,7,24,2,C.violetDark);
  for (let x = 4; x < 26; x += 2) g.px(x,7,C.pink).px(x+1,7,C.glow);
  return g.outline().svg('garden-lamp-art');
});
/** A nutrient reservoir: glass tank, coloured solution, a pump head with a status light. */
export const tankSprite = (tint=0) => memo(`tank:${tint}`,() => {
  const liquid = [[C.water,C.waterDark,C.aqua],[C.leafLight,C.leaf,C.leafShine],[C.violet,C.violetDark,C.pink]][tint%3];
  const g = canvas(16,26);
  g.rect(3,0,10,4,C.metalDark).rect(4,1,8,2,C.metal).px(10,1,tint === 2 ? C.pink : C.leafShine);
  g.rect(1,4,14,19,C.metalLight).rect(2,5,12,17,C.cream);
  g.rect(2,10,12,12,liquid[0]).rect(2,10,12,1,liquid[2]).rect(11,11,3,11,liquid[1]);
  g.rect(3,6,1,4,'#ffffff').rect(3,12,1,6,liquid[2]);
  g.rect(1,23,14,2,C.metalDark).rect(2,25,2,1,C.metalDark).rect(12,25,2,1,C.metalDark);
  g.rect(15,16,1,3,C.metal);
  return g.outline().svg('garden-tank-art');
});
/** A little red farm tractor with a fertiliser hopper. Two frames for chugging along. */
export const tractorSprite = (frame=0) => memo(`tractor:${frame}`,() => {
  const g = canvas(28,18), bob = frame ? 1 : 0;
  g.rect(14,2+bob,8,7,C.redDark).rect(15,3+bob,6,4,C.sky).rect(15,3+bob,2,1,'#ffffff');
  g.rect(4,8+bob,20,5,C.red).rect(4,8+bob,20,1,'#e67c5d').rect(22,9+bob,4,4,C.red);
  g.rect(6,4+bob,6,4,C.sackLight).rect(7,3+bob,4,1,C.sack).px(8,5+bob,C.leaf).px(10,6+bob,C.leaf);
  g.rect(24,5+bob,1,4,C.metalDark).px(24,4+bob,C.metal);
  g.oval(13,9,10,9,C.tyre).oval(15,11,6,5,C.hub).px(17+frame,13,C.tyre);
  g.oval(3,12,6,6,C.tyre).oval(4,13,4,4,C.hub);
  g.oval(23,13,5,5,C.tyre).px(25,15,C.hub);
  return g.outline().svg('garden-tractor-art');
});
/** A picker bot on a monorail: a domed head, grabbing arm and a harvest basket. */
export const pickerSprite = (frame=0) => memo(`picker:${frame}`,() => {
  const g = canvas(18,22), reach = frame ? 3 : 0;
  g.rect(8,0,2,3,C.metalDark).px(8,0,C.yellow);
  g.oval(3,2,12,9,C.metal).oval(4,3,10,6,C.metalLight).rect(6,5,6,3,C.blue).px(7,6,C.aqua).px(10,6,C.aqua);
  g.rect(4,11,10,6,C.yellow).rect(4,11,10,1,C.cream).rect(5,13,8,3,C.orange).px(7,14,C.leaf).px(10,14,C.carrot);
  g.rect(14,11-reach,1,4+reach,C.metalDark).rect(15,10-reach,2,2,C.metal);
  g.rect(3,17,12,2,C.metalDark).rect(5,19,2,2,C.tyre).rect(11,19,2,2,C.tyre);
  return g.outline().svg('garden-picker-art');
});
/** Hand tools for the chores. */
export const wateringCanSprite = () => memo('can',() => {
  const g = canvas(14,11);
  g.rect(3,3,7,7,C.blue).rect(3,3,7,1,C.sky).rect(4,4,1,5,C.sky);
  g.rect(5,0,4,1,C.metalDark).px(4,1,C.metalDark).px(9,1,C.metalDark).px(4,2,C.metalDark).px(9,2,C.metalDark);
  g.rect(10,4,1,2,C.blue).rect(11,3,1,2,C.blue).rect(12,1,2,2,C.metal);
  g.rect(1,4,2,1,C.metalDark).rect(1,5,1,3,C.metalDark).rect(1,8,2,1,C.metalDark);
  return g.outline().svg('garden-tool-art');
});
export const fertiliserSprite = () => memo('bag',() => {
  const g = canvas(12,13);
  g.rect(2,2,8,10,C.sackLight).rect(3,1,6,1,C.sack).rect(2,11,8,1,C.sack).rect(8,3,2,8,C.sack);
  g.rect(4,0,4,2,C.sackDark).rect(4,5,4,4,C.paper).px(5,6,C.leaf).px(6,7,C.leaf).px(6,6,C.leafDark);
  return g.outline().svg('garden-tool-art');
});
export const droplet = () => memo('drop',() => canvas(3,4).px(1,0,C.aqua).rect(0,1,3,2,C.water).px(1,3,C.waterDark).svg('garden-drop-art'));

/** Beam's ship: a stubby retro rocket with a porthole and a fuel intake. */
export const rocketSprite = () => memo('rocket',() => {
  const g = canvas(24,40);
  g.rect(10,0,4,2,C.red).rect(8,2,8,3,C.red).rect(10,1,2,3,'#e67c5d');
  g.rect(6,5,12,24,C.paper).rect(6,5,3,24,C.cream).rect(15,5,3,24,'#d7c595');
  g.oval(8,8,8,8,C.metalDark).oval(9,9,6,6,C.sky).rect(10,10,2,2,'#ffffff');
  g.rect(6,19,12,2,C.red).rect(6,26,12,1,C.red);
  g.rect(2,22,4,10,C.red).rect(18,22,4,10,C.red).rect(1,30,5,2,C.redDark).rect(18,30,5,2,C.redDark);
  g.rect(8,29,8,3,C.metalDark).rect(9,32,6,2,C.metal);
  g.rect(18,14,3,2,C.metalDark).rect(21,13,2,4,C.yellow);
  return g.outline().svg('garden-rocket-art');
});
/** A drifting cloud and a pixel sun for the greenhouse sky. */
export const cloudSprite = () => memo('cloud',() => canvas(22,8).oval(0,3,10,5,'#f4f1dc').oval(5,0,10,8,'#f4f1dc').oval(12,2,10,6,'#f4f1dc').rect(2,6,18,1,'#dcdcc3').svg('garden-cloud-art'));
export const sunSprite = () => memo('sun',() => {
  const g = canvas(18,18);
  g.oval(4,4,10,10,C.yellow).oval(5,5,7,7,'#f7d983').rect(6,6,2,2,C.cream);
  for (const [x,y] of [[8,0],[9,0],[8,16],[9,16],[0,8],[0,9],[16,8],[16,9],[2,2],[15,2],[2,15],[15,15]]) g.px(x,y,C.yellow);
  return g.svg('garden-sun-art');
});
export const sparkleSprite = () => memo('sparkle',() => canvas(7,7).px(3,0,C.cream).rect(3,1,1,5,C.glow).rect(1,3,5,1,C.glow).px(3,3,'#ffffff').px(0,3,C.cream).px(6,3,C.cream).px(3,6,C.cream).svg('garden-sparkle-art'));

/** Small shop icons, one per piece of garden equipment. */
export function equipmentIcon(id) {
  return ({growLights:lampSprite,hydroponics:() => tankSprite(0),tractor:() => tractorSprite(0),picker:() => pickerSprite(0)}[id] || lampSprite)();
}
