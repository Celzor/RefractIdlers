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

## The shared round clock

The host starts the first round at 60 seconds. Spacetime research extends future rounds to a maximum of 180 seconds. `getRoundDuration(state)` uses `60 + max(roundSeconds research among active human pilots)`, capped at 180; bots never set the duration. The shared duration is fixed at round start, including in Scoreboard, so research purchases and roster changes cannot alter an ongoing countdown. During rounds, pilots attack, buy machines and seeds, tend crops, and earn continuous income. The final 10 seconds double manual and automatic hit damage. Continuous farm production is unchanged; research can separately enhance surge minting.

Completing a round grants 2 SP, plus 1 for meeting the applicable milestone, plus any research bonus. Total awards are capped at **10 SP per pilot per completed round**. The exact award is recorded before upgrades or prestige can change the build. There is no income in the lobby or intermission and no closed-tab income calculation.

The intermission has no countdown. Pilots research, buy machines, or prestige, then ready up. Everyone still active must be ready before the next round starts. Buying research or prestiging clears that pilot's ready flag. A departing player cannot hold an otherwise ready crew in the intermission.

For round `r`, the personal income milestone is:

```text
round(500 × (1 + 0.12 × (r − 1))²)
```

Scoreboard uses that personal amount. Co-op multiplies it by the number of pilots present when the round begins. The co-op target remains fixed during roster changes. Spending does not reduce milestone progress. Missing a milestone still grants the normal 2 SP and never blocks the next round. Quadratic milestone growth avoids the previous exponential curve overtaking the entire economy during a long session.

## Destructible orbs

An unmodified manual click deals **2 damage** and separately mints **0.25 LRC**. The first personal core has **2,000 HP** and pays **300 LRC** when destroyed. A new, stronger core appears immediately. Excess damage carries into subsequent ordinary cores, stopping at the final crystal.

The first visible shell fracture appears at **10% damage**, requiring **100 ordinary unmodified hits** against the first personal core. Later crack stages appear at **35% and 65% damage**. The shell is the visual outer surface of the same health pool; reaching a crack stage does not destroy the core or pay a separate reward. Critical hits, surge, research and automation accelerate the work. Baseline production and manual minting continue to fund the first machines while the durable shell is chipped away.

```text
unscaled ordinary HP at level n = 2,000 × 1.18^(n − 1) × 3^floor((n − 1) / 20)
unscaled destruction reward = 300 × 1.14^(n − 1)
```

The final ordinary core in each system (20, 40, …, 180) is a 30-second boss gate. Bosses have **50% damage resistance** and **five times the base reward**. Maximum HP rises across boss and system boundaries. Bossbreaker and related research improve damage against the resistance; boss-reward research improves the boss drop. Core 200 uses the final-crystal rules below, with no ordinary boss resistance or LRC drop.

Scoreboard always uses the personal curve, regardless of how many other pilots are present. Co-op multiplies maximum HP and destruction rewards by:

```text
crew scale = 1 + 0.85 × (max(1, active human pilots) − 1)
```

Two humans face 1.85× HP and receive 1.85× destruction rewards; eight face 6.95× HP and rewards. Equal participation therefore gives a modest time benefit while maintaining reward value per damage. The multiplier also applies to flat drop research. Spectators and internal practice bots do not raise difficulty. Continuous production, manual minting, personal research prices and the prestige formula do not receive this difficulty multiplier.

Joining, leaving and host handover preserve **remaining HP as a fraction of maximum HP**, then apply the new crew scale. For example, a half-damaged 3,700-HP core becomes a half-damaged 5,400-HP core when a third human joins. It remains at the same level; no kill or payout occurs. Reordering the same roster preserves HP exactly. Personal cores are never resized. The same rule holds when the last human leaves and when a crew returns, and near the finite HP ceiling.

`getOrb` exposes `crewSize`, `crewScale`, `unscaledMaxHp`, `damageFraction` and `fractureStage` alongside the current HP, level, reward and boss fields. `getCoopDifficulty` provides the crew fields independently. Crack stages use the normalized damage fraction, so roster changes do not erase or create visible cracks.

Manual hits have a base 5% critical chance and a 3× critical damage multiplier. Research adds critical chance, critical multiplier, a chance of an extra hit, and combo damage. Critical chance is capped at 80%; extra-hit chance is capped at 90%. A successful bonus-hit roll adds a second hit to the same input. Holding a key does not create repeated input in the UI, and the host's token bucket allows 15 accepted manual inputs per second with a burst of three.

Consecutive manual hits build a combo, initially capped at ten. The combo expires after two seconds without a manual hit. Combo research gives those stacks a damage effect; Fortune loop also increases capacity. The simulation splits long time steps at combo expiry, Beam's meal expiry and the surge boundary so an expired effect does not apply for a whole delayed frame.

Orb drops belong to the pilot whose attack shatters the orb. In co-op those drops enter the pool and that pilot's contribution record. All active co-op pilots share the highest orb reached for research gates. `getOrb(player,state).reward` previews the **personalized manual destruction reward**, including that pilot's research and prestige. Automatic-only drop modifiers can change an automatic kill's payout.

Large attacks use capped geometric sums across at most ten system bands and a binary search for the number of full ordinary cores destroyed. System bosses and the final core cannot be skipped by residual damage. The test suite compares this calculation against an independent iterative oracle across partial cores, bosses, system boundaries and high-value attacks.

## Ten systems and the final crystal

`src/campaign.js` defines ten systems, each containing twenty named planetary cores: Solace, Verdant Reach, Cinderwake, Azure Drift, Gilded Spiral, Violet Expanse, Hollow Crown, Chronos Veil, Infinite Prism, and **Crystal**. Crystal is Beam's home system; its unusually hard cores and the parallel-universe story are additions for Idlers, not established Refract companion lore. `getCampaignLocation(level)` resolves the system and planet used by the Galaxy map and core view.

The last core, **Refract — Beam's home**, uses the Refract logo and has **10^120 base HP**, multiplied by the usual co-op crew scale. Ordinary numeric damage would be too small to change that health reliably, so each accepted hit converts to crystal resonance:

```text
resonance fraction per hit = min(0.01, log10(1 + raw damage) / 100000)
remaining health floor = maximum HP × max(0, 1 − finalElapsed / 10800)
```

Automatic batches apply the per-hit fraction to their actual pulse count. The final core starts with full health and zero `finalElapsed` even after an enormous attack. Its active-round clock advances only while that core is present, once per shared core in Co-op. No build, click cadence or crew size can defeat it in less than **10,800 active seconds after arrival**. Intermissions and closed tabs add no time. Damage cannot cross the remaining-health floor; when it opens fully, remaining health still has to be removed. The UI exposes the resonance conversion and time remaining. Co-op roster changes preserve health percentage and elapsed lattice time.

A final kill sets global `phase: 'victory'`, remaining time to zero, and a persistent `{playerId, at}` victory event. Every current pilot receives 100 available and lifetime prestige points and one `victories` increment, with safe-integer caps. The engine stops production, growing, timers and subsequent attacks immediately. Every gameplay action is rejected except the host's `newJourney`; reloads and repeated inputs cannot award the same victory twice. The victory event survives host departure and a returning winner does not receive another payout.

### Ship fuel and jump points

Beam's meals fuel the ship. `isJumpPoint(level)` marks cores 20, 40, …, 200; `fuelTarget(level)` returns the current system's `FUEL_TARGETS` entry (120, 200, 350, 600, 1,000, 1,700, 2,900, 4,900, 8,400, 14,000). Fuel lives in `player.fuel` (Scoreboard) or `state.sharedFuel` (Co-op); `getFuel` and `getShipStatus(player,state)` read the right tank. While a jump-point core's tank is short of its target, `damageOrb` returns `{kills:0,amount:0,grounded:true}` before any boss clock starts, and `encounterStep` skips the core so automatic fleets cannot split time into microscopic steps waiting for a first hit. Validation bounds each tank by the current core's target and keeps the unused tank at zero. Prestige empties a personal tank, a Co-op crew tank survives personal prestige, and `newJourney` empties every tank. Missing fields migrate to empty tanks.

### Transit and the jump flight

Shattering a jump-point core below the final crystal no longer advances the core. `damageOrb` pays the kill, restores the core to full health, clears any attempt clock and records a **transit**: `player.transit = {pilot}` in Scoreboard or `state.sharedTransit` in Co-op (`getTransit`, `getFlyer`, and `getShipStatus().transit/flyer/launchReady`). While a transit exists, `damageOrb` returns `{kills:0,amount:0,transit:true}` and `encounterStep` skips the core, so nothing on either side can change it. The flyer is the pilot named in the transit, or the host once that pilot has left the roster.

The flight itself is `src/flight.js`, a twelve-second top-to-bottom meteorite dodge (WASD, arrows or pointer; three hits or Escape is a crash) played only on the flyer's client. It reports `completeJump {arrived}`. The host accepts the action only during a round or intermission, from the flyer, with a boolean result and a full tank. Arrival empties the tank, clears the transit, advances the core to the next system's first planet at full health and raises every affected pilot's highest-orb milestone. A crash keeps the transit and halves the tank (`CRASH_FUEL_FRACTION`), so Beam must be fed before another launch. Validation accepts a transit only on an intact, inactive jump-point boss below the final core, with the pilot matching in Scoreboard; Scoreboard snapshots must carry a null shared transit and Co-op pilots a null personal one. Prestige clears a personal transit, Co-op prestige preserves the shared one, and `newJourney` clears all of them.

`feedBeam` receives `context.fuelRoom` and returns `fuel = min(fuelRoom, meal seconds)` (weed counts as 260); `applyAction` adds it to the tank. When Beam's meal or Cooked timer is already full, a meal is still accepted while the tank has room, turning the food entirely into fuel. With both full, feeding is rejected and spends nothing.

`newJourney` resets shared and personal cores to level 1, clears fractional attack clocks and combos, and opens an unready intermission. It retains research, balances, machines, gardens, lifetime records and victory rewards. Ordinary personal prestige still resets the choosing pilot's core and final timer; Co-op prestige preserves the shared final crystal.

## Machines and bulk purchases

| Machine | Initial price | Effect per unit |
| --- | ---: | --- |
| Auto clicker | 25 | One automated orb strike every two seconds |
| Light array | 800 | 32 base continuous LRC/second |
| Refract orb farm | 3,000 | 90 base continuous LRC/second |
| Refractometer | 4,500 | +10% personal damage and all LRC production |
| Pocket star | 12,000 | 300 base continuous LRC/second |
| Solar sail | 150,000 | 2,600 base continuous LRC/second; unlocks at orb 15 |
| Lens cathedral | 1,800,000 | 24,000 base continuous LRC/second; orb 40 and 20 rounds |
| Dyson lantern | 25,000,000 | 260,000 base continuous LRC/second; orb 80 and one prestige |
| Singularity forge | 400,000,000 | 3,200,000 base continuous LRC/second; orb 120 and three prestiges |
| Momentum flywheel (Click tech) | 90,000 | +1 combo capacity and +0.001 combo power per unit; capacity caps at 250 |

The three deepest collection tiers, then the flywheel and the forge, are appended after every shipped machine in `GENERATORS`, because packed saves store machine counts by array position. The Click tech catalogue requires the `ki2` Outfitting licence and every Arsenal machine additionally requires `ki3`.

Every unit price is `ceil(base × 1.17^owned × (1 − discount))`, where the discount is the sum of the permanent Quartermaster effect and the catalogue's own research (Bulk contracts for the Workshop, Fleet doctrine for the Arsenal, Flywheel gearing for Click tech), capped at 50%. `generatorCost` and `generatorQuote` share `unitPrice`, so bundles stay exact.

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

## Beam's Garden

The `ki1` Garden licence (Outfitting research, one rank, 2 SP, available after one completed round) sets `farm.unlocked`; defeating Haze at the secret star grants it too. Buying `satellite` machines no longer opens the garden. [`src/farm.js`](../src/farm.js) owns the catalogues and farm rules; [`src/farm-view.js`](../src/farm-view.js) renders the greenhouse from the pixel sprites in [`src/farm-sprites.js`](../src/farm-sprites.js). Each player's named `farm` state contains `unlocked`, `plots`, `crops`, `inventory`, `upgrades`, `fedSeconds`, `cookedSeconds`, lifetime `meals`, and the automation clocks `tractorClock` and `pickerClock`. A fresh farm has one empty bed and the carrot variety unlocked. Each plot is `{crop,progress,water,fertilised}`: `crop:null` is an empty bed with zero progress and water and `fertilised:false`; `progress` and `water` run from 0 to 1.

| Crop | Variety unlock LRCs | Seeds per planting LRCs | Base growth seconds | Base meal seconds |
| --- | ---: | ---: | ---: | ---: |
| Carrot | 0 | 100 | 30 | 30 |
| Lettuce | 18,000 | 250 | 45 | 45 |
| Tomato | 65,000 | 600 | 60 | 70 |
| Pumpkin | 220,000 | 1,500 | 90 | 110 |

Every planting purchases fresh seeds, including for an already unlocked variety. Seed prices are 100 LRCs for carrots, 250 for lettuce, 600 for tomatoes, and 1,500 for pumpkins before research discounts. A ready bed must be harvested manually; harvesting puts vegetables into inventory and clears the bed. Feeding consumes one vegetable and extends Beam's meal timer, capped at **300 active seconds**. While fed, the owner's personal income and hit damage gain a base **25%** multiplier bonus. The bonus applies to passive income, minting, ordinary orb rewards, and manual and automatic damage; it does not increase attack cadence. The companion's portrait and poke action remain cosmetic.

The garden expands to six beds. The next bed costs `ceil(12000 × 2.2^(owned beds − 1) × (1 − discount))`. Grow lights, hydroponics, tractors and picker bots each have three levels, starting at 25,000, 60,000, 40,000 and 90,000 LRCs respectively; their next level costs `ceil(base cost × 2.5^owned level × (1 − discount))`. Variety unlocks and every seed purchase use the same discount. `getFarmStats(player)` exposes these combined effects:

```text
growthRate = 1 + 0.25 × grow lights + 0.25 × hydroponics + cropSpeed research
yield = 1 + floor(cropYield research)            (+1 for a fertilised bed)
autoWater = hydroponics ≥ 1
tractorPeriod = 8 / tractors seconds             (0 when none)
pickerPeriod = 6 / picker bots seconds           (0 when none)
feedMultiplier = 1 + mealDuration research
feedBonus = 0.25 + beamBoost research
discount = min(0.75, farmDiscount research)
```

Planting sets `water:1, fertilised:false`. A bed grows at `growthRate × (fertilised ? 1.5 : 1) / crop.growTime` per active second while it has water; one watering (`waterCrop`) lasts `WATER_SECONDS = 20` and a dry bed stops growing. `fertiliseCrop` marks a growing bed once. Hydroponics holds every planted bed at full water.

`advanceFarm(player,seconds,wallet)` splits elapsed time at every tractor and picker cycle boundary, so results are independent of how the host slices time. Each tractor cycle fertilises the first planted, unfertilised, unripe bed. Each picker cycle harvests the first ripe bed whose pantry has room, then buys the same seed through `wallet` and replants it; without enough LRCs the bed stays empty. Water drains only while a crop grows. Meal and Cooked timers decrease alongside. The game calls it only during active rounds, splitting at meal expiry before recalculating production; there is no offline progress.

The scene draws every purchased bed with three plants rendered from exact progress (48 frames per crop), soil moisture, fertiliser granules and thirst warnings; one grow lamp per level; one reservoir, nutrient or UV tank per hydroponics level, with feed pipes, drip emitters and water troughs; one tractor per level in the floor lane; one picker bot per level on the monorail; and Beam's ship with its fuel gauge. Snapshot comparison animates the bot or tractor that worked a bed and Beam heaving light into the tank when fuel rises.

`applyAction` routes `unlockCrop`, `buyFarmPlot`, `buyFarmUpgrade`, `plantCrop`, `waterCrop`, `fertiliseCrop`, `harvestCrop` and `feedBeam` to `applyFarmAction(player,action,balance,spend,context)`. All require an unlocked farm and either a round or intermission. The host checks variety ownership, plot indices, maturity, inventory, equipment capacity and affordability before committing. `farmCropCost`, `farmSeedCost`, `farmPlotCost` and `farmUpgradeCost` supply identical prices to the view and engine. A failed or occupied-bed planting spends nothing. Co-op purchases, including each planting, use the shared bank, but the farm, produce and meal bonus remain personal; boosted earnings feed the pool. Inventories cap at 999,999 per vegetable, and a full pantry rejects harvesting without clearing the bed.

`resetFarm(player)` preserves garden access, unlocked seeds and lifetime meals. Prestige resets the garden to one empty bed and clears equipment, harvested produce and the meal timer. Research remains on the player and continues to improve the next garden.

## Persistent research

There are **118 regular research nodes in twenty branches** (114 tuning nodes plus the four one-rank Outfitting licences), plus **25 permanent prestige nodes**. Catalog order is a save format: the sixty shipped tuning nodes, the first sixteen prestige nodes and the three licences keep their positions, and every later discipline (Arsenal doctrine, Deep industry, Click engineering, Hull integrity, then the Hangar and Hull prestige chains, the Overflow sinks, the Observatory licence, the five frontier disciplines and finally the Siege clock) is appended after them. Double-clicking a node researches one rank. All research ranks survive prestige. The full regular tree has **715 ranks**.

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
| Beam's garden | Vegetable growth, meal duration and strength, harvest yield, garden purchase discounts |
| Spacetime | Extend future rounds from 60 to 180 seconds |
| Outfitting | One-rank licences: Garden (`ki1`), Click tech (`ki2`), Arsenal (`ki3`), Observatory (`ki4`, orb 15 and six rounds) |
| Arsenal doctrine | Arsenal damage, Mouse rate, Lazer and gate strike hits, relay income, Arsenal speed and discounts; tier 1 requires `ki3` |
| Deep industry | Sail, cathedral and lantern yield, Refractometer strength, Workshop discounts, deep-machine yield and machine synergy |
| Click engineering | Per-unit wormhole, foamer and string strength, combo window and capacity, Click tech discounts, surge damage; tier 1 requires `ki2` |
| Hull integrity | Shield charges, light-ray chance, salvage refunds, reflected rays, comet damage and mint (rank caps 3, 5, 4, 4, 5, 3) |
| Light vault | Wallet interest per second, interest headroom, the Closing bell round dividend; tier 3+ links to Luminous mint |
| Surge science | Earlier solar surge, surge-only automatic speed, critical chance, drop and machine-income bonuses, surge damage; links to Active light |
| Astrogation | Meal fuel, jump-flight hull hits, crash fuel retention, arrival pay, fuel-target discounts (rank caps 8, 3, 4, 6, 5, 2); needs an open garden; links to Beam's garden |
| Shooting stars | Tailwind duration and strength, stars per round, Stardust minting, Slipstream damage (rank caps 8, 8, 4, 6, 5, 4); tier 1 requires `ki4`; links to Clockwork orbit |
| Quasars | Lens duration and strength, windfall pay, quasar frequency and visibility; tier 1 requires `ki4`; links to Orb geology |

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

Beam's garden follows Seed science → Long lunch → Garden planning → Abundant harvest → Photosynthetic feast → Orbital ecosystem. Its later cross-branch requirements connect to Living light. All six nodes also require an unlocked garden; adding the branch preserves the previously shipped branches' prerequisite links.

Spacetime follows Clock stretch → Orbital intervals → Time prism → Chronal reservoir → Spacetime fold → Infinite afternoon. Per-rank extensions are 2, 2, 3, 4, 4 and 5 seconds across the six tiers, totaling 120 extra seconds at full ranks. Later nodes connect to Long horizon. Bonuses survive prestige and affect the next shared round.

Event horizon grants +1 SP once any rank is owned. Deep research, Chrono archive, Universal theory, Keeper's insight, and Infinite library add fractional **research insight**. Every whole accumulated insight gives +1 SP per completed round. Maximum regular insight is 4.2 and permanent insight is 2; with the base award, milestone, and Event horizon, the hard maximum is 10 SP.

The entire regular tree costs **135,980 SP**. Even granting the maximum 10 SP from the first round, ignoring every milestone gate and intermission, completion requires at least **13,598 rounds**. At the shortest 60-second duration that is **226.63 active hours, or 9.44 days**. Spacetime research extends rounds, early rounds grant fewer points, and intermissions require decisions, so actual completion is slower. This is a mathematical lower bound, not an unattended completion estimate. The balance audit in `scripts/balance.mjs` follows legal machine and research policies without gardening or meals, uses actual variable round durations, and stops on campaign victory.

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

Garden access, unlocked seeds and lifetime meal counts also survive. The choosing pilot's garden returns to one empty bed with no equipment, inventory or active meal bonus.

`resetProgress` is the opposite of prestige: a complete personal wipe. The acting pilot is replaced by a newly created player that keeps only its identity, avatar, colour and roster position (so a resetting host stays host). Every balance, record, rank, machine, garden field, prestige total and victory count returns to zero, the personal core returns to level 1, and the pilot is no longer ready. It is accepted in the lobby, during a round and in intermission, and rejected during a frozen victory like every other action. In co-op the fresh pilot inherits the shared orb level as its highest-orb milestone, and the shared bank, shared orb and crew round total are untouched. The standalone client does not send this action: it discards the device save, creates a new game and returns to the first lobby. Both paths require an explicit acknowledgement in the interface and cannot be undone.

The twenty-four prestige disciplines form six chains:

- Eternal spark → Crown of rays → Stellar heart → Source of light
- Enduring orbit → Timeless machinery → Recursive light → Everlight
- Prism memory → Keeper's insight → Eternal record → Infinite library
- Evergreen roots → Heirloom harvest → Endless lunch → Beam's bounty
- Launch kit → Standing orders → Hangar lease → Quartermaster (the Hangar: starting machines after a reset, retained Click tech, machine discounts)
- Hull plating → Salvage rights → Comet charts → Brighter legacy (the Hull: permanent shield charges, light-ray refunds, comet multipliers, +1% production per lifetime PP per rank)

Prestige applies hangar research while resetting: `floor(owned × retention)` of each Click tech device survives, then the launch kit (`startMotes` Auto clickers, `startArrays` Light arrays and orb farms) is placed in the empty orbit. `getStats().startingKit` and `clickTechRetention` expose the same numbers for the Prestige tab.

Each has five ranks. The four tiers start at 1, 3, 8, and 20 PP, with costs growing by `1.65^current rank`. Later nodes require two ranks in the prior discipline and higher orb, completed-round, and lifetime-PP milestones. The top tier requires orb 150, 720 completed rounds, and 100 lifetime PP. Effects improve damage, production, automation, drops, research insight, and co-op frequency. The fourth chain requires garden access and adds permanent crop speed, harvest yield, meal duration and meal strength respectively.

## Production formulas

The shared frequency sum includes only the owner in scoreboard and all active pilots in co-op. Refractometers belong to the owner. Research effects within each named term add; separate terms multiply.

```text
power multiplier = (1 + (0.10 + Brighter legacy) × lifetime PP)
  × (1 + frequency) × (1 + personal-power research)
  × (1 + (0.10 + Calibrated optics) × refractometers) × (1 + active Beam meal bonus)

hit damage = (2 + flat-damage research + (4 + Wormhole tuning) × wormhole generators)
  × (1 + damage research + (0.20 + Foam density) × quantum foamers)
  × power multiplier × (1 + combo stacks × (combo research + 0.001 × flywheels))
  × (2 + Surge engine during surge, otherwise 1)
  × (comet damage, manual hits only, while a comet passes)

combo capacity = min(250, 10 + combo research + flywheels); a combo survives 2 + Combo memory seconds

manual mint = (0.25 + flat-mint research) × (1 + mint research)
  × (1 + owned-machine count × mint dividends)
  × power multiplier × surge-mint factor
```

Farm, array, and star output use their separate research multipliers. Farm horticulture adds yield based on owned arrays; Dyson crown adds machine yield based on total machine count. Their sum is enhanced by machine-production research, then added to the baseline 1 LRC/second and flat passive research before the general passive and power multipliers apply.

The original automatic rate is `(0.5 × auto clickers + flat automatic research) × (1 + automatic-speed research + shared automation)`. Each Arsenal type adds `owned × catalog rate × the same speed factor × (1 + Arsenal speed research)`, and the Mouse also gains `(1 + Overclocked mice)`. Each strike uses hit damage times its automatic-damage modifier and the device's attack multiplier; Arsenal strikes also take `(1 + Arsenal damage research)`, the Lazer beam deals `20 + Lazor capacitors` hits and the gate `100 + Gate resonance`. Probe and gate income takes `(1 + Relay uplink)`; sails, cathedrals, lanterns and forges take `(1 + Stellar foundry + their own research)`. Autonomous mint pays a fraction of manual-mint income per non-Mouse strike; Mouse strikes earn the full guaranteed manual-mint income. Projected idle income is continuous production plus the sum of every type's rate times its own mint amount. Total automated DPS is the sum of every type's rate times its hit damage.

Orb drops combine the geometric base reward, boss reward modifiers, flat drop research, the power multiplier, drop research, and highest-orb research. Automatic-only drop research applies to automatic kills. Long catch-up batches use the stats at the start of each segment; orb-level scaling updates for subsequent segments. Normal simulation advances on short timer ticks.

## Overflow sinks

The `overflow` branch (`currency: 'lrc'`) holds six nodes with `maxRank: 1000`, `cost` between 1e6 and 4e6 LRC and `costGrowth: 1.3`. Each requires rank 1 of a shipped discipline's tier-6 node plus the tier-6 milestones (orb 175, 720 rounds, three prestiges, ten lifetime PP) and `gates.complete`: `isResearchComplete(player)`, every skill-point node at maximum rank. The research map hides the Overflow nodes and their edges until that moment. `skillAvailability` compares the price with `getBalance` and `buySkill` deducts it from the personal wallet or the Co-op bank; skill points are untouched. They are appended last in the catalog (`ov1`–`ov6`) and excluded from `RESEARCH_TOTAL_RANKS`, `RESEARCH_TOTAL_COST` and the balance audit's research policy, because an LRC price cannot be ranked against an SP price.

## Space hazards

**Light rays.** Inside the `click` action, after the hit resolves, the host rolls one more `random(state)` when the pilot is in a boss fight (`inBossFight`: a live secret challenge, or a system boss with `bossStartedAt`) and the hit neither killed the core nor bounced off a grounded or transit core. With probability `FLARE_CHANCE × (1 − min(0.75, Flare dampers))` a light ray fires. If the pilot owns no machines the ray is harmless. Otherwise a shield charge (`player.shield`) absorbs it, reflecting `Ablative lattice × automatic damage` into the boss when researched; with no charge left, one unit of a **uniformly random owned machine type** is removed, `machinesLost` increments, and `salvage × replacement price` is refunded. Refunds enter the Co-op bank directly; a personal refund is capped at `runLrc − lrc` so a wallet can never exceed its run total. The click result carries `flare: {hit, blocked, id, index, refund, shield, reflected}` for the interface. Automatic attacks never roll rays.

Shield charges equal `floor(shield research)` (Prism shield, Aegis of light, permanent Hull plating), capped at `SHIELD_LIMIT`. They refill at round start, when a secret challenge begins, and when a boss attempt starts (`rechargeShields`: the whole non-secret crew in Co-op, the pilot alone in Scoreboard). Prestige and `newJourney` zero them; validation bounds them.

**Comets.** `startRound` rolls `state.comet` from the round number and current host RNG without advancing it (`rollComet`): three rounds in five get `{at}`, with `8 ≤ at` and `at + 6 ≤ duration − 10`, so a comet never overlaps the surge. `cometWindow(state)` reports the live window; `getStats().comet` is true inside it and manual hits multiply damage by `cometDamage = 3 + research` and mint by `cometMint = 5 + research`. Passive production and automatic attacks ignore comets, so `advance` needs no extra split. The intermission clears the comet; validation accepts `null` or an object with exactly one integer `at` within the round duration.

## Authority, saves and finite limits

Refract supplies authenticated participants and a relay. The first participant coordinates; followers render snapshots. Actions include their displayed round number, so stale packets cannot affect a later round. The host validates membership, phase, affordability, capacity, rank/prerequisite gates, and currencies. On departure, the next participant continues from synchronized state. Casual play trusts that browser host; adversarial rankings would require a server referee.

Standalone saves are device-local. Shared snapshots use browser session storage. There is no account-backed save, cross-device progression, global ranking, or offline catch-up. Closing every participating session can end that shared run. Research is permanent within retained progression, not independent of browser storage.

The engine migrates older saves by adding missing orb/counter fields and preserves already-earned legacy ranks even if new research prerequisites are higher. Future purchases enforce the new gates. New saves require `combatVersion: 2` and `campaignVersion: 1` while retaining overall `version: 1`. Legacy 12-HP and pre-campaign 2,000-HP curves convert ordinary cores **by remaining-health fraction**, including system and co-op scale; a core at 25% health remains at 25%. Old cores already at or beyond level 200 migrate to a full-health final crystal with a fresh lattice timer, preserving their recorded highest-orb milestone and granting no victory. Current-version saves preserve exact partial HP and elapsed final time. Unsupported versions, impossible health and malformed clocks are rejected. Migration clones its input and does not grant rewards.

The original nine skill IDs remain stable; compact IDs for newer nodes keep large multiplayer snapshots within the relay envelope. Readable catalog keys and names remain available for UI and audits.

The simulation and local/session-storage saves keep named fields. `compactGameState(state)` creates the relay representation without mutating the live state and strips avatar URLs, which come from the roster. Compact fields are:

- `player.skills` and `player.generators`: rank arrays in `SKILLS` and `GENERATORS` catalog order, with trailing zeros trimmed. Each entry is validated against its catalog maximum. The older comma-separated `id:rank` strings still decode.
- `player.shield`, `player.machinesLost`, `player.transit`, `state.comet` and `state.sharedTransit` travel as plain fields; saves without them migrate to zero charges, no losses, no transit and no comet.
- `sharedOrb` and `player.orb`: `[level, hp]`, or `[level, hp, finalElapsed]` for the final crystal. Numeric precision is retained.
- `state.sharedFuel` and `player.fuel`: plain numbers, bounded by the current core's fuel target.
- `player.farm`: `packFarm` returns `[unlockedFlag, seedMask, plots, inventory, upgrades, fedSeconds, meals, tractorClock, pickerClock, cookedSeconds]`. `unlockedFlag` is 0 or 1. The seed bitmask and inventory slots follow `CROPS` order. An empty bed packs as `[0]`; a planted bed as `[cropNumber, progress, water, fertilisedFlag]` with the one-based crop index. The four upgrade slots follow `FARM_UPGRADES`: grow lights, hydroponics, tractor, picker. A null inventory or upgrade slot represents an absent named property. Older seven-field farms (two-field `[crop, progress]` beds, three upgrade slots ending in fertiliser) and nine-field farms still decode: their beds start watered and unfertilised, and each fertiliser level becomes a tractor level.
- `lastRound.players`: rows `[playerIndexOrId, lrc, clicks, skillPoints]`. Active pilots use their index in the snapshot's player array; a departed pilot keeps their string ID so the completed-round summary survives roster changes.

`migrateState` clones and decodes either the named or compact representation, including `unpackFarm`, orb tuples and strict skill/machine counts, then applies full `validateState` checks. Malformed arrays, duplicate or unknown catalog IDs, out-of-range values and invalid summary indices are rejected. Final HP cannot sit below the elapsed lattice floor; zero health requires a consistent frozen victory. The activity bridge uses this same validated decoder for received snapshots, and the UI uses its named result. Old named saves gain an empty garden, unlocked if they already own a `satellite`; existing crop state is retained.

- Monetary values and damage are finite and capped at `10^150`; integer counters use the safe-integer ceiling.
- Machines cap at 1,000 of each kind. Live core progression ends at 200; retained legacy highest-core records may be larger.
- Compact snapshots must remain below 15,000 UTF-8 bytes, leaving room for the 16 KiB relay envelope. Zero-valued sky counters (`tailwindUntil`, `lensUntil`, `skyCaught`, `starsCaught`, `quasarsTapped`) and a null `sky` are left out of compact snapshots; `migrateState` restores them. `validateState` measures the compact representation even when validating named state. Tests cover eight fully ranked, fully equipped gardens with long IDs, Unicode names and completed-round summaries.
- Validation covers malformed numbers, catalog ranks, duplicate IDs, phase fields, orb HP, farm ownership and inventory, compact encodings, and payload size. Both saved and received state must pass full validation after decoding.
- Automated checks cover the combat oracle across system boundaries, the 100-hit first fracture, roster changes and migration, paid seed atomicity, mode isolation, research gates, variable round lengths, the three-hour minimum against eight extreme builds, one-time victory rewards, frozen actions, restart and endgame snapshot round trips.

## Frontier research: the vault, the surge, the ship and the sky

**Light vault.** `getStats` reports `interestRate = min(getBalance(player,state) × vaultRate, passiveRate × vaultCap)` with `vaultCap = 0.5 + Compound ledger + Trust fund + Reserve bank + Infinite ledger`. `advance` earns `(passiveRate + interestRate) × elapsed` through `earn`, so interest counts toward lifetime, run and round totals and the round goal, and in Co-op it enters the shared bank. The balance is read at the start of each integration step. `idleRate` includes interest. **Closing bell**: `finishRound` first pays every pilot `roundLrc × bellPct` through `earn`, then judges the round goal and awards skill points.

**Surge science.** The surge window is personal: `surgeWindowOf(effects, roundDuration) = min(floor(roundDuration / 2), 10 + Early dawn + Solar dynamo + Corona)`. `getStats` flags `surge` when `remaining ≤ window`, and `advance` splits each step at every distinct crew window (and at every live tailwind or lens expiry) so stats never change inside a step. While surging: automatic speed `× (1 + Surge coils)`, critical chance `+ Flash point`, drop multiplier `× (1 + Surge bounty)`, machine income `× (1 + Solar dynamo)`, damage `× (2 + Corona + Surge engine)`.

**Astrogation.** `feedBeam` receives `context.fuelMultiplier = 1 + Fuel injectors + Star charts` and multiplies the meal's fuel before the tank's room caps it. `shipTarget(player, state, level) = ceil(fuelTarget(level) × (1 − min(0.5, Efficient routes)))` replaces the raw target in `getShipStatus`, the grounded check in `damageOrb` and the skip in `encounterStep`; a Co-op crew takes its best-researched human pilot. Validation still bounds tanks by the undiscounted target. `completeJump {arrived:false}` keeps `crashRetain = min(1, 0.5 + Crash recovery)` of the tank and reports `kept`; arrival pays `idleRate × arrivalSeconds` through `earn` and reports `bonus`. `flightHits = 3 + Reinforced hull + Star charts` is passed to the flight client as `maxHits`.

**The Observatory.** `hasObservatory(player)` is rank one of `ki4`. `startRound` calls `rollSky`: with at least one licensed human, it fixes `state.sky = {stars, quasar}` from the round number and the host RNG without advancing it. `stars` holds `1 + best Meteor shower` (at most `MAX_STARS` = 6) integer start times, each at least four seconds in and ending before the surge region; `quasar` is a start time or null, present with probability `min(1, 0.35 + best Deep field)`. Without a licensed pilot `sky` is null. `skyEvents(state, player)` returns null for unlicensed pilots or outside a round, otherwise each star's `active`, `progress` and `caught` flags (a star is visible for `STAR_SECONDS` = 4) and the quasar's `active`, `remaining` and `tapped` flags (visible for `10 + Redshift` seconds, personal). Catches are per pilot in the bitmask `player.skyCaught` (bit *i* for star *i*, bit 30 for the quasar), reset at round start.

`catchStar {index}` requires the round phase, a licence, a visible, uncaught star; it extends `player.tailwindUntil` by `8 + Star catcher + Constellation` seconds (never beyond `now + 60`), increments `starsCaught`, and mints `passiveRate × Stardust` through `earn`. While `now < tailwindUntil`, automatic speed and machine income are `× (1 + 0.25 + Tailwind + Constellation)` and hits deal `× (1 + Slipstream)`. `tapQuasar` requires a visible, untapped quasar; it pays `idleRate × (10 + Windfall + Blazar)` through `earn`, extends `player.lensUntil` by `10 + Quasar lens` seconds and increments `quasarsTapped`. While `now < lensUntil` the drop multiplier is `× (1 + 0.5 + Gravitational focus + Blazar)`. Both buffs end at round end, prestige, `newJourney` and victory; `winCampaign` also clears the sky. Validation requires `sky` only during a round, with one to six integer star times and an integer or null quasar time inside the round; buff timestamps at most sixty seconds ahead; and integer counters. The interface renders stars and the quasar as buttons over the orbit, shows tailwind and lens labels, and turns the comet label into a forecast for licensed pilots before a comet.

**Siege clock.** `bossDuration(state, player) = min(60, 30 + 5 × Siege clock)`; a Co-op crew uses its best-researched human. `getOrb`, `expireChallenges` and `encounterStep` read it, so attempts, remaining time and required DPS follow the researched clock. `validOrb` accepts any attempt younger than `BOSS_CLOCK_LIMIT` (60 seconds). The secret star keeps its fixed 30 seconds.

## Achievements

`src/achievements.js` holds a fixed catalogue of badges, each a predicate over the player (and state) that reads only records the engine keeps across prestige: `clicks`, `orbsDestroyed`, `highestOrb`, `victories`, `completedRounds`, `lifetimeLrc`, `prestigeCount`, `totalPrestige`, research ranks, `farm.unlocked`, `farm.meals`, `farm.crops.weed`, `autoClicks`, `machinesLost`, `starsCaught` and `quasarsTapped`. Nothing is saved or relayed: `getAchievements(player, state)` derives the list each render, so a badge never locks again and `resetProgress` clears them with the pilot. The standings dialog shows the catalogue on an **Achievements** tab beside the Scoreboard (or Crew) tab with an unlocked count; locked badges render greyed with `???` for both name and description. The interface compares the unlocked set between renders of the same pilot and toasts each newly earned badge.

## Timed bosses and the secret star

System bosses start their attempt on the first hit. The attempt lasts `bossDuration(state, player)`: 30 active seconds, plus five per rank of the permanent Siege clock, capped at 60. A timeout restores full HP and clears the attempt; defeating the boss unlocks the next system. Required DPS is maximum HP divided by the attempt length, after armour. Automatic DPS shown by `getOrb` uses the same armour and boss-research factors as damage. Snapshots retain `bossStartedAt`, and campaign-version-1 saves migrate into the new timed-boss rules.

The optional Green Star contains Haze, a personal 1e9-HP, 30-active-second challenge. `startSecretChallenge` diverts the acting pilot’s attacks into `secretOrb`; `leaveSecretChallenge` or timeout returns to the unchanged campaign. Victory unlocks `farm.crops.weed` and farm access, without normal core rewards, milestones or galaxy-victory credit. Co-op teammates keep attacking their shared core.

Weed seeds cost 4,200 LRC and grow in 120 active seconds before farm bonuses. Feeding weed sets `farm.cookedSeconds` to 260, with a fixed 4.20× multiplier on newly earned passive income, click mint, automatic mint and ordinary core rewards. Damage and prior balances/scores do not change. Ordinary meals remain independent. Timers pause outside active rounds and persist through validated saves and relay snapshots. Prestige retains secret seeds and resets the active cooked timer; full progress reset removes both.
