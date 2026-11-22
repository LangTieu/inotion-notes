# GitHub workflow — inotion-notes

Repo: https://github.com/LangTieu/inotion-notes (private, branch `main`)

## Roles

- **IB4 (`/data/home/notes-app`)** — source of truth for code. Code, test,
  and deploy happen here. IB4 has NO GitHub auth, so it never pushes or
  pulls directly.
- **VM (`~/workspace/notes-app`)** — liaison + mirror. Pushes to GitHub via
  the `custom.github` PAT (LangTieu, full `repo` scope) and the helper
  `~/workspace/custom-connectors/custom.github/bin/github_api.py`.
  Push script: `~/workspace/notes-app/scratch/push_github.py`
  (Git Data API: blobs → tree → commit → ref, one commit per chunk).
- **GitHub** — the coordination point. No more hand sync of individual files
  between machines; a phase is "synced" only when its commit is on `main`.
- **Connector (Muse GitHub App, lethienhieuhcm-web)** — has NO access to
  this repo (`list_commits` → 404). Do not rely on it for this repo; all
  pushes/reads go through `custom.github` (LangTieu PAT).

## After each phase

1. On IB4: `npm test && npm run typecheck && npm run build`
   (all must exit 0, run bare, no pipes), then `npm run deploy`.
2. Sync changed files IB4 → VM (instabox upload/download, sha check).
3. On VM: commit + push via the API helper (see push script), one commit
   per logical chunk.
4. Verify: remote tree (recursive) vs IB4 `git ls-tree -r HEAD` — same 87
   paths, same blob shas; `.gitignore` must match IB4's working tree.

## Never commit

Secrets (`.env*`, `.dev.vars`, any key/token/password value), `*.log`,
`node_modules/`, `dist/`, `.wrangler/`, `refs/` (45 MB third-party EdgeEver
reference copy), `design/` (v0 output snapshot — the live UI is `src/`).
`wrangler.jsonc` is safe: it holds only resource IDs, no secrets.

## Notes

- `migrations/0002_seed_test_user.sql` seeds a TEST-ONLY user (password in
  the file's own comment). It was already applied to the live D1; rotate or
  remove that test user before any wider use.
- First push (22/11): 6 commits (bootstrap README + 4 chunks + `.gitignore`
  sync), HEAD `8ec56c9`. Empty repos reject the git-blobs API (409) — the
  first file must go through the Contents API to bootstrap `main`.
