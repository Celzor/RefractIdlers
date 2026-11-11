import { CROPS, FARM_UPGRADES, MAX_PLOTS, getFarmStats, farmPlotCost, farmCropCost, farmUpgradeCost, getFarmUnlocked } from './farm.js';
import { getBalance } from './game.js';

const safe = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number = value => new Intl.NumberFormat('en', { notation:value >= 10000 ? 'compact' : 'standard', maximumFractionDigits:1 }).format(value || 0);
const cropById = new Map(CROPS.map(crop => [crop.id,crop]));
const setText = (node,value) => { if(node.textContent !== String(value))node.textContent=value; };

/** Small original pixel vegetables, shared by the seed packets, beds and pantry. */
function vegetable(id,stage='ready') {
  const leaves='<path fill="#75a653" d="M14 15V7h4v8h-2V5h-5v4h3zm2-3h5V7h4v5h-5v4h-4z"/><path fill="#476c3e" d="M8 10h6v4h3v4h-5v-4H8z"/>';
  const shapes={
    carrot:`<path fill="#c37b3f" d="M10 17h12v8h-4v6h-4v-4h-4z"/><path fill="#efad50" d="M11 17h8v7h-4v4h-2v-5h-2z"/><path fill="#a45d35" d="M17 20h5v2h-5zm-5 4h4v2h-4z"/>${leaves}`,
    lettuce:'<path fill="#45643b" d="M7 12h5V8h9v4h5v5h3v9h-5v4H9v-3H4v-9h3z"/><path fill="#8db763" d="M9 13h4V9h7v5h5v5h3v6h-5v4H11v-4H6v-7h3z"/><path fill="#b2cf7e" d="M11 16h5v-4h3v6h5v4h-6v5h-4v-6h-4z"/><path fill="#678e4b" d="M15 17h3v8h-3zm-6 5h5v3H9z"/>',
    tomato:`<path fill="#923e37" d="M9 15h14v3h5v11h-5v3H10v-3H5V19h4z"/><path fill="#df6b4f" d="M10 16h12v3h4v8h-5v3H11v-3H7v-8h3z"/><path fill="#f3a073" d="M10 20h4v3h-4z"/>${leaves}`,
    pumpkin:'<path fill="#735334" d="M16 8h5v9h-5z"/><path fill="#b96935" d="M8 16h17v4h4v9h-4v4H8v-4H4v-9h4z"/><path fill="#eea54c" d="M9 17h6v14H9zm10 0h5v14h-5z"/><path fill="#cf7c36" d="M15 16h4v17h-4z"/><path fill="#6a924a" d="M19 9h8v4h-8z"/>',
  };
  const sprout='<path fill="#4c743e" d="M15 29V15h3v14z"/><path fill="#99bd68" d="M8 13h7v3h3v5h-6v-3H8zm10 3h4v-5h6v6h-4v3h-6z"/>';
  return `<svg viewBox="0 0 34 36" aria-hidden="true" shape-rendering="crispEdges">${stage==='sprout'?sprout:`<g${stage==='growing'?' transform="translate(5 7) scale(.7)"':''}>${shapes[id]||shapes.carrot}</g>`}</svg>`;
}

function light(index) {
  return `<div class="garden-lamp" data-equipment-unit="${index}" aria-label="Grow light ${index+1}"><svg viewBox="0 0 80 44" aria-hidden="true" shape-rendering="crispEdges"><path d="M15 0h3v11h-3zm47 0h3v11h-3z" fill="#45544b"/><path d="M10 10h60v5h5v9H5v-9h5z" fill="#45544b"/><path d="M11 15h58v6H11z" fill="#8d9c79"/><path d="M15 22h50v5H15z" fill="#ffe9a0"/><path d="M15 28h50l15 16H0z" fill="#efce7c" opacity=".25"/></svg></div>`;
}
function tank(index) {
  return `<svg data-equipment-unit="${index}" viewBox="0 0 40 44" role="img" aria-label="Hydroponic tank ${index+1}" shape-rendering="crispEdges"><path d="M8 5h22v5H8zM5 10h28v28H5z" fill="#405c5a"/><path d="M8 12h22v23H8z" fill="#759d97"/><path d="M9 23h20v11H9z" fill="#85c6c3"/><path d="M12 16h7v5h-7z" fill="#d5e4ba"/><path d="M33 29h7v5h-7zM10 38h4v5h-4zm14 0h4v5h-4z" fill="#394d48"/><path d="M12 1h14v5H12z" fill="#b9c6a4"/></svg>`;
}
function sack(index) {
  return `<svg data-equipment-unit="${index}" viewBox="0 0 34 40" role="img" aria-label="Fertiliser sack ${index+1}" shape-rendering="crispEdges"><path d="M10 3h15v6h-3v4h5v5h3v18H4V18h3v-5h5V9h-2z" fill="#92704c"/><path d="M13 11h7v5h5v5h2v12H7V20h4v-4h2z" fill="#d5c185"/><path d="M12 8h10v4H12z" fill="#5c754a"/><path d="M16 28V19h3v9zm0-6h-5v-5h5zm3 2h5v-5h-5z" fill="#6b8d4d"/></svg>`;
}

export class FarmView {
  constructor(root,{send,onResearch}) {
    this.root=root;this.send=send;this.onResearch=onResearch;this.selectedCrop='carrot';this.player=null;this.state=null;
    root.innerHTML=`<div class="garden-layout">
      <section class="garden-main panel" aria-label="Beam's vegetable garden">
        <header class="garden-header"><div><p class="eyebrow">THE LIGHT FACTORY / GREENHOUSE</p><h2>Beam’s Garden</h2></div><span class="garden-season" data-farm-status>Ready to plant</span></header>
        <div class="garden-scene" aria-label="Your purchased garden beds and equipment">
          <div class="garden-window" aria-hidden="true"><span class="garden-sun"></span><span class="garden-cloud"></span></div>
          <div class="garden-scene-sign">GROWN WITH GOOD VIBES</div>
          <div class="garden-light-rack" data-farm-equipment="growLights"></div>
          <div class="garden-pipes" aria-hidden="true"></div>
          <div class="garden-beds">${Array.from({length:MAX_PLOTS},(_,index)=>`<button type="button" class="garden-bed" data-farm-plot="${index}"><span class="garden-bed-label"></span><span class="garden-crop-art"></span><span class="garden-bed-action"></span><span class="garden-growth" aria-hidden="true"><i></i></span></button>`).join('')}</div>
          <div class="garden-equipment-floor"><div class="garden-tanks" data-farm-equipment="hydroponics"></div><span class="garden-floor-name">BEAM’S LITTLE PATCH</span><div class="garden-sacks" data-farm-equipment="fertiliser"></div></div>
        </div>
        <div class="garden-readout"><span data-farm-stats></span><button type="button" class="garden-link" data-farm-research>Farm research ↗</button></div>
        <section class="garden-pantry" aria-label="Harvest basket and feeding Beam"><div class="garden-pantry-heading"><h3>Harvest basket</h3><span data-farm-meal>Grow a snack for Beam.</span></div><div class="garden-foods">${CROPS.map(crop=>`<div class="garden-food" data-food="${crop.id}"><span class="garden-food-icon">${vegetable(crop.id)}</span><div><span class="garden-food-name">${safe(crop.name)}</span><strong data-stock="${crop.id}">0</strong></div><button type="button" data-feed-crop="${crop.id}">Feed</button></div>`).join('')}</div><p class="garden-feed-note">Feed Beam to boost your income &amp; damage. Meals stack up to 5 minutes.</p></section>
      </section>
      <section class="garden-workshop panel" aria-label="Garden seeds and upgrades"><div id="farm-shop-companion" class="shop-companion"></div><header><p class="eyebrow">A LITTLE CARE. A LOT OF LIGHT.</p><h2>Garden shed</h2><p>Choose a seed, then an empty bed.</p></header>
        <div class="garden-seeds" role="group" aria-label="Choose or unlock vegetable seeds">${CROPS.map(crop=>`<button type="button" class="garden-seed" data-select-crop="${crop.id}" aria-pressed="false"><span class="garden-seed-icon">${vegetable(crop.id)}</span><span class="garden-seed-name">${safe(crop.name)}</span><small data-seed-detail="${crop.id}"></small></button>`).join('')}</div>
        <div class="garden-expansion"><span><b>Planting beds</b><small data-plot-count></small></span><button type="button" data-buy-farm-plot></button></div>
        <div class="garden-upgrades">${FARM_UPGRADES.map(upgrade=>`<article class="garden-upgrade"><div><h3>${safe(upgrade.name)} <span data-upgrade-level="${upgrade.id}"></span></h3><p>${safe(upgrade.description)}</p></div><button type="button" data-farm-upgrade="${upgrade.id}"></button></article>`).join('')}</div>
        <div class="garden-round"><span data-garden-round-note>Plants grow during rounds.</span><button type="button" class="primary-button" data-garden-ready hidden>Ready for next round</button></div>
      </section>
    </div>`;
    this.plots=[...root.querySelectorAll('[data-farm-plot]')];this.artSignatures=new Map();this.equipmentSignature='';
    root.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button||button.disabled||!this.player)return;
      if(button.hasAttribute('data-farm-research')){this.onResearch?.();return;}
      if(button.hasAttribute('data-garden-ready')){this.send({type:'ready'});return;}
      if(button.hasAttribute('data-buy-farm-plot')){this.send({type:'buyFarmPlot'});return;}
      if(button.dataset.farmUpgrade){this.send({type:'buyFarmUpgrade',id:button.dataset.farmUpgrade});return;}
      if(button.dataset.feedCrop){this.send({type:'feedBeam',crop:button.dataset.feedCrop});return;}
      if(button.dataset.selectCrop){const id=button.dataset.selectCrop;if(!this.player.farm.crops[id])this.send({type:'unlockCrop',id});else{this.selectedCrop=id;this.render(this.player,this.state,this.usable);}return;}
      if(button.hasAttribute('data-farm-plot')){
        const plot=Number(button.dataset.farmPlot),bed=this.player.farm.plots[plot];
        if(!bed)this.send({type:'buyFarmPlot'});
        else if(!bed.crop)this.send({type:'plantCrop',plot,crop:this.selectedCrop});
        else if(bed.progress>=1)this.send({type:'harvestCrop',plot});
      }
    });
  }

  render(player,state,usable) {
    this.player=player;this.state=state;this.usable=usable;
    if(!player?.farm||!getFarmUnlocked(player))return;
    const farm=player.farm,stats=getFarmStats(player),balance=getBalance(player,state),canAct=usable&&['round','intermission'].includes(state.phase);
    if(!farm.crops[this.selectedCrop])this.selectedCrop='carrot';
    const active=state.phase==='round',ready=farm.plots.filter(plot=>plot.crop&&plot.progress>=1).length;
    setText(this.root.querySelector('[data-farm-status]'),ready?`${ready} ready to harvest`:active?'Growing in the light':'Between rounds · growth paused');
    setText(this.root.querySelector('[data-farm-stats]'),`${number(stats.growthRate)}× growth · ${stats.yield} veg / harvest`);
    setText(this.root.querySelector('[data-farm-meal]'),farm.fedSeconds>0?`Well fed · +${Math.round(stats.feedBonus*100)}% power · ${Math.ceil(farm.fedSeconds)}s`:`Beam’s snack bonus: +${Math.round(stats.feedBonus*100)}% power`);
    this.root.querySelector('.garden-pantry').classList.toggle('is-fed',farm.fedSeconds>0);
    const plotPrice=farmPlotCost(player),atPlotCap=farm.plots.length>=MAX_PLOTS;
    for(const button of this.plots){
      const index=Number(button.dataset.farmPlot),plot=farm.plots[index],crop=cropById.get(plot?.crop),locked=!plot;
      const stage=locked?'locked':!crop?'empty':plot.progress>=1?'ready':plot.progress>=.5?'growing':'sprout';
      button.dataset.growthStage=stage;button.dataset.crop=crop?.id||'';
      const caption=locked?(index===farm.plots.length?`Open · ${number(plotPrice)} LRC`:'Expand your garden'):!crop?`Plant ${cropById.get(this.selectedCrop).name}`:stage==='ready'?'Harvest':`${Math.ceil((1-plot.progress)*crop.growTime/stats.growthRate)}s${active?'':' · paused'}`;
      setText(button.querySelector('.garden-bed-label'),crop?crop.name:`BED ${String(index+1).padStart(2,'0')}`);
      setText(button.querySelector('.garden-bed-action'),caption);
      button.disabled=!canAct||(locked?(index!==farm.plots.length||balance<plotPrice):Boolean(crop&&stage!=='ready'));
      button.setAttribute('aria-label',`Bed ${index+1}. ${crop?crop.name+'. ':''}${caption}`);
      const artKey=`${crop?.id||''}:${stage}`;
      if(this.artSignatures.get(index)!==artKey){
        button.querySelector('.garden-crop-art').innerHTML=locked?'<span class="garden-bed-lock">+</span>':crop?[0,1,2].map(()=>vegetable(crop.id,stage)).join(''):'<span class="garden-soil-furrows" aria-hidden="true"></span>';
        this.artSignatures.set(index,artKey);
      }
      button.querySelector('.garden-growth i').style.width=`${Math.round((plot?.progress||0)*100)}%`;
    }
    for(const crop of CROPS){
      const owned=Boolean(farm.crops[crop.id]),cost=farmCropCost(player,crop.id),button=this.root.querySelector(`[data-select-crop="${crop.id}"]`),selected=owned&&this.selectedCrop===crop.id;
      button.classList.toggle('is-selected',selected);button.classList.toggle('is-locked',!owned);button.setAttribute('aria-pressed',String(selected));
      if(owned)button.removeAttribute('data-unlock-crop');else button.dataset.unlockCrop=crop.id;
      button.disabled=!canAct||(!owned&&balance<cost);
      setText(button.querySelector('small'),owned?`${Math.ceil(crop.growTime/stats.growthRate)}s grow · ${Math.round(crop.feedSeconds*stats.feedMultiplier)}s snack`:`Unlock · ${number(cost)} LRC`);
      button.setAttribute('aria-label',owned?`Select ${crop.name} seeds${selected?', selected':''}`:`Unlock ${crop.name} seeds for ${number(cost)} LRC`);
      const stock=farm.inventory[crop.id]||0;setText(this.root.querySelector(`[data-stock="${crop.id}"]`),stock);
      const feed=this.root.querySelector(`[data-feed-crop="${crop.id}"]`);feed.disabled=!canAct||stock<1||farm.fedSeconds>=300;
      feed.setAttribute('aria-label',`Feed Beam one ${crop.name} for ${Math.round(crop.feedSeconds*stats.feedMultiplier)} seconds of bonus`);
      feed.title=`${Math.round(crop.feedSeconds*stats.feedMultiplier)} seconds of +${Math.round(stats.feedBonus*100)}% income and damage`;
    }
    setText(this.root.querySelector('[data-plot-count]'),`${farm.plots.length} / ${MAX_PLOTS} open`);
    const plotButton=this.root.querySelector('[data-buy-farm-plot]');setText(plotButton,atPlotCap?'All open':`+ Bed · ${number(plotPrice)}`);plotButton.disabled=!canAct||atPlotCap||balance<plotPrice;plotButton.title=atPlotCap?'Every planting bed is open':`${number(plotPrice)} LRC`;
    for(const upgrade of FARM_UPGRADES){
      const level=farm.upgrades[upgrade.id]||0,cost=farmUpgradeCost(player,upgrade.id),maxed=level>=upgrade.maxLevel,button=this.root.querySelector(`[data-farm-upgrade="${upgrade.id}"]`);
      setText(this.root.querySelector(`[data-upgrade-level="${upgrade.id}"]`),`${level}/${upgrade.maxLevel}`);
      setText(button,maxed?'MAX':`${number(cost)} LRC`);button.disabled=!canAct||maxed||balance<cost;
      button.setAttribute('aria-label',maxed?`${upgrade.name} fully upgraded`:`Upgrade ${upgrade.name} to level ${level+1} for ${number(cost)} LRC`);
    }
    const equipmentSignature=FARM_UPGRADES.map(upgrade=>farm.upgrades[upgrade.id]||0).join(':');
    if(equipmentSignature!==this.equipmentSignature){
      for(const [id,draw] of [['growLights',light],['hydroponics',tank],['fertiliser',sack]]){
        const level=farm.upgrades[id]||0,node=this.root.querySelector(`[data-farm-equipment="${id}"]`);
        node.innerHTML=Array.from({length:level},(_,index)=>draw(index)).join('');node.dataset.level=String(level);
      }
      this.root.querySelector('.garden-scene').dataset.hydroponics=String(farm.upgrades.hydroponics||0);
      this.root.querySelector('.garden-scene').dataset.lights=String(farm.upgrades.growLights||0);
      this.equipmentSignature=equipmentSignature;
    }
    const readyButton=this.root.querySelector('[data-garden-ready]');readyButton.hidden=state.phase!=='intermission';readyButton.disabled=!usable;setText(readyButton,player.ready?'Cancel ready':'Ready for next round');
    setText(this.root.querySelector('[data-garden-round-note]'),active?`Round ${state.round} · ${Math.ceil(state.remaining)}s of growing time`:player.ready?'Ready! Waiting for your crew.':'Growth & meal timers pause between rounds.');
  }
}
