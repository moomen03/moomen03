/**
 * svg/timeline.ts
 * Horizontal timeline of repository lifecycles: a bar per repo spanning
 * createdAt -> lastPush, positioned along a shared time axis.
 */
import type { RepositoryGraph } from "../types.js";
import { svgHeader, svgFooter, text, THEME, panelTitle, truncate } from "./theme.js";

export function renderTimeline(graph: RepositoryGraph): string {
  const width = 640;
  const rowHeight = 30;
  const topPad = 50;
  const height = topPad + graph.nodes.length * rowHeight + 30;

  if (graph.nodes.length === 0) {
    return `${svgHeader(width, 120, "Repository timeline")}
    ${panelTitle("REPOSITORY TIMELINE")}
    ${text(20, 60, "No non-fork repositories yet \u2014 timeline will populate as the account grows.", {
      size: 11,
      color: THEME.textMuted,
    })}
  ${svgFooter}`;
  }

  const maxAge = Math.max(...graph.nodes.map((n) => n.ageInDays), 1);
  const axisLeft = 175;
  const axisRight = width - 40;
  const axisWidth = axisRight - axisLeft;

  const rows = [...graph.nodes]
    .sort((a, b) => b.ageInDays - a.ageInDays)
    .map((node, i) => {
      const y = topPad + i * rowHeight;
      const startX = axisLeft + ((maxAge - node.ageInDays) / maxAge) * axisWidth;
      const endX = axisLeft + ((maxAge - node.lastPushDays) / maxAge) * axisWidth;
      const barWidth = Math.max(2, endX - startX);
      const alive = node.lastPushDays <= 90;
      return `<g>
        <title>${node.name}</title>
        ${text(axisLeft - 12, y + rowHeight / 2 + 4, truncate(node.name, 20), { size: 10, anchor: "end", color: THEME.textPrimary })}
        <rect x="${startX}" y="${y + 6}" width="${barWidth}" height="10" rx="5" fill="${
        alive ? THEME.accent : THEME.border
      }"/>
        <circle cx="${endX}" cy="${y + 11}" r="4" fill="${alive ? THEME.success : THEME.textMuted}"/>
      </g>`;
    })
    .join("\n");

  return `${svgHeader(width, height, "Repository timeline")}
  ${panelTitle("REPOSITORY TIMELINE")}
  ${text(width - 20, 26, `oldest ${maxAge}d`, { size: 11, color: THEME.textMuted, anchor: "end" })}
  <line x1="${axisLeft}" y1="${topPad - 12}" x2="${axisRight}" y2="${topPad - 12}" stroke="${THEME.border}"/>
  ${rows}
${svgFooter}`;
}
