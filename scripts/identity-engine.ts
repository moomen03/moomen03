/**
 * identity-engine.ts
 * ------------------------------------------------------------------
 * IDENTITY ENGINE (core logic)
 *
 * Pure function pipeline: RawGitHubSnapshot -> DeveloperIdentity.
 * No network calls here, no randomness, no dates other than
 * `generatedAt` and values derived directly from the snapshot — the
 * same snapshot always produces the same identity model except for
 * that one timestamp field. That determinism is what makes the
 * "only commit when something real changed" caching strategy possible.
 * ------------------------------------------------------------------
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type {
  RawGitHubSnapshot,
  RawRepo,
  DeveloperIdentity,
  ActivityMap,
  ActivityMapEntry,
  RepositoryGraph,
  RepositoryNode,
  RepositoryEdge,
  ProjectCluster,
  LanguageFingerprint,
  ContributionDynamics,
} from "./types.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------- activityMap ----------

function buildActivityMap(snapshot: RawGitHubSnapshot): ActivityMap {
  const counts = snapshot.contributionCalendar.map((d) => d.count);
  const max = Math.max(1, ...counts);

  const days: ActivityMapEntry[] = snapshot.contributionCalendar.map((d) => {
    const ratio = d.count / max;
    let intensity: 0 | 1 | 2 | 3 | 4 = 0;
    if (d.count > 0) intensity = 1;
    if (ratio > 0.25) intensity = 2;
    if (ratio > 0.5) intensity = 3;
    if (ratio > 0.75) intensity = 4;
    return { date: d.date, count: d.count, intensity };
  });

  // Streaks
  let currentStreak = 0;
  let longestStreak = 0;
  let running = 0;
  for (const d of days) {
    if (d.count > 0) {
      running += 1;
      longestStreak = Math.max(longestStreak, running);
    } else {
      running = 0;
    }
  }
  // Current streak: count consecutive active days ending today. Today's
  // cell is often still 0 (the user hasn't committed *yet* today), which
  // would wrongly zero out an otherwise-live streak — so if the last day
  // is empty we skip it and measure the streak ending yesterday.
  let streakStart = days.length - 1;
  if (streakStart >= 0 && days[streakStart]!.count === 0) streakStart -= 1;
  for (let i = streakStart; i >= 0; i--) {
    if (days[i]!.count > 0) currentStreak += 1;
    else break;
  }

  // Busiest weekday
  const weekdayTotals = new Array(7).fill(0);
  for (const d of days) {
    const wd = new Date(d.date + "T00:00:00Z").getUTCDay();
    weekdayTotals[wd] += d.count;
  }
  const busiestIdx = weekdayTotals.indexOf(Math.max(...weekdayTotals));

  return {
    days,
    totalContributions: counts.reduce((a, b) => a + b, 0),
    currentStreak,
    longestStreak,
    busiestWeekday: WEEKDAYS[busiestIdx]!,
    busiestHourBucket: null, // requires commit timestamps not exposed by the calendar API
  };
}

// ---------- languageFingerprint ----------

function buildLanguageFingerprint(repos: RawRepo[]): LanguageFingerprint[] {
  const totals = new Map<string, { bytes: number; repoCount: number }>();
  for (const repo of repos) {
    if (repo.isFork) continue; // forks shouldn't inflate the fingerprint of a fork owner
    for (const [lang, bytes] of Object.entries(repo.languages)) {
      const entry = totals.get(lang) ?? { bytes: 0, repoCount: 0 };
      entry.bytes += bytes;
      entry.repoCount += 1;
      totals.set(lang, entry);
    }
  }
  const grandTotal = [...totals.values()].reduce((a, b) => a + b.bytes, 0) || 1;

  return [...totals.entries()]
    .map(([language, v]) => ({
      language,
      bytes: v.bytes,
      percentage: Math.round((v.bytes / grandTotal) * 1000) / 10,
      repoCount: v.repoCount,
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

// ---------- repositoryGraph + projectClusters ----------

function buildRepositoryGraph(repos: RawRepo[]): RepositoryGraph {
  const now = new Date();
  const nodes: RepositoryNode[] = repos
    .filter((r) => !r.isFork)
    .map((r) => ({
      id: r.name,
      name: r.name,
      language: r.primaryLanguage,
      stars: r.stargazerCount,
      forks: r.forkCount,
      sizeKB: r.size,
      ageInDays: daysBetween(new Date(r.createdAt), now),
      lastPushDays: daysBetween(new Date(r.pushedAt), now),
      topics: r.topics,
    }));

  // Edge weight = shared language + shared topics between every repo pair.
  const edges: RepositoryEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      let weight = 0;
      if (a.language && a.language === b.language) weight += 2;
      const sharedTopics = a.topics.filter((t) => b.topics.includes(t)).length;
      weight += sharedTopics;
      if (weight > 0) edges.push({ source: a.id, target: b.id, weight });
    }
  }

  // Clusters: group by primary language when no topics are set (works even
  // for accounts with very few repos/topics, e.g. brand-new profiles).
  const byLanguage = new Map<string, string[]>();
  for (const n of nodes) {
    const key = n.language ?? "Unlabeled";
    byLanguage.set(key, [...(byLanguage.get(key) ?? []), n.id]);
  }
  const clusters: ProjectCluster[] = [...byLanguage.entries()].map(([lang, ids]) => ({
    id: lang.toLowerCase().replace(/\s+/g, "-"),
    label: lang,
    repoIds: ids,
  }));

  return { nodes, edges, clusters };
}

// ---------- contributionDynamics ----------

function buildContributionDynamics(snapshot: RawGitHubSnapshot): ContributionDynamics {
  const totalCommitsLastYear = snapshot.contributionCalendar.reduce((a, d) => a + d.count, 0);
  const totalPRs = snapshot.pullRequests.length;
  const mergedPRs = snapshot.pullRequests.filter((p) => p.state === "MERGED").length;
  const totalIssues = snapshot.issues.length;
  const closedIssues = snapshot.issues.filter((i) => i.state === "CLOSED").length;

  const avgAdditionsPerPR =
    totalPRs === 0 ? 0 : snapshot.pullRequests.reduce((a, p) => a + p.additions, 0) / totalPRs;
  const avgDeletionsPerPR =
    totalPRs === 0 ? 0 : snapshot.pullRequests.reduce((a, p) => a + p.deletions, 0) / totalPRs;

  // Velocity trend: commits in the most recent 90 days vs the 90 days before that.
  const now = new Date();
  const cutoff90 = new Date(now.getTime() - 90 * 86400000);
  const cutoff180 = new Date(now.getTime() - 180 * 86400000);
  let recent = 0;
  let prior = 0;
  for (const d of snapshot.contributionCalendar) {
    const date = new Date(d.date + "T00:00:00Z");
    if (date >= cutoff90) recent += d.count;
    else if (date >= cutoff180) prior += d.count;
  }
  let velocityTrend: ContributionDynamics["velocityTrend"] = "steady";
  if (prior === 0 && recent > 0) velocityTrend = "accelerating";
  else if (prior > 0) {
    const delta = (recent - prior) / prior;
    if (delta > 0.15) velocityTrend = "accelerating";
    else if (delta < -0.15) velocityTrend = "cooling";
  }

  return {
    totalCommitsLastYear,
    totalPRs,
    mergedPRs,
    prMergeRate: totalPRs === 0 ? 0 : Math.round((mergedPRs / totalPRs) * 1000) / 10,
    totalIssues,
    closedIssues,
    issueCloseRate: totalIssues === 0 ? 0 : Math.round((closedIssues / totalIssues) * 1000) / 10,
    avgAdditionsPerPR: Math.round(avgAdditionsPerPR),
    avgDeletionsPerPR: Math.round(avgDeletionsPerPR),
    velocityTrend,
  };
}

export function computeIdentity(snapshot: RawGitHubSnapshot): DeveloperIdentity {
  const repositoryGraph = buildRepositoryGraph(snapshot.repos);
  return {
    generatedAt: new Date().toISOString(),
    login: snapshot.login,
    displayName: snapshot.name,
    accountAgeInDays: daysBetween(new Date(snapshot.createdAt), new Date()),
    followers: snapshot.followers,
    following: snapshot.following,
    achievements: snapshot.achievements,
    activityMap: buildActivityMap(snapshot),
    repositoryGraph,
    languageFingerprint: buildLanguageFingerprint(snapshot.repos),
    contributionDynamics: buildContributionDynamics(snapshot),
    projectClusters: repositoryGraph.clusters,
  };
}

/** Strip volatile fields so we can hash/compare identity output run-to-run. */
function stableStringify(identity: DeveloperIdentity): string {
  const { generatedAt, ...rest } = identity;
  return JSON.stringify(rest);
}

async function main() {
  const rawPath = path.resolve("data/cache/raw-snapshot.json");
  const snapshot: RawGitHubSnapshot = JSON.parse(await readFile(rawPath, "utf-8"));
  const identity = computeIdentity(snapshot);

  const outDir = path.resolve("data/cache");
  await mkdir(outDir, { recursive: true });

  const identityPath = path.join(outDir, "identity.json");
  let changed = true;
  try {
    const previous: DeveloperIdentity = JSON.parse(await readFile(identityPath, "utf-8"));
    changed = stableStringify(previous) !== stableStringify(identity);
  } catch {
    // no previous identity.json — first run, definitely "changed"
  }

  await writeFile(identityPath, JSON.stringify(identity, null, 2), "utf-8");
  // Flag file the workflow reads to decide whether SVGs/README need regenerating.
  await writeFile(path.join(outDir, "identity.changed"), changed ? "true" : "false", "utf-8");

  console.log(
    `[identity-engine] computed identity for ${identity.login}. Changed since last run: ${changed}`
  );
}

main().catch((err) => {
  console.error("[identity-engine] failed:", err);
  process.exit(1);
});
