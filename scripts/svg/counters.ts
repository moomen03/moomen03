/**
 * svg/counters.ts
 * A stat strip of real, sourced counters. Every number here maps
 * directly to a DeveloperIdentity field — there is no field in this
 * file that isn't computed from GitHub data, by design (see the
 * CRITICAL CONSTRAINTS in the system spec: no fake stats, ever).
 */
import type { DeveloperIdentity } from "../types.js";
import { svgHeader, svgFooter, text, THEME } from "./theme.js";

interface Stat {
  label: string;
  value: string | number;
}

export function renderCounters(identity: DeveloperIdentity): string {
  const stats: Stat[] = [
    { label: "REPOS", value: identity.repositoryGraph.nodes.length },
    { label: "CONTRIBUTIONS/YR", value: identity.activityMap.totalContributions },
    { label: "CURRENT STREAK", value: `${identity.activityMap.currentStreak}d` },
    { label: "LONGEST STREAK", value: `${identity.activityMap.longestStreak}d` },
    { label: "PRs MERGED", value: `${identity.contributionDynamics.mergedPRs}/${identity.contributionDynamics.totalPRs}` },
    { label: "ISSUES CLOSED", value: `${identity.contributionDynamics.closedIssues}/${identity.contributionDynamics.totalIssues}` },
    { label: "FOLLOWERS", value: identity.followers },
    { label: "VELOCITY", value: identity.contributionDynamics.velocityTrend.toUpperCase() },
  ];

  const width = 640;
  const cols = 4;
  const rows = Math.ceil(stats.length / cols);
  const cellW = width / cols;
  const cellH = 70;
  const height = rows * cellH + 20;

  const cells = stats
    .map((stat, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cellW;
      const y = 10 + row * cellH;
      const valueStr = String(stat.value);
      // Shrink the font for long values (e.g. "ACCELERATING") so they never
      // overflow the fixed-width cell instead of clipping or bleeding over.
      const maxCharsAtFullSize = 8;
      const fullSize = 20;
      const minSize = 12;
      const size =
        valueStr.length <= maxCharsAtFullSize
          ? fullSize
          : Math.max(minSize, Math.round((fullSize * maxCharsAtFullSize) / valueStr.length));
      return `<g transform="translate(${x},${y})">
        <rect x="6" y="0" width="${cellW - 12}" height="${cellH - 10}" rx="8" fill="${THEME.bgPanel}" stroke="${THEME.border}"/>
        ${text(cellW / 2, cellH / 2 - 6, valueStr, { size, weight: "700", anchor: "middle", color: THEME.accent })}
        ${text(cellW / 2, cellH / 2 + 16, stat.label, { size: 9, anchor: "middle", color: THEME.textMuted })}
      </g>`;
    })
    .join("\n");

  return `${svgHeader(width, height, "Live counters")}
  ${cells}
${svgFooter}`;
}
