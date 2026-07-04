/**
 * svg/language-fingerprint.ts
 * Single stacked horizontal bar (GitHub's own repo-language-bar style)
 * plus a legend with exact percentages — deliberately understated
 * since this is the panel most prone to looking like a generic badge.
 */
import type { LanguageFingerprint } from "../types.js";
import { svgHeader, svgFooter, text, THEME, panelTitle } from "./theme.js";

const PALETTE = [
  THEME.accent,
  THEME.success,
  THEME.warning,
  "#f778ba",
  "#a371f7",
  "#79c0ff",
  "#ffa657",
  THEME.textMuted,
];

export function renderLanguageFingerprint(languages: LanguageFingerprint[]): string {
  const width = 640;
  const barY = 60;
  const barHeight = 22;
  const legendRowHeight = 22;
  const shown = languages.slice(0, 8);
  const height = barY + barHeight + 30 + shown.length * legendRowHeight + 20;

  if (shown.length === 0) {
    return `${svgHeader(width, 120, "Language fingerprint")}
    ${panelTitle("LANGUAGE FINGERPRINT")}
    ${text(20, 60, "No language data yet.", { size: 11, color: THEME.textMuted })}
  ${svgFooter}`;
  }

  const barLeft = 20;
  const barWidth = width - 40;
  let x = barLeft;
  const segments = shown
    .map((lang, i) => {
      const w = (lang.percentage / 100) * barWidth;
      const seg = `<rect x="${x}" y="${barY}" width="${w}" height="${barHeight}" fill="${
        PALETTE[i % PALETTE.length]
      }"><title>${lang.language}: ${lang.percentage}%</title></rect>`;
      x += w;
      return seg;
    })
    .join("\n");

  const legend = shown
    .map(
      (lang, i) => `<g transform="translate(20, ${barY + barHeight + 26 + i * legendRowHeight})">
        <rect width="10" height="10" rx="2" fill="${PALETTE[i % PALETTE.length]}"/>
        ${text(18, 10, `${lang.language}`, { size: 11, color: THEME.textPrimary })}
        ${text(barWidth, 10, `${lang.percentage}% \u00b7 ${lang.repoCount} repo${lang.repoCount === 1 ? "" : "s"}`, {
          size: 11,
          color: THEME.textMuted,
          anchor: "end",
        })}
      </g>`
    )
    .join("\n");

  return `${svgHeader(width, height, "Language fingerprint")}
  ${panelTitle("LANGUAGE FINGERPRINT")}
  <rect x="${barLeft}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="6" fill="${THEME.bgPanel}"/>
  <clipPath id="bar-clip"><rect x="${barLeft}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="6"/></clipPath>
  <g clip-path="url(#bar-clip)">${segments}</g>
  ${legend}
${svgFooter}`;
}
