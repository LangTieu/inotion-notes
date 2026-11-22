# GitHub workflow — inotion-notes

Repo: https://github.com/lethienhieuhcm-web/inotion-notes (private, branch `main`)

## Roles

- **IB4 (`/data/home/notes-app`)** — source of truth. Code, test, and deploy
  happen here. After each finished phase: commit + push to GitHub.
- **VM (`~/workspace/notes-app`)** — mirror for review. Pull from GitHub to
  verify; never push from the VM unless IB4 is down.
- **GitHub** — the coordination point. No more hand sync of individual files
  between machines; a phase is "synced" only when its commit is on `main`.

## After each phase (on IB4)

```bash
cd /data/home/notes-app
npm test && npm run typecheck && npm run build   # all must exit 0, run bare (no pipes)
git add -A && git commit -m "Phase N: <what changed>"
git push origin main
npm run deploy   # only after tests pass; ALWAYS npm run deploy, never bare wrangler deploy
```

## Verify on VM

```bash
cd ~/workspace/notes-app && git pull --ff-only
git log --oneline -3          # commit sha must match IB4
git status --short            # must be clean
```

## Never commit

Secrets (`.env*`, `.dev.vars`, any key/token/password value), `*.log`,
`node_modules/`, `dist/`, `.wrangler/`, `refs/` (45 MB third-party EdgeEver
reference copy), `design/` (v0 output snapshot — the live UI is `src/`).
`wrangler.jsonc` is safe: it holds only resource IDs, no secrets.

## Notes

- `migrations/0002_seed_test_user.sql` seeds a TEST-ONLY user (password in
  the file's own comment). It was already applied to the live D1; rotate or
  remove that test user before any wider use.
- Repo creation + first push need the GitHub App installed on the repo
  (the App cannot create repos under a personal account).
