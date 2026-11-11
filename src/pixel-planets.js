/**
 * Original 16-bit-style pixel planets and stars. Each sprite is drawn once at a tiny
 * resolution (ordered-dither shading, hard outline, limited palette) and cached as a
 * data URL that the page scales up with `image-rendering: pixelated`.
 */
const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(value=>(value+.5)/16);
export const dither=(x,y)=>BAYER[(y&3)*4+(x&3)];
const OUTLINE=[10,12,30],SPACE=[16,19,44],CREAM=[255,244,214];
const LIGHT=(()=>{const v=[-.62,-.6,.5],l=Math.hypot(...v);return v.map(n=>n/l);})();
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
export function rgb(color){const hex=String(color).replace('#','');const full=hex.length===3?[...hex].map(c=>c+c).join(''):hex;return [0,2,4].map(i=>parseInt(full.slice(i,i+2),16)||0);}
const parse=color=>Array.isArray(color)?color:color.startsWith('hsl')?hsl(color):rgb(color);
function hsl(color){const [h,s,l]=color.match(/[\d.]+/g).map(Number),a=s/100*Math.min(l/100,1-l/100),f=n=>{const k=(n+h/30)%12;return Math.round(255*(l/100-a*Math.max(-1,Math.min(k-3,9-k,1))));};return [f(0),f(8),f(4)];}
export const mix=(a,b,t)=>a.map((value,i)=>Math.round(value+(b[i]-value)*t));
/** Five steps from deep shadow to highlight, all derived from one base colour. */
export const ramp=base=>{const c=parse(base);return [mix(c,SPACE,.74),mix(c,SPACE,.48),mix(c,SPACE,.2),c,mix(c,CREAM,.45)];};

function hash(x,y,z,seed){let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,1440662683)^Math.imul(seed|0,1274126177);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;}
const smooth=t=>t*t*(3-2*t);
function noise3(x,y,z,seed){
  const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),u=smooth(x-xi),v=smooth(y-yi),w=smooth(z-zi);
  const lerp=(a,b,t)=>a+(b-a)*t,corner=(dx,dy,dz)=>hash(xi+dx,yi+dy,zi+dz,seed);
  return lerp(lerp(lerp(corner(0,0,0),corner(1,0,0),u),lerp(corner(0,1,0),corner(1,1,0),u),v),lerp(lerp(corner(0,0,1),corner(1,0,1),u),lerp(corner(0,1,1),corner(1,1,1),u),v),w);
}
export const fbm=(x,y,z,seed)=>noise3(x,y,z,seed)*.58+noise3(x*2.07,y*2.07,z*2.07,seed+17)*.3+noise3(x*4.3,y*4.3,z*4.3,seed+41)*.12;

/** Returns [palette, level offset, emissive] for a point on the rotated sphere. */
function surface(kind,palettes,p,seed){
  const [x,y,z]=p,n=fbm(x*1.9+3,y*1.9+5,z*1.9+7,seed);
  switch(kind){
    case 'terrestrial':return Math.abs(y)>.8?[palettes.ice,0]:n>.53?[palettes.alt,n>.62?1:0]:[palettes.sea,0];
    case 'clouded':return fbm(x*1.4,y*4.2,z*1.4,seed+3)>.55?[palettes.light,0]:[palettes.base,0];
    case 'banded':case 'ringed':{const band=Math.sin(y*10+n*3.4);return band>.35?[palettes.alt,0]:band<-.55?[palettes.base,-1]:[palettes.base,0];}
    case 'molten':return Math.abs(n-.5)<.055?[palettes.hot,2,true]:[palettes.rock,0];
    case 'frost':return Math.abs(n-.5)<.03?[palettes.base,-2]:[palettes.light,0];
    case 'fractured':return Math.abs(n-.5)<.045?[palettes.hot,1,true]:[palettes.base,0];
    case 'storm':{const spot=Math.hypot((x-.28)/.36,(y-.22)/.2);if(z>0&&spot<1)return [palettes.hot,spot<.5?1:0];const band=Math.sin(y*12+n*2.5);return band>.3?[palettes.alt,0]:[palettes.base,0];}
    default:return [palettes.base,n>.6?1:0];
  }
}

function palettesFor(kind,color){
  const base=parse(color);
  return {base:ramp(base),sea:ramp(mix(base,[64,118,170],.6)),alt:ramp(kind==='terrestrial'?[118,158,96]:mix(base,kind==='storm'?[214,150,186]:[236,205,160],.42)),light:ramp(mix(base,CREAM,.55)),ice:ramp([226,236,240]),
    rock:ramp(mix(base,[60,44,52],.55)),hot:[[198,76,46],[226,112,52],[244,160,70],[255,206,104],[255,240,190]]};
}

function paint(ctx,width,height,colourAt){
  const image=ctx.createImageData(width,height),data=image.data,mask=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const color=colourAt(x,y);if(!color)continue;
    const i=(y*width+x)*4;data[i]=color[0];data[i+1]=color[1];data[i+2]=color[2];data[i+3]=255;mask[y*width+x]=1;
  }
  // A one-pixel ink outline, the way hand-drawn 16-bit sprites separate from the backdrop.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    if(mask[y*width+x])continue;
    const near=(x>0&&mask[y*width+x-1])||(x<width-1&&mask[y*width+x+1])||(y>0&&mask[(y-1)*width+x])||(y<height-1&&mask[(y+1)*width+x]);
    if(!near)continue;const i=(y*width+x)*4;data[i]=OUTLINE[0];data[i+1]=OUTLINE[1];data[i+2]=OUTLINE[2];data[i+3]=255;
  }
  ctx.putImageData(image,0,0);
}

/** Draws a planet onto a context at (left, top). Ringed planets are 1.75x as wide as they are tall. */
export function drawPixelPlanet(ctx,left,top,{kind='terrestrial',color='#8cb3c8',size=16,seed=1,turn=0}={}){
  const ringed=kind==='ringed',width=ringed?Math.round(size*1.75/2)*2:size,height=size;
  const scratch=ctx.canvas.ownerDocument?.createElement('canvas')??new OffscreenCanvas(width,height);scratch.width=width;scratch.height=height;
  const sctx=scratch.getContext('2d'),radius=(ringed?size*.36:size/2-1),cx=width/2,cy=height/2,palettes=palettesFor(kind,color);
  const ringColour=ramp(mix(parse(color),CREAM,.5)),tilt=-.32,cos=Math.cos(turn),sin=Math.sin(turn);
  const facets=kind==='crystal'?[[173,230,236],[132,112,190],[220,196,240],[96,184,202],[176,160,218],[150,214,226]].map(c=>ramp(c)):null;
  const ringAt=(x,y)=>{const rx=x*Math.cos(tilt)+y*Math.sin(tilt),ry=-x*Math.sin(tilt)+y*Math.cos(tilt),r=Math.hypot(rx,ry/.3)/radius;return r>1.28&&r<1.95?{r,front:ry>0}:null;};
  paint(sctx,width,height,(px,py)=>{
    const sx=px+.5-cx,sy=py+.5-cy,dx=sx/radius,dy=sy/radius,d2=dx*dx+dy*dy,ring=ringed?ringAt(sx,sy):null;
    // Solid bands (no dither) keep a thin ring readable at 12-16 pixels; the far side sits in shade.
    const ringPixel=()=>ringColour[clamp((ring.r<1.55?3:2)-(ring.front?0:1),0,4)];
    if(kind==='crystal'){
      // A faceted gem: hexagonal silhouette, flat-shaded faces, no texture.
      const angle=Math.atan2(dy,dx),hex=Math.cos(Math.PI/6)/Math.cos(((angle%(Math.PI/3))+Math.PI/3)%(Math.PI/3)-Math.PI/6),distance=Math.sqrt(d2);
      if(distance>hex*1.02)return null;
      const sector=Math.floor(((angle+Math.PI)/(Math.PI/3)))%6,inner=distance<hex*.48,palette=facets[(sector+(inner?3:0))%6];
      const light=clamp(.5+Math.cos(angle+2.3)*.35+(inner?.18:0),0,1);
      return palette[clamp(Math.floor(light*4+dither(px,py)*.8),0,4)];
    }
    if(d2>1)return ring?ringPixel():null;
    if(ring?.front)return ringPixel();
    const nz=Math.sqrt(1-d2),lambert=dx*LIGHT[0]+dy*LIGHT[1]+nz*LIGHT[2];
    const point=[dx*cos+nz*sin,dy,-dx*sin+nz*cos],[palette,offset,emissive]=surface(kind,palettes,point,seed);
    if(lambert>.9&&!emissive)return palette[4];
    const light=clamp((lambert+.14)/1.04,0,1),level=Math.floor(light*3.6+dither(px,py)*.9)+offset;
    return palette[clamp(emissive?Math.max(level,2):level,0,4)];
  });
  ctx.drawImage(scratch,left,top);
  return {width,height};
}

/** Every system's twentieth core is its star: a pixel sun wearing a crown. */
export function drawCrownedSun(ctx,left,top,{size=12,color='#ffcf5a'}={}){
  const scratch=ctx.canvas.ownerDocument?.createElement('canvas')??new OffscreenCanvas(size,size);scratch.width=size;scratch.height=size;
  const sctx=scratch.getContext('2d'),sun=[[176,62,34],[222,104,40],[246,156,52],parse(color),[255,246,196]],gold=[[122,74,26],[196,132,38],[246,204,82],[255,240,170]];
  const cx=size/2,cy=size*.56,radius=size*.25,crown=Math.max(1,Math.floor(size/12));
  // Crown silhouette: three spikes over a band, in rows from the top (scaled for larger sprites).
  // The crown floats one ink row above the sun so the two shapes read separately.
  const CROWN=['x.x.x','xxxxx','xxxxx'],crownWidth=CROWN[0].length*crown,crownLeft=Math.round(cx-crownWidth/2),crownTop=Math.max(0,Math.round(cy-radius)-1-CROWN.length*crown);
  paint(sctx,size,size,(px,py)=>{
    const cxp=px-crownLeft,cyp=py-crownTop;
    if(cyp===CROWN.length*crown&&cxp>=0&&cxp<crownWidth)return OUTLINE;
    if(cxp>=0&&cyp>=0&&cxp<crownWidth&&cyp<CROWN.length*crown&&CROWN[Math.floor(cyp/crown)][Math.floor(cxp/crown)]==='x'){
      const row=Math.floor(cyp/crown),column=Math.floor(cxp/crown);
      if(row===2&&column===2)return [214,60,72];
      return gold[row===0?3:row===1?2:1];
    }
    const sx=px+.5-cx,sy=py+.5-cy,distance=Math.hypot(sx,sy)/radius;
    if(distance<=1){const light=clamp(1-distance*.78+(-sx-sy)/radius*.18,0,1);return sun[clamp(Math.floor(light*4+dither(px,py)*.85),0,4)];}
    // Eight stubby rays, alternately long and short, give the sun its pixel corona.
    const angle=(Math.atan2(sy,sx)+Math.PI*2)%(Math.PI*2),spoke=Math.round(angle/(Math.PI/4))%8,offAxis=Math.abs(angle-spoke*Math.PI/4);
    const reach=spoke%2?1.42:1.7;
    if(distance<=reach&&(offAxis<.24||Math.abs(offAxis-Math.PI*2)<.24)&&spoke!==6)return distance<1.35?sun[2]:sun[1];
    return null;
  });
  ctx.drawImage(scratch,left,top);
  return {width:size,height:size};
}

const cache=new Map();
function spriteURL(key,width,height,draw){
  if(cache.has(key))return cache.get(key);
  if(typeof document==='undefined')return '';
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)return '';draw(ctx);
  const url=canvas.toDataURL('image/png');cache.set(key,url);return url;
}
export function planetSpriteURL({kind,color,size=16,seed=1,turn=0}){
  const width=kind==='ringed'?Math.round(size*1.75/2)*2:size;
  return spriteURL(`planet:${kind}:${color}:${size}:${seed}:${turn}`,width,size,ctx=>drawPixelPlanet(ctx,0,0,{kind,color,size,seed,turn}));
}
export const crownedSunURL=({size=12,color='#ffcf5a'}={})=>spriteURL(`sun:${size}:${color}`,size,size,ctx=>drawCrownedSun(ctx,0,0,{size,color}));
