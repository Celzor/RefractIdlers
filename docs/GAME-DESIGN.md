# Refract Idlers: combat, economy and long-term research

Refract Idlers combines a shared round clock with personal builds, destructible light orbs, automated attacks, continuous farming, and persistent research. The coordinating browser owns the simulation; clients send intents and render synchronized state.

## Session modes

The host chooses one mode in the initial lobby. It stays fixed for that session.

| Rule | Scoreboard | Co-op |
| --- | --- | --- |
| Orb | Each pilot attacks their own orb | Everyone attacks one shared orb |
| Wallet | Individual spendable LRCs | One pool containing everyone's earnings |
| Machines | Bought from the purchaser's wallet | Bought from the pool, attributed to the purchasing pilot |
| Research and skill points | Personal | Personal; every build contributes to the shared effort |
| Frequency effects | Only the owner benefits | Aggregate across the current crew |
| Round bonus | Reach a personal income milestone | Everyone benefits when the shared milestone is reached |
| Ranking | Currently active pilots only | Shared progress and individual contribution attribution |

Up to eight pilots are active. Additional participants spectate. Departed pilots leave the live ranking and stop producing; their already-earned co-op LRCs remain in the bank, and the shared orb's damaged percentage remains. The engine supports bots for tests, but there is no bot toggle in the interface.

## The 60-second loop

The host starts the first round. During each 60-second round, pilots can attack, buy machines, and earn continuous income. The final 10 seconds double manual and automatic hit damage. Continuous farm production is unchanged; research can separately enhance surge minting.

Completing a round grants 2 SP, plus 1 for meeting the applicable milestone, plus any research bonus. Total awards are capped at **10 SP per pilot per completed round**. The exact award is recorded before upgrades or prestige can change the build. There is no income in the lobby or intermission and no closed-tab income calculation.

The intermission has no countdown. Pilots research, buy machines, or prestige, then ready up. Everyone still active must be ready before the next round starts. Buying research or prestiging clears that pilot's ready flag. A departing player cannot hold an otherwise ready crew in the intermission.

For round `r`, the personal income milestone is:

```text
round(500 × (1 + 0.12 × (r − 1))²)
```

Scoreboard uses that personal amount. Co-op multiplies it by the number of pilots present when the round begins. The co-op target remains fixed during roster changes. Spending does not reduce milestone progress. Missing a milestone still grants the normal 2 SP and never blocks the next round. Quadratic milestone growth avoids the previous exponential curve overtaking the entire economy during a long session.

## Destructible orbs

An unmodified manual click deals **2 damage** and separately mints **0.25 LRC**. The first personal core has **2,000 HP** and pays **300 LRC** when destroyed. A new, stronger core appears immediately. Excess damage carries into subsequent cores.

The first visible shell fracture appears at **10% damage**, requiring **100 ordinary unmodified hits** against the first personal core. Later crack stages appear at **35% and 65% damage**. The shell is the visual outer surface of the same health pool; reaching a crack stage does not destroy the core or pay a separate reward. Critical hits, surge, research and automation accelerate the work. Baseline production and manual minting continue to fund the first machines while the durable shell is chipped away.

```text
unscaled maximum HP at level n = 2,000 × 1.18^(n − 1)
unscaled destruction reward = 300 × 1.14^(n − 1)
```

Every tenth orb is a boss. Bosses have **50% damage resistance** and **five times the base reward**. Maximum HP follows the same increasing curve, so orb 11 still has more HP than orb 10. Bossbreaker and related research improve damage against the resistance; boss-reward research improves the boss drop. HP and rewards eventually saturate at the documented finite economy ceiling.

Scoreboard always uses the personal curve, regardless of how many other pilots are present. Co-op multiplies maximum HP and destruction rewards by:

```text
crew scale = 1 + 0.85 × (max(1, active human pilots) − 1)
```

Two humans face 1.85× HP and receive 1.85× destruction rewards; eight face 6.95× HP and rewards. Equal participation therefore gives a modest time benefit while maintaining reward value per damage. The multiplier also applies to flat drop research. Spectators and internal practice bots do not raise difficulty. Continuous production, manual minting, personal research prices and the prestige formula do not receive this difficulty multiplier.

Joining, leaving and host handover preserve **remaining HP as a fraction of maximum HP**, then apply the new crew scale. For example, a half-damaged 3,700-HP core becomes a half-damaged 5,400-HP core when a third human joins. It remains at the same level; no kill or payout occurs. Reordering the same roster preserves HP exactly. Personal cores are never resized. The same rule holds when the last human leaves and when a crew returns, and near the finite HP ceiling.

`getOrb` exposes `crewSize`, `crewScale`, `unscaledMaxHp`, `damageFraction` and `fractureStage` alongside the current HP, level, reward and boss fields. `getCoopDifficulty` provides the crew fields independently. Crack stages use the normalized damage fraction, so roster changes do not erase or create visible cracks.

Manual hits have a base 5% critical chance and a 3× critical damage multiplier. Research adds critical chance, critical multiplier, a chance of an extra hit, and combo damage. Critical chance is capped at 80%; extra-hit chance is capped at 90%. A successful bonus-hit roll adds a second hit to the same input. Holding a key does not create repeated input in the UI, and the host's token bucket allows 15 accepted manual inputs per second with a burst of three.

Consecutive manual hits build a combo, initially capped at ten. The combo expires after two seconds without a manual hit. Combo research gives those stacks a damage effect; Fortune loop also increases capacity. The simulation splits long time steps at combo expiry and the surge boundary so an expired effect does not apply for a whole delayed frame.

Orb drops belong to the pilot whose attack shatters the orb. In co-op those drops enter the pool and that pilot's contribution record. All active co-op pilots share the highest orb reached for research gates. `getOrb(player,state).reward` previews the **personalized manual destruction reward**, including that pilot's research and prestige. Automatic-only drop modifiers can change an automatic kill's payout.

Large attacks use capped geometric sums and a binary search for the number of full orbs destroyed. Work does not grow linearly with the number of kills. The test suite compares this analytical calculation against an independent iterative oracle across partial orbs, bosses, modifiers, and high-value attacks.

## Machines and bulk purchases

| Machine | Initial price | Effect per unit |
| --- | ---: | --- |
| Auto clicker | 25 | One automated orb strike every two seconds |
| Refract orb farm | 140 | 6 base continuous LRC/second |
| Light array | 800 | 32 base continuous LRC/second |
| Refractometer | 4,500 | +10% personal damage and all LRC production |
| Pocket star | 12,000 | 300 base continuous LRC/second |

The Workshop keeps these five machines. The Arsenal adds four purchasable devices with permanent-progress unlocks:

| Arsenal device | Initial price | Base effect per unit | Unlock requirements |
| --- | ---: | --- | --- |
| AI Mouse | 2,400 | Two automatic clicks per second; each deals one automatic hit and mints the normal guaranteed click income | Highest orb 5; Clockwork core rank 2 |
| Lazer cannon | 35,000 | One beam every five seconds, dealing 20 times an automatic hit | Highest orb 15; Servo lenses rank 2 |
| Starlink probe | 250,000 | A pulse every two seconds dealing three times an automatic hit, plus 1,200 base continuous LRC/second | Highest orb 30; Perpetual motion rank 1 |
| Star gate | 5,000,000 | A strike every ten seconds dealing 100 times an automatic hit, plus 10,000 base continuous LRC/second | Highest orb 60; 120 completed rounds; one prestige; Parallel beams rank 2 |

The Lazer cannon's flavor line is “Immah firin mah lazor BWAAAH.” Its heavy strike is one attack, not twenty separate paid clicks. The AI Mouse is the exception to ordinary automatic minting: it always earns the owner's guaranteed `clickIncome` per pulse, without a manual critical roll, bonus hit, combo increment, or input-token cost. Other devices mint only the amount granted by automatic-mint research. Existing damage and surge buffs apply to every automatic device. Probe and gate income receives ordinary machine-production, passive-income and personal-power modifiers.

`generatorAvailability(player,id,state)` returns `{unlocked,available,reason}`. `unlocked` covers the purchaser's own highest orb, completed rounds, prestige count and research requirements. `available` additionally checks phase, capacity and funds for the next single unit. Shared money cannot bypass another pilot's personal unlock. The host checks availability before every purchase; hiding a disabled button is not the enforcement mechanism. Price quotes remain readable for locked devices and do not grant purchase permission.

Each successive unit costs `ceil(base price × 1.17^owned)`. **Buy 1** buys the next unit. **Buy 10** requires the full next-ten-unit price and capacity; it never buys a partial bundle. **Buy Max** buys the largest affordable prefix, up to the 1,000-unit capacity per machine. The bundle price is the sum of each individually rounded unit price. Quotes do not mutate balances; the host validates and deducts the entire purchase atomically.

Machine spending never reduces run or lifetime earnings. Co-op purchases deduct only the shared bank, while personal contribution counters remain intact.

Automatic strikes are actual pulses. The original clicker and Clockwork core share `autoClock`; four compact `arsenalClock` entries track the Mouse, Lazer, probe and gate independently. Matching `arsenalShots` entries retain lifetime per-type shots, while `autoClicks` remains the lifetime total of all automatic attacks. A type with multiple units has their combined attack cadence. The simulation aggregates each type's pulses without iterating over individual owned machines. They damage the orb and receive destruction rewards, but never consume manual input tokens or increment manual click counters. They do not roll critical hits or bonus hits. Damage research, prestige, Refractometers, and surge affect their damage; automation research adds independent speed, damage, minting, and drop bonuses. Clockwork core can supply a small automatic rate even before a machine is owned.

`getStats().autoProfiles` exposes five entries in the order `mote`, `mouse`, `laser`, `probe`, `gate`. Each has `{id,owned,rate,damage,mint,shots,progress}`. Rate means the **total owned-type attacks per second**, including automation-speed modifiers. Damage and mint are per pulse; shots are lifetime confirmed attacks; progress is the fraction toward that type's next pulse. Visuals can therefore follow actual confirmed attacks while using the same timing information as the simulation. Prestige removes machines and resets fractional charges, while retaining research, unlock milestones and lifetime attack counts. Older saves receive zeroed Arsenal arrays without changing their existing clicker charge or lifetime count.

`idleRate` means projected **continuous LRC plus automatic minting**. It excludes uncertain orb-destruction rewards. `autoDps` reports automated damage separately. This prevents an HP-damaging auto clicker from being advertised as guaranteed continuous LRC production.

## Persistent research

There are **48 regular research nodes in eight branches**, plus **12 permanent prestige disciplines**. All research ranks survive prestige. The full regular tree has **312 ranks**.

| Branch | Main systems |
| --- | --- |
| Active light | Damage, critical chance, extra hits, combos |
| Living light | Continuous income, machine output, farm/array/star synergies |
| Shared frequency | Personal power, co-op frequency, shared automation, Event horizon SP |
| Orb geology | Destruction rewards, boss damage and boss drops, highest-orb scaling |
| Clockwork orbit | Automatic cadence, damage, minting and drops |
| Luminous mint | Income per manual click, machine dividends, surge minting |
| Prism fortune | Critical multipliers, extra hits, critical minting and combo capacity |
| Long horizon | Research insight and long-term cross-discipline bonuses |

Each branch has six tiers:

| Tier | Base SP cost | Maximum ranks | Highest orb | Completed rounds | Further gates |
| ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 1 | 8 | — | — | None |
| 2 | 4 | 8 | 10 | 3 | Previous node at rank 2 |
| 3 | 15 | 8 | 25 | 15 | Previous node at rank 3 |
| 4 | 50 | 6 | 50 | 60 | Previous node rank 2, cross-branch node rank 2, one prestige |
| 5 | 180 | 5 | 100 | 240 | Previous node rank 2, cross-branch node rank 2, three prestiges |
| 6 | 600 | 4 | 175 | 720 | Previous node rank 2, cross-branch node rank 1, three prestiges and ten lifetime PP |

The next regular rank costs `ceil(base cost × 1.38^current rank)`. Exact prerequisites, effects, and milestone gates live in `src/skills.js`; the interface displays them from the same catalog. Gate explanations take priority over phase/funds messages so a pilot can inspect future research during a round.

Event horizon grants +1 SP once any rank is owned. Deep research, Chrono archive, Universal theory, Keeper's insight, and Infinite library add fractional **research insight**. Every whole accumulated insight gives +1 SP per completed round. Maximum regular insight is 4.2 and permanent insight is 2; with the base award, milestone, and Event horizon, the hard maximum is 10 SP.

The entire regular tree costs **59,816 SP**. Even granting the maximum 10 SP from the first round, ignoring every milestone gate and every intermission, completion requires at least **5,982 rounds: 99.7 active hours, or 4.154 days of harvesting**. Actual completion takes longer because early rounds grant fewer points and intermissions require decisions. This is a mathematical lower bound, not a claim that an unattended session completes the tree in four days. The balance audit in `scripts/balance.mjs` measures representative legal purchase/research policies separately.

## Prestige and permanent disciplines

Prestige becomes available between rounds after **2,500 personal run LRCs**, including income already spent on machines. Co-op teammates' contributions cannot unlock another pilot's prestige.

```text
points awarded = floor(log2(1 + personal run earnings / 2,500))
threshold for k points = 2,500 × (2^k − 1)
```

| Run earnings | Award |
| ---: | ---: |
| 2,500 | 1 PP |
| 7,500 | 2 PP |
| 17,500 | 3 PP |
| 37,500 | 4 PP |
| 77,500 | 5 PP |

The logarithmic award prevents the prestige/reinvestment feedback loop from reaching the numeric point ceiling within hours. Exact threshold comparisons correct floating-point logarithm rounding. The application uses `prestigeNextThreshold` rather than duplicating the formula.

Each lifetime earned PP adds 10% to the prestige multiplier. Spendable PP can buy permanent disciplines without reducing that lifetime multiplier. Prestige resets only the choosing pilot's personal wallet/run earnings, machines, personal orb, fractional auto-strike progress, and combo. It **preserves all research, unspent SP, lifetime earnings, manual/automatic click counts, highest orb, destruction count, completed rounds, and prestige history**. In co-op it also preserves the shared bank and shared orb exactly. Other pilots retain their builds.

The twelve prestige disciplines form three chains:

- Eternal spark → Crown of rays → Stellar heart → Source of light
- Enduring orbit → Timeless machinery → Recursive light → Everlight
- Prism memory → Keeper's insight → Eternal record → Infinite library

Each has five ranks. The four tiers start at 1, 3, 8, and 20 PP, with costs growing by `1.65^current rank`. Later nodes require two ranks in the prior discipline and higher orb, completed-round, and lifetime-PP milestones. The top tier requires orb 150, 720 completed rounds, and 100 lifetime PP. Effects improve damage, production, automation, drops, research insight, and co-op frequency.

## Production formulas

The shared frequency sum includes only the owner in scoreboard and all active pilots in co-op. Refractometers belong to the owner. Research effects within each named term add; separate terms multiply.

```text
power multiplier = (1 + 0.10 × lifetime PP)
  × (1 + frequency) × (1 + personal-power research)
  × (1 + 0.10 × refractometers)

hit damage = (2 + flat-damage research) × (1 + damage research)
  × power multiplier × (1 + combo stacks × combo research)
  × (2 during surge, otherwise 1)

manual mint = (0.25 + flat-mint research) × (1 + mint research)
  × (1 + owned-machine count × mint dividends)
  × power multiplier × surge-mint factor
```

Farm, array, and star output use their separate research multipliers. Farm horticulture adds yield based on owned arrays; Dyson crown adds machine yield based on total machine count. Their sum is enhanced by machine-production research, then added to the baseline 1 LRC/second and flat passive research before the general passive and power multipliers apply.

The original automatic rate is `(0.5 × auto clickers + flat automatic research) × (1 + automatic-speed research + shared automation)`. Each Arsenal type adds `owned × catalog rate × the same speed factor`. Each strike uses hit damage times its automatic-damage modifier and the device's attack multiplier. Autonomous mint pays a fraction of manual-mint income per non-Mouse strike; Mouse strikes earn the full guaranteed manual-mint income. Projected idle income is continuous production plus the sum of every type's rate times its own mint amount. Total automated DPS is the sum of every type's rate times its hit damage.

Orb drops combine the geometric base reward, boss reward modifiers, flat drop research, the power multiplier, drop research, and highest-orb research. Automatic-only drop research applies to automatic kills. Long catch-up batches use the stats at the start of each segment; orb-level scaling updates for subsequent segments. Normal simulation advances on short timer ticks.

## Authority, saves and finite limits

Refract supplies authenticated participants and a relay. The first participant coordinates; followers render snapshots. Actions include their displayed round number, so stale packets cannot affect a later round. The host validates membership, phase, affordability, capacity, rank/prerequisite gates, and currencies. On departure, the next participant continues from synchronized state. Casual play trusts that browser host; adversarial rankings would require a server referee.

Standalone saves are device-local. Shared snapshots use browser session storage. There is no account-backed save, cross-device progression, global ranking, or offline catch-up. Closing every participating session can end that shared run. Research is permanent within retained progression, not independent of browser storage.

The engine migrates older saves by adding missing orb/counter fields and preserves already-earned legacy ranks even if new research prerequisites are higher. Future purchases enforce the new gates. New saves and snapshots require `combatVersion: 2` while retaining overall state `version: 1`. Legacy saves with no combat version or combat version 1 convert the old 12-HP curve to the 2,000-HP curve **by remaining-health fraction**; shared cores also receive the current human-crew scale. A legacy core at 25% health stays at 25% health. Current-version saves preserve partial HP exactly, and unsupported future combat versions or invalid old HP are rejected. Migration clones the input and never grants money, kills, levels, research or prestige.

The original nine skill IDs remain stable; compact IDs for newer nodes keep large multiplayer snapshots within the relay envelope. Readable catalog keys and names remain available for UI and audits.

- Monetary values and damage are finite and capped at `10^150`; integer counters use the safe-integer ceiling.
- Machines cap at 1,000 of each kind. Orb level has a finite implementation limit of one million; saturated HP/rewards remain finite.
- Snapshots must remain below 15,000 UTF-8 bytes, leaving room for the 16 KiB relay envelope. Avatar URLs are supplied separately from the roster. Tests cover eight fully ranked builds with long IDs and Unicode names.
- Validation covers malformed numbers, catalog ranks, duplicate IDs, phase fields, orb HP, and payload size. Save migration is never used to accept network state.
- Automated checks include 250 independent combat-oracle cases across personal and scaled co-op cores, the 100-hit first-fracture threshold, roster changes and legacy health-fraction migration, atomic bulk purchases, mode isolation, pooled state retention, research gates/effects, reward caps, multi-day cost bounds, persistence, and host handover.
