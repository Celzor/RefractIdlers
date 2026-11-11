# Beam: source notes and the Idlers adaptation

Beam is Refract's small crystal companion and **Chief Vibe Officer**. Idlers gives him a pixel costume and a seat at the top of the active shop. His appearance, gentle habits and knowingly unscientific confidence come from the existing Refract project; the game dialogue and reactions are new.

This research used the author-provided `refract/oasis-core` checkout on 10 November 2026. Source paths below are relative to that checkout. The source repository was read without modification.

## What the source establishes

| Detail | Source evidence |
| --- | --- |
| Sapphire/cyan faceted head, asymmetric crystal crown/ears, navy face, warm cream eyes, amber core, separate floating crystal hands and feet, orbiting shard | `docs/beam/prompts.md:12`; the same identity is repeated for the other weather expressions |
| A friendly greeting and quiet floating presence | `frontend/src/components/beam/BeamScene.tsx:10–18`, including “Hello!” and “Just floating by” |
| Chief Vibe Officer, a highly scientific vibe check, an extremely scientific chart with a sample size of one | `frontend/src/components/turbo/TurboProMaxDialog.tsx:40,398,411,430` |
| A compact wooden boat during the day and an upholstered armchair at night | `docs/beam/README.md:21–23` |
| Boat: honey-walnut hull, teal cushion, Beam seated low with hands at the rim | `docs/beam/seated-boat.md:9` |
| Chair: deep teal upholstery, cyan piping, short walnut feet, relaxed open eyes and dangling crystal feet | `docs/beam/seated-armchair.md:9` |
| Gentle animation, considerate compact placement, reduced-motion support, background-tab pausing | `docs/beam/README.md:15–23`; `frontend/src/components/beam/beam.css`; `frontend/src/components/beam/BeamBlink.tsx` |
| Greeting artwork originated in a user-provided Flick handoff; the concept sheet is reference art | `docs/beam/README.md:64–70`; `docs/beam/beam-concept-sheet.png` |

The concept sheet uses the earlier name **Flick** and the line “A little light. A lot of personality.” The current source calls the character **Beam** and retains an old `flickEnabled` preference for compatibility (`docs/beam/README.md:7`). The old name is development history, not evidence of a second character.

The source provides a well-defined personality and visual identity. The materials reviewed do not establish a creation myth, an LRC origin story, a crystal civilization or a relationship between Beam and destructible game orbs. Vegetable gardening and feeding Beam are new Idlers mechanics; the reviewed source does not establish a vegetable diet or food-powered abilities. Idlers does not present these additions as official Refract lore.

## Expressions and their game interpretation

The original companion responds to real weather. The Idlers companion responds to game milestones; it does not request weather or location.

| Existing expression | Original source | Idlers interpretation |
| --- | --- | --- |
| Neutral greeting, friendly floating | `BeamScene.tsx:10–18` | Welcome and quiet supervision |
| Sunny: delighted closed eyes and open hands | `docs/beam/prompts.md:12` | A first machine or new research |
| Stormy: wide eyes, worried brows and a huddled posture | `docs/beam/prompts.md:28` | Concern when a boss orb appears |
| Windy: determined squint, crooked grin, leaning into a gust | `docs/beam/prompts.md:36` | Bracing for the final ten-second surge |
| Seated daytime boat or nighttime chair | `docs/beam/README.md:21–23` | Resting during the build phase |
| Crown in the playful Turbo presentation | `TurboProMaxDialog.tsx:242` and `frontend/public/beam/beam-turbo-pro-max.png` | A brief prestige celebration |

Rainy, hot and cold poses also exist (`docs/beam/prompts.md:20,44,52`). Idlers currently uses the expressions above; it does not claim every weather pose is implemented. The game's day/night chair choice uses the device's local clock, with daytime from 07:00 to 18:59. This is an adaptation, not Refract's weather-derived day/night calculation.

## Pixel identity

[`public/assets/beam-pixel.svg`](../public/assets/beam-pixel.svg) is original code-native artwork drawn on a 64×64 grid. It preserves the uneven ears, large navy face, luminous cream eyes, amber chest, detached limbs and small orbiting shard. Cyan and sapphire remain central to Beam even though the surrounding game uses warmer wood, paper and felt colors.

The stepped shapes, pixel shading, game-sized furniture and gold prestige crown are newly drawn. They are an adaptation of the existing mascot, not copied animation frames or a newly declared official Refract palette. The full-resolution source PNGs and the concept sheet are not shipped with this game. Named SVG layers share one small local asset across expressions and poses.

## Voice and interaction

Beam is affectionate, lightly absurd and more confident in his research methods than those methods warrant. The **Chief Vibe Officer** title is sourced; all dialogue in [`src/beam.js`](../src/beam.js), including “A new idea! Peer-reviewed by me. Just me.”, is newly written for Idlers. Game references to photons, LRCs, machines and prestige describe this game's mechanics rather than expand official Refract canon.

The companion reads local game snapshots and reacts to selected milestones: arrival, the first purchase of each machine type, research, a boss, a surge, a round ending, a garden meal or prestige. He does not speak on each click. Event priorities and cooldowns prevent a queue of interruptions. A major milestone remains available while research hides the companion, then receives its remaining display time when the player returns. Only the current reaction is retained; later higher-priority milestones replace it, and a new build idea can replace an unseen round-end greeting. The welcome and rest poses remain quiet between milestones.

Beam can be greeted with a harmless poke, limited to once every three seconds, or minimized with a persistent local preference. Reduced-motion settings disable sprite movement, and hidden tabs pause it. He stays inside his reserved UI space and creates no popups. Poking him changes no health, income, score, prestige or network state. He is the player's companion, never the destructible orb.

The first Refract orb farm opens **Beam's Garden**. Players grow carrots, lettuce, tomatoes and pumpkins, harvest them, then use the Farm's **Feed** controls. Feeding consumes produce through the host-authoritative game engine and grants a base **+25% personal income and hit damage** bonus. Meals stack to 300 active seconds; crop growth and meal timers pause between rounds. Farming research improves the garden and its meals. These systems and Beam's snack dialogue are specific to Idlers. His portrait, animations, greetings and reactions remain cosmetic; hiding the companion does not remove an earned meal bonus.

## Implementation contract

[`src/beam.js`](../src/beam.js) exports `BeamCompanion`. Construct it with a mounted element, call `render(state, selfId)` with current snapshots, and call `destroy()` before removing it. The optional third render argument is a monotonic millisecond timestamp. `react(type, detail)` supports explicit cosmetic reactions; normal milestones are already detected by `render`.

[`src/beam.css`](../src/beam.css) owns the compact character presentation and motion. [`CREDITS.md`](../CREDITS.md) records source and artwork provenance.

[`src/farm.js`](../src/farm.js) owns crop state, purchases and meal effects, with actions and simulation integrated into [`src/game.js`](../src/game.js). [`src/farm-view.js`](../src/farm-view.js) and [`src/farm.css`](../src/farm.css) render the garden and send actions. The companion renderer observes meal milestones; it does not award or expire the gameplay bonus itself.
