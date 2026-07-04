/**
 * svg/index.ts
 * ------------------------------------------------------------------
 * Orchestrator for the Visual System. Reads the computed identity
 * model once, then calls each modular renderer and writes its output
 * to assets/svg/. Adding a new visualization means: write one
 * render*.ts function, add one line here. Nothing else changes.
 * ------------------------------------------------------------------
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { DeveloperIdentity } from "../types.js";
import { renderHeatmap } from "./heatmap.js";
import { renderNetworkGraph } from "./network-graph.js";
import { renderTimeline } from "./timeline.js";
import { renderLanguageFingerprint } from "./language-fingerprint.js";
import { renderCounters } from "./counters.js";
import { renderActivityFlow } from "./activity-flow.js";

async function main() {
  const identityPath = path.resolve("data/cache/identity.json");
  const identity: DeveloperIdentity = JSON.parse(await readFile(identityPath, "utf-8"));

  const outDir = path.resolve("assets/svg");
  await mkdir(outDir, { recursive: true });

  const outputs: Record<string, string> = {
    "heatmap.svg": renderHeatmap(identity.activityMap),
    "network-graph.svg": renderNetworkGraph(identity.repositoryGraph),
    "timeline.svg": renderTimeline(identity.repositoryGraph),
    "language-fingerprint.svg": renderLanguageFingerprint(identity.languageFingerprint),
    "counters.svg": renderCounters(identity),
    "activity-flow.svg": renderActivityFlow(identity.contributionDynamics),
  };

  for (const [filename, svg] of Object.entries(outputs)) {
    await writeFile(path.join(outDir, filename), svg, "utf-8");
  }

  console.log(`[svg] wrote ${Object.keys(outputs).length} SVG assets to assets/svg/`);
}

main().catch((err) => {
  console.error("[svg] failed:", err);
  process.exit(1);
});
