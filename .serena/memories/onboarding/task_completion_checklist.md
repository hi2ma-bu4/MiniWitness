# Task completion checklist
1. If source code changed, run at least `npm run test:unit` (or `npm run test` when build impact is broad).
2. For API/type changes, ensure `npm run build` succeeds and `dist/*.d.ts` generation remains valid.
3. For UI/canvas changes, manually verify `test/index.html` and/or `test/game/index.html` behavior in browser.
4. Confirm no unintended file changes with `git status --short` and inspect diffs for touched files.
5. Keep coding style consistent with existing TS conventions (tabs, JSDoc where needed, strict typing).
6. Document any skipped verification steps explicitly in the handoff (e.g., tests not run due to environment constraints).