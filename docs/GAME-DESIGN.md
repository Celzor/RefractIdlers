# Refract Idlers: game design and economy

This first playable version is an incremental game for up to eight pilots. Click the middle of the orbit to harvest LRCs, buy generators that produce LRCs during the round, and build a personal skill tree between rounds. The host chooses one mode in the lobby before the session starts.

## Session modes

| Rule | Scoreboard | Co-op |
| --- | --- | --- |
| Spendable LRCs | Each pilot has their own wallet | Every pilot earns into one shared wallet |
| Generator purchases | Paid from the purchaser's wallet | Paid from the shared wallet; attributed to the purchasing pilot |
| Builds and skill points | Personal | Personal; every build contributes to pooled production |
| Frequency and Resonance bonuses | Affect only their owner | Aggregate across participating pilots and benefit the crew |
| Extra round skill point | Earned by meeting a personal target | Awarded to everyone when the crew meets its shared target |
| Comparison | Live ranking of currently active pilots | Pooled balance and combined production |
| Prestige | Resets that pilot's wallet and build | Resets that pilot's build and contribution counters; preserves the shared wallet |

Scoreboard is the default. Only the first participant can change the mode, and only while the session is in the initial lobby. The mode is retained in synchronized snapshots and saved progress. A departing pilot leaves the active ranking and stops contributing production; their already-earned co-op LRCs remain in the pool. There is no cross-session global ranking.

## Round loop

1. The first participant is the coordinating host and starts round one.
2. Every round lasts 60 seconds. Every pilot begins with 1 passive LRC/second and a base click worth 2 LRCs.
3. Generators can be purchased during a round or its intermission. There is no passive production in the lobby or intermission. The engine does not award offline catch-up income.
4. The final 10 seconds double manual and automatic click rewards. Farm/array/star production and the baseline passive rate are unchanged.
5. When the timer expires, every active pilot receives 2 skill points. Scoreboard grants that pilot +1 for reaching their personal target; co-op grants everyone +1 for reaching the crew target. Having any rank of Event horizon grants that pilot another point. The exact award is recorded before anyone can buy upgrades or prestige.
6. The intermission has no timeout. Pilots can spend skill points, buy generators, or prestige. The next round begins when every human pilot is ready; practice bots never delay it. Buying a skill or prestiging clears that pilot's ready flag.

LRC balances, the co-op pool, generators, skills, and unused skill points carry between rounds. The round timer, round contribution counters, target progress, and ready flags reset. Missing a target still grants the normal 2 skill points and does not block progression.

The target for round `r`, with `N` pilots present at its start, is:

```text
scoreboard personal target = round(500 × 1.35^(r − 1))
co-op crew target = round(500 × N × 1.35^(r − 1))
```

The target stays fixed during that round even if a pilot joins or leaves. Earnings already contributed by a departed pilot remain in the team total. Scoreboard rewards do not depend on other pilots' performance. The engine supports labeled practice pilots for automated tests; this version does not expose a bot toggle in the interface.

## LRC production

Each generator's price grows with the number already owned:

```text
next price = ceil(base price × 1.17^owned)
```

| Generator | Base price | Effect per unit |
| --- | ---: | --- |
| Auto clicker | 25 | 0.5 automatic clicks/second, each paying your current click value |
| Refract orb farm | 140 | Grows Refract orbs for 6 base LRC/second |
| Light array | 800 | 32 base LRC/second |
| Refractometer | 4,500 | +10% to all your LRC production |
| Pocket star | 12,000 | 300 base LRC/second |

Purchases deduct only the spendable wallet: personal LRCs in scoreboard, or shared LRCs in co-op. They never deduct run earnings or lifetime earnings, so investing in generators does not delay eligibility for prestige. Co-op purchases do not alter the purchaser's personal contribution counters. Skill costs remain personal skill points in both modes.

The income multiplier uses only the owning pilot's Frequency/Resonance ranks in scoreboard, or sums those ranks across the current participating crew in co-op:

```text
frequency bonus = Σ(0.03 × Shared frequency rank + 0.02 × Resonance rank)
personal bonus = 0.10 × own Resonance rank + 0.15 × own Event horizon rank
refractometer multiplier = 1 + 0.10 × owned refractometers
multiplier = (1 + 0.10 × total prestige points)
  × (1 + frequency bonus) × (1 + personal bonus) × refractometer multiplier
```

Click income before critical hits is:

```text
(2 + 2 × Focused light rank)
  × (1 + 0.25 × Singularity rank)
  × multiplier
  × (2 during the final 10 seconds, otherwise 1)
```

Every manual click has a `5% + 5% × Critical mass rank` chance to pay triple. Automatic clicks do not roll critical hits. The coordinating simulation owns the deterministic random-number state. Critical outcomes cannot be selected by a follower's action payload.

Let `generator production` be the sum of owned orb farms, light arrays, and pocket stars multiplied by their base rates. Continuous passive income is:

```text
(1 + 2 × Solar cells rank
   + generator production × (1 + 0.30 × Perpetual motion rank))
  × (1 + 0.20 × Orbital array rank)
  × multiplier
```

Automatic click frequency and total projected idle income are:

```text
automatic clicks/second = owned auto clickers × 0.5
  × (1 + 0.30 × Perpetual motion rank)
  × (1 + 0.20 × Orbital array rank)
projected idle LRC/second = continuous passive income + automatic clicks/second × click value
```

The engine awards automatic clicks as actual pulses, retaining fractional pulse progress in `autoClock`. One unmodified auto clicker pays once every two seconds rather than adding a fractional click reward every frame. Automatic pulses increment the lifetime `autoClicks` counter; they do not increment manual click counters or consume the manual token bucket. Focused light, Singularity, prestige, Refractometers, and the final-ten-second surge all affect their value. Idle tree upgrades increase their frequency. Catch-up steps split at the surge boundary so time before the surge is not paid at its doubled value.

Co-op combined passive production is the sum of every active pilot's passive rate. Combined click power is the sum of their individual click values before critical hits; it describes all pilots clicking once, not one pilot's click. Each click still awards only the clicking pilot's own value into the pool and their contribution record.

## Skill tree

Skills are purchased only during intermissions. Each branch requires at least one rank in its preceding node. A rank costs `base cost + current rank` skill points. Unspent points carry forward until prestige.

| Branch | Skill | Base cost | Maximum rank | Effect per rank |
| --- | --- | ---: | ---: | --- |
| Click | Focused light | 1 | 5 | +2 base LRC/click |
| Click | Critical mass | 2 | 5 | +5 percentage points of critical chance |
| Click | Singularity | 3 | 5 | +25% click production |
| Idle | Solar cells | 1 | 5 | +2 base passive LRC/second |
| Idle | Orbital array | 2 | 5 | +20% passive production |
| Idle | Perpetual motion | 3 | 5 | +30% generator production |
| Crew | Shared frequency | 1 | 5 | +3% income; shared with the crew in co-op |
| Crew | Resonance | 2 | 5 | +2% income shared in co-op, and +10% personal income |
| Crew | Event horizon | 3 | 3 | +15% personal income; owning any rank grants +1 skill point per completed round |

Bonuses within the same term add together; separate terms in the formulas multiply. Frequency bonuses help solo players too. In scoreboard another pilot's upgrades never change your production or your milestone reward.

## Prestige: refract your core

Prestige becomes available during an intermission after earning at least 2,500 LRCs since that pilot's previous prestige:

```text
points awarded = floor(sqrt(run earnings / 2,500))
```

| Run earnings | Points awarded |
| ---: | ---: |
| 2,500 | 1 |
| 10,000 | 2 |
| 22,500 | 3 |
| 40,000 | 4 |

Every earned prestige point permanently adds 10% to that pilot's prestige income multiplier. Points are not spent in this version; the prestige balance records the accumulated points. Waiting for a larger award trades faster current growth against a stronger reset.

Prestige is based on the choosing pilot's own run earnings in both modes; another pilot's contribution cannot unlock it. It resets that pilot's personal LRC counter, run earnings, generators, skill tree, and unspent skill points. It preserves lifetime earnings, lifetime click count, prestige points, and prestige count. It does not reset the crew's round number, other pilots, or the completed round's contribution/award records.

In scoreboard the resetting LRC counter is that pilot's spendable wallet. In co-op the shared wallet remains intact: the choosing pilot's build resets, while every already-pooled LRC stays available to everyone. Removing that pilot's Frequency/Resonance skills changes the co-op shared multiplier for the next round. Prestige does not require a team vote because it never resets the pool or another pilot's build. Fractional automatic pulse progress resets with the build; the lifetime automatic-click counter is retained.

The initial pacing is deliberately quick enough to explore in one short session. In a deterministic simulation that buys affordable generators continuously and chooses a mix of early idle/click skills, the first prestige was available after roughly two rounds at two clicks per second, or three rounds without clicking. These are illustrative balance checks, not automatic gameplay: purchases and skill choices still require player input, and different choices change the result.

## Multiplayer authority and persistence boundaries

Refract supplies participant identities and the relay. The first participant simulates the game, accepts actions for authenticated senders, and publishes snapshots. Followers render those snapshots. The bridge handles request deduplication, snapshot ordering, late-join synchronization, and host handover. The engine validates phase, membership, prerequisites, prices, rank limits, and numeric state. The application attaches the displayed round number to every action; the engine rejects intents carrying a different round number, so a delayed click or purchase cannot apply to a later round.

When a host leaves, the first remaining participant becomes coordinator using the synchronized state. Roster reconciliation retains each remaining pilot's build and balances. If everyone still present was already ready, the next round can begin during that reconciliation; the replacement host publishes the resulting state.

The click limiter replenishes 15 clicks per second and permits a burst of three. This prevents a follower from submitting arbitrarily many rewarded clicks in one simulation instant. It is a gameplay limit, not a reliable way to detect automation.

This is a casual game with a trusted browser host. A modified coordinator can forge its simulation or saved progress. Competitive rankings, secure cross-device progression, and adversarial anti-cheat would require a server referee and authenticated persistent storage. No currency has a real-money value.

Session restoration and browser storage belong to the application layer. The pure engine itself neither reads storage nor grants closed-tab income. Removing a participant removes their active engine record; restoring progress on a later visit must be handled by the application layer. Prestige is permanent within the saved progression retained by that layer.

`migrateState` upgrades older browser saves that predate modes into scoreboard mode with an empty shared pool, and initializes missing automatic-click counters to zero. It preserves their existing balances and owned catalog IDs; those IDs now have the effects described above. Old round summaries did not record each player's individual Event horizon reward, so migration retains only the recorded base award rather than inventing a historical bonus. New summaries record exact personal awards. The network validator requires the new fields; migration is only for browser saves.

## Technical limits and verification

- At most eight active pilots; additional Refract members can be handled as spectators by the application.
- Monetary counters and calculated production are capped at `10^15` to remain finite. Generator ownership is capped at 1,000 per kind. These are implementation safety limits, not early-game goals.
- A round crossing its boundary awards income only for its remaining time, completes once, and awards skill points once.
- Snapshot validation rejects malformed numbers, invalid ranks, unknown catalog entries, unsafe avatar protocols, duplicate IDs, inconsistent phase fields, and states over 15,000 UTF-8 bytes. The application omits avatar URLs from shared snapshots and renders avatars from the Refract roster, leaving room in the 16 KiB relay envelope.
- The engine tests cover mode authority, individual production and rewards, pooled affordability and spending, combined rates, pool retention after prestige/departure, exact round awards, save migration, phase rules, click limits, passive production, automatic pulses and surge catch-up, Refractometer multipliers, skill prerequisites, readiness, host handover, deterministic replay, practice bots, and snapshot validation.
