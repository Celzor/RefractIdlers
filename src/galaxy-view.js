import { SYSTEMS, FINAL_LEVEL, FINAL_HP, FINAL_MIN_SECONDS, SECRET_HP, SECRET_DURATION, getCampaignLocation } from './campaign.js';
import { getOrb, getStats, getShipStatus } from './game.js';
import { planetSpriteURL, crownedSunURL } from './pixel-planets.js';

const safe=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const text=(node,value)=>{if(node.textContent!==String(value))node.textContent=value;};
// Notes are clamped with an ellipsis in CSS, so the hover title carries the full sentence.
const note=(node,value)=>{text(node,value);if(node.title!==String(value))node.title=value;};
const number=value=>value>=1e9?value.toExponential(1).replace('+',''):new Intl.NumberFormat('en',{maximumFractionDigits:0}).format(value||0);
const time=seconds=>{const value=Math.max(0,Math.ceil(seconds)),hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60);return hours?`${hours}h ${String(minutes).padStart(2,'0')}m`:`${minutes}m ${String(value%60).padStart(2,'0')}s`;};
// The expedition winds from the outer rim into the bright galactic heart.
const POSITIONS=[[13,66],[21,33],[42,17],[71,23],[86,49],[75,79],[48,83],[32,62],[41,39],[58,51]];
const SHAPES=['terrestrial','clouded','banded','ringed','molten','frost','fractured','ringed','storm','crystal'];

/** Pixel sprite markup for a system's world. Every twentieth core is the system's crowned star. */
function planet(index,ordinal=0,final=false) {
  if(final)return '<span class="galaxy-final-logo"><img src="assets/refract-icon.png" alt="Refract final core"></span>';
  if(ordinal===19)return `<img class="galaxy-planet sun" src="${crownedSunURL({size:16,color:SYSTEMS[index].color})}" alt="" aria-hidden="true">`;
  const hue=(index*39+ordinal*13+145)%360,color=ordinal?`hsl(${hue} 43% 62%)`:SYSTEMS[index].color,kind=SHAPES[(index+Math.floor(ordinal/4))%SHAPES.length];
  return `<img class="galaxy-planet ${kind}" src="${planetSpriteURL({kind,color,size:16,seed:index*20+ordinal+1,turn:ordinal*.33})}" alt="" aria-hidden="true">`;
}

/** Original, seeded star-and-dust artwork; no network textures or per-frame canvas work. */
function paintGalaxy(canvas) {
  const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return;
  const ratio=Math.min(devicePixelRatio||1,2),width=box.width,height=box.height;
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  const ctx=canvas.getContext('2d');if(!ctx)return;ctx.scale(ratio,ratio);
  let seed=190417;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(.00001,random())))*Math.cos(random()*Math.PI*2);
  const cx=width*.55,cy=height*.5,extent=Math.min(width*.54,height*.82),tilt=-.24;
  const project=(r,angle,spread=0)=>{const x=Math.cos(angle)*r*extent,y=Math.sin(angle)*r*extent*.64+spread;return {x:cx+x*Math.cos(tilt)-y*Math.sin(tilt),y:cy+x*Math.sin(tilt)+y*Math.cos(tilt)};};
  const background=ctx.createRadialGradient(cx,cy,0,cx,cy,width*.8);background.addColorStop(0,'#182439');background.addColorStop(.38,'#0d1526');background.addColorStop(1,'#060c18');ctx.fillStyle=background;ctx.fillRect(0,0,width,height);
  for(let i=0;i<900;i++){const x=random()*width,y=random()*height,size=random()>.975?1.7:random()*.8+.25;ctx.fillStyle=`rgba(${random()>.55?'166,190,219':'230,218,198'},${random()*.6+.08})`;ctx.fillRect(x,y,size,size);}
  ctx.globalCompositeOperation='screen';
  const haze=ctx.createRadialGradient(cx,cy,0,cx,cy,extent*.75);haze.addColorStop(0,'#d8bba42b');haze.addColorStop(.16,'#8396bd20');haze.addColorStop(.5,'#596da61a');haze.addColorStop(1,'#15274400');ctx.fillStyle=haze;ctx.fillRect(0,0,width,height);
  for(let i=0;i<6000;i++){
    const arm=i%3,r=Math.pow(random(),.69),angle=arm*Math.PI*2/3+3.9*Math.log(r+.14)+.48+gaussian()*(.08+.1*r),p=project(r,angle,gaussian()*extent*.018);
    const size=(2+random()*12)*(1-r*.4),alpha=(.014+random()*.035)*(1-r*.42),tone=arm===0?'136,155,207':arm===1?'174,143,192':'142,182,204';
    ctx.fillStyle=`rgba(${tone},${alpha})`;ctx.beginPath();ctx.arc(p.x,p.y,size,0,Math.PI*2);ctx.fill();
  }
  ctx.globalCompositeOperation='source-over';
  for(let i=0;i<950;i++){
    const r=.16+random()*.83,angle=(i%3)*Math.PI*2/3+3.9*Math.log(r+.14)+.67+gaussian()*.035,p=project(r,angle);
    ctx.fillStyle=`rgba(9,13,25,${random()*.12})`;ctx.beginPath();ctx.arc(p.x,p.y,2+random()*7,0,Math.PI*2);ctx.fill();
  }
  ctx.globalCompositeOperation='screen';
  for(let i=0;i<2700;i++){
    const r=Math.pow(random(),.72),angle=(i%3)*Math.PI*2/3+3.9*Math.log(r+.14)+.48+gaussian()*.12,p=project(r,angle,gaussian()*extent*.012),size=random()>.99?1.8:random()*.9+.3;
    ctx.fillStyle=`rgba(${r<.3?'242,218,188':'185,210,235'},${random()*.65+.12})`;ctx.fillRect(p.x,p.y,size,size);
  }
  const core=ctx.createRadialGradient(cx,cy,0,cx,cy,extent*.2);core.addColorStop(0,'#fff0d4ba');core.addColorStop(.07,'#e9ceb57a');core.addColorStop(.28,'#d0b8bc37');core.addColorStop(1,'#d4c2c000');ctx.fillStyle=core;ctx.fillRect(0,0,width,height);ctx.globalCompositeOperation='source-over';
}

export class GalaxyView {
  constructor(root,{onOrbit,onReplay,onNewJourney,onSecretChallenge,onLeaveSecret}={}) {
    this.onSecretChallenge=onSecretChallenge;this.onLeaveSecret=onLeaveSecret;this.secretSelected=false;
    this.root=root;this.onOrbit=onOrbit;this.onReplay=onReplay;this.onNewJourney=onNewJourney;this.player=null;this.state=null;this.selectedSystem=null;this.selectedPlanet=null;this.followCurrent=true;this.followPlanet=true;this.lastRoute='';this.heroKey='';
    const paths=POSITIONS.slice(1).map((position,index)=>{
      const from=POSITIONS[index],mid=[(from[0]+position[0])/2,(from[1]+position[1])/2];
      return `<path data-galaxy-route="${index}" d="M${from[0]},${from[1]} Q${mid[0]+(50-mid[0])*.14},${mid[1]+(50-mid[1])*.14} ${position[0]},${position[1]}"/>`;
    }).join('');
    root.innerHTML=`<section class="galaxy-layout" aria-label="Galaxy expedition map">
      <header class="galaxy-header"><div><h2>Galaxy</h2></div><div class="galaxy-expedition"><span data-galaxy-current></span><span data-galaxy-victories hidden></span></div><div class="galaxy-victory-actions" hidden><button type="button" data-galaxy-replay>Replay finale</button><button type="button" data-new-journey title="Keep your build, research and prestige. Restart the planetary route.">New journey ↗</button></div><button type="button" class="galaxy-locate" data-galaxy-locate>Locate my orbit</button></header>
      <div class="galaxy-chart"><canvas class="galaxy-canvas" aria-hidden="true"></canvas><div class="galaxy-coordinate galaxy-coordinate-top" aria-hidden="true">PERSEUS SURVEY / 010 SYSTEMS</div><div class="galaxy-coordinate galaxy-coordinate-bottom" aria-hidden="true">DEEP FIELD · REFRACT EXPEDITION</div>
        <svg class="galaxy-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>
        <div class="galaxy-systems" role="group" aria-label="Inspect solar systems">${SYSTEMS.map((system,index)=>`<button type="button" class="galaxy-system" data-galaxy-system="${index}" style="left:${POSITIONS[index][0]}%;top:${POSITIONS[index][1]}%;--system-color:${safe(system.color)}" aria-pressed="false"><span class="galaxy-system-orbit">${planet(index)}</span><span class="galaxy-system-index">${String(index+1).padStart(2,'0')}</span><strong>${safe(system.name)}</strong><small data-system-status="${index}"></small></button>`).join('')}</div>
        <div class="galaxy-twinkles" aria-hidden="true">${[[8,24],[27,18],[69,13],[89,71],[14,82],[49,26],[68,60],[89,32]].map(([x,y],index)=>`<i style="left:${x}%;top:${y}%;animation-delay:-${index*.83}s"></i>`).join('')}</div>
        <button type="button" class="galaxy-secret-star" data-secret-star aria-label="Inspect uncharted star" aria-pressed="false"><span aria-hidden="true">✦</span></button>
        <footer class="galaxy-map-footer"><div class="galaxy-legend"><span><i class="is-current"></i>Your orbit</span><span><i class="is-cleared"></i>Cleared</span><span><i></i>Uncharted</span></div><span data-galaxy-record></span></footer>
      </div>
      <aside class="galaxy-inspector" aria-label="Selected solar system"><div class="galaxy-inspector-top"><span class="galaxy-eyebrow" data-galaxy-system-number></span><span class="galaxy-system-badge" data-galaxy-system-badge></span></div><div class="galaxy-system-heading"><div class="galaxy-hero" data-galaxy-hero></div><div><h3 data-galaxy-system-name></h3><p data-galaxy-core-range></p></div></div><p class="galaxy-system-description" data-galaxy-description></p>
        <div class="galaxy-route-heading"><span>PLANETARY CORES</span><span data-galaxy-progress></span></div><div class="galaxy-planets" role="group" aria-label="Inspect planetary cores"></div>
        <section class="galaxy-encounter" aria-label="Selected planetary core"><div class="galaxy-encounter-heading"><span data-galaxy-planet-number></span><span data-galaxy-planet-status></span></div><h4 data-galaxy-planet-name></h4><p data-galaxy-hp></p><div class="galaxy-hp-track" aria-hidden="true"><i></i></div><p class="galaxy-encounter-note" data-galaxy-encounter-note></p></section>
        <div class="galaxy-final-note" hidden><span class="galaxy-final-symbol" aria-hidden="true">✧</span><p><strong>Beam’s home. The final Refract core.</strong>The hardest known substance in all parallel universes. Crystal resonance requires at least ${time(FINAL_MIN_SECONDS)} of active combat. Break it, and Beam crushes it up for the most wicked high in every universe.</p></div>
        <div class="galaxy-inspector-footer"><p data-galaxy-navigation-note>Clear each core in order. Beam’s meals fuel the ship: fill the tank to jump from each twentieth planet to the next system.</p><button type="button" class="galaxy-return" data-galaxy-orbit>Return to the orbit <span aria-hidden="true">↗</span></button></div>
      </aside>
      <aside class="galaxy-secret-inspector" aria-label="Secret star" hidden>
        <h3>The Green Star</h3><p class="secret-system-size">1 planet</p>
        <div class="secret-planet"><img class="galaxy-planet clouded" src="${planetSpriteURL({kind:'clouded',color:'#6fc979',size:16,seed:420})}" alt="" aria-hidden="true"><h4>Haze</h4><span data-secret-status>Optional boss</span></div>
        <dl class="secret-requirements"><div><dt>Health</dt><dd>${number(SECRET_HP)} HP</dd></div><div><dt>Time limit</dt><dd>${SECRET_DURATION} seconds</dd></div><div><dt>Required DPS</dt><dd>${number(SECRET_HP/SECRET_DURATION)}</dd></div><div><dt>Your auto DPS</dt><dd data-secret-dps>0</dd></div></dl>
        <p class="secret-reward">Reward: unlock weed in your farm.</p><p class="secret-reward-detail">Feed it to Beam for 4.20× earned LRCs for 4m 20s.</p>
        <div class="secret-actions"><button type="button" class="galaxy-return" data-secret-start>Challenge Haze ↗</button><button type="button" class="galaxy-locate" data-secret-leave hidden>Leave challenge</button><p data-secret-note></p></div>
      </aside>
    </section>`;
    this.canvas=root.querySelector('canvas');this.chart=root.querySelector('.galaxy-chart');this.chart.append(root.querySelector('.galaxy-final-note'));
    this.resizeObserver=new ResizeObserver(()=>paintGalaxy(this.canvas));this.resizeObserver.observe(this.chart);
    this.onViewChange=event=>{if(event.detail?.view==='galaxy')paintGalaxy(this.canvas);};document.addEventListener('game-view-change',this.onViewChange);
    root.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button||button.disabled)return;
      if(button.hasAttribute('data-galaxy-orbit')){this.onOrbit?.();return;}
      if(button.hasAttribute('data-galaxy-replay')){this.onReplay?.();return;}
      if(button.hasAttribute('data-new-journey')){this.onNewJourney?.();return;}
      if(button.hasAttribute('data-secret-start')){if(this.player?.secretOrb)this.onOrbit?.();else this.onSecretChallenge?.();return;}
      if(button.hasAttribute('data-secret-leave')){this.onLeaveSecret?.();return;}
      if(button.hasAttribute('data-secret-star')){this.secretSelected=true;if(this.player)this.render(this.sourcePlayer,this.state,this.usable);return;}
      if(button.hasAttribute('data-galaxy-locate')){this.secretSelected=false;this.followCurrent=true;this.followPlanet=true;this.selectedPlanet=null;if(this.player)this.render(this.sourcePlayer,this.state,this.usable);return;}
      if(button.hasAttribute('data-galaxy-system')){this.secretSelected=false;this.followCurrent=false;this.followPlanet=true;this.selectedSystem=Number(button.dataset.galaxySystem);this.selectedPlanet=null;}
      if(button.hasAttribute('data-galaxy-planet')){this.selectedPlanet=Number(button.dataset.galaxyPlanet);this.followPlanet=false;}
      if(this.player)this.render(this.sourcePlayer,this.state,this.usable);
    });
  }

  render(player,state,usable) {
    this.sourcePlayer=player;this.spectating=!player;player=player||state?.players[0];
    this.player=player;this.state=state;this.usable=usable&&!this.spectating;if(!player||!state)return;
    const campaignPlayer={...player,secretOrb:null};
    const orb=getOrb(campaignPlayer,state),location=getCampaignLocation(orb.level),won=state.phase==='victory'&&(state.mode==='coop'||state.victory?.playerId===player.id);
    if(this.followCurrent||this.selectedSystem===null)this.selectedSystem=location.index;
    const selected=SYSTEMS[this.selectedSystem],isCurrent=this.selectedSystem===location.index,systemCleared=won||this.selectedSystem<location.index;
    if(isCurrent&&this.followPlanet||this.selectedPlanet===null||this.selectedPlanet<selected.startLevel||this.selectedPlanet>selected.endLevel)this.selectedPlanet=isCurrent?orb.level:selected.startLevel;
    const selectedLocation=getCampaignLocation(this.selectedPlanet),final=this.selectedPlanet===FINAL_LEVEL,planetCleared=won||this.selectedPlanet<orb.level,planetCurrent=!won&&this.selectedPlanet===orb.level;
    // Ask the same read-only engine preview for future HP, including co-op scaling.
    const inspectedOrb={level:this.selectedPlanet,hp:1},preview=planetCurrent?orb:getOrb({...campaignPlayer,orb:inspectedOrb},state.mode==='coop'?{...state,sharedOrb:inspectedOrb}:state);
    text(this.root.querySelector('[data-galaxy-current]'),`${this.spectating?'SPECTATING · ':''}${won?'EXPEDITION COMPLETE':`SYSTEM ${String(location.index+1).padStart(2,'0')} / 10 · CORE ${Math.min(orb.level,FINAL_LEVEL)} / ${FINAL_LEVEL}`}`);
    text(this.root.querySelector('[data-galaxy-locate]'),this.spectating?'Locate observed orbit':'Locate my orbit');
    const victoryBadge=this.root.querySelector('[data-galaxy-victories]');victoryBadge.hidden=!(player.victories>0);text(victoryBadge,`${player.victories||0} ${player.victories===1?'galaxy':'galaxies'} completed`);
    this.root.querySelector('.galaxy-victory-actions').hidden=state.phase!=='victory';
    text(this.root.querySelector('[data-galaxy-record]'),`Best recorded core ${Math.min(player.highestOrb||1,FINAL_LEVEL)} · This journey: ${Math.min(orb.level,FINAL_LEVEL)}`);
    for(const button of this.root.querySelectorAll('[data-galaxy-system]')){
      const index=Number(button.dataset.galaxySystem),current=index===location.index&&!won,cleared=index<location.index||won,chosen=index===this.selectedSystem;
      button.classList.toggle('is-current',current);button.classList.toggle('is-cleared',cleared);button.classList.toggle('is-selected',chosen);button.classList.toggle('is-locked',!current&&!cleared);button.setAttribute('aria-pressed',String(chosen));
      const status=current?(this.spectating?'OBSERVED ORBIT':'YOU ARE HERE'):cleared?'CLEARED':'UNCHARTED';text(button.querySelector('small'),status);button.setAttribute('aria-label',`Inspect ${SYSTEMS[index].name}, system ${index+1}. ${status.toLowerCase()}.`);
    }
    for(const path of this.root.querySelectorAll('[data-galaxy-route]'))path.classList.toggle('is-charted',won||Number(path.dataset.galaxyRoute)<location.index);
    text(this.root.querySelector('[data-galaxy-system-number]'),`SYSTEM ${String(this.selectedSystem+1).padStart(2,'0')} / 10`);
    text(this.root.querySelector('[data-galaxy-system-badge]'),systemCleared?'Cleared':isCurrent?'Current orbit':'Uncharted');
    text(this.root.querySelector('[data-galaxy-system-name]'),selected.name);text(this.root.querySelector('[data-galaxy-core-range]'),`Cores ${selected.startLevel}–${selected.endLevel}`);note(this.root.querySelector('[data-galaxy-description]'),selected.description);
    const cleared=won?20:Math.max(0,Math.min(20,orb.level-selected.startLevel));text(this.root.querySelector('[data-galaxy-progress]'),`${cleared} / 20 cleared`);
    if(this.heroKey!==String(this.selectedSystem)){this.root.querySelector('[data-galaxy-hero]').innerHTML=planet(this.selectedSystem);this.heroKey=String(this.selectedSystem);}
    if(this.lastRoute!==String(this.selectedSystem)){
      this.root.querySelector('.galaxy-planets').innerHTML=selected.planets.map((name,index)=>{const level=selected.startLevel+index;return `<button type="button" class="galaxy-planet-button" data-galaxy-planet="${level}" aria-pressed="false" title="${safe(name)}">${planet(this.selectedSystem,index,level===FINAL_LEVEL)}<span>${level}</span></button>`;}).join('');this.lastRoute=String(this.selectedSystem);
    }
    for(const button of this.root.querySelectorAll('[data-galaxy-planet]')){
      const level=Number(button.dataset.galaxyPlanet),done=won||level<orb.level,current=!won&&level===orb.level,chosen=level===this.selectedPlanet;
      button.classList.toggle('is-cleared',done);button.classList.toggle('is-current',current);button.classList.toggle('is-selected',chosen);button.setAttribute('aria-pressed',String(chosen));button.dataset.state=done?'cleared':current?'current':'locked';
      button.setAttribute('aria-label',`Inspect ${selected.planets[level-selected.startLevel]}, core ${level}, ${done?'cleared':current?'current orbit':'uncharted'}`);
    }
    text(this.root.querySelector('[data-galaxy-planet-number]'),`CORE ${this.selectedPlanet}${final?' · FINAL':preview.systemBoss?' · SYSTEM BOSS':''}`);
    text(this.root.querySelector('[data-galaxy-planet-status]'),planetCleared?'Cleared':planetCurrent?'In your sights':'Uncharted');text(this.root.querySelector('[data-galaxy-planet-name]'),selectedLocation.planetName);
    text(this.root.querySelector('[data-galaxy-hp]'),planetCurrent?`${number(orb.hp)} / ${number(orb.maxHp)} HP`:final?`${number(preview.maxHp)} HP · ${number(FINAL_HP)} base`:`${number(preview.maxHp)} HP · system ${this.selectedSystem+1}`);
    const track=this.root.querySelector('.galaxy-hp-track');track.hidden=!planetCurrent;track.querySelector('i').style.width=`${Math.min(100,Math.max(0,orb.hp/orb.maxHp*100))}%`;
    note(this.root.querySelector('[data-galaxy-encounter-note]'),final?(planetCurrent?`Resonance: ${time(orb.finalRemaining??FINAL_MIN_SECONDS)} remaining. Active combat only; pauses between rounds.`:'Shatter its HP and complete 3h of active resonance. No offline or intermission progress.'):preview.systemBoss?`30s DPS check · ${number(preview.requiredDps)} effective DPS required. Health resets on timeout. Defeat it to enter the next system.`:'Destroy this core to continue.');
    this.root.querySelector('.galaxy-final-note').hidden=this.selectedSystem!==SYSTEMS.length-1;
    this.root.querySelector('.galaxy-inspector').classList.toggle('is-crystal',this.selectedSystem===SYSTEMS.length-1);
    note(this.root.querySelector('[data-galaxy-navigation-note]'),state.phase==='victory'?'A new journey keeps your build, research and prestige, and restarts the planetary route.':(()=>{const ship=player?getShipStatus(player,state):null;return ship?.grounded?`Grounded: Beam has fuelled ${Math.floor(ship.fuel)} of ${ship.target}. Feed him in the Farm to jump.`:'Clear cores to travel. Beam’s meals fuel each jump between systems.';})());
    this.root.querySelector('[data-galaxy-orbit]').disabled=false;
    this.root.querySelector('.galaxy-inspector').hidden=this.secretSelected;
    this.root.querySelector('.galaxy-secret-inspector').hidden=!this.secretSelected;
    this.root.querySelector('[data-secret-star]').setAttribute('aria-pressed',String(this.secretSelected));
    if(this.secretSelected)this.root.querySelector('.galaxy-final-note').hidden=true;
    const unlocked=Boolean(player.farm?.crops?.weed),active=Boolean(player.secretOrb);
    text(this.root.querySelector('[data-secret-dps]'),number(getStats(player,state).autoDps));
    text(this.root.querySelector('[data-secret-status]'),unlocked?'Cleared':active?'Challenge active':'Optional boss');
    text(this.root.querySelector('[data-secret-start]'),unlocked?'Weed unlocked':active?'Return to challenge ↗':'Challenge Haze ↗');
    this.root.querySelector('[data-secret-start]').disabled=!this.usable||unlocked||!['round','intermission'].includes(state.phase);
    this.root.querySelector('[data-secret-leave]').hidden=!active;
    this.root.querySelector('[data-secret-leave]').disabled=!this.usable||state.phase==='victory';
    text(this.root.querySelector('[data-secret-note]'),unlocked?'Grow weed in the Farm tab.':state.phase==='lobby'?'Start a round to enter.':active?(state.mode==='coop'?'Your crew continues while you fight Haze.':'Return to your campaign after this fight.'):state.phase==='victory'?'Begin a new journey to enter.':'A personal challenge. Return to your campaign afterward.');
  }

  destroy(){this.resizeObserver.disconnect();document.removeEventListener('game-view-change',this.onViewChange);}
}
