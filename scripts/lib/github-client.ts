/**
 * lib/github-client.ts
 * ------------------------------------------------------------------
 * The ONLY module allowed to make network calls in this system, and
 * it only ever talks to api.github.com. This keeps the "GitHub-only
 * data" constraint enforceable by code review: if a future contributor
 * adds a fetch() call outside this file, it's an obvious violation.
 *
 * Handles the two behaviours that bite every GitHub-data project:
 *   - secondary rate limits (403/429 + Retry-After) -> bounded backoff
 *   - the Search API returning { items: [...] }, not a bare array
 * ------------------------------------------------------------------
 */

const API_ROOT = "https://api.github.com";
const GRAPHQL_ROOT = "https://api.github.com/graphql";

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "github-identity-system",
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Single fetch with bounded retry on rate limiting / transient 5xx.
 * Respects Retry-After and x-ratelimit-reset when present, otherwise
 * uses exponential backoff. Gives up after `maxRetries` so a run can
 * never hang the Action indefinitely.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 4
): Promise<Response> {
  let lastErr = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;

    const status = res.status;
    const retryable = status === 429 || status === 403 || status >= 500;
    if (!retryable || attempt === maxRetries) {
      lastErr = `${status} ${await res.text()}`;
      throw new Error(`GitHub request failed: ${url} -> ${lastErr}`);
    }

    // Prefer server-advised wait; cap it so we never sleep for minutes.
    const retryAfter = res.headers.get("retry-after");
    const reset = res.headers.get("x-ratelimit-reset");
    let waitMs = Math.min(2000 * 2 ** attempt, 30000); // backoff, capped 30s
    if (retryAfter) waitMs = Math.min(Number(retryAfter) * 1000, 30000);
    else if (reset) {
      const deltaMs = Number(reset) * 1000 - Date.now();
      if (deltaMs > 0) waitMs = Math.min(deltaMs, 30000);
    }
    await sleep(waitMs);
  }
  throw new Error(`GitHub request failed after retries: ${url} -> ${lastErr}`);
}

export async function restGet<T>(path: string, token: string): Promise<T> {
  const res = await fetchWithRetry(`${API_ROOT}${path}`, { headers: authHeaders(token) });
  return (await res.json()) as T;
}

export async function graphql<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string
): Promise<T> {
  const res = await fetchWithRetry(GRAPHQL_ROOT, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data: T; errors?: unknown[] };
  if (json.errors && json.errors.length > 0) {
    throw new Error(`GitHub GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

/**
 * Paginate a REST endpoint that returns a bare JSON array (e.g. /repos).
 * Stops when a page returns fewer than 100 items.
 */
export async function restGetAllPages<T>(
  path: string,
  token: string,
  maxPages = 10
): Promise<T[]> {
  const results: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const batch = await restGet<T[]>(`${path}${sep}per_page=100&page=${page}`, token);
    if (!Array.isArray(batch)) {
      throw new Error(
        `restGetAllPages expected an array from ${path} but got an object. ` +
          `Use searchAllPages for /search/* endpoints.`
      );
    }
    results.push(...batch);
    if (batch.length < 100) break;
  }
  return results;
}

interface SearchResponse<T> {
  total_count: number;
  incomplete_results: boolean;
  items: T[];
}

/**
 * Paginate the Search API, which wraps results in { items: [...] } and
 * caps out at 1000 total results (10 pages of 100). We also stop early
 * once we've collected total_count items.
 */
export async function searchAllPages<T>(
  path: string,
  token: string,
  maxPages = 10
): Promise<T[]> {
  const results: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await restGet<SearchResponse<T>>(
      `${path}${sep}per_page=100&page=${page}`,
      token
    );
    results.push(...res.items);
    if (res.items.length < 100 || results.length >= res.total_count) break;
    if (results.length >= 1000) break; // Search API hard ceiling
  }
  return results;
}
