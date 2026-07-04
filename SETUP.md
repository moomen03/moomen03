# Setup — GitHub Living Profile Dashboard

A GitHub-native system that turns `moomen03`'s profile into a self-updating
engineering dashboard. Every number is computed from this account's own
GitHub data via GitHub Actions — no external services, no external data.

See `ARCHITECTURE.md` for the full design. This file is the 5-minute setup.

## Prerequisites

- The repo must be named **exactly** `moomen03/moomen03` and be **public**
  (this is GitHub's special "profile README" repo).
- Node.js 20+ (only needed if you want to run the pipeline locally).

## Install (one time)

1. Create the `moomen03/moomen03` repo on GitHub.
2. Copy everything in this folder into it.
3. Commit and push to `main`.

That's it. The workflow's `push` trigger fires the first run automatically.
No secrets to configure — it uses the default `GITHUB_TOKEN` that Actions
provides. If you'd rather trigger it by hand the first time:
**Actions → Update Living Profile Dashboard → Run workflow**.

## What happens on each run

```
fetch GitHub data → compute identity model → (did anything change?)
  → render 6 SVGs → render README.md → commit + push
```

The commit is skipped entirely when your GitHub data hasn't changed since
the last run, so an inactive week costs a few seconds instead of a noisy
commit.

## Run it locally (optional dry run)

```bash
npm install
npm run build

# The pipeline reads two env vars. Use a personal access token with
# public_repo scope for local runs (Actions supplies these automatically).
export GITHUB_LOGIN=moomen03
export GITHUB_TOKEN=ghp_your_token_here

npm run fetch        # -> data/cache/raw-snapshot.json
npm run identity     # -> data/cache/identity.json
npm run render:svg   # -> assets/svg/*.svg
npm run render:readme # -> README.md
```

Or all at once: `npm run pipeline`.

## Tuning

- **Schedule:** edit the `cron` line in `.github/workflows/update-profile.yml`.
  Default is every 6 hours; daily (`0 6 * * *`) is plenty for most accounts.
- **Achievements:** GitHub has no API for achievement badges, so
  `data/cache/achievements.json` is a small list you update by hand when you
  earn a new one. This is the only non-automated piece, and it's documented
  in `scripts/fetch-data.ts`.
- **Add a 7th visual:** write one `renderX()` in `scripts/svg/`, add one line
  to `scripts/svg/index.ts`, and one panel marker to `README.template.md`.

## Files you edit vs. files the bot owns

| You edit | The bot regenerates (don't hand-edit) |
|---|---|
| `README.template.md` | `README.md` |
| `scripts/**` | `assets/svg/*.svg` |
| `data/cache/achievements.json` | `data/cache/identity.json` |
