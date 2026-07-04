/**
 * svg/activity-flow.ts
 * Animated pipeline: Opened -> Merged/Closed, particles travel along
 * the path at a rate proportional to real throughput (more merges =
 * faster/denser dash animation). This is the "alive" visual the spec
 * asks for, without inventing any numbers — dash count and speed are
 * both derived from contributionDynamics.
 */
import type { ContributionDynamics } from "../types.js";
import { svgHeader, svgFooter, text, THEME, panelTitle } from "./theme.js";

export function renderActivityFlow(dynamics: ContributionDynamics): string {
  const width = 640;
  const height = 160;
  const laneY1 = 60;
  const laneY2 = 110;
  const startX = 60;
  const endX = width - 60;

  const prDuration = Math.max(1.2, 6 - dynamics.prMergeRate / 20); // higher merge rate -> faster flow
  const issueDuration = Math.max(1.2, 6 - dynamics.issueCloseRate / 20);

  function lane(y: number, label: string, count: number, duration: number, color: string): string {
    const dots = Array.from({ length: 3 })
      .map((_, i) => {
        const delay = (duration / 3) * i;
        return `<circle r="4" fill="${color}" filter="url(#glow)">
          <animateMotion dur="${duration}s" begin="${delay}s" repeatCount="indefinite"
            path="M${startX},${y} L${endX},${y}"/>
        </circle>`;
      })
      .join("\n");
    return `<line x1="${startX}" y1="${y}" x2="${endX}" y2="${y}" stroke="${THEME.border}" stroke-width="2"/>
      ${dots}
      ${text(startX, y - 12, label, { size: 11, color: THEME.textMuted })}
      ${text(endX, y - 12, String(count), { size: 12, weight: "700", color, anchor: "end" })}`;
  }

  return `${svgHeader(width, height, "Activity flow")}
  ${panelTitle("ACTIVITY FLOW")}
  ${text(width - 20, 26, `PR merge rate ${dynamics.prMergeRate}% \u00b7 issue close rate ${dynamics.issueCloseRate}%`, {
    size: 11,
    color: THEME.textMuted,
    anchor: "end",
  })}
  <circle cx="${startX}" cy="${laneY1}" r="5" fill="${THEME.accent}"/>
  <circle cx="${endX}" cy="${laneY1}" r="5" fill="${THEME.success}"/>
  ${lane(laneY1, `pull requests opened \u2192 merged`, dynamics.mergedPRs, prDuration, THEME.accent)}
  <circle cx="${startX}" cy="${laneY2}" r="5" fill="${THEME.warning}"/>
  <circle cx="${endX}" cy="${laneY2}" r="5" fill="${THEME.success}"/>
  ${lane(laneY2, `issues opened \u2192 closed`, dynamics.closedIssues, issueDuration, THEME.warning)}
${svgFooter}`;
}
