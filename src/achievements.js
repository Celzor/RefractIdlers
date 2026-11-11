/**
 * Achievements: lifetime milestones shown beside the scoreboard. Every test reads a record the engine keeps across
 * prestige (lifetime LRC, clicks, orbs, rounds, research ranks, farm meals, sky catches), so a badge never locks again.
 * Nothing here is saved: the list is derived from the player each render, and a full progress reset clears it naturally.
 */
import { FINAL_LEVEL } from './campaign.js';
import { SKILLS, isResearchComplete } from './game.js';
import { getFarmUnlocked } from './farm.js';

const n = (value) => (Number.isFinite(value) ? value : 0);
const researchRanks = (p) => SKILLS.reduce((sum, skill) => sum + (skill.currency === 'skill' ? n(p.skills?.[skill.id]) : 0), 0);

export const ACHIEVEMENTS = Object.freeze([
  { id: 'first-light', name: 'First light', description: 'Land your first hit on a Refract orb.', icon: '✦', test: (p) => n(p.clicks) >= 1 },
  { id: 'hundred-hands', name: 'Hundred hands', description: 'Hit the orb 100 times by hand.', icon: '✦', test: (p) => n(p.clicks) >= 100 },
  { id: 'thousand-hands', name: 'Thousand hands', description: 'Hit the orb 1,000 times by hand.', icon: '✦', test: (p) => n(p.clicks) >= 1000 },
  { id: 'carpal-constellation', name: 'Carpal constellation', description: 'Hit the orb 10,000 times by hand.', icon: '✦', test: (p) => n(p.clicks) >= 10000 },
  { id: 'shellbreaker', name: 'Shellbreaker', description: 'Shatter your first orb.', icon: '◈', test: (p) => n(p.orbsDestroyed) >= 1 },
  { id: 'demolition-crew', name: 'Demolition crew', description: 'Shatter 25 orbs.', icon: '◈', test: (p) => n(p.orbsDestroyed) >= 25 },
  { id: 'orb-century', name: 'Orb century', description: 'Shatter 100 orbs.', icon: '◈', test: (p) => n(p.orbsDestroyed) >= 100 },
  { id: 'serial-shatterer', name: 'Serial shatterer', description: 'Shatter 1,000 orbs.', icon: '◈', test: (p) => n(p.orbsDestroyed) >= 1000 },
  { id: 'gatekeeper', name: 'Gatekeeper', description: 'Beat a system boss and jump to the second system.', icon: '⌖', test: (p) => n(p.highestOrb) >= 21 },
  { id: 'halfway-home', name: 'Halfway home', description: 'Reach the sixth system, orb 101.', icon: '⌖', test: (p) => n(p.highestOrb) >= 101 },
  { id: 'the-last-light', name: 'The last light', description: 'Reach Refract, the final core.', icon: '✧', test: (p) => n(p.highestOrb) >= FINAL_LEVEL },
  { id: 'homecoming', name: 'Homecoming', description: 'Complete the journey to Beam’s home.', icon: '✧', test: (p) => n(p.victories) >= 1 },
  { id: 'shift-complete', name: 'Shift complete', description: 'Complete your first round.', icon: '⌛', test: (p) => n(p.completedRounds) >= 1 },
  { id: 'regular-shift', name: 'Regular shift', description: 'Complete 10 rounds.', icon: '⌛', test: (p) => n(p.completedRounds) >= 10 },
  { id: 'veteran-pilot', name: 'Veteran pilot', description: 'Complete 100 rounds.', icon: '⌛', test: (p) => n(p.completedRounds) >= 100 },
  { id: 'pocket-change', name: 'Pocket change', description: 'Earn 1,000 lifetime LRC.', icon: '¤', test: (p) => n(p.lifetimeLrc) >= 1e3 },
  { id: 'light-millionaire', name: 'Light millionaire', description: 'Earn 1,000,000 lifetime LRC.', icon: '¤', test: (p) => n(p.lifetimeLrc) >= 1e6 },
  { id: 'light-billionaire', name: 'Light billionaire', description: 'Earn 1,000,000,000 lifetime LRC.', icon: '¤', test: (p) => n(p.lifetimeLrc) >= 1e9 },
  { id: 'light-trillionaire', name: 'Light trillionaire', description: 'Earn one trillion lifetime LRC.', icon: '¤', test: (p) => n(p.lifetimeLrc) >= 1e12 },
  { id: 'refracted', name: 'Refracted', description: 'Prestige for the first time.', icon: '✧', test: (p) => n(p.prestigeCount) >= 1 },
  { id: 'prism-veteran', name: 'Prism veteran', description: 'Prestige five times.', icon: '✧', test: (p) => n(p.prestigeCount) >= 5 },
  { id: 'eternal-light', name: 'Eternal light', description: 'Earn 100 lifetime prestige points.', icon: '✧', test: (p) => n(p.totalPrestige) >= 100 },
  { id: 'scholar', name: 'Scholar', description: 'Research 25 ranks across the skill tree.', icon: '⌘', test: (p) => researchRanks(p) >= 25 },
  { id: 'professor', name: 'Professor', description: 'Research 150 ranks across the skill tree.', icon: '⌘', test: (p) => researchRanks(p) >= 150 },
  { id: 'polymath', name: 'Polymath', description: 'Master every regular research node and open infinite mode.', icon: '∞', test: (p) => isResearchComplete(p) },
  { id: 'green-thumb', name: 'Green thumb', description: 'Open Beam’s Garden.', icon: '♧', test: (p) => getFarmUnlocked(p) },
  { id: 'lunch-is-served', name: 'Lunch is served', description: 'Feed Beam a meal.', icon: '♧', test: (p) => n(p.farm?.meals) >= 1 },
  { id: 'head-chef', name: 'Head chef', description: 'Feed Beam 50 meals.', icon: '♧', test: (p) => n(p.farm?.meals) >= 50 },
  { id: 'haze-cleared', name: 'Haze cleared', description: 'Defeat Haze at the green star and unlock the secret crop.', icon: '✺', test: (p) => Boolean(p.farm?.crops?.weed) },
  { id: 'clockwork', name: 'Clockwork', description: 'Let your machines land 1,000 automatic hits.', icon: '↻', test: (p) => n(p.autoClicks) >= 1000 },
  { id: 'collateral', name: 'Collateral', description: 'Lose a machine to a boss light ray.', icon: '⛨', test: (p) => n(p.machinesLost) >= 1 },
  { id: 'star-catcher', name: 'Star catcher', description: 'Catch a shooting star from the Observatory.', icon: '☄', test: (p) => n(p.starsCaught) >= 1 },
  { id: 'sky-watcher', name: 'Sky watcher', description: 'Catch 50 shooting stars.', icon: '☄', test: (p) => n(p.starsCaught) >= 50 },
  { id: 'quasar-tapped', name: 'Quasar tapped', description: 'Tap a flaring quasar for a windfall.', icon: '◉', test: (p) => n(p.quasarsTapped) >= 1 },
]);
if (new Set(ACHIEVEMENTS.map((entry) => entry.id)).size !== ACHIEVEMENTS.length) throw new Error('Achievement IDs must be unique.');

/** Every badge in catalog order with its unlocked flag for this pilot. Locked badges render as ??? in the interface. */
export function getAchievements(player, state) {
  return ACHIEVEMENTS.map(({ id, name, description, icon, test }) => {
    let unlocked = false;
    if (player) { try { unlocked = Boolean(test(player, state)); } catch { unlocked = false; } }
    return { id, name, description, icon, unlocked };
  });
}
export const unlockedAchievements = (player, state) => getAchievements(player, state).filter((entry) => entry.unlocked);
