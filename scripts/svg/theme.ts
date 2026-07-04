/**
 * svg/theme.ts
 * ------------------------------------------------------------------
 * Every visual constant lives here so the six SVG components render
 * as one coherent system instead of six separate art projects.
 * ------------------------------------------------------------------
 */

export const THEME = {
  bgDark: "#0d1117",
  bgPanel: "#161b22",
  border: "#30363d",
  textPrimary: "#c9d1d9",
  textMuted: "#8b949e",
  accent: "#58a6ff",
  accentDim: "#1f6feb",
  success: "#3fb950",
  warning: "#d29922",
  font: "'JetBrains Mono','SFMono-Regular',Consolas,monospace",
  heat: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"], // intensity 0..4
} as const;

export function svgHeader(width: number, height: number, title: string): string {
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}">
  ${sharedDefs()}
  <rect width="${width}" height="${height}" rx="10" fill="url(#panel-bg)" stroke="${THEME.border}"/>`;
}

/**
 * Reusable <defs> shared by every panel so the whole system reads as
 * one design language: a subtle vertical background gradient, a soft
 * accent glow filter, and a header accent gradient. Referenced by
 * url(#id) inside each renderer.
 */
export function sharedDefs(): string {
  return `<defs>
    <linearGradient id="panel-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f151c"/>
      <stop offset="100%" stop-color="${THEME.bgDark}"/>
    </linearGradient>
    <linearGradient id="accent-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${THEME.accent}"/>
      <stop offset="100%" stop-color="#a371f7"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>`;
}

/** A consistent panel title with an accent underline, used by every panel. */
export function panelTitle(label: string, x = 20, y = 26): string {
  return `${text(x, y, label, { size: 13, weight: "700", color: THEME.accent })}
  <rect x="${x}" y="${y + 6}" width="${label.length * 8}" height="2" rx="1" fill="url(#accent-grad)" opacity="0.7"/>`;
}

export const svgFooter = `</svg>`;

export function text(
  x: number,
  y: number,
  content: string,
  opts: { size?: number; color?: string; weight?: string; anchor?: string } = {}
): string {
  const { size = 12, color = THEME.textPrimary, weight = "400", anchor = "start" } = opts;
  return `<text x="${x}" y="${y}" font-family="${THEME.font}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${escapeXml(
    content
  )}</text>`;
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Truncate a label to maxChars with an ellipsis, keeping SVG width predictable. */
export function truncate(s: string, maxChars: number): string {
  return s.length <= maxChars ? s : s.slice(0, maxChars - 1) + "\u2026";
}
