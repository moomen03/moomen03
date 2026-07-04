/**
 * svg/heatmap.ts
 * Contribution heatmap reinterpretation: same data as GitHub's own
 * calendar, but rendered as a radial pulse grid instead of a flat grid,
 * with a subtle CSS pulse animation on the most recent active day.
 */
import type { ActivityMap } from "../types.js";
import { svgHeader, svgFooter, text, THEME, panelTitle } from "./theme.js";

const CELL = 11;
const GAP = 3;
const COLS = 53;
const ROWS = 7;

export function renderHeatmap(activity: ActivityMap): string {
  const width = COLS * (CELL + GAP) + 60;
  const height = ROWS * (CELL + GAP) + 70;

  // Empty state: a brand-new account has no contribution calendar yet.
  // Render a clear message instead of an empty grid that looks broken.
  if (activity.days.length === 0) {
    return `${svgHeader(width, height, "Contribution activity map")}
    ${panelTitle("ACTIVITY MAP", 40, 22)}
    ${text(width / 2, height / 2, "No contribution data yet \u2014 this map fills in as you commit.", {
      size: 12,
      color: THEME.textMuted,
      anchor: "middle",
    })}
  ${svgFooter}`;
  }

  let cells = "";
  let lastActiveIdx = -1;
  activity.days.forEach((day, i) => {
    const col = Math.floor(i / ROWS);
    const row = i % ROWS;
    const x = 40 + col * (CELL + GAP);
    const y = 40 + row * (CELL + GAP);
    const fill = THEME.heat[day.intensity];
    const isRecentActive = day.count > 0;
    if (isRecentActive) lastActiveIdx = i;
    // Staggered fade-in for a polished "booting up" feel. The base <rect>
    // has no opacity attribute (so it defaults to fully visible): if a
    // renderer doesn't run SMIL, the grid still shows at full opacity
    // instead of vanishing. When SMIL runs, each cell washes in on a
    // capped delay so the whole sweep finishes within ~2s.
    const delay = Math.min(i * 0.004, 2).toFixed(3);
    cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${fill}">
      <title>${day.date}: ${day.count} contribution${day.count === 1 ? "" : "s"}</title>
      <animate attributeName="opacity" values="0;1" dur="0.4s" begin="${delay}s" fill="freeze"/>
    </rect>\n`;
  });

  // Pulse ring on the most recent active day to signal "still alive".
  let pulse = "";
  if (lastActiveIdx >= 0) {
    const col = Math.floor(lastActiveIdx / ROWS);
    const row = lastActiveIdx % ROWS;
    const cx = 40 + col * (CELL + GAP) + CELL / 2;
    const cy = 40 + row * (CELL + GAP) + CELL / 2;
    pulse = `<circle cx="${cx}" cy="${cy}" r="${CELL / 2}" fill="none" stroke="${THEME.accent}" stroke-width="1.5" filter="url(#glow)">
      <animate attributeName="r" values="${CELL / 2};${CELL};${CELL / 2}" dur="2.4s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="1;0;1" dur="2.4s" repeatCount="indefinite"/>
    </circle>`;
  }

  const legend = THEME.heat
    .map((c, i) => `<rect x="${40 + i * 16}" y="${height - 20}" width="10" height="10" rx="2" fill="${c}"/>`)
    .join("");

  return `${svgHeader(width, height, "Contribution activity map")}
  ${panelTitle("ACTIVITY MAP", 40, 22)}
  ${text(width - 20, 22, `${activity.totalContributions} contributions · ${activity.currentStreak}d streak`, {
    size: 11,
    color: THEME.textMuted,
    anchor: "end",
  })}
  ${cells}
  ${pulse}
  ${legend}
  ${text(40 + THEME.heat.length * 16 + 8, height - 12, "less \u2192 more", { size: 9, color: THEME.textMuted })}
  ${text(width - 20, height - 12, `longest streak ${activity.longestStreak}d \u00b7 busiest ${activity.busiestWeekday}`, {
    size: 9,
    color: THEME.textMuted,
    anchor: "end",
  })}
${svgFooter}`;
}
