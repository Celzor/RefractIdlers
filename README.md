# Refract Idlers

A multiplayer incremental game for Refract: click the middle of the orbit, harvest LRCs, build passive production, and grow a skill tree between rounds. The host chooses Scoreboard or Co-op for the session. Prestige your own build to return with a permanent income bonus.

Built on the activity approach from [Refract Tic-tac-toe](https://github.com/Celzor/refract-tack-toe), with assets, audio, orbital rendering, and multiplayer bridge code reused or adapted from [RogueRefract](https://github.com/Celzor/RogueRefract).

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

## The game loop

1. The host chooses **Scoreboard** or **Co-op** in the lobby, then starts a **60-second round**. The choice stays fixed for the session. Click or tap the central Refract core to collect LRCs; keyboard controls are shown in the game. Your orbit also starts with **1 passive LRC per second**.
2. Spend LRCs on generators during a round or between rounds. Scoreboard uses your personal balance; Co-op uses the shared crew bank. Purchased generators belong to the pilot who buys them and carry into subsequent rounds with their skills.
3. Complete the round to receive **2 skill points**. In Scoreboard, reaching your personal round target awards **1 extra point to you**. In Co-op, reaching the shared target awards **1 extra point to every pilot**. Missing a target still advances the game and awards the base points.
4. Build your skill tree during the intermission. It has no countdown: each human pilot chooses when to ready up, and the next round starts once everyone is ready.
5. Once you have earned enough LRCs in your current run, prestige between rounds for a permanent production bonus.

Clicking starts at **2 LRCs**, with a **5% chance** of a triple-value critical click. The final **10 seconds** of each round are a solar surge with double click income. The host limits sustained clicking to 15 accepted clicks per second, with a small allowance for short input bursts.

The Scoreboard target is `round(500 × 1.35^(round − 1))` per pilot. The Co-op target is `round(500 × active pilots × 1.35^(round − 1))` for the crew. Targets count income earned during the round; spending LRCs does not reduce target progress. The interface shows real participants; bot support is used only in engine tests.

### Session modes

| | Scoreboard | Co-op |
| --- | --- | --- |
| LRC spending | Each pilot has a personal balance | All earnings enter one shared bank that any active pilot can spend |
| Progress display | Live ranking by session lifetime LRC earnings | Crew production, shared balance and shared target |
| Skill bonuses | Your skills improve your own production | Crew-branch bonuses also benefit other active pilots |
| Round bonus | Earn +1 SP by reaching your personal target | Everyone earns +1 SP when the crew reaches its target |
| Prestige | Resets your balance and build; lifetime ranking earnings stay | Resets your personal build and run earnings; the shared bank stays |

Scoreboard is the default. Only the host can change the mode, and only before the first round. Starting a new session is required to choose another mode. Rankings include active pilots only; departed pilots disappear, and late joiners enter with their own current-session earnings. Spending or prestiging does not erase an active pilot's lifetime earnings on the leaderboard.

In Co-op, one pilot can buy a generator using LRCs earned by the others. The generator is owned by its purchaser, while its future output enters the shared bank. Shared funds are never removed by a personal prestige.

### Generators

| Upgrade | First purchase | Effect per owned unit |
| --- | ---: | ---: |
| Auto clicker | 25 LRCs | One automatic core click every 2 seconds |
| Refract orb farm | 140 LRCs | 6 passive LRC/s |
| Light array | 800 LRCs | 32 passive LRC/s |
| Refractometer | 4,500 LRCs | +10% to your production |
| Pocket star | 12,000 LRCs | 300 passive LRC/s |

Each purchase costs `ceil(base cost × 1.17^owned)`. Skill, crew, and prestige bonuses increase production. Each generator type is capped at 1,000 units.

Auto clickers pulse the core automatically during harvesting rounds. Their payout uses your current click power, including click skills, prestige, Refractometer bonuses, and the final-ten-second surge. Automatic clicks have no critical-hit roll, do not consume your manual click allowance, and are counted separately from manual clicks. The output readout includes their projected average income; actual LRCs arrive on each pulse. Orbital array and Perpetual motion skills increase their pulse rate.

Refractometer bonuses add together before multiplying your own production: five units grant +50%. In Co-op, the resulting income flows into the shared bank. Upgrade purchases and automatic production trigger visual feedback. Sound is enabled initially and unlocks after your first interaction; the sound button mutes or restores synthesized effects and remembers your choice on this device. Reduced-motion preferences suppress decorative animation.

### Skill tree

Each branch has three linked nodes. Buy at least one rank of the preceding node to unlock the next. Rank costs are `base skill-point cost + current rank`; the three tiers start at **1, 2, and 3 points**. Nodes have five ranks, except Event horizon, which has three.

| Branch | First node | Second node | Third node |
| --- | --- | --- | --- |
| Clicking | **Focused light:** +2 LRC/click per rank | **Critical mass:** +5 percentage points of critical chance per rank | **Singularity:** +25% click income per rank |
| Idle production | **Solar cells:** +2 passive LRC/s per rank | **Orbital array:** +20% passive income per rank | **Perpetual motion:** +30% generator production per rank |
| Crew | **Shared frequency:** +3% income per rank | **Resonance:** +2% income and +10% own income per rank | **Event horizon:** +15% own income per rank, plus one extra skill point per completed round once unlocked |

In Co-op, Shared frequency and Resonance's shared bonuses from active pilots add together and apply to everyone. In Scoreboard, those bonuses apply only to their owner. Prestige, applicable skill bonuses, personal bonuses, and Refractometer bonuses multiply: `(1 + 0.10 × total prestige points) × (1 + applicable shared-branch bonuses) × (1 + personal bonuses) × (1 + 0.10 × Refractometers)`.

### Prestige

Earn **2,500 LRCs in your run** to unlock your first prestige. The award is `floor(sqrt(run LRCs / 2500))`: 2,500 earns 1 point, 10,000 earns 2, and 22,500 earns 3. Spending LRCs does not reduce your run total.

Each prestige point permanently adds **10% to all your LRC income**. Prestiging resets **your** personal spendable LRCs, run income, generators, skills, and unspent skill points. It preserves lifetime income and prestige totals. In Co-op, the shared bank is preserved in full. Other pilots keep their builds, and the shared round number continues. Prestige points apply automatically; there is no separate prestige shop.

## Multiplayer

Open **http://127.0.0.1:4175/tools/preview.html** for the local multiplayer lab. Its two game frames are separate clients connected through a simulated Refract relay. This verifies the activity contract locally; it is not a room service for remote friends.

For a live session:

1. Host the built `dist/` directory at a public HTTPS URL that permits embedding by your Refract instance.
2. In Refract, open **Manage instance → Activities** and register that final URL as **Refract Idlers**.
3. Reload Refract, join a call, and launch the activity. Other participants join the same activity from the call.

The final URL must be reachable by every participant. A loopback URL only reaches the current device. A private Sites preview is for owner review and does not by itself provide shared Refract hosting.

The first participant coordinates the game. The bridge authenticates relayed sender identities, and the host validates clicks, phases, affordability, skill prerequisites, and prestige eligibility. Followers render synchronized snapshots. Late joiners request the current state; after host departure, the next participant continues from the last synchronized snapshot. Up to **eight pilots** play; additional participants spectate.

This is a casual multiplayer game with a trusted coordinating browser, not a server-enforced competitive economy. A real call with two signed-in Refract users remains the final integration acceptance check.

## Saves and limits

Standalone progress saves on the current device. Refract snapshots use `sessionStorage`, scoped to the session and user, to support reloads. Browser storage can be cleared or unavailable; there is no account-backed persistence, cross-device save, or offline income calculation. A Refract run should not be treated as durable once all participating sessions are closed.

## Hosting and source

`npm run build` produces a static `dist/` with relative asset URLs, suitable for GitHub Pages repository subpaths or another static host. Serve this output, not the entire working directory.

The Pages workflow checks syntax, runs unit tests, and builds on pull requests and pushes to `main`. On a push to `main` or manual run it deploys only if GitHub Pages is already enabled for the repository. In **Settings → Pages**, select **GitHub Actions**, then run the workflow. Register the actual deployment URL reported by GitHub; an expected repository URL is not proof of deployment.

| File | Responsibility |
| --- | --- |
| `src/game.js` | Round rules, LRC economy, skills, prestige, snapshot validation |
| `src/main.js` | Interface, input, local saves, simulation and relay wiring |
| `src/arena.js` | Canvas orbit, participant avatars, visual feedback |
| `src/activity.js` | Authenticated Refract relay and host election |
| `src/audio.js` | Gesture-unlocked synthesized sound effects |
| `public/refract-activity.js` | Official Refract iframe helper |
| `tools/preview.html` | Local multiplayer protocol simulator |

Licensed **AGPL-3.0-only**. See [LICENSE](LICENSE) and [CREDITS.md](CREDITS.md) for source attribution and retained brand ownership.
