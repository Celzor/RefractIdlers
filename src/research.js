import { SKILLS, SKILL_BRANCHES, skillCost, skillAvailability } from './game.js';
import { getFarmUnlocked } from './farm.js';

const $ = (selector) => document.querySelector(selector);
const safe = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const catalog = new Map(SKILLS.map(skill => [skill.id,skill]));
const disciplines = SKILL_BRANCHES.filter(branch => branch.currency !== 'prestige');
const research = SKILLS.filter(skill => skill.currency !== 'prestige');
const legacy = SKILLS.filter(skill => skill.currency === 'prestige');
const colors = ['#dfbf65','#94bc79','#7cbdb7','#c7909b','#8daccb','#e0ad69','#b4a0cd','#b8bc8b','#83bf88','#80cbd5'];
const count = value => value >= 1e15 ? value.toExponential(1).replace('+','') : new Intl.NumberFormat('en',{notation:value >= 1e6 ? 'compact' : 'standard',maximumFractionDigits:0}).format(value || 0);
const branchColor = skill => colors[disciplines.findIndex(branch => branch.id === skill.branch)] || '#c3a3cb';
let lastPlayer, lastState, lastUsable, lastSignature = '';
let selectedBranch = 'all', query = '', availableOnly = false;
let mainMap, legacyMap;

/** Original pixel glyphs: eight optical motifs, with distinct tier geometry. */
function glyph(skill) {
  const tier = skill.tier || 1;
  const branch = skill.currency === 'prestige' ? ['click','idle','mastery','farm'][Math.floor(legacy.indexOf(skill)/4)] : skill.branch;
  const ink = 'currentColor', pale = '#eee2ba';
  const motifs = {
    chronos: `<path d="M3 1h10v3h-2v2H9v4h2v2h2v3H3v-3h2v-2h2V6H5V4H3z" fill="${ink}"/><path d="M5 3h6L8 6zm3 7 3 3H5z" fill="${pale}"/>`,
    farm: `<path d="M7 5H3V3H1V0h4v2h2v3h2V3h2V0h4v3h-2v2h-3v3h3v3h-2v3H7v2H5v-5H3V8h4z" fill="${ink}"/><path d="M5 9h6v2H9v2H7v-2H5z" fill="#e7a45f"/>`,
    click: `<path d="M9 1H6v5H3v3h5v6h3V9h3V6H9z" fill="${ink}"/><path d="M9 3H7v4H5v1h4v5h1V8h2V7H9z" fill="${pale}"/>`,
    idle: `<path d="M7 7H3V5H1V2h4v2h2v3h2V5h2V2h4v3h-2v2h-3v6h3v2H4v-2h3z" fill="${ink}"/><path d="M2 3h2v1H2zm10 0h2v1h-2zM8 8h1v5H8z" fill="${pale}"/>`,
    team: `<path d="M1 5h3V2h3v3h2V2h3v3h3v6h-3v3H9v-3H7v3H4v-3H1z" fill="${ink}"/><path d="M3 7h3v2H3zm7 0h3v2h-3zM7 6h2v4H7z" fill="${pale}"/>`,
    orbs: `<path d="M6 1h4v2h2v2h2v2h1v3h-2v2h-2v2H5v-2H3v-2H1V7h2V5h2V3h1z" fill="${ink}"/><path d="M6 4h3v2H6zM4 6h2v3H4zM9 7h2v2H9zM8 9h2v3H8z" fill="${pale}"/>`,
    automation: `<path d="M6 1h4v2h3v3h2v4h-2v3h-3v2H6v-2H3v-3H1V6h2V3h3z" fill="${ink}"/><path d="M5 5h6v6H5z" fill="#263234"/><path d="M7 7h2v2H7z" fill="${pale}"/>`,
    mint: `<path d="M4 1h8v2h2v2h1v6h-2v2h-2v2H4v-2H2v-2H1V5h2V3h1z" fill="${ink}"/><path d="M7 3h2v2h3v2H7v2h4v4H9v1H7v-2H4v-2h5V9H5V5h2z" fill="${pale}"/>`,
    fortune: `<path d="M6 1h4v4h4v2h2v3h-5v5H8v-3H6v3H3v-5H0V7h2V5h4z" fill="${ink}"/><path d="M7 5h2v2h2v2H9v2H7V9H5V7h2z" fill="${pale}"/>`,
    mastery: `<path d="M1 2h5l2 2 2-2h5v11h-5l-2 2-2-2H1z" fill="${ink}"/><path d="M7 5h2v8H7zM3 5h2v1H3zm0 3h2v1H3zm8-3h2v1h-2zm0 3h2v1h-2z" fill="${pale}"/>`,
  };
  const marks = Array.from({length:Math.min(tier,6)},(_,index) => `<rect x="${3+index*2}" y="18" width="1" height="2"/>`).join('');
  const crown = tier >= 5 || skill.currency === 'prestige' ? '<path d="M3 0h2v2h2V0h2v2h2V0h2v4H3z" fill="#e6bc61" transform="translate(2 -3)"/>' : '';
  const variant = tier%3 === 0 ? '<path d="M0 3h2v2H0zm18 11h2v2h-2z"/>' : tier%3 === 2 ? '<path d="M0 9h2v2H0zm18-4h2v2h-2z"/>' : '';
  return `<svg viewBox="-1 -4 22 26" aria-hidden="true" shape-rendering="crispEdges" fill="${ink}"><g transform="translate(2 1)">${motifs[branch] || motifs.orbs}</g>${crown}${variant}${marks}</svg>`;
}

function layout(skills,isLegacy) {
  const width = isLegacy ? 1280 : 2020, height = isLegacy ? 1120 : 1760;
  const center = {x:width/2,y:height/2};
  const points = new Map();
  const shifts = [0,6,-8,10,-6,5];
  for (const skill of skills) {
    const branch = isLegacy ? Math.floor(skills.indexOf(skill)/4) : disciplines.findIndex(item => item.id === skill.branch);
    const tier = skill.tier-1;
    const radius = isLegacy ? [130,265,410,555][tier] : [260,395,530,665,800,935][tier];
    const base = isLegacy ? -135+branch*360/(legacy.length/4) : -90+branch*360/disciplines.length;
    const degrees = base + shifts[tier] * (branch%2 ? -1 : 1);
    const angle = degrees*Math.PI/180;
    points.set(skill.id,{x:center.x+Math.cos(angle)*radius,y:center.y+Math.sin(angle)*radius*(isLegacy ? .8 : .82)});
  }
  return {width,height,center,points};
}

function ancestors(id,found=new Set()) {
  for (const required of catalog.get(id)?.requires || []) if (!found.has(required)) { found.add(required); ancestors(required,found); }
  return found;
}

class SkillMap {
  constructor(root,inspector,skills,isLegacy=false) {
    this.root = $(root); this.inspector = $(inspector); this.skills = skills; this.legacy = isLegacy;
    this.geometry = layout(skills,isLegacy); this.selected = skills[0].id; this.x=0; this.y=0; this.scale=1; this.fitted=false; this.pointers=new Map();
    const {width,height,center,points} = this.geometry;
    const lines = skills.flatMap(skill => {
      const to = points.get(skill.id);
      const parents = skill.requires.length ? skill.requires : ['origin'];
      return parents.map(id => {
        const from = id === 'origin' ? center : points.get(id);
        if (!from) return '';
        const cross = id !== 'origin' && catalog.get(id).branch !== skill.branch;
        return `<path class="graph-edge${cross ? ' is-cross' : ''}" data-edge-from="${id}" data-edge-to="${skill.id}" d="M${from.x.toFixed(1)} ${from.y.toFixed(1)}L${to.x.toFixed(1)} ${to.y.toFixed(1)}"/>`;
      });
    }).join('');
    const nodes = skills.map(skill => {
      const point = points.get(skill.id);
      return `<button class="graph-node is-locked" data-skill-node="${skill.id}" data-state="locked" style="left:${point.x}px;top:${point.y}px;--node-color:${branchColor(skill)}" aria-pressed="false" title="${safe(skill.name)}"><span class="graph-node-icon">${glyph(skill)}</span><span class="graph-node-rank" id="rank-${skill.id}">0/${skill.maxRank}</span><span class="graph-node-name">${safe(skill.name)}</span></button>`;
    }).join('');
    this.root.innerHTML = `<div class="graph-viewport" data-graph-viewport tabindex="0" aria-label="${isLegacy ? 'Prestige' : 'Research'} tree. Drag to pan. Use plus and minus to zoom. Arrow keys move the map."><div class="graph-board" data-graph-board style="width:${width}px;height:${height}px"><svg class="graph-connections" viewBox="0 0 ${width} ${height}" aria-hidden="true">${lines}</svg><div class="graph-origin" style="left:${center.x}px;top:${center.y}px"><img src="assets/pixel-core.svg" alt=""><span>${isLegacy ? 'ETERNAL LIGHT' : 'THE LIGHT FACTORY'}</span></div>${nodes}</div></div><div class="graph-map-title"><span class="graph-map-light"></span>${isLegacy ? 'LEGACY CIRCUIT' : 'RESEARCH CIRCUIT'}<small>${skills.length} connected nodes</small></div><div class="graph-controls" role="group" aria-label="Map controls"><button data-graph-action="out" aria-label="Zoom out">−</button><span data-graph-zoom>100%</span><button data-graph-action="in" aria-label="Zoom in">+</button><button data-graph-action="fit" class="graph-fit" aria-label="Fit the whole tree">FIT</button><button data-graph-action="expand" class="graph-focus-button" aria-label="Expand skill tree" aria-pressed="false" title="Expand skill tree">↗</button></div><div class="graph-legend"><span><i class="legend-ready"></i>Available</span><span><i class="legend-owned"></i>Researched</span><span><i class="legend-locked"></i>Locked</span></div><span class="graph-pan-hint">DRAG TO EXPLORE · SCROLL TO ZOOM</span>`;
    this.viewport=this.root.querySelector('[data-graph-viewport]'); this.board=this.root.querySelector('[data-graph-board]');
    const details=document.createElement('button');details.className='graph-mobile-details';details.dataset.graphAction='details';details.textContent='Selected node · DETAILS ↓';this.root.append(details);
    this.nodeElements=new Map([...this.root.querySelectorAll('[data-skill-node]')].map(node=>[node.dataset.skillNode,node]));
    this.root.addEventListener('click',event=>{
      const control=event.target.closest('[data-graph-action]');
      if(control){const action=control.dataset.graphAction;if(action==='details')this.inspector.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});else if(action==='expand')this.expand();else if(action==='fit')this.fit(false);else this.zoom(this.scale*(action==='in'?1.25:.8));return;}
      const node=event.target.closest('[data-skill-node]');
      if(node && (!this.suppressClickUntil || performance.now()>this.suppressClickUntil || event.detail===0))this.select(node.dataset.skillNode);
    });
    this.viewport.addEventListener('wheel',event=>{event.preventDefault();const rect=this.viewport.getBoundingClientRect();this.zoom(this.scale*Math.exp(-event.deltaY*.0015),event.clientX-rect.left,event.clientY-rect.top);},{passive:false});
    this.viewport.addEventListener('pointerdown',event=>this.pointerDown(event));
    this.viewport.addEventListener('pointermove',event=>this.pointerMove(event));
    this.viewport.addEventListener('pointerup',event=>this.pointerUp(event));
    this.viewport.addEventListener('pointercancel',event=>this.pointerUp(event,true));
    this.viewport.addEventListener('keydown',event=>{
      if(event.target.closest('[data-skill-node]'))return;
      const move={ArrowLeft:[70,0],ArrowRight:[-70,0],ArrowUp:[0,70],ArrowDown:[0,-70]}[event.key];
      if(move){event.preventDefault();this.x+=move[0];this.y+=move[1];this.transform();}
      else if(['+','=','-'].includes(event.key)){event.preventDefault();this.zoom(this.scale*(event.key==='-'?.8:1.25));}
      else if(event.key==='Home'){event.preventDefault();this.fit(false);}
    });
    this.root.addEventListener('focusin',event=>{const node=event.target.closest('[data-skill-node]');if(node && !this.pointers.size)this.ensureVisible(node.dataset.skillNode);});
    this.inspector.addEventListener('click',event=>{if(event.target.closest('[data-graph-action="back"]'))this.root.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
    new ResizeObserver(()=>this.ensureCamera()).observe(this.viewport);
    document.addEventListener('keydown',event=>{
      if(!this.expanded)return;
      if(event.key==='Escape'){event.preventDefault();this.expand(false);}
      if(event.key==='Tab'){
        const controls=[...this.root.parentElement.querySelectorAll('button:not(:disabled),a[href],input,[tabindex="0"]')].filter(element=>element.offsetParent!==null);
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&(document.activeElement===first||!this.root.parentElement.contains(document.activeElement))){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||!this.root.parentElement.contains(document.activeElement))){event.preventDefault();first?.focus();}
      }
    });
    document.addEventListener('game-view-change',()=>{if(this.expanded)this.expand(false);});
  }
  expand(value=!this.expanded){
    this.expanded=value;this.root.parentElement.classList.toggle('graph-expanded',value);document.body.classList.toggle('graph-focus-open',value);
    if(value){this.root.parentElement.setAttribute('role','dialog');this.root.parentElement.setAttribute('aria-modal','true');this.root.parentElement.setAttribute('aria-label',`${this.legacy?'Legacy':'Research'} tree expanded`);}
    else{this.root.parentElement.removeAttribute('role');this.root.parentElement.removeAttribute('aria-modal');this.root.parentElement.removeAttribute('aria-label');}
    const button=this.root.querySelector('[data-graph-action="expand"]');button.setAttribute('aria-pressed',String(value));button.setAttribute('aria-label',value?'Close expanded skill tree':'Expand skill tree');button.textContent=value?'×':'↗';
    requestAnimationFrame(()=>{this.fit(this.viewport.clientWidth<550);if(value)this.viewport.focus({preventScroll:true});else button.focus({preventScroll:true});});
  }
  ensureCamera(){
    const width=this.viewport.clientWidth,height=this.viewport.clientHeight;if(!width||!height)return;
    if(!this.fitted){this.fit(true);this.fitted=true;}
    else if(this.lastWidth&&(width!==this.lastWidth||height!==this.lastHeight)){this.x+=(width-this.lastWidth)/2;this.y+=(height-this.lastHeight)/2;this.transform();}
    this.lastWidth=width;this.lastHeight=height;
  }
  fit(initial=false){
    const width=this.viewport.clientWidth,height=this.viewport.clientHeight;if(!width||!height)return;
    this.lastWidth=width;this.lastHeight=height;
    const fit=Math.min((width-52)/this.geometry.width,(height-100)/this.geometry.height);
    this.scale=initial && width<550?.65:Math.max(initial?.5:.18,Math.min(.95,fit));
    this.x=width/2-this.geometry.center.x*this.scale;this.y=height/2-this.geometry.center.y*this.scale;this.transform();
  }
  transform(){
    const width=this.viewport.clientWidth,height=this.viewport.clientHeight;
    this.x=Math.max(-this.geometry.width*this.scale+80,Math.min(width-80,this.x));
    this.y=Math.max(-this.geometry.height*this.scale+80,Math.min(height-80,this.y));
    this.board.style.transform=`translate(${this.x}px,${this.y}px) scale(${this.scale})`;
    this.root.style.setProperty('--map-inverse',String(1/this.scale));
    this.root.querySelector('[data-graph-zoom]').textContent=`${Math.round(this.scale*100)}%`;
    this.root.dataset.zoom=String(this.scale);
    this.root.classList.toggle('is-overview',this.scale<.48);
  }
  zoom(scale,anchorX=this.viewport.clientWidth/2,anchorY=this.viewport.clientHeight/2){
    scale=Math.max(.18,Math.min(1.8,scale));const worldX=(anchorX-this.x)/this.scale,worldY=(anchorY-this.y)/this.scale;
    this.scale=scale;this.x=anchorX-worldX*scale;this.y=anchorY-worldY*scale;this.transform();
  }
  focusNode(id,scale){const point=this.geometry.points.get(id);if(!point)return;if(scale)this.scale=scale;this.x=this.viewport.clientWidth/2-point.x*this.scale;this.y=this.viewport.clientHeight/2-point.y*this.scale;this.transform();}
  ensureVisible(id){const point=this.geometry.points.get(id);if(!point)return;const x=this.x+point.x*this.scale,y=this.y+point.y*this.scale;
    if(x<65||x>this.viewport.clientWidth-65||y<65||y>this.viewport.clientHeight-65)this.focusNode(id);}
  select(id,center=false){
    if(!this.nodeElements.has(id))return;this.selected=id;if(center)this.focusNode(id,Math.max(this.scale,.65));
    lastSignature='';renderResearch(lastPlayer,lastState,lastUsable);
  }
  pointerDown(event){
    if(event.button!==0&&event.pointerType==='mouse')return;
    const point={x:event.clientX,y:event.clientY,node:event.target.closest('[data-skill-node]')?.dataset.skillNode};
    this.pointers.set(event.pointerId,point);this.viewport.setPointerCapture(event.pointerId);
    if(this.pointers.size===1){this.drag={x:point.x,y:point.y,startX:this.x,startY:this.y,moved:false,node:point.node};this.root.classList.add('is-panning');}
    if(this.pointers.size===2){const [a,b]=[...this.pointers.values()],rect=this.viewport.getBoundingClientRect();const midX=(a.x+b.x)/2-rect.left,midY=(a.y+b.y)/2-rect.top;
      this.pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),scale:this.scale,worldX:(midX-this.x)/this.scale,worldY:(midY-this.y)/this.scale};if(this.drag)this.drag.moved=true;}
  }
  pointerMove(event){
    if(!this.pointers.has(event.pointerId))return;this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(this.pointers.size>=2&&this.pinch){const [a,b]=[...this.pointers.values()],rect=this.viewport.getBoundingClientRect();this.scale=Math.max(.18,Math.min(1.8,this.pinch.scale*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,this.pinch.distance)));
      this.x=(a.x+b.x)/2-rect.left-this.pinch.worldX*this.scale;this.y=(a.y+b.y)/2-rect.top-this.pinch.worldY*this.scale;this.transform();return;}
    if(this.drag){const dx=event.clientX-this.drag.x,dy=event.clientY-this.drag.y;if(Math.hypot(dx,dy)>5)this.drag.moved=true;this.x=this.drag.startX+dx;this.y=this.drag.startY+dy;this.transform();}
  }
  pointerUp(event,cancelled=false){
    const drag=this.drag;this.pointers.delete(event.pointerId);if(!this.pointers.size){this.root.classList.remove('is-panning');this.pinch=null;this.drag=null;
      if(drag){this.suppressClickUntil=performance.now()+100;if(!cancelled&&!drag.moved&&drag.node)this.select(drag.node);}}
    else if(this.pointers.size===1){const point=[...this.pointers.values()][0];this.pinch=null;this.drag={x:point.x,y:point.y,startX:this.x,startY:this.y,moved:true};}
  }
  render(player,state,usable){
    const path=ancestors(this.selected);path.add(this.selected);
    let matches=0;
    for(const skill of this.skills){
      const node=this.nodeElements.get(skill.id),rank=player?.skills[skill.id]||0;
      const availability=player?skillAvailability(player,skill.id,state):{available:false,reason:'Join the session to research.'};
      const status=rank>=skill.maxRank?'maxed':availability.available&&usable?'ready':rank?'owned':'locked';
      let matching=true;
      if(!this.legacy){matching=(!query||`${skill.name} ${skill.description} ${skill.requires.map(id=>catalog.get(id)?.name).join(' ')}`.toLowerCase().includes(query))&&(selectedBranch==='all'||!!query||skill.branch===selectedBranch)&&(!availableOnly||availability.available);if(matching)matches++;}
      node.dataset.state=status;node.classList.toggle('is-ready',status==='ready');node.classList.toggle('is-owned',rank>0);node.classList.toggle('is-maxed',status==='maxed');node.classList.toggle('is-locked',status==='locked');
      node.classList.toggle('is-selected',skill.id===this.selected);node.classList.toggle('is-path',path.has(skill.id));node.classList.toggle('is-dim',!matching);node.classList.toggle('is-match',matching&&!!query);
      node.setAttribute('aria-pressed',String(skill.id===this.selected));node.setAttribute('aria-label',`${skill.name}. Rank ${rank} of ${skill.maxRank}. ${availability.reason} Select to inspect.`);
      node.querySelector('.graph-node-rank').textContent=`${rank}/${skill.maxRank}`;
    }
    for(const edge of this.root.querySelectorAll('[data-edge-from]')){
      const from=edge.dataset.edgeFrom,to=edge.dataset.edgeTo;
      edge.classList.toggle('is-path',path.has(to)&&(from==='origin'||path.has(from)));
      edge.classList.toggle('is-complete',from==='origin'?!!player?.skills[to]:!!player?.skills[from]&&!!player?.skills[to]);
    }
    this.renderInspector(player,state,usable);
    return matches;
  }
  renderInspector(player,state,usable){
    const skill=catalog.get(this.selected),rank=player?.skills[skill.id]||0,currency=this.legacy?'PP':'SP',cost=player?skillCost(player,skill.id):skill.cost;
    this.root.querySelector('[data-graph-action="details"]').textContent=`${skill.name} · DETAILS ↓`;
    const availability=player?skillAvailability(player,skill.id,state):{available:false,reason:'Join the session to research.'},maxed=rank>=skill.maxRank;
    const requirements=skill.requires.map(id=>{const required=catalog.get(id),needed=skill.requiredRanks?.[id]||1,owned=player?.skills[id]||0;return `<button class="graph-dependency${owned>=needed?' is-met':''}" data-focus-skill="${id}"><span>${safe(required?.name||id)} ↗</span><b>${owned}/${needed}</b></button>`;}).join('');
    const gates=[['orb','Reach orb',player?.highestOrb],['rounds','Complete rounds',player?.completedRounds],['prestiges','Prestige resets',player?.prestigeCount],['prestige','Lifetime PP',player?.totalPrestige]].filter(([key])=>skill.gates?.[key]>0).map(([key,label,value])=>`<li class="${(value||0)>=skill.gates[key]?'is-met':''}"><span>${label}</span><b>${count(value)} / ${count(skill.gates[key])}</b></li>`).join('');
    const markup=`<button class="graph-back" data-graph-action="back">↑ Back to the tree</button><div class="graph-inspector-heading"><span class="graph-inspector-icon" style="color:${branchColor(skill)}">${glyph(skill)}</span><div><span class="graph-eyebrow">${safe(SKILL_BRANCHES.find(branch=>branch.id===skill.branch)?.name||'Research')} · TIER ${skill.tier}</span><h3>${safe(skill.name)}</h3></div></div><div class="graph-rank-preview"><span>RANK</span><strong>${rank} <em>→</em> ${maxed?'MAX':rank+1}</strong><small>of ${skill.maxRank}</small></div><p class="graph-effect">${safe(skill.description)}</p><div class="graph-inspector-progress"><span style="width:${rank/skill.maxRank*100}%"></span></div>${requirements?`<div class="graph-requires"><h4>CONNECTED RESEARCH</h4>${requirements}</div>`:'<p class="graph-starting">Starting node · no prerequisite</p>'}${gates?`<ul class="graph-gates">${gates}</ul>`:''}<div class="graph-purchase"><p id="research-reason-${skill.id}" role="status">${maxed?'Every rank mastered.':safe(availability.reason)}</p><button class="primary-button graph-buy" data-buy-skill="${skill.id}" ${!usable||!availability.available?'disabled':''}><span>${maxed?'MASTERED':rank?'UPGRADE NODE':'UNLOCK NODE'}</span><b id="skill-cost-${skill.id}">${maxed?'✓':`${count(cost)} ${currency}`}</b></button><small>Research survives every prestige.</small></div>`;
    // Preserve the purchase button during a successful action so keyboard users
    // retain focus. The inspector changes only when its selected data changes.
    if(this.inspectorMarkup!==markup){const focused=this.inspector.querySelector('[data-buy-skill]')===document.activeElement;this.inspector.innerHTML=markup;this.inspectorMarkup=markup;if(focused){const buy=this.inspector.querySelector('[data-buy-skill]');if(!buy.disabled)buy.focus({preventScroll:true});else this.nodeElements.get(skill.id)?.focus({preventScroll:true});}}
    this.inspector.dataset.selectedSkill=skill.id;
  }
}

export function initializeResearch(){
  $('#research-branches').innerHTML=`<button data-research-branch="all" aria-pressed="true">All paths <span>${research.length}</span></button>`+disciplines.map((branch,index)=>`<button data-research-branch="${branch.id}" aria-pressed="false" style="--branch-color:${colors[index]}"><i></i>${safe(branch.name)}<span id="branch-count-${branch.id}">0</span></button>`).join('');
  mainMap=new SkillMap('#research-map','#research-inspector',research);
  legacyMap=new SkillMap('#legacy-map','#legacy-inspector',legacy,true);
  $('#research-branches').addEventListener('click',event=>{const button=event.target.closest('[data-research-branch]');if(!button)return;selectedBranch=button.dataset.researchBranch;query='';$('#research-search').value='';lastSignature='';renderResearch(lastPlayer,lastState,lastUsable);
    if(selectedBranch==='all')mainMap.fit(false);else{const nodes=research.filter(skill=>skill.branch===selectedBranch);mainMap.select(nodes[1]?.id||nodes[0].id,true);}});
  $('#research-search').addEventListener('input',event=>{query=event.target.value.trim().toLowerCase();lastSignature='';renderResearch(lastPlayer,lastState,lastUsable);if(query){const first=research.find(skill=>`${skill.name} ${skill.description} ${skill.requires.map(id=>catalog.get(id)?.name).join(' ')}`.toLowerCase().includes(query));if(first)mainMap.select(first.id,true);}});
  $('#research-available').addEventListener('click',()=>{availableOnly=!availableOnly;lastSignature='';renderResearch(lastPlayer,lastState,lastUsable);});
  document.addEventListener('click',event=>{const button=event.target.closest('[data-focus-skill]');if(!button)return;const skill=catalog.get(button.dataset.focusSkill);if(!skill)return;query='';availableOnly=false;selectedBranch='all';$('#research-search').value='';document.querySelector(`[data-tab="${skill.currency==='prestige'?'prestige':'skills'}"]`).click();(skill.currency==='prestige'?legacyMap:mainMap).select(skill.id,true);});
}

export function renderResearch(player,state,usable){
  lastPlayer=player;lastState=state;lastUsable=usable;if(!state||!mainMap)return;
  mainMap.ensureCamera();legacyMap.ensureCamera();
  const signature=JSON.stringify([player?.id,player?.skills,player?.skillPoints,player?.prestigePoints,player?.totalPrestige,player?.prestigeCount,player?.highestOrb,player?.completedRounds,getFarmUnlocked(player),state.phase,state.mode,usable,selectedBranch,query,availableOnly,mainMap.selected,legacyMap.selected]);
  if(signature===lastSignature)return;lastSignature=signature;
  const owned=research.reduce((sum,skill)=>sum+(player?.skills[skill.id]||0),0),total=research.reduce((sum,skill)=>sum+skill.maxRank,0);
  $('#research-progress').textContent=`${count(owned)} / ${count(total)} ranks · ${research.length} nodes`;
  $('#research-milestone').textContent=`Orb ${count(player?.highestOrb)} · ${count(player?.completedRounds)} rounds · ${count(player?.prestigeCount)} prestiges`;
  $('#legacy-points').textContent=count(player?.prestigePoints);
  for(const branch of disciplines){const ranks=research.filter(skill=>skill.branch===branch.id).reduce((sum,skill)=>sum+(player?.skills[skill.id]||0),0);$(`#branch-count-${branch.id}`).textContent=String(ranks);}
  for(const button of $('#research-branches').querySelectorAll('[data-research-branch]'))button.setAttribute('aria-pressed',String(selectedBranch===button.dataset.researchBranch));
  $('#research-available').setAttribute('aria-pressed',String(availableOnly));
  const branch=disciplines.find(item=>item.id===selectedBranch);
  $('#research-branch-title').textContent=query?'Search the circuit':branch?.name||'Follow the light';
  $('#research-branch-description').textContent=query?'Matching nodes are lit. Their connections stay visible.':branch?.description||'Choose a node to inspect its upgrades. Bright lines trace its prerequisites.';
  const matches=mainMap.render(player,state,usable);legacyMap.render(player,state,usable);
  $('#research-branch-progress').textContent=query||availableOnly||branch?`${matches} highlighted`:`${disciplines.length} disciplines`;
  $('#research-empty').hidden=matches!==0;
}
