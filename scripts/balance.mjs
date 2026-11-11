/** Reproducible play-policy audit. This is a pacing report, not an optimal-play claim. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import * as game from '../src/game.js';

const extended = process.argv.includes('--extended');
const pushHours=Number(process.argv.find(arg=>arg.startsWith('--push-hours='))?.split('=')[1]||24);
assert.ok(Number.isFinite(pushHours)&&pushHours>0&&pushHours<=168,'The final push must be between 0 and 168 active hours');
const checkpoints = [3600, 21600, 86400, ...(extended ? [10000 * 60] : [])];
const maxSeconds = checkpoints.at(-1);
const normalResearch = game.SKILLS.filter(skill => skill.currency === 'skill');
const started = performance.now();
const report = {
  methodology: {
    mode: 'Solo scoreboard, fixed RNG seed 0x5eed.',
    policies: '0 manual clicks/sec and 2 manual clicks/sec. Both policies buy the most expensive unlocked, affordable machine type first every 10 seconds, then cheaper types, using Buy Max. Arsenal gates are never bypassed.',
    research: 'Between rounds buy the cheapest currently legal research repeatedly. Every purchase uses skillAvailability and applyAction; no gates or resources are bypassed.',
    prestige: 'First prestige as soon as eligible at intermission. Subsequent prestige requires at least 15 completed rounds since the previous reset and a gain of at least 5 points. Research is retained.',
    unattended: 'The two long simulations automatically ready and shop between rounds. They model continuously managed play, not closed-tab or hands-free progress. A separate true-unattended check stops at the first intermission.',
    precision: 'Zero-click simulation advances in 10-second segments; 2-click/sec uses 0.5-second steps. Milestone timing is accurate to the corresponding step, except eligibility may be recorded within the current round before prestige becomes selectable.',
    deepPush: `After 10,000 rounds, extended mode holds prestige for up to ${pushHours} additional active hours while continuing the same legal investment, research and clicking policy.`,
  },
  research: {
    nodes: normalResearch.length,
    ranks: game.RESEARCH_TOTAL_RANKS,
    totalSP: game.RESEARCH_TOTAL_COST,
    maximumSPPerRound: game.MAX_SKILL_POINTS_PER_ROUND,
    optimisticActiveHoursToMax: game.RESEARCH_TOTAL_COST / game.MAX_SKILL_POINTS_PER_ROUND / 60,
    optimisticActiveDaysToMax: game.RESEARCH_TOTAL_COST / game.MAX_SKILL_POINTS_PER_ROUND / 60 / 24,
    caveat: 'The theoretical bound assumes maximum SP income from the first round, immediate ready-ups, no other delays, and all gates met. Actual progression is slower.',
  },
  scenarios: [],
};

function researchAllAvailable(state, player) {
  let bought = 0;
  while (true) {
    const choices = game.SKILLS.filter(skill => game.skillAvailability(player, skill.id, state).available)
      .sort((a,b) => game.skillCost(player,a.id)-game.skillCost(player,b.id) || a.id.localeCompare(b.id));
    if (!choices.length) return bought;
    const result = game.applyAction(state, player.id, {type:'buySkill',id:choices[0].id});
    assert.equal(result.ok, true, `Legal research ${choices[0].key}`);
    if (++bought > 500) throw Error('Research loop exceeded all possible ranks');
  }
}
function invest(state, player) {
  for (const generator of [...game.GENERATORS].sort((a,b)=>b.baseCost-a.baseCost)) {
    if(!game.generatorAvailability(player,generator.id,state).available)continue;
    if (game.generatorCost(player,generator.id)>game.getBalance(player,state)) continue;
    const quote = game.generatorQuote(player,generator.id,'max',state);
    if (!quote.quantity) continue;
    const result = game.applyAction(state,player.id,{type:'buyGenerator',id:generator.id,quantity:'max'});
    assert.equal(result.ok,true, `Affordable machine investment ${generator.id}`);
  }
}
function snapshot(state,player) {
  const stats = game.getStats(player,state);
  const research = normalResearch.filter(skill => (player.skills[skill.id]||0)>0);
  return {
    hours:state.now/3600,completedRounds:player.completedRounds,highestOrb:player.highestOrb,
    researchNodes:research.length,researchRanks:research.reduce((sum,s)=>sum+(player.skills[s.id]||0),0),
    highestResearchTier:Math.max(0,...research.map(s=>s.tier)),
    permanentRanks:game.SKILLS.filter(s=>s.currency==='prestige').reduce((sum,s)=>sum+(player.skills[s.id]||0),0),
    skillPoints:player.skillPoints,totalPrestige:player.totalPrestige,prestiges:player.prestigeCount,
    lifetimeLrc:player.lifetimeLrc,steadyLrcPerSecond:stats.idleRate,automaticDamagePerSecond:stats.autoDps,
    generatorCounts:{...player.generators},
  };
}
for (const clicksPerSecond of [0,2]) {
  const state = game.createGame();
  const player = game.addPlayer(state,{id:'audit',name:'Audit pilot'});
  game.applyAction(state,player.id,{type:'start'});
  const scenario={manualClicksPerSecond:clicksPerSecond,firstCrackSeconds:null,firstCoreClearedSeconds:null,firstBossClearedSeconds:null,firstPrestigeEligibleSeconds:null,firstPrestigeSeconds:null,checkpoints:[]};
  let lastPrestigeRound=-Infinity,nextInvestment=10,steps=0;
  while(state.now<maxSeconds) {
    if(state.phase==='round') {
      if(clicksPerSecond) game.applyAction(state,player.id,{type:'click'});
      game.advance(state,clicksPerSecond?0.5:Math.min(10,state.remaining));
      if(scenario.firstCrackSeconds===null&&(player.orbsDestroyed>0||game.getOrb(player,state).fractureStage>=1))scenario.firstCrackSeconds=state.now;
      if(player.orbsDestroyed>0&&scenario.firstCoreClearedSeconds===null)scenario.firstCoreClearedSeconds=state.now;
      if(player.highestOrb>=11 && scenario.firstBossClearedSeconds===null) scenario.firstBossClearedSeconds=state.now;
      if(game.prestigeGain(player)>=1 && scenario.firstPrestigeEligibleSeconds===null) scenario.firstPrestigeEligibleSeconds=state.now;
      if(state.now>=nextInvestment){invest(state,player);nextInvestment=state.now+10;}
    }
    if(state.phase==='intermission') {
      researchAllAvailable(state,player);
      const gain=game.prestigeGain(player);
      if(gain>=(player.prestigeCount===0?1:5) && (player.prestigeCount===0 || player.completedRounds-lastPrestigeRound>=15)) {
        assert.equal(game.applyAction(state,player.id,{type:'prestige'}).ok,true);
        lastPrestigeRound=player.completedRounds;
        if(scenario.firstPrestigeSeconds===null)scenario.firstPrestigeSeconds=state.now;
        researchAllAvailable(state,player);
      }
      invest(state,player);
      assert.equal(game.validateState(state),true,`Valid snapshot after ${state.round} rounds (${clicksPerSecond}clicks/sec)`);
      if(checkpoints.includes(state.now)) scenario.checkpoints.push(snapshot(state,player));
      if(state.now<maxSeconds) assert.equal(game.applyAction(state,player.id,{type:'ready'}).ok,true);
    }
    if(++steps>maxSeconds*2+1000)throw Error('Audit step limit exceeded');
  }
  assert.ok(player.totalPrestige<Number.MAX_SAFE_INTEGER,'Prestige does not saturate its safe integer counter');
  if(extended) {
    const pushStart=state.now;
    const push={maximumHours:pushHours,orb175AfterHours:null,fullResearchAfterHours:null};
    game.applyAction(state,player.id,{type:'ready'});
    while(state.now<pushStart+pushHours*3600) {
      if(clicksPerSecond)game.applyAction(state,player.id,{type:'click'});
      game.advance(state,clicksPerSecond?0.5:Math.min(10,state.remaining));
      if(state.now>=nextInvestment){invest(state,player);nextInvestment=state.now+10;}
      if(player.highestOrb>=175&&push.orb175AfterHours===null)push.orb175AfterHours=(state.now-pushStart)/3600;
      if(state.phase==='intermission') {
        researchAllAvailable(state,player);invest(state,player);
        assert.equal(game.validateState(state),true,'Valid state during the long orb push');
        if(normalResearch.every(skill=>(player.skills[skill.id]||0)===skill.maxRank)) {push.fullResearchAfterHours=(state.now-pushStart)/3600;break;}
        if(state.now<pushStart+pushHours*3600)game.applyAction(state,player.id,{type:'ready'});
      }
    }
    push.final=snapshot(state,player);
    scenario.deepPushWithoutPrestige=push;
  }
  report.scenarios.push(scenario);
  console.log(JSON.stringify(scenario,null,2));
}

const unattended=game.createGame();
game.addPlayer(unattended,{id:'idle',name:'Unattended'});
game.applyAction(unattended,'idle',{type:'start'});
game.advance(unattended,24*3600);
report.trueUnattended={phase:unattended.phase,activeSeconds:unattended.now,lrc:unattended.players[0].lrc};
assert.equal(unattended.phase,'intermission');
assert.equal(unattended.now,60);
report.wallSeconds=(performance.now()-started)/1000;
await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
await writeFile(new URL('../test-results/balance.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(`Research bound: ${report.research.totalSP} SP, at most ${report.research.maximumSPPerRound} SP/minute, at least ${report.research.optimisticActiveDaysToMax.toFixed(2)} active days.`);
console.log(`Audit completed in ${report.wallSeconds.toFixed(2)}s. Report: test-results/balance.json`);
