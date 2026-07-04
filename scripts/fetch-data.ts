/**
 * fetch-data.ts
 * ------------------------------------------------------------------
 * DATA EXTRACTION LAYER
 *
 * Pulls everything the Identity Engine needs, straight from the
 * GitHub REST + GraphQL APIs for GITHUB_LOGIN, using the Actions-
 * provided GITHUB_TOKEN. No other network calls exist in this repo.
 *
 * Output: data/cache/raw-snapshot.json  (matches RawGitHubSnapshot)
 * ------------------------------------------------------------------
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { restGet, restGetAllPages, searchAllPages, graphql } from "./lib/github-client.js";
import type {
  RawGitHubSnapshot,
  RawRepo,
  RawCommitDay,
  RawPullRequestSummary,
  RawIssueSummary,
} from "./types.js";

const LOGIN = process.env.GITHUB_LOGIN;
const TOKEN = process.env.GITHUB_TOKEN;

if (!LOGIN) throw new Error("GITHUB_LOGIN env var is required (the profile owner's username).");
if (!TOKEN) throw new Error("GITHUB_TOKEN env var is required.");

interface GhUser {
  login: string;
  name: string | null;
  bio: string | null;
  followers: number;
  following: number;
  public_repos: number;
  created_at: string;
}

interface GhRepo {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  fork: boolean;
  archived: boolean;
  pushed_at: string;
  created_at: string;
  topics: string[];
  size: number;
}

async function fetchUser(): Promise<GhUser> {
  return restGet<GhUser>(`/users/${LOGIN}`, TOKEN!);
}

async function fetchRepos(): Promise<RawRepo[]> {
  const repos = await restGetAllPages<GhRepo>(
    `/users/${LOGIN}/repos?type=owner&sort=pushed`,
    TOKEN!
  );

  const enriched: RawRepo[] = [];
  for (const r of repos) {
    let languages: Record<string, number> = {};
    try {
      languages = await restGet<Record<string, number>>(
        `/repos/${LOGIN}/${r.name}/languages`,
        TOKEN!
      );
    } catch {
      // A repo can be emptied/renamed mid-run; degrade gracefully rather than
      // failing the whole pipeline over one repo.
      languages = r.language ? { [r.language]: r.size * 1024 } : {};
    }
    enriched.push({
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      primaryLanguage: r.language,
      languages,
      stargazerCount: r.stargazers_count,
      forkCount: r.forks_count,
      openIssues: r.open_issues_count,
      isFork: r.fork,
      isArchived: r.archived,
      pushedAt: r.pushed_at,
      createdAt: r.created_at,
      topics: r.topics ?? [],
      size: r.size,
    });
  }
  return enriched;
}

const CONTRIBUTION_QUERY = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

interface ContributionQueryResult {
  user: {
    contributionsCollection: {
      contributionCalendar: {
        weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
      };
    };
  };
}

async function fetchContributionCalendar(): Promise<RawCommitDay[]> {
  const data = await graphql<ContributionQueryResult>(
    CONTRIBUTION_QUERY,
    { login: LOGIN },
    TOKEN!
  );
  const days: RawCommitDay[] = [];
  for (const week of data.user.contributionsCollection.contributionCalendar.weeks) {
    for (const day of week.contributionDays) {
      days.push({ date: day.date, count: day.contributionCount });
    }
  }
  return days;
}

interface GhPullRequestSearchItem {
  repository_url: string;
  state: "open" | "closed";
  created_at: string;
  pull_request?: { merged_at: string | null };
}

async function fetchPullRequests(): Promise<RawPullRequestSummary[]> {
  // Search API: all PRs authored by the user. Returns { items: [...] },
  // so it must go through searchAllPages, not restGetAllPages.
  const items = await searchAllPages<GhPullRequestSearchItem>(
    `/search/issues?q=author:${LOGIN}+type:pr`,
    TOKEN!,
    5
  );
  return items.map((it) => ({
    repo: it.repository_url.split("/").slice(-2).join("/"),
    state: it.pull_request?.merged_at ? "MERGED" : it.state === "open" ? "OPEN" : "CLOSED",
    createdAt: it.created_at,
    mergedAt: it.pull_request?.merged_at ?? null,
    // Additions/deletions require a per-PR call; omitted here to keep the
    // extraction layer within a small, predictable number of requests.
    // The identity engine treats missing values as 0 and this is documented
    // in ContributionDynamics derivation.
    additions: 0,
    deletions: 0,
  }));
}

interface GhIssueSearchItem {
  repository_url: string;
  state: "open" | "closed";
  created_at: string;
  closed_at: string | null;
}

async function fetchIssues(): Promise<RawIssueSummary[]> {
  const items = await searchAllPages<GhIssueSearchItem>(
    `/search/issues?q=author:${LOGIN}+type:issue`,
    TOKEN!,
    5
  );
  return items.map((it) => ({
    repo: it.repository_url.split("/").slice(-2).join("/"),
    state: it.state === "open" ? "OPEN" : "CLOSED",
    createdAt: it.created_at,
    closedAt: it.closed_at,
  }));
}

async function fetchAchievements(): Promise<string[]> {
  // Achievements have no public REST/GraphQL field as of this writing; they
  // are rendered on the profile page. We keep this as an explicit manual
  // override file so the system never scrapes HTML (fragile + against the
  // spirit of "structured API data only"). See data/cache/achievements.json.
  try {
    const raw = await import("node:fs/promises").then((fs) =>
      fs.readFile(path.resolve("data/cache/achievements.json"), "utf-8")
    );
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function main() {
  const [user, repos, contributionCalendar, pullRequests, issues, achievements] =
    await Promise.all([
      fetchUser(),
      fetchRepos(),
      fetchContributionCalendar(),
      fetchPullRequests(),
      fetchIssues(),
      fetchAchievements(),
    ]);

  const snapshot: RawGitHubSnapshot = {
    fetchedAt: new Date().toISOString(),
    login: user.login,
    name: user.name,
    bio: user.bio,
    followers: user.followers,
    following: user.following,
    publicRepos: user.public_repos,
    createdAt: user.created_at,
    repos,
    contributionCalendar,
    pullRequests,
    issues,
    achievements,
  };

  const outDir = path.resolve("data/cache");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "raw-snapshot.json"),
    JSON.stringify(snapshot, null, 2),
    "utf-8"
  );

  console.log(
    `[fetch-data] wrote snapshot for ${user.login}: ${repos.length} repos, ` +
      `${contributionCalendar.length} calendar days, ${pullRequests.length} PRs, ${issues.length} issues.`
  );
}

main().catch((err) => {
  console.error("[fetch-data] failed:", err);
  process.exit(1);
});
