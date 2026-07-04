/**
 * svg/network-graph.ts
 * Force-layout-lite repository network: repos as nodes sized by stars,
 * edges weighted by shared language/topics. Deterministic circular
 * layout (no physics simulation) so output is stable run-to-run.
 */
import type { RepositoryGraph } from "../types.js";
import { svgHeader, svgFooter, text, THEME, panelTitle, truncate } from "./theme.js";

export function renderNetworkGraph(graph: RepositoryGraph): string {
  const width = 640;
  const height = 420;
  const cx = width / 2;
  const cy = height / 2 + 10;
  const radius = Math.min(width, height) / 2 - 90;

  const nodes = graph.nodes;

  // Empty state: no non-fork repositories to graph.
  if (nodes.length === 0) {
    return `${svgHeader(width, 140, "Repository network graph")}
    ${panelTitle("REPOSITORY NETWORK")}
    ${text(width / 2, 80, "No repositories to map yet.", {
      size: 12,
      color: THEME.textMuted,
      anchor: "middle",
    })}
  ${svgFooter}`;
  }

  const n = nodes.length;
  const positions = new Map<string, { x: number; y: number }>();

  nodes.forEach((node, i) => {
    if (n === 1) {
      // A single repo looks best centered, not pinned to the top of a circle.
      positions.set(node.id, { x: cx, y: cy });
      return;
    }
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    positions.set(node.id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  });

  const maxStars = Math.max(1, ...nodes.map((n) => n.stars));

  const edgeSvg = graph.edges
    .map((e) => {
      const a = positions.get(e.source);
      const b = positions.get(e.target);
      if (!a || !b) return "";
      const strokeWidth = Math.min(4, 0.5 + e.weight * 0.6);
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${THEME.accentDim}" stroke-opacity="0.35" stroke-width="${strokeWidth}"/>`;
    })
    .join("\n");

  const nodeSvg = nodes
    .map((node) => {
      const p = positions.get(node.id)!;
      const r = 10 + (node.stars / maxStars) * 18;
      const alive = node.lastPushDays <= 90;
      const color = alive ? THEME.success : THEME.textMuted;
      return `<g>
        <circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${THEME.bgPanel}" stroke="${color}" stroke-width="2">
          <title>${node.name} \u2014 ${node.language ?? "unlabeled"} \u2014 ${node.stars}\u2605 \u2014 last push ${node.lastPushDays}d ago</title>
        </circle>
        ${
          alive
            ? `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="none" stroke="${THEME.success}" stroke-width="1" opacity="0.6" filter="url(#glow)">
                <animate attributeName="r" values="${r};${r + 6};${r}" dur="3s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.6;0;0.6" dur="3s" repeatCount="indefinite"/>
              </circle>`
            : ""
        }
        ${text(p.x, p.y + r + 14, truncate(node.name, 18), { size: 10, anchor: "middle", color: THEME.textPrimary })}
      </g>`;
    })
    .join("\n");

  return `${svgHeader(width, height, "Repository network graph")}
  ${panelTitle("REPOSITORY NETWORK")}
  ${text(width - 20, 26, `${nodes.length} repos \u00b7 ${graph.edges.length} links`, {
    size: 11,
    color: THEME.textMuted,
    anchor: "end",
  })}
  ${edgeSvg}
  ${nodeSvg}
  ${text(20, height - 14, "solid ring = pushed within 90 days", { size: 9, color: THEME.textMuted })}
${svgFooter}`;
}
