# Refract Idlers

A multiplayer incremental game for Refract: break planetary cores across ten solar systems, collect LRCs, build machines, grow vegetables for Beam, and research lasting upgrades between rounds. The host chooses Scoreboard or Co-op. The route ends at the Refract crystal in **Crystal**, Beam's home system.

The interface is built for desktop play, with a fixed game frame verified at **1366×768** and **1920×1080**. The core and workshop fill the frame, with Beam at the top of the active shop. Between rounds, the play field is greyed out with a centered start/ready button; the workshop stays available. Controls sit beside the view tabs; Scoreboard opens the standings dialog and Co-op uses the Crew button for shared production and the roster. Research uses its own pan-and-zoom map.

Built on the activity approach from [Refract Tic-tac-toe](https://github.com/Celzor/refract-tack-toe), with assets, audio, orbital rendering, and multiplayer bridge code reused or adapted from [RogueRefract](https://github.com/Celzor/RogueRefract).

## Look and sound

The game uses a warm retro tabletop: chunky pixel borders, paper labels, a felt play surface, original pixel machines, and a little orbit of busy workers. New machines appear on the table as you buy them. Clicking and automatic production produce quick coin feedback; purchases play short arcade arpeggios. The synthesized audio combines quiet square and triangle waves with soft coin clinks, a gentle filter, and bounded voice counts.

The visual direction takes inspiration from the tactile incremental-game feel of [Gamblers Table](https://store.steampowered.com/app/3618390/Gamblers_Table/), [Scritchy Scratchy](https://store.steampowered.com/app/3948120/Scritchy_Scratchy/), and [Rusty's Retirement](https://store.steampowered.com/app/2666510/Rustys_Retirement/). The tabletop artwork and pixel-machine sprites were created for Refract Idlers; no sprites, sound recordings, or game assets from those titles are included. Refract branding and companion-project provenance remain listed in [CREDITS.md](CREDITS.md).

**Beam, Refract's Chief Vibe Officer**, keeps a small pixel-art desk at the top of the workshop or garden shed. He reacts to new machines, research, bosses, the solar surge, round breaks, garden meals and prestige. His crystal appearance, playful confidence, daytime boat and nighttime armchair come from the existing Refract companion. The dialogue, garden and game reactions are new adaptations; [Beam's source notes](docs/BEAM-LORE.md) separate established characterization from this game's additions. Greeting or minimizing his portrait is cosmetic. Feeding him vegetables through the Farm grants an income and damage bonus. Beam is never the orb you attack.

## Run locally

Requires **Node.js 24 or newer**. No package installation is needed.

```sh
npm run dev
```

Open **http://127.0.0.1:4175/**. Opening `index.html` directly will not load browser modules; use the development server.

```sh
npm run check
npm test
npm run build
npm run preview
```

With the development server still running, run the optional browser acceptance suite:

```sh
npm run test:browser
```

It uses installed Microsoft Edge on Windows by default. Set `BROWSER_EXECUTABLE` to another Chromium executable and `TEST_URL` to a different preview URL when needed. Screenshots are saved to ignored `test-results/`.

Use `npm run test:browser -- --graph-only` for focused desktop frame and research-map checks, or `--sidebar-only` for the maximum-size Scoreboard and Co-op rosters. Release checks target desktop play.

Use `npm run test:browser -- --fleet-only` for Arsenal unlocks, bulk-fleet growth, firing paths, dense-fleet performance, reduced motion and host validation. Frame timing is recorded in `test-results/fleet-performance.json`.

Use `npm run test:browser -- --secret-only` to verify the secret star, boss challenge, weed unlock and Cooked Beam bonus.

Use `npm run test:browser -- --reset-only` for reset confirmation, cancellation, complete score removal, reloads and multiplayer synchronization.

With the development server running, `node tests/farm-browser.mjs` checks garden purchases, visible equipment, planting, harvesting, feeding, save reloads and prestige at both desktop sizes.

## The game loop

1. The host chooses **Scoreboard** or **Co-op** in the lobby, then starts a **60-second round**. The choice stays fixed for the session. Click or tap the central orb to damage it. Breaking an orb grants an LRC drop and reveals a stronger orb. Your orbit also starts with **1 passive LRC per second**.
2. Spend LRCs on generators during a round or between rounds, using **1**, **10**, or **Max** purchases. Scoreboard uses your personal balance; Co-op uses the shared crew bank. Purchased generators belong to the pilot who buys them.
3. Complete the round to receive **2 skill points**. In Scoreboard, reaching your personal round target awards **1 extra point to you**. In Co-op, reaching the shared target awards **1 extra point to every pilot**. Missing a target still advances the game and awards the base points.
4. Build your skill tree during the intermission. It has no countdown: each human pilot chooses when to ready up, and the next round starts once everyone is ready.
5. Once you have earned enough LRCs in your current run, prestige between rounds for permanent points. Spend those points on lasting prestige research, while keeping the research and skill points you already earned.

Clicking starts at **2 damage** plus a small **0.25 LRC** mint reward, with a **5% chance** of a triple-damage critical hit. The first solo orb has **2,000 HP** and drops **300 LRCs**. Its first visible crack appears after **10% damage**: 100 ordinary, unupgraded hits. Deeper fractures appear at 35% and 65% damage. Critical hits, automation, upgrades and the solar surge can reach these thresholds sooner. Ordinary cores reveal the next planet immediately; the final planet of each system is an armoured boss gate. The final **10 seconds** of each round are a solar surge with double click damage. The host limits sustained clicking to 15 accepted clicks per second, with a small allowance for short input bursts.

**Spacetime** research extends future rounds from 60 to **180 seconds**. The strongest active human pilot's round-extension bonus sets the shared clock in both modes. Its length is fixed when the round starts; research and roster changes affect the next round. Skill points still arrive per completed round, with the same 10-SP cap.

### The ten-system journey

**The story:** Beam wants to go home to Crystal, break the Refract orb, crush it up, snort it and have the most wicked high in every universe. The ship that gets him there runs on Beam himself. Feed him your garden's vegetables and, once he is full enough, he heaves bright light straight into the ship's fuel tank.

The Galaxy map follows **200 planetary cores**, twenty per system: Solace, Verdant Reach, Cinderwake, Azure Drift, Gilded Spiral, Violet Expanse, Hollow Crown, Chronos Veil, Infinite Prism, and Crystal. Each successive system multiplies the ordinary HP curve by another three. Crystal is Beam's home, where the cores are described as the hardest substance across every parallel universe; this setting is new Idlers lore.

**Ship fuel.** Every twentieth core (20, 40, …, 180, and Refract at 200) is a **jump point**. The ship cannot reach it until the fuel tank holds that system's target; until then hits and machines do no damage there, and the boss timer does not start. Breaking a jump-point core burns the whole tank and carries you to the next system. Beam introduces the idea in Solace, the first system.

| System | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fuel to jump | 120 | 200 | 350 | 600 | 1,000 | 1,700 | 2,900 | 4,900 | 8,400 | 14,000 |

Each meal adds fuel equal to its meal seconds (30 for a carrot, 110 for a pumpkin, 260 for weed), capped at the tank's target. When Beam's meal bonus is already full, food goes straight into the tank. Scoreboard pilots fly their own ship; a Co-op crew shares one tank, which survives personal prestige. Personal prestige and a new journey empty the tank. Older saves start with an empty tank.

Each system exit at cores **20, 40, …, 180** is a **30-second DPS check**. The first hit starts the fight; defeat the boss before the timer expires to enter the next system. Failure restores full health, and the next hit starts a new attempt. Bosses have 50% armour. The display shows the effective DPS needed after armour and your current automatic DPS; manual hits also count. The timer pauses between rounds and survives reloads. Damage from the preceding planet cannot skip the boss. Crystal’s final core uses the finale rules below.

Core **200** is the Refract logo crystal, with **10¹²⁰ base HP**. Every hit converts into crystal resonance so even modest attacks can change that astronomical health pool. Its lattice opens over **at least three active hours after arrival**, regardless of damage, attack speed, or crew size. The displayed lattice timer pauses between rounds and survives reloads and host handover. Reaching the final core never carries excess damage through it.

Defeating it freezes gameplay for everyone and displays the victory cinematic. Every pilot present receives **100 permanent prestige points** and a recorded victory, once. Only the host can begin another journey: planetary cores reset to the beginning, while balances, machines, research, gardens and victory rewards remain. The crew readies up from intermission to resume.

Scoreboard gives each pilot their own orb. Co-op gives the crew one shared orb: every player's clicks and automatic attacks damage the same HP pool. Orb damage and progression persist between rounds, and synchronized snapshots preserve them through reloads and host handover.

Co-op multiplies orb HP and drops by `1 + 0.85 × (active human pilots − 1)`, with a minimum multiplier of 1. Two pilots face a 3,700-HP first orb; three face 5,400 HP. Joining or leaving changes its size while preserving the percentage of damage already dealt. Older saves migrate to the harder cores with their existing health percentage intact.

The Scoreboard target is `round(500 × (1 + 0.12 × (round − 1))²)` per pilot. The Co-op target is that amount multiplied by active pilots. Targets count income earned during the round; spending LRCs does not reduce target progress. The interface shows real participants; bot support is used only in engine tests.

### Session modes

| | Scoreboard | Co-op |
| --- | --- | --- |
| LRC spending | Each pilot has a personal balance | All earnings enter one shared bank that any active pilot can spend |
| Progress display | Live ranking by session lifetime LRC earnings | Crew production, shared balance and shared target |
| Skill bonuses | Your skills improve your own production | Crew-branch bonuses also benefit other active pilots |
| Round bonus | Earn +1 SP by reaching your personal target | Everyone earns +1 SP when the crew reaches its target |
| Prestige | Resets your balance, machines and orb; research and lifetime ranking earnings stay | Resets your machines and run earnings; research, shared bank and shared orb stay |
| Start over | Wipes your pilot entirely, research and prestige included; other pilots keep their builds | Wipes your pilot entirely; the shared bank and shared orb stay |

Scoreboard is the default. Only the host can change the mode, and only before the first round. Starting a new session is required to choose another mode. Rankings include active pilots only; departed pilots disappear, and late joiners enter with their own current-session earnings. Spending or prestiging does not erase an active pilot's lifetime earnings on the leaderboard.

In Co-op, one pilot can buy a generator using LRCs earned by the others. The generator is owned by its purchaser, while its future output enters the shared bank. Shared funds are never removed by a personal prestige.

### Generators

| Upgrade | First purchase | Effect per owned unit |
| --- | ---: | ---: |
| Auto clicker | 25 LRCs | One automatic core click every 2 seconds |
| Refract orb farm | 14,000 LRCs | 6 passive LRC/s and access to Beam's Garden |
| Light array | 800 LRCs | 32 passive LRC/s |
| Refractometer | 4,500 LRCs | +10% to your production |
| Pocket star | 12,000 LRCs | 300 passive LRC/s |

The shop's **Machinery** tab contains these five machines. **Arsenal** adds four research-gated machines:

| Upgrade | First purchase | Base effect per unit | Unlock requirements |
| --- | ---: | --- | --- |
| AI Mouse | 2,400 LRCs | 2 automatic attacks/sec; each also mints your current click income | Highest orb 5; Clockwork core rank 2 |
| Lazer cannon | 35,000 LRCs | A 20× automatic-damage beam every 5 seconds | Highest orb 15; Servo lenses rank 2 |
| Starlink probe | 250,000 LRCs | A 3× automatic-damage pulse every 2 seconds; 1,200 passive LRC/s | Highest orb 30; Perpetual motion rank 1 |
| Star gate | 5,000,000 LRCs | A 100× automatic-damage strike every 10 seconds; 10,000 passive LRC/s | Highest orb 60; 120 completed rounds; one prestige; Parallel beams rank 2 |

These are base rates before research and production bonuses. Automatic damage research boosts all five attacking types, and automation speed research shortens their firing intervals. General generator and passive-production research also improves the probe and gate's income. The AI Mouse always mints click income; other automatic attackers require auto-mint research to earn that additional per-attack income. Automatic attacks never trigger manual-click counts or critical rolls.

Unlock requirements belong to the purchaser, including in Co-op; another pilot's research does not unlock your Arsenal. Once unlocked, Co-op purchases can use the shared bank. Each attacking type has its own saved firing progress, so the slower cannon and gate retain their place in the cycle across reloads.

Each purchase costs `ceil(base cost × 1.17^owned)`. Skill, crew, and prestige bonuses increase production. Each generator type is capped at 1,000 units.

Bulk purchases charge the sum of the escalating individual prices. **10** buys exactly ten or fails without spending anything; **Max** buys the largest affordable batch up to the generator cap. The host validates the full quote against the current balance, including other pilots' spending from the Co-op bank.

Auto clickers damage the orb automatically during harvesting rounds. Their attacks use your current click damage, including click skills, prestige, Refractometer bonuses, and the final-ten-second surge. Automatic clicks have no critical-hit roll, do not consume your manual click allowance, and are counted separately from manual clicks. Their damage generates LRCs when an orb breaks; passive LRC production continues separately. Orbital array and Perpetual motion skills increase their pulse rate.

Refractometer bonuses add together before multiplying your own production: five units grant +50%. In Co-op, the resulting income flows into the shared bank. Upgrade purchases and automatic production trigger visual feedback. Sound is enabled initially and unlocks after your first interaction; the sound button mutes or restores synthesized effects and remembers your choice on this device. Reduced-motion preferences suppress decorative animation.

Each owned unit adds a sprite to the fleet. The renderer draws up to **256 detailed units plus 512 small units** individually; larger holdings add a density field, with purchase flashes still marking new units. This bounds rendering work while keeping every owned unit in the economy. Scoreboard shows your fleet; Co-op combines active pilots' machines. Actual attack events drive projectiles and beams that reach the center of the orb through a transparent, click-through effects layer. Up to 96 visual shots are active at once. Intermissions stop new attacks while in-flight shots finish at the core; reduced motion suppresses moving attack effects.

### Click technology

The workshop's **Click tech** catalogue buys equipment with LRCs. Each purchase appears in the orbit, uses the same escalating prices and bulk controls as other machines, and resets on prestige.

| Device | First purchase | Effect per owned unit |
| --- | ---: | --- |
| Wormhole generator | 600 LRCs | +4 base damage to manual and automatic hits |
| Quantum foamer | 3,500 LRCs | +20% hit damage, additive with damage research |
| String detheory | 18,000 LRCs | +1 percentage point of manual critical chance and +0.1 critical multiplier |

Total critical chance caps at 80%. Automatic attacks still do not roll critical hits.

### Beam's Garden

Buying your first **14,000-LRC Refract orb farm** opens the **Farm** tab with one planting bed and the carrot variety unlocked. Choose a vegetable, pay for seeds each time you plant an empty bed, tend it while it grows, then harvest it when ready. Each harvest produces one vegetable before fertiliser and research bonuses. Unlocking a variety allows repeat purchases of its seeds.

The greenhouse is drawn in the same ink-outlined pixel style as the orbit. Every crop is redrawn from its exact growth progress, so plants visibly sprout, leaf out and fruit pixel by pixel, sway while lamps are on, and wilt when dry.

**Chores.** A fresh planting starts watered. One watering keeps a bed growing for **20 active seconds**; a dry bed stops growing until you water it again with the bed's watering can (or by clicking the bed). Fertilise each planting once with its sack for **+50% growth speed and +1 vegetable**. Hydroponics takes over watering; tractors take over fertilising.

| Vegetable | Variety unlock | Seeds per planting | Base growing time | Meal duration |
| --- | ---: | ---: | ---: | ---: |
| Carrot | Included | 100 LRCs | 30 seconds | 30 seconds |
| Lettuce | 18,000 LRCs | 250 LRCs | 45 seconds | 45 seconds |
| Tomato | 65,000 LRCs | 600 LRCs | 60 seconds | 70 seconds |
| Pumpkin | 220,000 LRCs | 1,500 LRCs | 90 seconds | 110 seconds |

Feed a harvested vegetable to Beam for **+25% personal income and hit damage**, plus ship fuel. This includes passive production, click minting, orb rewards, and manual and automatic damage. Meals add duration up to **300 active seconds**; research can improve their duration and strength. Growth, watering, automation and meal timers advance only during active rounds, pause between rounds, and make no offline progress. Planting, chores, harvesting, feeding and purchases are also available between rounds.

Expand to **six planting beds**. The next bed starts at 12,000 LRCs, with subsequent prices growing by 2.2×. Each equipment type has three levels:

| Equipment | First level | Effect | Visible installation |
| --- | ---: | --- | --- |
| Grow lights | 25,000 LRCs | +25% growth speed per lamp | A pink-violet lamp over each bed column |
| Hydroponics | 60,000 LRCs | Waters every bed automatically; +25% growth speed per level | Reservoir, nutrient and UV tanks, flowing feed pipes, drip emitters and water troughs |
| Tractor | 40,000 LRCs | Fertilises one unfertilised bed every 8 seconds, per tractor | Tractors chugging along the floor lane |
| Picker bot | 90,000 LRCs | Harvests one ripe bed every 6 seconds, per bot, and buys seeds to replant it | Bots on a monorail between the bed rows |

Equipment prices grow by 2.5× per level. Growth bonuses add together; farm research discounts seed, bed and equipment purchases. Picker bots pay for replacement seeds from your current wallet (the shared bank in Co-op); without enough LRCs they harvest and leave the bed empty, and a full pantry leaves the bed ripe. Tractor and bot cycles are split exactly, so results do not depend on frame timing. Older saves keep their gardens: two-field beds start watered, and each level of the retired fertiliser upgrade becomes a tractor.

In Co-op, garden purchases use the shared bank; beds, equipment, produce and Beam's meal bonus belong to the purchasing pilot. Their boosted earnings enter the shared bank. Prestige keeps garden access, unlocked seeds and research, but returns the garden to one empty bed and clears equipment, produce and the active meal.

### The secret star

A small uncharted star on the Galaxy map turns green when hovered or focused. Select it to reveal **The Green Star**, containing one planet: **Haze**. Its optional personal challenge has **1 billion HP** and a **30-second** deadline: roughly **33.33 million DPS**. Your clicks and machines fight Haze while your campaign position is kept; in Co-op, other pilots continue the shared campaign. Timing out returns you to your campaign. You can retry from the star or leave the challenge early.

Defeating Haze opens the farm if needed and unlocks **weed**, with a popup notification. It cannot be unlocked with LRCs. Seeds cost **4,200 LRC** per planting before discounts and take **120 active seconds** to grow before bonuses. Feeding one to Beam makes him **Cooked** for **4 minutes 20 seconds**, multiplying all your newly earned LRCs and score by **4.20×**. Existing scores and damage are unaffected. The bonus pauses between rounds, survives reloads, and feeding again refreshes it to 260 seconds. Ordinary vegetable meals remain separate. Prestige keeps the seed unlock but clears produce and the active boost; a full reset clears everything.

### Research

The research atlas has **60 connected normal nodes across ten branches**, with six tiers per branch, plus a **16-node permanent prestige graph**. Research ranks and unspent skill points survive every prestige. Pan and zoom the map, select a node to inspect its costs and requirements, and follow prerequisite links across branches. Search and availability highlights help find the next investment while keeping the surrounding graph visible. Expand the map for more space; Escape closes the expanded view. Touch dragging and the zoom controls work on mobile.

| Tier | Rank cap | Starting SP cost | Orb milestone | Completed rounds |
| --- | ---: | ---: | ---: | ---: |
| 1 | 8 | 1 | None | None |
| 2 | 8 | 4 | 10 | 3 |
| 3 | 8 | 15 | 25 | 15 |
| 4 | 6 | 50 | 50 | 60 |
| 5 | 5 | 180 | 100 | 240 |
| 6 | 4 | 600 | 175 | 720 |

Rank prices grow as `ceil(starting cost × 1.38^current rank)`. Later research also requires earlier ranks, and some nodes need progress in another branch or prestige milestones. These requirements use retained progression rather than forcing the entire tree to restart on prestige. Normal nodes spend skill points; the permanent tree on the Prestige tab spends available prestige points.

The board supports long-term development over many runs: stronger clicks, automation, orb hunting, production, shared bonuses and research interact. Co-op's crew bonuses apply to the active crew, while Scoreboard keeps each pilot's research benefits personal. Buying research is an intermission action so the crew can compare builds before starting the next round.

The six **Beam's garden** nodes improve growth speed, meal duration, purchase discounts, harvest yield and meal strength. Four permanent farm nodes—**Evergreen roots**, **Heirloom harvest**, **Endless lunch** and **Beam's bounty**—retain those improvements across runs. Both farm research paths require an unlocked garden as well as their displayed prerequisites and milestones.

### Progression audit

Run `npm run balance` for the reproducible 1-hour, 6-hour and 24-hour pacing report. `--quick` checks 10 minutes, 30 minutes and one hour. `--extended` continues to 10,000 completed rounds, then allows up to 24 additional active hours without prestige; `--push-hours=168` increases that limit. A victory stops the audit instead of silently restarting the campaign. These commands write `test-results/balance.json`.

Maxing normal research costs **74,770 SP across 390 ranks**. Even at the maximum **10 SP per round**, it requires at least **7,477 completed rounds**. At the shortest 60-second duration that is **5.19 active days**; researched extensions, intermissions and milestone gates increase the actual time. This is an optimistic lower bound, not an expected completion time.

The audit compares no manual clicks with two clicks per second. Both scripted policies invest every ten seconds, choosing the unlocked and affordable machine type with the highest base cost first, then cheaper types. They automatically ready between rounds, buy the cheapest legal research, and prestige for at least five points after fifteen completed rounds since the last reset; the first prestige happens as soon as eligible. No resources, research gates or Arsenal unlocks are bypassed.

The current audit includes the expanded machine and research catalogues. Its policies do not plant, harvest or feed Beam, so these measurements provide a conservative **no-gardening baseline**, without meal bonuses.

| Managed play policy | First core broken | First boss cleared | First prestige |
| --- | ---: | ---: | ---: |
| No manual clicks | 5 min 18 sec | 16 min 44 sec | 9 min 18 sec |
| Two clicks per second | 3 min 27 sec | 13 min 3.5 sec | 7 min 12 sec |

The current ten-system, paid-seed audit reaches **40 normal nodes / 222 ranks** and a highest core of **124** for both policies after 24 active hours. Round length has grown to **115 seconds**; the zero-click policy has completed 910 rounds and the two-click policy 909. Neither reaches core 175 or the final crystal in that window. These measurements predate the timed system-boss gates and secret crop; a full-campaign completion time has not been measured for these policies.

These figures describe continuously managed sessions. An unattended session stops at its first intermission after 60 seconds, and there is no offline income. Prestige restarts the personal orb, while the highest-orb milestone and research remain recorded across runs.

### Prestige

Earn **2,500 LRCs in your run** to unlock your first prestige. The award is `floor(log2(1 + run LRCs / 2500))`: 2,500 earns 1 point, 7,500 earns 2, and 17,500 earns 3. Spending LRCs does not reduce your run total. Logarithmic awards keep repeated prestige resets from rapidly overwhelming the long-term economy.

Each earned prestige point permanently adds **10% to your production**. Prestiging resets **your** personal spendable LRCs, run income, generators and personal orb. It preserves all research ranks, unspent skill points, lifetime income and prestige totals. In Co-op, the shared bank and shared orb are preserved in full. Other pilots keep their builds, and the shared round number continues. The permanent production bonus uses total earned prestige points, so spending available points on prestige research does not remove that bonus.

Your garden remains unlocked with its seed collection and farm research. Rebuild from one empty bed: purchased beds, equipment, harvested vegetables and Beam's current meal bonus reset.

## Multiplayer

Open **http://127.0.0.1:4175/tools/preview.html** for the local multiplayer lab. Its two game frames are separate clients connected through a simulated Refract relay. This verifies the activity contract locally; it is not a room service for remote friends.

For a live session:

1. Host the built `dist/` directory at a public HTTPS URL that permits embedding by your Refract instance.
2. In Refract, open **Manage instance → Activities** and register that final URL as **Refract Idlers**.
3. Reload Refract, join a call, and launch the activity. Other participants join the same activity from the call.

The final URL must be reachable by every participant. A loopback URL only reaches the current device.

The first participant coordinates the game. The bridge authenticates relayed sender identities, and the host validates clicks, phases, affordability, skill prerequisites, and prestige eligibility. Followers render synchronized snapshots. Late joiners request the current state; after host departure, the next participant continues from the last synchronized snapshot. Up to **eight pilots** play; additional participants spectate.

This is a casual multiplayer game with a trusted coordinating browser, not a server-enforced competitive economy. A real call with two signed-in Refract users remains the final integration acceptance check.

## Saves and limits

Standalone progress saves on the current device. Refract snapshots use `sessionStorage`, scoped to the session and user, to support reloads. Browser storage can be cleared or unavailable; there is no account-backed persistence, cross-device save, or offline income calculation. A Refract run should not be treated as durable once all participating sessions are closed.

**Resetting progress.** Open **Prestige → Reset all progress**. In standalone play it erases all saved progress and scoring data (including lifetime LRCs, clicks, round results and victories) after an explicit acknowledgement and returns to the first lobby, where the mode can be chosen again. In a Refract session the same control resets only your own pilot: LRCs, machines, research, skill points, prestige, garden and records return to those of a new pilot, while the session, its round number, other pilots and, in Co-op, the shared bank and orb carry on. Cancel or close the confirmation to keep your progress. Neither reset can be undone.

## Hosting and source

`npm run build` produces a static `dist/` with relative asset URLs, suitable for GitHub Pages repository subpaths or another static host. Serve this output, not the entire working directory.

The Pages workflow checks syntax, runs unit tests, and builds on pull requests and pushes to `main`. On a push to `main` or manual run it deploys only if GitHub Pages is already enabled for the repository. In **Settings → Pages**, select **GitHub Actions**, then run the workflow. Register the actual deployment URL reported by GitHub; an expected repository URL is not proof of deployment.

| File | Responsibility |
| --- | --- |
| [src/game.js](src/game.js) | Round rules, LRC economy, skills, prestige, snapshot validation |
| [src/campaign.js](src/campaign.js) | Ten solar systems, planetary names, final lattice and victory constants |
| [src/skills.js](src/skills.js) | Research catalog, rank costs and milestone gates |
| [src/farm.js](src/farm.js) | Garden economy, crop growth, meal bonuses and farm snapshot validation |
| [src/farm-view.js](src/farm-view.js), [src/farm.css](src/farm.css) | Interactive greenhouse, chores, machines, ship fuel panel, seed shop and harvest basket |
| [src/farm-sprites.js](src/farm-sprites.js) | Original pixel sprites: progress-driven plants, produce, equipment, ship and sky. Preview them at `tools/garden-sprites.html` |
| `src/main.js` | Interface, input, local saves, simulation and relay wiring |
| `src/research.js` | Connected research maps, pan/zoom and selected-node inspectors |
| `src/research.css` | Research nodes, prerequisite edges and map layout |
| `src/frame.css` | Fixed desktop game frame and compact panels |
| [src/beam.js](src/beam.js), [src/beam.css](src/beam.css) | Cosmetic pixel companion rendering, milestone reactions and motion |
| `docs/BEAM-LORE.md` | Source-grounded Beam notes and adaptation boundaries |
| `src/arena.js` | Canvas orbit, participant avatars, visual feedback |
| `src/activity.js` | Authenticated Refract relay and host election |
| `src/audio.js` | Gesture-unlocked synthesized sound effects |
| `public/refract-activity.js` | Official Refract iframe helper |
| `tools/preview.html` | Local multiplayer protocol simulator |
| `scripts/balance.mjs` | Reproducible long-duration progression audit |

Licensed **AGPL-3.0-only**. See [LICENSE](LICENSE) and [CREDITS.md](CREDITS.md) for source attribution and retained brand ownership.
