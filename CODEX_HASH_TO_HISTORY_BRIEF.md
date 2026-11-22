# Brief: Notes app — remove `#` from URLs (hash routing → history routing)

## Context
- Project: /data/home/notes-app (inotion-notes, https://inotion.eu.cc)
- The app currently uses hash routing: URLs look like `inotion.eu.cc/#/notes`.
- The Worker ALREADY serves index.html for unknown paths: wrangler.jsonc has
  `"assets": {"directory": "./dist", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"]}`.
  Do NOT change wrangler.jsonc or anything under worker/.

## Task
Switch the frontend from hash routing to history (pathname) routing so URLs
become clean: `/notes`, `/pinned`, `/archived`, `/trash`, `/folder/<id>`,
`/tag/<id>`, `/search?q=...`. No `#` anywhere in app URLs.

## Files (known hash usages — search the whole src/ for more)
- src/lib/inotion/route.ts — parseHash, routeToHash, useRoute (hashchange),
  navigate (sets location.hash). Rewrite to pathname+search: parse the Route
  from window.location.pathname + window.location.search; useRoute must listen
  to `popstate`; navigate must use history.pushState / history.replaceState
  and notify listeners. Keep the Route type and all route kinds unchanged.
- src/components/inotion/app.tsx:47 — `window.location.hash = '#/notes'`
  → navigate to `/notes`.
- src/components/inotion/workspace.tsx:66 — `if (!window.location.hash)
  window.location.replace('#/notes')` → if pathname is `/`, redirect to `/notes`.
- Grep src/ for `location.hash`, `hashchange`, `#/` and update every hit.
  Do not leave any `#/...` app link.

## Rules
- Behaviour must stay identical: back/forward buttons, deep links, refresh on
  any route, login redirect to the current route, note open/close via query
  param `note`, search scope params. Only the URL format changes.
- Legacy hash URLs must keep working: on load, if location.hash starts with
  `#/`, redirect (replace) to the equivalent clean path.
- Do NOT change features, UI, styles, API calls, or the Worker.
- Do NOT deploy. Do NOT change wrangler.jsonc, migrations, or secrets.
- If you get stuck on anything, STOP at the DONE marker below and write
  exactly what you need — do not skip ahead or improvise a different design.

## Verify (all must pass, run them yourself)
- npm test, npm run typecheck, npm run build — all exit 0. Run each command
  directly (no pipe to tail/head before checking the exit code — piping hides
  failures). Check the real exit code of every command.
- Add or update a test for route parsing (parse path+query → Route, and
  navigate → clean URL) if no route test exists yet.

## Done marker
Write HASH_TO_HISTORY_DONE.md in /data/home/notes-app listing: files changed,
test/typecheck/build results, and how you verified legacy `#/...` URLs redirect.
