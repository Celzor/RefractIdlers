# Credits and source provenance

Refract Idlers is licensed under **GNU Affero General Public License v3.0 only (AGPL-3.0-only)**. The license text is included in [LICENSE](LICENSE).

## RogueRefract

[Celzor/RogueRefract](https://github.com/Celzor/RogueRefract) is the principal implementation and asset source, distributed under AGPL-3.0-only.

- `public/assets/refract-icon.png` and `public/favicon.svg`: reused Refract branding assets.
- `public/refract-activity.js`: the official Refract activity helper, reused from RogueRefract.
- `src/audio.js`: adapted gesture-unlocked Web Audio engine, with newly composed retro coin clinks, bleeps, purchase arpeggios, and a low-pass filter.
- `src/arena.js`: retains the tilted orbital projection and participant identity approach from RogueRefract. The low-resolution tabletop, animated machine sprites, crops, avatar chips, and pixel harvesting effects are original Refract Idlers artwork.
- `src/icons.js` and `public/assets/pixel-core.svg`: original pixel machine and prism artwork for Refract Idlers.
- `src/activity.js`: adapted from RogueRefract's authenticated activity bridge, with an Idlers-specific protocol identifier and integration.
- Development, static hosting, and test patterns also follow the companion project.

The Refract name and brand mark remain with their owner. Their inclusion does not transfer trademark ownership.

## Refract Tic-tac-toe

[Celzor/refract-tack-toe](https://github.com/Celzor/refract-tack-toe), distributed under GPL v3, provides the activity architecture reference: authenticated participant identities, a coordinating browser, shared snapshots, late-join synchronization, and a local multi-frame relay preview. Its README and integration design informed this project; no source files from that repository were copied into this implementation.

## Refract Idlers

The LRC economy, incremental generators, round rewards, three-branch skill tree, personal prestige rules, and game interface are implemented for Refract Idlers.

## Fonts

The retro interface self-hosts these unmodified regular-weight TrueType fonts from the official [Google Fonts repository](https://github.com/google/fonts). Font loading makes no external requests. Both fonts are distributed under the SIL Open Font License 1.1, separate from the application license.

- **Press Start 2P**, designed by CodeMan38: `public/fonts/press-start-2p.ttf`, 118,204 bytes, normal style, weight 400. Copyright 2012 The Press Start 2P Project Authors, with Reserved Font Name "Press Start 2P". [Official source](https://github.com/google/fonts/tree/main/ofl/pressstart2p); retained license: [press-start-2p-OFL.txt](public/fonts/press-start-2p-OFL.txt). Source Git blob: `39adf42efa597906e53be689474ac82214112124`.
- **VT323**, designed by Peter Hull: `public/fonts/vt323.ttf`, 153,116 bytes, normal style, weight 400. Copyright 2011 The VT323 Project Authors. [Official source](https://github.com/google/fonts/tree/main/ofl/vt323); retained license: [vt323-OFL.txt](public/fonts/vt323-OFL.txt). Source Git blob: `afa69098f15bf64849d397f133d9467486904053`.

The font filenames are shortened for local asset paths; the font data and embedded family names are unchanged.
