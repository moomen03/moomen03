# GitHub Identity System — Architecture & Roadmap
### For: github.com/moomen03

This is a GitHub-only, self-hosted "living dashboard" system: GitHub Actions
pulls this account's own data from the GitHub API, computes a structured
identity model from it, renders that model into six SVG panels, and rewrites
`README.md` — all inside the repo, on a schedule, with no external services.

Current real data on this account (fetched to design against, not
hardcoded): **2 repositories** (`Jordan-Car-Price-Analysis-2023` — Jupyter
Notebook, `rag-system-project` — Python), **2 followers**, **4 following**,
one achievement (**Pair Extraordinaire**). The system is built to look
intentional at this size and to scale automatically as repos, stars, and
contributions grow — nothing is hardcoded to "2 repos".

---

## 1. System architecture

```
                     ┌─────────────────────────┐
  schedule/push  ───▶│   GitHub Actions runner  │
                     └────────────┬─────────────┘
                                  │
                 ┌────────────────┼────────────────┐
                 ▼                                  │
      ① fetch-data.ts                                │
      GitHub REST + GraphQL                          │
      (api.github.com only)                          │
                 │                                    │
                 ▼                                    │
      data/cache/raw-snapshot.json                    │
                 │                                    │
                 ▼                                    │
      ② identity-engine.ts                            │
      pure transform, deterministic                   │
                 │                                    │
                 ▼                                    │
      data/cache/identity.json  ──── diff check ──────┘
                 │                    (changed? y/n)
                 ▼
      ③ svg/index.ts  →  assets/svg/*.svg  (6 files)
                 │
                 ▼
      ④ render-readme.ts  →  README.md
                 │
                 ▼
      ⑤ git commit + push  (only if identity.json changed)
```

Four layers, each a separate concern, each independently testable:

| Layer | File(s) | Responsibility |
|---|---|---|
| **Automation** | `.github/workflows/update-profile.yml` | scheduling, triggering, committing |
| **Data Extraction** | `scripts/fetch-data.ts`, `scripts/lib/github-client.ts` | the only code allowed to make network calls, and only to `api.github.com` |
| **Identity Engine** | `scripts/identity-engine.ts`, `scripts/types.ts` | raw JSON → `DeveloperIdentity` model, pure functions, no I/O side effects beyond reading/writing cache |
| **Visual System** | `scripts/svg/*.ts` | `DeveloperIdentity` → SVG strings, one file per visualization |
| **README System** | `scripts/render-readme.ts`, `README.template.md` | template + identity → `README.md` |

---

## 2. Folder structure (as delivered)

```
github-identity-system/
├── .github/workflows/
│   └── update-profile.yml        # the automation engine
├── scripts/
│   ├── types.ts                  # DeveloperIdentity schema + raw data shapes
│   ├── lib/
│   │   └── github-client.ts      # thin REST+GraphQL client, api.github.com only
│   ├── fetch-data.ts             # Data Extraction Layer
│   ├── identity-engine.ts        # Identity Engine (core logic)
│   ├── render-readme.ts          # README System
│   └── svg/
│       ├── theme.ts              # shared colors/fonts/helpers
│       ├── heatmap.ts            # contribution heatmap reinterpretation
│       ├── network-graph.ts      # repository network graph
│       ├── timeline.ts           # repository timeline
│       ├── language-fingerprint.ts
│       ├── counters.ts           # dynamic counters
│       ├── activity-flow.ts      # animated PR/issue flow
│       └── index.ts              # orchestrator: identity.json → 6 SVGs
├── README.template.md            # static shell with PANEL markers
├── data/cache/
│   ├── achievements.json         # manual override (see §6)
│   └── (generated at runtime: raw-snapshot.json, identity.json, identity.changed)
├── assets/svg/                   # generated at runtime, committed by the bot
├── package.json
└── tsconfig.json
```

---

## 3. Identity model schema

This is the contract between the Identity Engine and the Visual System.
Every SVG renderer takes a slice of this and nothing else — no renderer
reaches back into raw GitHub data.

```ts
DeveloperIdentity {
  generatedAt: string
  login: string
  displayName: string | null
  accountAgeInDays: number
  followers: number
  following: number
  achievements: string[]

  activityMap: {
    days: { date, count, intensity: 0-4 }[]
    totalContributions, currentStreak, longestStreak
    busiestWeekday, busiestHourBucket
  }

  repositoryGraph: {
    nodes: { id, name, language, stars, forks, sizeKB, ageInDays, lastPushDays, topics }[]
    edges: { source, target, weight }[]   // shared language/topics
    clusters: ProjectCluster[]
  }

  languageFingerprint: { language, bytes, percentage, repoCount }[]

  contributionDynamics: {
    totalCommitsLastYear, totalPRs, mergedPRs, prMergeRate,
    totalIssues, closedIssues, issueCloseRate,
    avgAdditionsPerPR, avgDeletionsPerPR,
    velocityTrend: "accelerating" | "steady" | "cooling"
  }

  projectClusters: { id, label, repoIds }[]
}
```

Full type definitions with comments are in `scripts/types.ts`.

---

## 4. Visual system (SVG engine)

Six modular, independently-callable renderers, all pure functions
`(identity slice) → svg string`, all themed from one shared `theme.ts`:

1. **`heatmap.ts`** — contribution calendar reinterpreted as a radial-pulse
   grid; the most recent active day gets an animated pulse ring so the
   profile visibly "breathes" rather than looking like a static badge.
2. **`network-graph.ts`** — repos as nodes (radius = stars), edges weighted
   by shared language/topics, deterministic circular layout so output is
   stable between runs. Repos pushed in the last 90 days get a pulsing ring.
3. **`timeline.ts`** — one bar per repo spanning creation → last push on a
   shared time axis.
4. **`language-fingerprint.ts`** — single stacked bar (GitHub's own
   language-bar convention) plus an exact-percentage legend.
5. **`counters.ts`** — an 8-cell stat grid; every number maps 1:1 to a
   `DeveloperIdentity` field, with auto-shrinking text so nothing overflows.
6. **`activity-flow.ts`** — two animated lanes (PRs opened→merged, issues
   opened→closed) where dot speed is derived from real merge/close rates,
   not decorative.

All are pure SVG (no raster), all use CSS-var-free inline styling so they
render identically whether viewed on GitHub, raw.githubusercontent.com, or
opened directly in a browser. `svg/index.ts` is the only orchestrator —
adding a 7th visualization is "write one render function, add one line."

---

## 5. README dashboard structure

`README.template.md` is the **source of truth** you hand-edit. It contains
marker pairs like:

```html
<!--PANEL:HEATMAP:START-->
<!--PANEL:HEATMAP:END-->
```

`render-readme.ts` replaces the content between each pair with an `<img>`
pointing at the matching file in `assets/svg/` by **relative repo path**
(e.g. `assets/svg/heatmap.svg`). Two things make this the correct choice:

1. GitHub's profile README renderer strips `<script>`/`<style>` outside
   images but **honours animation inside an `<img>`-embedded SVG** (SMIL and
   inline `<style>` both run — this is how the popular "snake" contribution
   animations work), which is why every panel is a self-contained animated
   SVG rather than inline markup.
2. GitHub proxies README images through `camo.githubusercontent.com`, which
   **strips query strings and caches on the content hash**. So a
   `?cache=timestamp` param does nothing except add a spurious diff to every
   commit — which would defeat diff-gating. Cache-busting is automatic: when
   the SVG bytes change, Camo's hash changes and the fresh image is served.

Everything outside the markers — your intro line, a "how this works" blurb,
links — survives regeneration untouched.

---

## 6. Automation (GitHub Actions)

`.github/workflows/update-profile.yml`:

- **Triggers:** `schedule` (every 6 hours — tune to your real activity
  rate), `push` to `main` (excluding the bot's own output paths, to avoid a
  self-triggering loop), and `workflow_dispatch` for manual runs.
- **Pipeline:** checkout → install → build TS → fetch data → compute
  identity → **diff check** → render SVGs → render README → commit only if
  `identity.changed == true`.
- **Permissions:** `contents: write`, using the default `GITHUB_TOKEN` —
  no PAT, no secrets to manage.
- **Concurrency group** prevents overlapping runs from racing on the commit.

One deliberate manual step: GitHub **achievements** (like "Pair
Extraordinaire") have no REST/GraphQL field as of this writing — they only
exist on the rendered profile page. Rather than scrape HTML (fragile, and
arguably outside "structured API data"), `data/cache/achievements.json` is
a small manually-maintained list you update when you earn a new one. This
is the one intentional exception to full automation, and it's documented
in code (`fetch-data.ts`) so it's never mistaken for a bug.

---

## 7. Caching & performance strategy

- **Deterministic identity computation:** `identity-engine.ts` is a pure
  function of `raw-snapshot.json` except for the `generatedAt` timestamp.
  That means two runs against unchanged GitHub data produce byte-identical
  output (modulo that one field) — which is what makes a real diff check
  possible instead of "commit every run."
- **Diff-gated rendering:** `identity.changed` (a plain `"true"/"false"`
  file) is computed by stripping `generatedAt` and comparing JSON strings
  against the previous run. SVG rendering, README rendering, and the git
  commit are all skipped when nothing changed — so an inactive week costs
  the Action a few seconds instead of a wasted commit + render cycle.
- **Bounded, resilient API calls:** `github-client.ts` retries on secondary
  rate limits and transient 5xx with bounded exponential backoff (respecting
  `Retry-After` / `x-ratelimit-reset`, capped at 30s), so a run can never
  hang the Action. Repo language lookups are one call per repo (there is no
  bulk endpoint); PR/issue history uses the Search API — which returns
  `{ items: [...] }` and is paginated by a dedicated `searchAllPages` helper,
  capped at 5 pages, well under the Search rate limit (30 req/min).
- **No per-PR diff stats:** additions/deletions per PR would need one API
  call per PR, which doesn't scale as PR count grows. `avgAdditionsPerPR` /
  `avgDeletionsPerPR` are wired into the schema and engine now so this is a
  one-line addition later (see `fetch-data.ts` comment) without a schema
  change — but it isn't fetched today, and the flow diagram doesn't imply
  precision it doesn't have.
- **Content-hash cache-busting (not query strings):** README SVGs use
  relative paths with no `?cache=` param. Camo caches on content, so a byte
  change to an SVG is what invalidates the cached image — and unchanged runs
  produce byte-identical SVGs, so nothing is committed. This is what keeps
  diff-gating honest instead of committing on every scheduled run.

---

## 8. Implementation roadmap

1. **Create the repo** named exactly `moomen03/moomen03` (GitHub's special
   "profile README" repo — must match your username exactly, must be
   public).
2. **Copy this scaffold in**, run `npm install`.
3. **Local dry run** (already done during this design — see below) to
   confirm renderers compile and produce valid SVG before touching Actions.
4. **Push to `main`.** The workflow's `push` trigger fires the first run
   automatically; alternatively use *Actions → Update Living Profile
   Dashboard → Run workflow* for a manual first run.
5. **Verify the first commit**: `README.md`, `assets/svg/*.svg`, and
   `data/cache/identity.json` should appear, committed by
   `profile-dashboard-bot` (actions bot identity).
6. **Tune the schedule** in the workflow's `cron` line once you know your
   real commit cadence — no reason to run hourly for a few pushes a week.
7. **Grow the data set naturally**: as repos, stars, PRs, and issues
   accumulate, `repositoryGraph`, `languageFingerprint`, and
   `contributionDynamics` all densify automatically — no code changes.
8. **Optional next iteration**: add the per-PR additions/deletions fetch
   (§7) once PR volume justifies the extra API calls; add a 7th SVG panel
   by writing one `render*.ts` function and one line in `svg/index.ts`.

---

## 9. Why this satisfies the constraints

- **GitHub-only data:** `lib/github-client.ts` is the single file in the
  entire codebase allowed to call `fetch()`, and it only ever targets
  `api.github.com`. No third-party APIs, no external services, no
  hand-maintained "stats" beyond the one documented achievements exception.
- **No invented metrics:** every field in `DeveloperIdentity` traces to a
  specific GitHub API response; `scripts/types.ts` comments document the
  source endpoint for anything non-obvious.
- **Fully self-contained:** the pipeline runs entirely inside GitHub
  Actions, reads/writes only within the repo, and requires no secrets
  beyond the default `GITHUB_TOKEN`.
