# Phase 4 completion report

## Files created or modified

| File | Change | `wc -l` |
|---|---|---:|
| `src/api.ts` | Client export walks every page of active, archived, and trashed notes; deduplicates notes and includes folders/tags in JSON. | 38 |
| `src/NotesWorkspace.tsx` | Export action, paginated “load more”, live save/count status and clearer accessible labels. Existing focus refresh and explicit conflict reload/overwrite actions remain in use. | 81 |
| `src/notes.css` | Visible keyboard focus, mobile JSON export control, and page navigation styles. | 7 |
| `worker/e2e.test.ts` | Authenticated end-to-end lifecycle using in-memory SQLite and mocked B2, including two independent sessions and a stale revision conflict. | 73 |

Actual inventory command output:

```text
   38 src/api.ts
   81 src/NotesWorkspace.tsx
    7 src/notes.css
   73 worker/e2e.test.ts
  199 total
```

No migration or Wrangler configuration was changed. Export is generated in the logged-in browser from authenticated API pages; note bodies in the file are decrypted by the existing authenticated API. The JSON contains active, archived, and trashed notes, folders, and tags. The app has no logging statements that emit passwords, session cookies, decrypted note bodies, or B2 credentials.

## Verification output

Commands used the existing read-only package tree at `/data/home/webmail-r3-codex/node_modules`; no install was run.

`npm test` — exit code 0:

```text
> inotion-notes@0.1.0 test
> vitest run

 RUN  v5.1.0 /data/home/notes-app

 Test Files  6 passed (6)
      Tests  19 passed (19)
   Start at  04:37:31
   Duration  438ms (tests 69%, transform 17%, import 12%, worker 3%)
```

`npm run typecheck` — exit code 0:

```text
> inotion-notes@0.1.0 typecheck
> tsc -p . && tsc -p tsconfig.worker.json
```

`npm run build` — exit code 0:

```text
> inotion-notes@0.1.0 build
> vite build

vite v8.3.8 building client environment for production...
transforming...
✓ 19 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.40 kB │ gzip:  0.28 kB
dist/assets/index-AtnMFUpO.css   16.17 kB │ gzip:  4.51 kB
dist/assets/index-BXRc4Cm-.js   238.66 kB │ gzip: 74.28 kB

✓ built in 347ms
```

Source/config safety scan (excluding `NOTES_PLAN.md` and `refs/`, which were not changed):

```text
rg -n -i 'webmail' src worker migrations package.json wrangler.jsonc
rg_exit=1

rg -n '(AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|[0-9a-fA-F]{64})' src worker migrations package.json wrangler.jsonc
rg_exit=1
```

Both scans found no matches. A separate literal scan found only test fixtures (`TEST_ONLY...`, `wrong-password`, `test-key`, and a deterministic test AES key), all synthetic values in tests; no live credential was read or added. URLs in app source are the app domain, local development origins, Google Fonts, and the B2 S3 endpoint. No prior-project domain or project name was found in source/config.

## Manual deploy approval checklist — not run

The D1 database is already `inotion-notes` with ID `d765bb72-58b0-4dbe-8ec9-8d68ab4dbe88`. Phase 1–3 reports say remote migrations 0001–0003 were applied; migration `0004_attachments.sql` remains to apply remotely. `package-lock.json` exists. No secret, migration, publish, or remote command was run in Phase 4.

After Henrry reviews and liaison explicitly approves deployment:

1. Confirm the Cloudflare account, Worker `inotion-notes`, D1 `inotion-notes`, custom domain `inotion.eu.cc`, and private B2 bucket `inotion-notes-attachments` are the intended isolated resources.
2. Load these six values into Worker secrets using `npx wrangler secret put <NAME>` and enter each value only at Wrangler’s prompt: `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_S3_ENDPOINT`, `ENCRYPTION_KEY`, and `ALLOWED_EMAILS`. Obtain B2 values from the protected credential file; never paste values into shell history, this repository, or logs. Note: `wrangler.jsonc` currently defines `ALLOWED_EMAILS` under `vars`; reconcile that existing binding before setting it as a secret (remove the plaintext var only with explicit approval, or retain it as a non-secret Worker variable).
3. Review pending migrations, then apply them to the remote D1 only after approval: `npx wrangler d1 migrations apply inotion-notes --remote`. Based on the recorded state, this should apply migration 0004.
4. Review the final diff and run `npm test`, `npm run typecheck`, and `npm run build` again immediately before publish.
5. After explicit publish approval, run `npm run deploy` (the script builds first).
6. Live smoke test `https://inotion.eu.cc/api/config`; log in/out; create and edit a folder, tag, and note; verify title and decrypted-body search; verify note `body_md` is encrypted in D1; upload, view, and delete an allowed attachment; test a two-session edit conflict; verify trash/restore/permanent deletion; log out and back in to confirm persistence. Verify that a different account cannot read the note or attachment.

PHASE4 DONE
