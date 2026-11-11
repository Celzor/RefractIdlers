import { CROPS, FARM_UPGRADES, MAX_PLOTS, WATER_SECONDS, COOKED_SECONDS, COOKED_SCORE_MULTIPLIER, getFarmStats, plotSecondsLeft, farmPlotCost, farmCropCost, farmSeedCost, farmUpgradeCost, getFarmUnlocked } from './farm.js';
import { getBalance, getShipStatus } from './game.js';
import { SYSTEMS } from './campaign.js';
import { plantSprite, plantFrame, produceIcon, lampSprite, tankSprite, tractorSprite, pickerSprite, wateringCanSprite, fertiliserSprite, rocketSprite, toiletSprite, knifeSprite, cloudSprite, sunSprite, sparkleSprite, droplet, equipmentIcon } from './farm-sprites.js';

const safe = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number = value => new Intl.NumberFormat('en', { notation:value >= 10000 ? 'compact' : 'standard', maximumFractionDigits:1 }).format(value || 0);
const cropById = new Map(CROPS.map(crop => [crop.id,crop]));
const setText = (node,value) => { if(node.textContent !== String(value))node.textContent=value; };
const setData = (node,key,value) => { value=String(value); if(node.dataset[key] !== value)node.dataset[key]=value; };
const BEAM_SPRITE = new URL('../assets/beam-pixel.svg', import.meta.url).href;
const beamLayer = name => `<use class="${name}" href="${BEAM_SPRITE}#${name}"/>`;
/** Each bed shows three plants; slightly staggered so a bed reads as a living patch, not clones. */
const PLANT_PACE = [.95,1,.9];
/** Every vegetable is chopped this many times on the board before Beam gets it. */
export const CHOPS = 4;

/** Pixel greenhouse backdrop: glass, sky, a wooden knee wall and a flagstone floor. Stretches to the scene. */
function backdrop() {
  const r = (x,y,w,h,fill,extra='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`;
  let art = r(0,0,160,40,'#a9cdc4')+r(0,0,160,9,'#bfd9cd')+r(0,26,160,14,'#c9dbb6');
  // Distant hills and trees seen through the glass.
  art += '<path fill="#9cbb8f" d="M0 34h12v-3h10v-2h14v3h12v-4h18v2h10v3h16v-3h14v-2h20v4h10v2h24v10H0z"/>';
  art += '<path fill="#86a77a" d="M0 37h20v-2h18v1h22v-2h16v2h30v-1h24v1h30v5H0z"/>';
  for (const x of [8,46,93,131]) art += r(x,29,4,3,'#6f9a68')+r(x+1,28,2,1,'#6f9a68')+r(x+1,32,2,3,'#7a5a3a');
  // Glass panes and the greenhouse frame.
  for (let x = 0; x <= 160; x += 20) art += r(x-1,0,2,40,'#5e7a58')+r(x,0,1,40,'#87a37c');
  art += r(0,0,160,2,'#4d6648')+r(0,13,160,1,'#5e7a58')+r(0,26,160,1,'#5e7a58');
  for (let x = 3; x < 160; x += 20) art += r(x,3,1,7,'#e6f0e2',' opacity=".55"')+r(x+2,15,1,5,'#e6f0e2',' opacity=".35"');
  // A wooden knee wall with a shelf of terracotta pots.
  art += r(0,40,160,6,'#8a6440')+r(0,40,160,1,'#b38a58')+r(0,45,160,1,'#5f4430');
  for (let x = 0; x < 160; x += 9) art += r(x,41,1,4,'#6e4f35');
  // Flagstone floor.
  art += r(0,46,160,54,'#7d6a4f');
  for (let y = 46, row = 0; y < 100; y += 6, row++) {
    art += r(0,y,160,1,'#64543f');
    for (let x = row%2 ? 0 : 7; x < 160; x += 14) art += r(x,y,1,6,'#64543f')+r(x+2,y+2,3,1,'#8b7759');
  }
  return `<svg class="garden-backdrop" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true" shape-rendering="crispEdges">${art}</svg>`;
}
/** Beam on his throne. Meals go in; a rainbow runs down the flush pipe into the ship's tank. */
function beamThrone() {
  return `<div class="garden-throne" aria-hidden="true">${toiletSprite()}<svg class="garden-beam-sprite" viewBox="0 0 64 64" shape-rendering="crispEdges">${['beam-body','beam-head','beam-eyes','beam-eyes-worried','beam-eyes-cheer','beam-hand-left','beam-hand-right','beam-feet'].map(beamLayer).join('')}</svg><span class="garden-strain"></span><span class="garden-chew"></span></div>`;
}
/** The chopping board overlay: one vegetable, one knife, four chops, then it is served. */
function kitchen() {
  return `<div class="garden-kitchen" data-kitchen hidden role="group" aria-label="Chop a vegetable for Beam">
    <div class="garden-kitchen-card">
      <div class="garden-kitchen-heading"><span data-kitchen-title>Chop the carrot</span><button type="button" class="garden-kitchen-cancel" data-kitchen-cancel aria-label="Put the vegetable back">×</button></div>
      <button type="button" class="garden-board" data-chop aria-label="Chop"><span class="garden-slices" data-slices></span><span class="garden-knife">${knifeSprite()}</span><span class="garden-crumbs"><i></i><i></i><i></i><i></i></span></button>
      <div class="garden-kitchen-pips" data-chop-pips aria-hidden="true"></div>
      <p class="garden-kitchen-note" data-kitchen-note></p>
    </div>
  </div>`;
}

export class FarmView {
  constructor(root,{send,onResearch,onEvent}) {
    this.root=root;this.send=send;this.onResearch=onResearch;this.onEvent=onEvent;this.selectedCrop='carrot';this.player=null;this.state=null;
    this.previous=null;this.localActions=new Map();this.pickerTargets=[];this.tractorTargets=[];
    const slot = index => `<div class="garden-slot" data-bed-slot="${index}">
      <button type="button" class="garden-bed" data-farm-plot="${index}"><span class="garden-bed-label"></span><span class="garden-soil" aria-hidden="true"><i></i><i></i><i></i></span><span class="garden-crop-art" aria-hidden="true"></span><span class="garden-bed-action"></span><span class="garden-meters" aria-hidden="true"><span class="garden-growth"><i></i></span><span class="garden-water"><i></i></span></span></button>
      <div class="garden-tools"><button type="button" class="garden-tool garden-tool-water" data-water-plot="${index}" hidden>${wateringCanSprite()}</button><button type="button" class="garden-tool garden-tool-fertilise" data-fertilise-plot="${index}" hidden>${fertiliserSprite()}</button></div>
      <span class="garden-drip" aria-hidden="true">${droplet()}${droplet()}${droplet()}</span><span class="garden-fx" aria-hidden="true"></span></div>`;
    root.innerHTML=`<div class="garden-layout">
      <section class="garden-main panel" aria-label="Beam's vegetable garden">
        <header class="garden-header"><div><h2>Beam’s Garden</h2></div><span class="garden-season" data-farm-status>Ready to plant</span></header>
        <div class="garden-scene" data-active="false" aria-label="Your purchased garden beds and equipment">
          ${backdrop()}
          <span class="garden-sun" aria-hidden="true">${sunSprite()}</span><span class="garden-cloud" aria-hidden="true">${cloudSprite()}</span><span class="garden-cloud garden-cloud-two" aria-hidden="true">${cloudSprite()}</span>
          <div class="garden-light-rack" data-farm-equipment="growLights"></div>
          <div class="garden-hydro" data-farm-equipment="hydroponics"></div>
          <div class="garden-pipes" aria-hidden="true"><span class="garden-pipe garden-pipe-feed"></span><span class="garden-pipe garden-pipe-top"><i></i></span><span class="garden-pipe garden-pipe-bottom"><i></i></span></div>
          <div class="garden-beds">${Array.from({length:MAX_PLOTS},(_,index)=>slot(index)).join('')}<div class="garden-rail" data-farm-equipment="picker" aria-label="Picker bots"></div></div>
          <div class="garden-lane" data-farm-equipment="tractor" aria-label="Tractors"></div>
          <aside class="garden-ship" data-ship aria-label="Beam’s ship fuel">
            <span class="garden-ship-label">SHIP FUEL</span>
            ${beamThrone()}
            <span class="garden-flush-pipe" aria-hidden="true"><i></i></span>
            <div class="garden-ship-body"><span class="garden-rocket">${rocketSprite()}<span class="garden-rocket-fuel" aria-hidden="true"><i data-fuel-fill></i></span></span></div>
            <strong data-fuel-text>0 / 120</strong><small data-fuel-note>Feed Beam to fuel the ship.</small>
          </aside>
          ${kitchen()}
        </div>
        <div class="garden-readout"><span data-farm-stats></span><button type="button" class="garden-link" data-farm-research>Farm research ↗</button></div>
        <section class="garden-pantry" aria-label="Harvest basket and feeding Beam"><div class="garden-pantry-heading"><h3>Harvest basket</h3><span data-farm-meal>No active meal</span></div><div class="garden-foods">${CROPS.map(crop=>`<div class="garden-food" data-food="${crop.id}"><span class="garden-food-icon">${produceIcon(crop.id)}</span><div><span class="garden-food-name">${safe(crop.name)}</span><strong data-stock="${crop.id}">0</strong></div><button type="button" data-feed-crop="${crop.id}">Feed</button></div>`).join('')}</div><p class="garden-feed-note">Meals boost your income &amp; damage and fuel the ship. A full Beam sends food straight to the tank.</p></section>
      </section>
      <section class="garden-workshop panel" aria-label="Garden seeds and upgrades"><div id="farm-shop-companion" class="shop-companion"></div><header><h2>Garden shed</h2><p>Plant, water, fertilise, harvest.</p></header>
        <div class="garden-seeds" role="group" aria-label="Choose or unlock vegetable seeds">${CROPS.map(crop=>`<button type="button" class="garden-seed" data-select-crop="${crop.id}" aria-pressed="false"><span class="garden-seed-icon">${produceIcon(crop.id)}</span><span class="garden-seed-name">${safe(crop.name)}</span><small data-seed-detail="${crop.id}"></small></button>`).join('')}</div>
        <div class="garden-expansion"><span><b>Planting beds</b><small data-plot-count></small></span><button type="button" data-buy-farm-plot></button></div>
        <div class="garden-upgrades">${FARM_UPGRADES.map(upgrade=>`<article class="garden-upgrade" data-upgrade="${upgrade.id}"><span class="garden-upgrade-icon" aria-hidden="true">${equipmentIcon(upgrade.id)}</span><div><h3>${safe(upgrade.name)} <span data-upgrade-level="${upgrade.id}"></span></h3><p>${safe(upgrade.description)}</p></div><button type="button" data-farm-upgrade="${upgrade.id}"></button></article>`).join('')}</div>
        <div class="garden-round"><span data-garden-round-note>Plants grow during rounds.</span><button type="button" class="primary-button" data-garden-ready hidden>Ready for next round</button></div>
      </section>
    </div>`;
    this.scene=root.querySelector('.garden-scene');this.kitchen=null;this.reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
    this.slots=[...root.querySelectorAll('[data-bed-slot]')];this.plots=[...root.querySelectorAll('[data-farm-plot]')];
    root.addEventListener('keydown',event=>{if(event.key==='Escape'&&this.kitchen){event.preventDefault();this.closeKitchen();}});
    this.artSignatures=new Map();this.equipmentSignature='';
    for(const crop of CROPS.filter(crop=>crop.secret))for(const selector of [`[data-select-crop="${crop.id}"]`,`[data-food="${crop.id}"]`])root.querySelector(selector).hidden=true;
    root.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button||button.disabled||!this.player)return;
      if(button.hasAttribute('data-farm-research')){this.onResearch?.();return;}
      if(button.hasAttribute('data-garden-ready')){this.send({type:'ready'});return;}
      if(button.hasAttribute('data-buy-farm-plot')){this.send({type:'buyFarmPlot'});return;}
      if(button.dataset.farmUpgrade){this.send({type:'buyFarmUpgrade',id:button.dataset.farmUpgrade});return;}
      if(button.hasAttribute('data-kitchen-cancel')){this.closeKitchen();return;}
      if(button.hasAttribute('data-chop')){this.chop();return;}
      if(button.dataset.feedCrop){this.openKitchen(button.dataset.feedCrop,button);return;}
      if(button.dataset.waterPlot){this.tend(Number(button.dataset.waterPlot),'waterCrop');return;}
      if(button.dataset.fertilisePlot){this.tend(Number(button.dataset.fertilisePlot),'fertiliseCrop');return;}
      if(button.dataset.selectCrop){const id=button.dataset.selectCrop;if(!this.player.farm.crops[id])this.send({type:'unlockCrop',id});else{this.selectedCrop=id;this.render(this.player,this.state,this.usable);}return;}
      if(button.hasAttribute('data-farm-plot')){
        const plot=Number(button.dataset.farmPlot),bed=this.player.farm.plots[plot],stats=getFarmStats(this.player);
        if(!bed)this.send({type:'buyFarmPlot'});
        else if(!bed.crop)this.send({type:'plantCrop',plot,crop:this.selectedCrop});
        else if(bed.progress>=1){this.localActions.set(`harvest:${plot}`,performance.now());this.burst(plot,'harvest',bed.crop);this.send({type:'harvestCrop',plot});}
        else if(!stats.autoWater&&bed.water<1-1e-9)this.tend(plot,'waterCrop');
        else if(!bed.fertilised)this.tend(plot,'fertiliseCrop');
      }
    });
  }

  /** The board opens with a whole vegetable; it is served only after every chop lands. */
  openKitchen(crop,origin) {
    if(!this.player?.farm?.inventory?.[crop])return;
    this.kitchen={crop,cuts:0,origin};clearTimeout(this.serveTimer);
    const panel=this.root.querySelector('[data-kitchen]');panel.hidden=false;panel.classList.remove('is-serving');
    this.root.querySelector('[data-chop]').disabled=false;
    setText(this.root.querySelector('[data-kitchen-title]'),`Chop the ${cropById.get(crop)?.name.toLowerCase()||'vegetable'}`);
    this.renderKitchen();this.root.querySelector('[data-chop]').focus({preventScroll:true});
  }
  chop() {
    if(!this.kitchen||this.kitchen.cuts>=CHOPS)return;
    this.kitchen.cuts++;
    const board=this.root.querySelector('[data-chop]');board.classList.remove('is-chopping');void board.offsetWidth;board.classList.add('is-chopping');
    this.renderKitchen();
    if(this.kitchen.cuts>=CHOPS)this.serve();
  }
  renderKitchen() {
    const {crop,cuts}=this.kitchen,pieces=cuts+1;
    // Each chop splits the vegetable into one more vertical slice; slices drift apart on the board.
    this.root.querySelector('[data-slices]').innerHTML=Array.from({length:pieces},(_,index)=>`<span class="garden-slice" style="--i:${index};--n:${pieces};clip-path:inset(0 ${(100-(index+1)*100/pieces).toFixed(2)}% 0 ${(index*100/pieces).toFixed(2)}%)">${produceIcon(crop)}</span>`).join('');
    this.root.querySelector('[data-chop-pips]').innerHTML=Array.from({length:CHOPS},(_,index)=>`<i class="${index<cuts?'is-done':''}"></i>`).join('');
    const left=CHOPS-cuts;setText(this.root.querySelector('[data-kitchen-note]'),left?`Click the board or press Space · ${left} ${left===1?'chop':'chops'} to go`:'Served! Beam is eating.');
    this.root.querySelector('[data-chop]').setAttribute('aria-label',left?`Chop, ${left} to go`:'Served');
  }
  serve() {
    const {crop}=this.kitchen,panel=this.root.querySelector('[data-kitchen]');
    this.root.querySelector('[data-chop]').disabled=true;panel.classList.add('is-serving');
    const throne=this.root.querySelector('.garden-throne');throne.classList.remove('is-eating');void throne.offsetWidth;throne.classList.add('is-eating');
    this.send({type:'feedBeam',crop});
    clearTimeout(this.serveTimer);this.serveTimer=setTimeout(()=>this.closeKitchen(),this.reduced?0:650);
  }
  closeKitchen() {
    const origin=this.kitchen?.origin;this.kitchen=null;clearTimeout(this.serveTimer);
    const panel=this.root.querySelector('[data-kitchen]');panel.hidden=true;panel.classList.remove('is-serving');
    this.root.querySelector('[data-chop]').disabled=false;
    if(origin?.isConnected)origin.focus({preventScroll:true});
  }
  /** Fuel went up: Beam strains on the throne, the rainbow runs down the pipe, and the tank fills last. */
  digest() {
    const nodes=['.garden-throne','.garden-flush-pipe','[data-ship]'].map(selector=>this.root.querySelector(selector));
    for(const node of nodes){node.classList.remove('is-digesting');void node.offsetWidth;node.classList.add('is-digesting');}
    clearTimeout(this.digestTimer);this.digestTimer=setTimeout(()=>{for(const node of nodes)node.classList.remove('is-digesting');},this.reduced?400:3600);
  }

  /** Chores give instant feedback; the host still decides whether they happened. */
  tend(plot,type) {
    this.localActions.set(`${type}:${plot}`,performance.now());
    this.burst(plot,type==='waterCrop'?'water':'fertilise');
    this.send({type,plot});
  }

  /** Short-lived pixel particles over one bed. Removed by timer so reduced motion never leaves them behind. */
  burst(plot,kind,crop) {
    const fx=this.slots[plot]?.querySelector('.garden-fx');if(!fx)return;
    const node=document.createElement('span');node.className=`garden-burst garden-burst-${kind}`;
    node.innerHTML=kind==='water'?droplet().repeat(5):kind==='harvest'||kind==='pick'?`${produceIcon(crop)}<b>+</b>`:sparkleSprite().repeat(kind==='fertilise'?4:3);
    fx.append(node);setTimeout(()=>node.remove(),1300);
  }

  /** Spot automation and refuelling by comparing snapshots, then animate the machine that did it. */
  detectEvents(farm,ship) {
    const now=performance.now(),recent=key=>now-(this.localActions.get(key)||-1e9)<4000,previous=this.previous;
    if(previous&&previous.playerId===this.player.id){
      farm.plots.forEach((plot,index)=>{
        const before=previous.plots[index];if(!before)return;
        const picked=before.crop&&before.progress>=1&&(plot.crop===null||plot.progress<before.progress);
        if(picked&&!recent(`harvest:${index}`)){this.pickerTargets.push(index);this.burst(index,'pick',before.crop);this.onEvent?.('autoHarvest');}
        if(plot.crop&&plot.fertilised&&!(before.crop===plot.crop&&before.fertilised)&&!recent(`fertiliseCrop:${index}`)&&plot.progress>0){this.tractorTargets.push(index);this.burst(index,'fertilise');}
      });
      if(ship.fuel>previous.fuel+1e-9)this.digest();
    }
    this.previous={playerId:this.player.id,fuel:ship.fuel,plots:farm.plots.map(plot=>({crop:plot.crop,progress:plot.progress,fertilised:plot.fertilised}))};
    // Machines head for the bed they just worked on.
    const columnOf=index=>index%3;
    for(const [selector,targets] of [['[data-farm-equipment="picker"] [data-equipment-unit]',this.pickerTargets],['[data-farm-equipment="tractor"] [data-equipment-unit]',this.tractorTargets]]){
      const units=[...this.root.querySelectorAll(selector)];if(!units.length){targets.length=0;continue;}
      while(targets.length){const target=targets.shift(),unit=units[target%units.length];unit.style.setProperty('--column',String(columnOf(target)));unit.classList.remove('is-working');void unit.offsetWidth;unit.classList.add('is-working');}
    }
  }

  renderEquipment(farm) {
    const signature=FARM_UPGRADES.map(upgrade=>farm.upgrades[upgrade.id]||0).join(':');
    if(signature===this.equipmentSignature)return;
    const units=(id,draw)=>{const level=farm.upgrades[id]||0,node=this.root.querySelector(`[data-farm-equipment="${id}"]`);node.innerHTML=Array.from({length:level},(_,index)=>draw(index)).join('');node.dataset.level=String(level);};
    units('growLights',index=>`<div class="garden-lamp" data-equipment-unit="${index}" style="--column:${index}" role="img" aria-label="Grow light ${index+1}">${lampSprite()}<span class="garden-lamp-glow"></span></div>`);
    units('hydroponics',index=>`<div class="garden-tank" data-equipment-unit="${index}" role="img" aria-label="${['Water reservoir','Nutrient doser','UV oxygen tank'][index]}">${tankSprite(index)}<span class="garden-bubbles"><i></i><i></i><i></i></span></div>`);
    units('tractor',index=>`<div class="garden-tractor" data-equipment-unit="${index}" style="--column:${index}" role="img" aria-label="Tractor ${index+1}"><span class="garden-tractor-frame">${tractorSprite(0)}</span><span class="garden-tractor-frame">${tractorSprite(1)}</span><span class="garden-exhaust"><i></i><i></i></span></div>`);
    units('picker',index=>`<div class="garden-picker" data-equipment-unit="${index}" style="--column:${index}" role="img" aria-label="Picker bot ${index+1}"><span class="garden-picker-frame">${pickerSprite(0)}</span><span class="garden-picker-frame">${pickerSprite(1)}</span></div>`);
    this.scene.dataset.hydroponics=String(farm.upgrades.hydroponics||0);
    this.scene.dataset.lights=String(farm.upgrades.growLights||0);
    this.equipmentSignature=signature;
  }

  render(player,state,usable) {
    this.player=player;this.state=state;this.usable=usable;
    if(!player?.farm||!getFarmUnlocked(player))return;
    const farm=player.farm,stats=getFarmStats(player),balance=getBalance(player,state),canAct=usable&&['round','intermission'].includes(state.phase),ship=getShipStatus(player,state);
    if(!farm.crops[this.selectedCrop])this.selectedCrop='carrot';
    const active=state.phase==='round',ready=farm.plots.filter(plot=>plot.crop&&plot.progress>=1).length;
    const thirsty=farm.plots.filter(plot=>plot.crop&&plot.progress<1&&!stats.autoWater&&plot.water<=0).length;
    setData(this.scene,'active',active);
    this.renderEquipment(farm);
    setText(this.root.querySelector('[data-farm-status]'),thirsty?`${thirsty} thirsty ${thirsty===1?'bed':'beds'} · water them!`:ready?`${ready} ready to harvest`:active?'Growing':'Between rounds · growth paused');
    setText(this.root.querySelector('[data-farm-stats]'),`${number(stats.growthRate)}× growth · ${stats.autoWater?'hydroponic water':'hand watered'} · ${farm.upgrades.tractor?'tractor fertiliser':'hand fertiliser'}`);
    const cookedTime=Math.ceil(farm.cookedSeconds || 0),cookedLabel=`Cooked · ×${COOKED_SCORE_MULTIPLIER.toFixed(2)} score · ${Math.floor(cookedTime/60)}m ${String(cookedTime%60).padStart(2,'0')}s`;
    setText(this.root.querySelector('[data-farm-meal]'),cookedTime>0?cookedLabel:farm.fedSeconds>0?`Well fed · +${Math.round(stats.feedBonus*100)}% power · ${Math.ceil(farm.fedSeconds)}s`:`Beam’s snack bonus: +${Math.round(stats.feedBonus*100)}% power`);
    const pantry=this.root.querySelector('.garden-pantry');
    pantry.classList.toggle('is-fed',farm.fedSeconds>0);pantry.classList.toggle('is-cooked',cookedTime>0);pantry.classList.toggle('has-secret',Boolean(farm.crops.weed));
    const plotPrice=farmPlotCost(player),seedPrice=farmSeedCost(player,this.selectedCrop),atPlotCap=farm.plots.length>=MAX_PLOTS;
    for(const button of this.plots){
      const index=Number(button.dataset.farmPlot),slot=this.slots[index],plot=farm.plots[index],crop=cropById.get(plot?.crop),locked=!plot;
      const growing=Boolean(crop&&plot.progress<1),dry=growing&&!stats.autoWater&&plot.water<=0;
      const stage=locked?'locked':!crop?'empty':plot.progress>=1?'ready':plot.progress>=.5?'growing':'sprout';
      setData(button,'growthStage',stage);setData(button,'crop',crop?.id||'');
      setData(slot,'moisture',!crop?'none':stats.autoWater?'hydro':dry?'dry':plot.water<.35?'damp':'wet');
      slot.classList.toggle('is-fertilised',Boolean(plot?.fertilised));slot.classList.toggle('is-thirsty',dry);slot.classList.toggle('is-open',!locked);
      const canWater=growing&&!stats.autoWater&&plot.water<1-1e-9,canFertilise=growing&&!plot.fertilised;
      const seconds=growing?Math.ceil(plotSecondsLeft(plot,stats)):0;
      const caption=locked?(index===farm.plots.length?`Open · ${number(plotPrice)} LRC`:'Expand your garden'):!crop?`Plant · ${number(seedPrice)} LRC`:stage==='ready'?'Harvest':dry?'Thirsty!':`${seconds}s${active?'':' · paused'}`;
      setText(button.querySelector('.garden-bed-label'),crop?crop.name:locked?`BED ${String(index+1).padStart(2,'0')}`:`${cropById.get(this.selectedCrop).name} / ${String(index+1).padStart(2,'0')}`);
      setText(button.querySelector('.garden-bed-action'),caption);
      button.disabled=!canAct||(locked?(index!==farm.plots.length||balance<plotPrice):crop?stage!=='ready'&&!canWater&&!canFertilise:balance<seedPrice);
      const chores=growing?` ${stats.autoWater?'Hydroponics waters it.':`Water ${Math.round(plot.water*100)}%.`} ${plot.fertilised?'Fertilised.':'Not fertilised.'}`:'';
      button.setAttribute('aria-label',`Bed ${index+1}. ${crop?crop.name+'. ':!locked?cropById.get(this.selectedCrop).name+'. ':''}${caption}.${chores}`);
      button.title=!locked&&!crop?`Plant ${cropById.get(this.selectedCrop).name} seeds for ${number(seedPrice)} LRC${balance<seedPrice?' · collect more LRCs':''}`:growing?(canWater?'Click to water this bed':canFertilise?'Click to fertilise this bed':''):'';
      const water=slot.querySelector('[data-water-plot]'),fertilise=slot.querySelector('[data-fertilise-plot]');
      water.hidden=!growing||stats.autoWater;fertilise.hidden=!growing||plot.fertilised;
      water.disabled=!canAct||!canWater;fertilise.disabled=!canAct||!canFertilise;
      water.setAttribute('aria-label',`Water bed ${index+1}${canWater?`, ${Math.round(plot.water*100)}% moist`:', already soaked'}`);water.title=`Water: keeps this bed growing for ${WATER_SECONDS} active seconds`;
      fertilise.setAttribute('aria-label',`Fertilise bed ${index+1}`);fertilise.title='Fertilise: +50% growth speed and +1 vegetable for this planting';
      const frames=crop?PLANT_PACE.map(pace=>plantFrame(plot.progress>=1?1:plot.progress*pace)):[];
      const artKey=locked?'locked':!crop?'empty':`${crop.id}:${frames.join(',')}`;
      if(this.artSignatures.get(index)!==artKey){
        button.querySelector('.garden-crop-art').innerHTML=locked?'<span class="garden-bed-lock">+</span>':crop?frames.map(frame=>`<span class="garden-plant-slot">${plantSprite(crop.id,frame/48)}</span>`).join(''):'';
        this.artSignatures.set(index,artKey);
      }
      button.querySelector('.garden-growth i').style.width=`${Math.round((plot?.progress||0)*100)}%`;
      button.querySelector('.garden-water i').style.width=`${Math.round((stats.autoWater&&crop?1:plot?.water||0)*100)}%`;
    }
    for(const crop of CROPS){
      const owned=Boolean(farm.crops[crop.id]),cost=farmCropCost(player,crop.id),seedCost=farmSeedCost(player,crop.id),button=this.root.querySelector(`[data-select-crop="${crop.id}"]`),selected=owned&&this.selectedCrop===crop.id;
      button.hidden=Boolean(crop.secret&&!owned);this.root.querySelector(`[data-food="${crop.id}"]`).hidden=button.hidden;
      button.classList.toggle('is-selected',selected);button.classList.toggle('is-locked',!owned);button.setAttribute('aria-pressed',String(selected));
      if(owned)button.removeAttribute('data-unlock-crop');else button.dataset.unlockCrop=crop.id;
      button.disabled=!canAct||(!owned&&(crop.secret||balance<cost));
      setText(button.querySelector('small'),owned?`${Math.ceil(crop.growTime/stats.growthRate)}s · ${number(seedCost)} LRC`:`Unlock · ${number(cost)} LRC`);
      button.setAttribute('aria-label',owned?`Select ${crop.name} seeds, ${number(seedCost)} LRC per planting${selected?', selected':''}`:`Unlock ${crop.name} variety once for ${number(cost)} LRC; seeds then cost ${number(seedCost)} LRC per planting`);
      const mealSeconds=crop.secret?COOKED_SECONDS:Math.round(crop.feedSeconds*stats.feedMultiplier);
      button.title=crop.secret?`${number(seedCost)} LRC per planting. Feed Beam for ×${COOKED_SCORE_MULTIPLIER.toFixed(2)} score over 4m 20s of active play.`:`${owned?'Variety unlocked.':`Unlock variety once: ${number(cost)} LRC.`} Seeds: ${number(seedCost)} LRC each planting. Each vegetable feeds Beam for ${mealSeconds} active seconds and adds ${mealSeconds} ship fuel.`;
      const stock=farm.inventory[crop.id]||0;setText(this.root.querySelector(`[data-stock="${crop.id}"]`),stock);
      const beamFull=crop.secret?farm.cookedSeconds>=COOKED_SECONDS:farm.fedSeconds>=300;
      const feed=this.root.querySelector(`[data-feed-crop="${crop.id}"]`);feed.disabled=!canAct||stock<1||(beamFull&&ship.full);
      setText(feed,beamFull&&!ship.full?'Fuel':'Feed');
      feed.setAttribute('aria-label',beamFull&&!ship.full?`Beam is full: turn one ${crop.name} into ship fuel`:`Feed Beam one ${crop.name} for ${mealSeconds} seconds of ${crop.secret?'score ':''}bonus and ship fuel`);
      feed.title=crop.secret?`Cooked: ×${COOKED_SCORE_MULTIPLIER.toFixed(2)} earned score for 4m 20s. Feeding again refreshes the timer.`:`${mealSeconds} seconds of +${Math.round(stats.feedBonus*100)}% income and damage, plus ship fuel`;
    }
    setText(this.root.querySelector('[data-plot-count]'),`${farm.plots.length} / ${MAX_PLOTS} open`);
    const plotButton=this.root.querySelector('[data-buy-farm-plot]');setText(plotButton,atPlotCap?'All open':`+ Bed · ${number(plotPrice)}`);plotButton.disabled=!canAct||atPlotCap||balance<plotPrice;plotButton.title=atPlotCap?'Every planting bed is open':`${number(plotPrice)} LRC`;
    for(const upgrade of FARM_UPGRADES){
      const level=farm.upgrades[upgrade.id]||0,cost=farmUpgradeCost(player,upgrade.id),maxed=level>=upgrade.maxLevel,button=this.root.querySelector(`[data-farm-upgrade="${upgrade.id}"]`);
      setText(this.root.querySelector(`[data-upgrade-level="${upgrade.id}"]`),`${level}/${upgrade.maxLevel}`);
      setText(button,maxed?'MAX':`${number(cost)} LRC`);button.disabled=!canAct||maxed||balance<cost;
      button.setAttribute('aria-label',maxed?`${upgrade.name} fully upgraded`:`Upgrade ${upgrade.name} to level ${level+1} for ${number(cost)} LRC`);
    }
    // The ship: Beam's meals are its fuel; every twentieth planet is a jump to the next system.
    const nextSystem=SYSTEMS[ship.systemIndex+1];
    this.root.querySelector('[data-fuel-fill]').style.height=`${Math.round(ship.fuel/ship.target*100)}%`;
    setText(this.root.querySelector('[data-fuel-text]'),`${number(Math.floor(ship.fuel))} / ${number(ship.target)}`);
    setText(this.root.querySelector('[data-fuel-note]'),ship.grounded?'Grounded! Feed Beam to jump.':ship.full?(nextSystem?`Ready to jump to ${nextSystem.name}`:'Ready to land on Refract'):nextSystem?`Next jump: ${nextSystem.name}`:'Next stop: home');
    const shipPanel=this.root.querySelector('[data-ship]');shipPanel.classList.toggle('is-grounded',ship.grounded);shipPanel.classList.toggle('is-full',ship.full);
    shipPanel.setAttribute('aria-label',`Beam’s ship fuel: ${Math.floor(ship.fuel)} of ${ship.target}. ${ship.grounded?'The ship is grounded until the tank is full.':ship.full?'The tank is full.':'Feed Beam to fill the tank.'}`);
    this.detectEvents(farm,ship);
    const readyButton=this.root.querySelector('[data-garden-ready]');readyButton.hidden=state.phase!=='intermission';readyButton.disabled=!usable;setText(readyButton,player.ready?'Cancel ready':'Ready for next round');
    setText(this.root.querySelector('[data-garden-round-note]'),active?`Round ${state.round} · ${Math.ceil(state.remaining)}s of growing time`:player.ready?'Ready! Waiting for your crew.':'Growth & meal timers pause between rounds.');
  }
}
