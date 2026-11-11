/** The last core's original canvas film. Presentation never changes game state. */
const TAU=Math.PI*2,END=18,IGNITION=3.55;
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const random=value=>{const n=Math.sin(value*127.1+311.7)*43758.5453;return n-Math.floor(n);};
const COLORS=['#83eaff','#7d9bff','#bc8cff','#ffb6cf','#ffe2a2','#d9ffff'];
const PHASES={gathering:'Ten systems on vegetable fuel. Beam is home, and the Refract is right there.',rupture:'The last core becomes a thousand suns of glittering dust.',afterglow:'Beam crushes it into one perfect line… and snorts the lot.',complete:'The most wicked high in every universe. The galaxy remembers your light.'};

export class FinaleScene {
  constructor(root,{audio,onContinue,onReplay}={}) {
    this.root=root;this.audio=audio;this.onContinue=onContinue;this.onReplay=onReplay;
    this.active=false;this.disposed=false;this.elapsed=0;this.generation=0;this.frameId=0;this.glows=new Map();
    this.motion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');this.reducedMotion=Boolean(this.motion?.matches);
    this.motionChange=event=>{this.reducedMotion=event.matches;this.dialog.dataset.reducedMotion=String(this.reducedMotion);};
    this.motion?.addEventListener?.('change',this.motionChange);
    this.dialog=document.createElement('dialog');this.dialog.className='finale-dialog';
    this.dialog.setAttribute('aria-labelledby','finale-title');this.dialog.setAttribute('aria-describedby','finale-narration');
    this.dialog.innerHTML=`<h1 id="finale-title" class="finale-accessible-title">The final Refract core</h1><canvas class="finale-canvas" aria-hidden="true"></canvas><div class="finale-vignette" aria-hidden="true"></div>
      <header class="finale-toolbar"><span class="finale-chapter">REFRACT <i></i> THE FINAL LIGHT</span><div><button type="button" data-finale-sound aria-pressed="false">Sound off</button><button type="button" data-finale-skip>Skip animation <span>ESC</span></button></div></header>
      <div class="finale-prologue" aria-hidden="true"><span>EVERY ORBIT LED HERE</span><p>One last refraction.</p></div>
      <p class="finale-narration" id="finale-narration" role="status" aria-live="polite"></p>
      <section class="finale-summary" hidden><span class="finale-medallion" aria-hidden="true">✦</span><p class="finale-eyebrow">JOURNEY COMPLETE</p><h2>Beyond the last light.</h2><p class="finale-winner"></p><div class="finale-reward"><span class="finale-reward-value"></span><span class="finale-reward-label"></span></div><p class="finale-memory">A thousand fragments. A new constellation.<br>Your light belongs to the whole galaxy now.</p><div class="finale-actions"><button type="button" class="finale-return" data-finale-continue>Return to galaxy <span>↗</span></button><button type="button" data-finale-replay>Watch again</button></div><p class="finale-replay-note"></p></section>`;
    root.append(this.dialog);this.canvas=this.dialog.querySelector('canvas');this.ctx=this.canvas.getContext('2d',{alpha:false});
    this.summary=this.dialog.querySelector('.finale-summary');this.narration=this.dialog.querySelector('.finale-narration');
    this.prologue=this.dialog.querySelector('.finale-prologue');
    this.skipButton=this.dialog.querySelector('[data-finale-skip]');this.soundButton=this.dialog.querySelector('[data-finale-sound]');
    this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.skip();});
    // Prevent the browser's close request even when a restored victory opens
    // before this page has received a user gesture. Keep map shortcuts outside.
    this.dialog.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.skip();}
      else if(event.key==='Tab')event.stopPropagation();
    },true);
    this.skipButton.addEventListener('click',()=>this.skip());
    this.dialog.querySelector('[data-finale-continue]').addEventListener('click',()=>{const details={...this.details};this.stop();this.onContinue?.(details);});
    this.dialog.querySelector('[data-finale-replay]').addEventListener('click',()=>void this.replay());
    this.soundButton.addEventListener('click',()=>void this.toggleSound());
    this.resize=()=>{if(!this.active)return;this.width=Math.max(1,innerWidth);this.height=Math.max(1,innerHeight);this.ratio=Math.min(1.5,devicePixelRatio||1);this.canvas.width=Math.round(this.width*this.ratio);this.canvas.height=Math.round(this.height*this.ratio);this.draw(this.elapsed);};
    addEventListener('resize',this.resize);
    this.logo=new Image();this.logo.src=new URL('../assets/refract-icon.png',import.meta.url).href;
    this.stars=Array.from({length:420},(_,i)=>({x:random(i+1),y:random(i+401),size:.45+random(i+901)*1.5,depth:.2+random(i+1301)*.8,color:COLORS[i%COLORS.length]}));
    this.dust=Array.from({length:280},(_,i)=>({angle:i*2.399963,speed:.15+random(i+1901)*.85,arc:random(i+2301)-.5,size:.6+random(i+2601)*2.5,color:COLORS[i%COLORS.length]}));
    this.facets=this.makeFacets();
  }

  start({winner='The Refract crew',reward=100,rewardLabel='prestige points',replayed=false}={}) {
    if(this.disposed)return;
    cancelAnimationFrame(this.frameId);this.generation++;this.active=true;this.elapsed=0;this.started=performance.now();
    this.details={winner:typeof winner==='string'?winner:String(winner?.name||'The Refract crew'),reward:Number.isFinite(reward)?Math.max(0,reward):100,rewardLabel:String(rewardLabel),replayed:Boolean(replayed)};
    this.audio?.beginFinale();this.audio?.playFinale();this.syncSound();
    this.summary.hidden=true;this.skipButton.hidden=false;this.prologue.style.opacity='1';this.dialog.dataset.phase='gathering';this.dialog.dataset.reducedMotion=String(this.reducedMotion);
    this.dialog.querySelector('.finale-winner').textContent=`${this.details.winner} shattered the final core.`;
    this.dialog.querySelector('.finale-reward-value').textContent=`+${new Intl.NumberFormat('en',{maximumFractionDigits:0}).format(this.details.reward)}`;
    this.dialog.querySelector('.finale-reward-label').textContent=this.details.rewardLabel;
    this.dialog.querySelector('.finale-reward').hidden=this.details.reward===0;
    this.dialog.querySelector('.finale-replay-note').textContent=this.details.reward===0?'You joined after this expedition ended. No new reward was granted.':replayed?'A memory of your victory. Your reward is already secured.':'Victory secured. This moment is yours to keep.';
    this.narration.textContent=PHASES.gathering;
    document.body.dataset.finale='active';
    if(!this.dialog.open)this.dialog.showModal();
    this.resize();this.skipButton.focus({preventScroll:true});
    const generation=this.generation;
    const tick=now=>{
      if(!this.active||generation!==this.generation)return;
      this.elapsed=Math.min(END,Math.max(0,(now-this.started)/1000));
      this.updatePhase();this.draw(this.elapsed);
      if(this.elapsed<END)this.frameId=requestAnimationFrame(tick);
      else this.showSummary();
    };
    this.frameId=requestAnimationFrame(tick);
  }

  updatePhase() {
    const phase=this.elapsed<IGNITION?'gathering':this.elapsed<7?'rupture':this.elapsed<15?'afterglow':'complete';
    if(this.dialog.dataset.phase!==phase){this.dialog.dataset.phase=phase;this.narration.textContent=PHASES[phase];}
    this.prologue.style.opacity=String(1-smooth((this.elapsed-2.2)/1));
    if(this.elapsed>=15&&this.summary.hidden)this.showSummary();
  }

  showSummary() {
    if(!this.active)return;
    const first=this.summary.hidden;this.summary.hidden=false;this.skipButton.hidden=true;
    this.prologue.style.opacity='0';
    this.dialog.dataset.phase='complete';this.narration.textContent=PHASES.complete;
    if(first)this.dialog.querySelector('[data-finale-continue]').focus({preventScroll:true});
  }

  skip() {
    if(!this.active||!this.summary.hidden)return;
    cancelAnimationFrame(this.frameId);this.elapsed=END;
    // Keep the ordinary channel locked while stopping the remaining score.
    this.audio?.beginFinale();this.showSummary();this.draw(END);
  }

  async replay() {
    if(!this.active)return;
    const generation=this.generation;
    if(this.audio?.enabled)await this.audio.unlock();
    if(!this.active||generation!==this.generation)return;
    this.onReplay?.({...this.details});this.start({...this.details,replayed:true});
  }

  async toggleSound() {
    if(!this.audio)return;
    const enabled=!this.audio.enabled;this.audio.setEnabled(enabled);this.syncSound();
    try{localStorage.setItem('refract-idlers:sound',enabled?'on':'off');}catch{/* preference storage is optional */}
    if(enabled){
      const generation=this.generation;await this.audio.unlock();
      if(this.active&&generation===this.generation&&this.elapsed<15)this.audio.playFinale({elapsed:this.elapsed});
    }
  }

  syncSound() {
    const enabled=Boolean(this.audio?.enabled);this.soundButton.textContent=enabled?'Sound on':'Sound off';
    this.soundButton.setAttribute('aria-pressed',String(enabled));this.soundButton.setAttribute('aria-label',enabled?'Mute finale sound':'Enable finale sound');
    this.soundButton.disabled=!this.audio;
  }

  stop() {
    this.active=false;this.generation++;cancelAnimationFrame(this.frameId);this.audio?.endFinale();
    if(this.dialog.open)this.dialog.close();delete document.body.dataset.finale;
  }

  dispose() {
    this.stop();this.disposed=true;removeEventListener('resize',this.resize);this.motion?.removeEventListener?.('change',this.motionChange);
    this.dialog.remove();this.glows.clear();this.stars=[];this.dust=[];this.facets=[];
  }

  makeFacets() {
    const vertices=Array.from({length:6},(_,row)=>Array.from({length:6},(_,col)=>({x:col/5-.5+(col&&col<5?(random(row*6+col+3001)-.5)*.09:0),y:row/5-.5+(row&&row<5?(random(row*6+col+3101)-.5)*.09:0)})));
    const facets=[];
    for(let row=0;row<5;row++)for(let col=0;col<5;col++){
      const a=vertices[row][col],b=vertices[row][col+1],c=vertices[row+1][col],d=vertices[row+1][col+1];
      for(const points of [[a,b,c],[b,d,c]]){
        const index=facets.length,x=points.reduce((sum,p)=>sum+p.x,0)/3,y=points.reduce((sum,p)=>sum+p.y,0)/3;
        facets.push({points,x,y,angle:Math.atan2(y,x)+(random(index+4001)-.5)*.55,speed:.6+random(index+4401)*.9,spin:(random(index+4801)-.5)*2.2,color:COLORS[index%COLORS.length]});
      }
    }
    return facets;
  }

  glow(x,y,size,color,alpha=1,stretch=1) {
    if(alpha<=0||size<=0)return;
    let sprite=this.glows.get(color);
    if(!sprite){
      sprite=document.createElement('canvas');sprite.width=sprite.height=128;const c=sprite.getContext('2d');
      const gradient=c.createRadialGradient(64,64,0,64,64,64);gradient.addColorStop(0,color);gradient.addColorStop(.2,`${color}c0`);gradient.addColorStop(.55,`${color}40`);gradient.addColorStop(1,`${color}00`);
      c.fillStyle=gradient;c.fillRect(0,0,128,128);this.glows.set(color,sprite);
    }
    const c=this.ctx;c.globalAlpha=clamp(alpha);c.drawImage(sprite,x-size*stretch/2,y-size/2,size*stretch,size);
  }

  draw(time) {
    const c=this.ctx;if(!c||!this.width)return;
    const w=this.width,h=this.height,cx=w/2,cy=h*.46,unit=Math.min(w,h),age=Math.max(0,time-IGNITION),quiet=this.reducedMotion;
    c.setTransform(this.ratio,0,0,this.ratio,0,0);c.globalCompositeOperation='source-over';c.globalAlpha=1;
    c.fillStyle='#03040d';c.fillRect(0,0,w,h);
    const after=smooth((time-6)/7),charge=smooth(time/IGNITION),impact=time>=IGNITION?Math.exp(-age*.58):0;
    c.globalCompositeOperation='screen';
    this.glow(w*.28,h*.38,unit*1.25,'#311b66',.18+after*.25,1.4);
    this.glow(w*.75,h*.63,unit*1.2,'#083f6a',.2+after*.3,1.4);
    if(after>0)this.drawAurora(time,after,quiet);
    this.drawStars(time,impact,quiet);
    if(quiet){
      this.glow(cx,cy,unit*.68,'#4b4cbb',.2+charge*.2);
      this.glow(cx,cy,unit*.3,'#9cdeff',time<7?.13:.07);
      if(time<8)this.drawLogo(cx,cy,unit*.24,0,1-smooth((time-4)/4),false);
      this.drawConstellation(after);
    }else{
      if(time<IGNITION){
        this.drawGathering(time,charge);
        const size=unit*.25*(1-charge*.19);
        this.glow(cx,cy,size*2.9,'#336cbb',.16+charge*.3);
        this.glow(cx,cy,size*1.45,'#e1d6ff',charge*.14);
        this.drawLogo(cx,cy,size,0,1,true);
        this.drawFractures(time,charge,size);
      }else{
        this.drawExplosion(time,age,impact);
        if(age<5.7)this.drawLogo(cx,cy,unit*.205,age,1-smooth((age-2.2)/3.5),false);
        this.drawConstellation(after);
      }
    }
    c.globalCompositeOperation='source-over';c.globalAlpha=1;
    // A gentle letterbox gives the light room to breathe without hiding controls.
    const vignette=c.createLinearGradient(0,0,0,h);vignette.addColorStop(0,'#03040da0');vignette.addColorStop(.2,'#03040d00');vignette.addColorStop(.75,'#03040d00');vignette.addColorStop(1,'#03040dd9');c.fillStyle=vignette;c.fillRect(0,0,w,h);
    this.dialog.dataset.elapsed=String(Math.floor(time*10)/10);
  }

  drawStars(time,impact,quiet) {
    const c=this.ctx,w=this.width,h=this.height,cx=w/2,cy=h*.46;
    for(let i=0;i<this.stars.length;i++){
      const star=this.stars[i],dx=star.x*w-cx,dy=star.y*h-cy;
      const dilation=quiet?1:1+impact*star.depth*.15;
      const x=cx+dx*dilation,y=cy+dy*dilation;
      c.globalAlpha=(.25+star.depth*.55)*(quiet?.9:.78+Math.sin(time*.6+i)*.15);c.fillStyle=star.color;
      c.fillRect(x,y,star.size,star.size);
      if(!quiet&&impact>.4&&i%3===0){c.globalAlpha=impact*.3;c.strokeStyle=star.color;c.lineWidth=star.size*.6;c.beginPath();c.moveTo(x,y);c.lineTo(x+dx*impact*.05,y+dy*impact*.05);c.stroke();}
      if(i%39===0){c.globalAlpha=.25;c.fillRect(x-star.size*2,y,star.size*5,.6);c.fillRect(x,y-star.size*2,.6,star.size*5);}
    }
  }

  drawGathering(time,charge) {
    const c=this.ctx,w=this.width,h=this.height,cx=w/2,cy=h*.46,unit=Math.min(w,h);
    for(let i=0;i<64;i++){
      const seed=this.dust[i],cycle=(time*.19+seed.speed)%1,radius=unit*(.12+(1-cycle)*.45),angle=seed.angle+time*.1;
      const x=cx+Math.cos(angle)*radius,y=cy+Math.sin(angle)*radius*.65;
      c.globalAlpha=charge*Math.sin(cycle*Math.PI)*.65;c.fillStyle=seed.color;c.beginPath();c.arc(x,y,seed.size*.55,0,TAU);c.fill();
    }
    for(let i=0;i<3;i++){
      const radius=unit*(.18+(1-charge)*.12+i*.055);c.globalAlpha=charge*.1;c.strokeStyle=COLORS[i];c.lineWidth=.7;
      c.beginPath();c.ellipse(cx,cy,radius,radius*.37,-.15+i*.16,0,TAU);c.stroke();
    }
    this.glow(cx,cy,unit*.11,'#f0e8ff',charge*.1,8);
  }

  drawLogo(cx,cy,size,age,opacity,whole) {
    const c=this.ctx;if(opacity<=0)return;
    c.save();c.globalCompositeOperation='source-over';c.globalAlpha=opacity;
    if(this.logo.complete&&this.logo.naturalWidth){
      if(whole||age===0){c.drawImage(this.logo,cx-size/2,cy-size/2,size,size);}
      else for(const facet of this.facets){
        const distance=(1-Math.exp(-age*.68))*Math.min(this.width,this.height)*.8*facet.speed;
        const x=cx+facet.x*size+Math.cos(facet.angle)*distance,y=cy+facet.y*size+Math.sin(facet.angle)*distance*.72;
        c.save();c.translate(x,y);c.rotate(facet.spin*age);
        c.beginPath();for(let i=0;i<facet.points.length;i++){const p=facet.points[i];c[i?'lineTo':'moveTo']((p.x-facet.x)*size,(p.y-facet.y)*size);}c.closePath();c.clip();
        c.drawImage(this.logo,(-.5-facet.x)*size,(-.5-facet.y)*size,size,size);
        c.globalCompositeOperation='screen';c.globalAlpha=opacity*.12;c.fillStyle=facet.color;c.fill();c.restore();
      }
    }else{
      c.translate(cx,cy);c.strokeStyle='#adceff';c.fillStyle='#2d2260';c.lineWidth=2;c.beginPath();c.moveTo(-size*.3,-size*.5);c.lineTo(size*.42,size*.35);c.lineTo(-size*.2,size*.47);c.closePath();c.fill();c.stroke();
    }
    c.restore();
  }

  drawFractures(time,charge,size) {
    const c=this.ctx,cx=this.width/2,cy=this.height*.46;
    const reveal=smooth((time-1.35)/1.85);if(reveal<=0)return;
    c.save();c.translate(cx-size*.04,cy);c.globalCompositeOperation='screen';
    for(let i=0;i<7;i++){
      const angle=i*TAU/7+.17,reach=size*.35*reveal;c.globalAlpha=reveal*.8;c.strokeStyle=COLORS[i%COLORS.length];c.lineWidth=1+charge;
      c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(angle+.15)*reach*.32,Math.sin(angle+.15)*reach*.32);c.lineTo(Math.cos(angle-.1)*reach*.67,Math.sin(angle-.1)*reach*.67);c.lineTo(Math.cos(angle)*reach,Math.sin(angle)*reach);c.stroke();
    }
    c.restore();
  }

  drawExplosion(time,age,impact) {
    const c=this.ctx,w=this.width,h=this.height,cx=w/2,cy=h*.46,unit=Math.min(w,h);
    const expansion=1-Math.exp(-age*1.3),radius=unit*(.12+expansion*.58);
    this.glow(cx,cy,radius*2.4,'#6866ff',impact*.7);
    this.glow(cx,cy,radius*1.7,'#70d9ff',impact*.65);
    this.glow(cx,cy,radius*.72,'#fff0dd',impact*.8);
    this.glow(cx,cy,unit*.08+age*10,'#fff7e3',Math.exp(-age*.75),14);
    // One expanding seismic plane; no repeated full-screen flashes or shaking.
    if(age<5){
      const wave=unit*(.08+age*.6),alpha=Math.exp(-age*.65);
      c.globalAlpha=alpha*.75;c.lineWidth=1.3;c.strokeStyle='#c3f3ff';c.beginPath();c.ellipse(cx,cy,wave,wave*.12,-.035,0,TAU);c.stroke();
      c.globalAlpha=alpha*.25;c.lineWidth=5;c.strokeStyle='#7f7bff';c.beginPath();c.ellipse(cx,cy,wave,wave*.12,-.035,0,TAU);c.stroke();
      c.globalAlpha=alpha*.4;c.lineWidth=1;c.strokeStyle='#ffe1b6';c.beginPath();c.ellipse(cx,cy,wave*.88,wave*.42,.11,0,TAU);c.stroke();
    }
    for(let i=0;i<44;i++){
      const angle=i*TAU/44+random(i+701)*.1,reach=radius*(.65+random(i+702)*.9),spread=.003+random(i+703)*.009;
      c.globalAlpha=impact*(i%3?.16:.32);c.fillStyle=COLORS[i%COLORS.length];
      c.beginPath();c.moveTo(cx+Math.cos(angle-spread)*9,cy+Math.sin(angle-spread)*9);c.lineTo(cx+Math.cos(angle)*reach,cy+Math.sin(angle)*reach*.82);c.lineTo(cx+Math.cos(angle+spread)*9,cy+Math.sin(angle+spread)*9);c.closePath();c.fill();
    }
    for(let i=0;i<this.dust.length;i++){
      const particle=this.dust[i],distance=unit*(.03+expansion*.75*particle.speed)+age*particle.speed*8;
      const angle=particle.angle+particle.arc*age*.035,x=cx+Math.cos(angle)*distance,y=cy+Math.sin(angle)*distance*.73;
      const alpha=Math.exp(-age*(.2+particle.speed*.1));c.globalAlpha=alpha*.8;c.fillStyle=particle.color;
      if(i%11===0)this.glow(x,y,particle.size*12,particle.color,alpha*.35);
      c.globalAlpha=alpha*.8;c.fillStyle=particle.color;c.beginPath();c.arc(x,y,particle.size*(1+impact),0,TAU);c.fill();
    }
    this.glow(cx,cy,unit*.16,'#91a5ff',smooth((age-3)/4)*.22);
  }

  drawAurora(time,alpha,quiet) {
    const c=this.ctx,w=this.width,h=this.height;
    c.save();c.translate(w*.5,h*.48);c.rotate(-.28);
    for(let band=0;band<6;band++){
      const drift=quiet?0:Math.sin(time*.12+band)*12;
      c.globalAlpha=alpha*(.025+band*.004);c.strokeStyle=COLORS[band];c.lineWidth=14+band*8;
      c.beginPath();c.moveTo(-w*.6,h*.12+band*7);c.bezierCurveTo(-w*.2,-h*.3+drift,w*.1,h*.3-drift,w*.6,-h*.13-band*9);c.stroke();
    }
    c.restore();
  }

  drawConstellation(alpha) {
    if(alpha<=0)return;const c=this.ctx,w=this.width,h=this.height,unit=Math.min(w,h),points=[];
    for(let i=0;i<17;i++){
      const angle=i*TAU/17-.9,radius=unit*(.19+random(i+6001)*.16);points.push({x:w/2+Math.cos(angle)*radius*1.45,y:h*.46+Math.sin(angle)*radius*.9});
    }
    c.strokeStyle='#88abda';c.lineWidth=.6;c.globalAlpha=alpha*.25;
    for(let i=0;i<points.length;i++){if(i%4===3)continue;const from=points[i],to=points[(i+1)%points.length];c.beginPath();c.moveTo(from.x,from.y);c.lineTo(to.x,to.y);c.stroke();}
    for(let i=0;i<points.length;i++){
      const point=points[i];this.glow(point.x,point.y,i%4===0?42:25,COLORS[i%COLORS.length],alpha*.4);
      c.globalAlpha=alpha*.8;c.fillStyle='#e3efff';c.fillRect(point.x-1,point.y-1,2,2);
    }
  }
}
