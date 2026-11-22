# Change Password Done

## Files
- `worker/index.ts` — POST endpoint, session and origin checks, 256 KB JSON cap, password verification/update, and revocation of other sessions.
- `worker/auth.test.ts` — endpoint coverage for successful change, wrong current password, missing session, short new password, and revoking a second session.
- `src/lib/inotion/api.ts` — API method for the real endpoint.
- `src/components/inotion/sidebar.tsx` — account footer link and change password dialog with client validation and request states.

## wc -l
```text
  117 worker/index.ts
  114 worker/auth.test.ts
  353 src/lib/inotion/api.ts
  539 src/components/inotion/sidebar.tsx
 1123 total
```

## Verification output

### `npm test` — exit 0
```text
> inotion-notes@0.1.0 test
> vitest run

 RUN  v5.1.0 /data/home/notes-app

 Test Files  6 passed (6)
      Tests  23 passed (23)
   Start at  05:59:26
   Duration  764ms (tests 63%, transform 23%, import 13%, worker 2%)
```

### `npm run typecheck` — exit 0
```text
> inotion-notes@0.1.0 typecheck
> tsc -p . && tsc -p tsconfig.worker.json
```

### `npm run build` — exit 0
```text
> inotion-notes@0.1.0 build
> vite build

vite v8.3.8 building client environment for production...
transforming...
✓ 2499 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.40 kB │ gzip:   0.27 kB
dist/assets/index-Dny0eGFb.css  197.52 kB │ gzip:  30.58 kB
dist/assets/index-Cf0ktvdE.js   653.89 kB │ gzip: 200.51 kB

[plugin builtin:vite-reporter] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust build.chunkSizeWarningLimit to change the warning threshold.
✓ built in 973ms
```

## Hot spots
- Build succeeds with a Vite warning: minified JavaScript bundle is 653.89 kB, above the 500 kB warning threshold.
- No database schema or remote database was changed.
