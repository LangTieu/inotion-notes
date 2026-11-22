# Hash to history routing

## Files changed

- `src/lib/inotion/route.ts` — route parsing and serialization now use pathname and query strings; navigation uses History API and listens for `popstate`; legacy `#/...` URLs are replaced with clean URLs on module load.
- `src/lib/inotion/route.test.ts` — covers pathname/query parsing, clean navigation URLs, and legacy hash replacement.
- `src/components/inotion/app.tsx` — sign-out returns to `/notes` through history navigation.
- `src/components/inotion/workspace.tsx` — `/` redirects to `/notes`.

## Verification

- `npm test` — passed (7 test files, 26 tests).
- `npm run typecheck` — passed.
- `npm run build` — passed. Vite reports its existing large-chunk advisory.
- Legacy redirect was verified by a route test that loads the route module with `location.hash` set to `#/search?q=hello+world&tag=t1` and asserts `history.replaceState` changes it to `/search?q=hello+world&tag=t1`.
- Searched `src/` for hash routing usages. Remaining `location.hash` and `#/` references are only the intentional legacy URL migration and its test.

No deployment was performed. Worker and Wrangler configuration were not changed.
