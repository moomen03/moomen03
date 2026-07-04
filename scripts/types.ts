/**
 * types.ts
 * ------------------------------------------------------------------
 * Single source of truth for every data shape in the pipeline.
 *
 * RawGitHubSnapshot  -> exactly what the GitHub REST/GraphQL API gives us.
 * DeveloperIdentity   -> the computed model the SVG layer renders from.
 *
 * Nothing outside this file should invent a field. If a renderer needs
 * a number that isn't here, it belongs in identity-engine.ts, not in
 * the renderer.
 * ------------------------------------------------------------------
 */

// ---------- Raw GitHub data (Data Extraction Layer output) ----------

export interface RawRepo {
  name: string;
  fullName: string;
  description: string | null;
  primaryLanguage: string | null;
  languages: Record<string, number>; // bytes per language, from /repos/{owner}/{repo}/languages
  stargazerCount: number;
  forkCount: number;
  openIssues: number;
  isFork: boolean;
  isArchived: boolean;
  pushedAt: string; // ISO date
  createdAt: string; // ISO date
  topics: string[];
  size: number; // KB, from the repo object
}

export interface RawCommitDay {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface RawPullRequestSummary {
  repo: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  createdAt: string;
  mergedAt: string | null;
  additions: number;
  deletions: number;
}

export interface RawIssueSummary {
  repo: string;
  state: "OPEN" | "CLOSED";
  createdAt: string;
  closedAt: string | null;
}

export interface RawGitHubSnapshot {
  fetchedAt: string; // ISO timestamp of this extraction run
  login: string;
  name: string | null;
  bio: string | null;
  followers: number;
  following: number;
  publicRepos: number;
  createdAt: string; // account creation date
  repos: RawRepo[];
  contributionCalendar: RawCommitDay[]; // last 365 days, from GraphQL contributionsCollection
  pullRequests: RawPullRequestSummary[];
  issues: RawIssueSummary[];
  achievements: string[]; // scraped achievement slugs, e.g. "pair-extraordinaire"
}

// ---------- Computed Identity Model (Identity Engine output) ----------

export interface ActivityMapEntry {
  date: string;
  count: number;
  intensity: 0 | 1 | 2 | 3 | 4; // quantized bucket for the heatmap renderer
}

export interface ActivityMap {
  days: ActivityMapEntry[];
  totalContributions: number;
  currentStreak: number;
  longestStreak: number;
  busiestWeekday: string; // "Mon" .. "Sun"
  busiestHourBucket: string | null; // only if timestamps are available
}

export interface RepositoryNode {
  id: string; // repo name, used as SVG node id
  name: string;
  language: string | null;
  stars: number;
  forks: number;
  sizeKB: number;
  ageInDays: number;
  lastPushDays: number; // days since last push, used for "alive vs dormant" styling
  topics: string[];
}

export interface RepositoryEdge {
  source: string;
  target: string;
  weight: number; // shared topics/language count, used for edge thickness
}

export interface RepositoryGraph {
  nodes: RepositoryNode[];
  edges: RepositoryEdge[];
  clusters: ProjectCluster[];
}

export interface ProjectCluster {
  id: string;
  label: string; // derived cluster name, e.g. dominant language or shared topic
  repoIds: string[];
}

export interface LanguageFingerprint {
  language: string;
  bytes: number;
  percentage: number; // 0-100, rounded to 1 decimal
  repoCount: number;
}

export interface ContributionDynamics {
  totalCommitsLastYear: number;
  totalPRs: number;
  mergedPRs: number;
  prMergeRate: number; // 0-100
  totalIssues: number;
  closedIssues: number;
  issueCloseRate: number; // 0-100
  avgAdditionsPerPR: number;
  avgDeletionsPerPR: number;
  velocityTrend: "accelerating" | "steady" | "cooling"; // derived from last 90d vs prior 90d
}

export interface DeveloperIdentity {
  generatedAt: string;
  login: string;
  displayName: string | null;
  accountAgeInDays: number;
  followers: number;
  following: number;
  achievements: string[];

  activityMap: ActivityMap;
  repositoryGraph: RepositoryGraph;
  languageFingerprint: LanguageFingerprint[];
  contributionDynamics: ContributionDynamics;
  projectClusters: ProjectCluster[];
}
