# MiniWitness project overview
- Purpose: TypeScript library for generating, rendering, serializing, and validating The Witness-like line puzzles.
- Main public API: `WitnessCore`, `WitnessUI`, `PuzzleGenerator`, `PuzzleValidator`, `PuzzleSerializer` exported from `src/index.ts`.
- Runtime targets: Browser ESM (library + worker support), plus Node-based test/build tooling.
- Build artifacts: `dist/MiniWitness.js`, `dist/MiniWitness.min.js`, `dist/MiniWitness.d.ts`.
- License: Apache-2.0.
- Package manager/runtime expectations: Node and npm pinned in `package.json` Volta (`node 24.13.0`, `npm 11.8.0`).

## High-level structure
- `src/`
  - `index.ts`: public exports + `WitnessCore` facade + worker message bridge.
  - `generator.ts`: puzzle generation algorithm.
  - `validator.ts`: solution validation + difficulty calculation.
  - `ui.ts`: canvas rendering and pointer input handling.
  - `serializer.ts`: compact puzzle/share serialization.
  - `types.ts`: enums/interfaces for puzzle model and options.
  - `grid.ts`, `rng.ts`: model + RNG helpers.
- `dev/build.mjs`: esbuild + dts-bundle-generator build pipeline.
- `test/node/*.test.ts`: unit tests for generator/validator/ui/serializer/features.
- `test/index.html`: playground/test UI page.
- `test/game/*`: game-style scene page built on top of library.

## Notes
- No README present in repo root at onboarding time.
- `.serena` exists for tool/project metadata.