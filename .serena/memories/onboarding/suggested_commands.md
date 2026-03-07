# Suggested commands (Windows / PowerShell)
## Core project commands
- Install deps: `npm install`
- Build library: `npm run build`
- Run unit tests only: `npm run test:unit`
- Full test flow (build + tests): `npm run test`

## Useful local checks
- Inspect package scripts: `Get-Content package.json`
- Quick tree (top level): `Get-ChildItem`
- Recursive file listing: `Get-ChildItem -Recurse -File`
- Search text in repo: `Get-ChildItem -Recurse | Select-String -Pattern "<pattern>"`
- Git status: `git status --short`
- Git diff for file: `git diff -- <path>`

## Entrypoints / manual run
- Browser playground page: open `test/index.html`
- Game-like page: open `test/game/index.html`

## Build internals
- Build script entry: `node ./dev/build.mjs`
- Type bundle generation done via: `npx dts-bundle-generator ...` (called from build script).

## Environment notes
- Volta versions are pinned in `package.json`; if runtime mismatch occurs, align Node/npm accordingly.