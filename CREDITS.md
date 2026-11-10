# Credits and source provenance

Refract Idlers is licensed under **GNU Affero General Public License v3.0 only (AGPL-3.0-only)**. The license text is included in [LICENSE](LICENSE).

## RogueRefract

[Celzor/RogueRefract](https://github.com/Celzor/RogueRefract) is the principal implementation and asset source, distributed under AGPL-3.0-only.

- `public/assets/refract-icon.png` and `public/favicon.svg`: reused Refract branding assets.
- `public/refract-activity.js`: the official Refract activity helper, reused from RogueRefract.
- `src/audio.js`: reused gesture-unlocked Web Audio effects.
- `src/arena.js`: adapted from RogueRefract's renderer, retaining its tilted orbital projection, spectrum colors, deterministic starfield, participant avatar approach, and particle feedback. Idlers adds generator motes, harvesting feedback, and a separate accessible HTML core button.
- `src/activity.js`: adapted from RogueRefract's authenticated activity bridge, with an Idlers-specific protocol identifier and integration.
- Development, static hosting, and test patterns also follow the companion project.

The Refract name and brand mark remain with their owner. Their inclusion does not transfer trademark ownership.

## Refract Tic-tac-toe

[Celzor/refract-tack-toe](https://github.com/Celzor/refract-tack-toe), distributed under GPL v3, provides the activity architecture reference: authenticated participant identities, a coordinating browser, shared snapshots, late-join synchronization, and a local multi-frame relay preview. Its README and integration design informed this project; no source files from that repository were copied into this implementation.

## Refract Idlers

The LRC economy, incremental generators, round rewards, three-branch skill tree, personal prestige rules, and game interface are implemented for Refract Idlers.
