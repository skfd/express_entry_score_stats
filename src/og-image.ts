/**
 * The link preview: a 1200x630 card that chat apps and feeds show when someone
 * pastes the page's address. It is redrawn on every build from the same data
 * as the page, so it always carries the latest draw.
 */
import { Resvg } from "@resvg/resvg-js";
import type { buildData } from "./page-data.js";

type PageData = ReturnType<typeof buildData>;

export const WIDTH = 1200;
export const HEIGHT = 630;

const PAGE = "#f9f9f7";
const INK = "#0b0b0b";
const MUTED = "#6f6d68";
const GRID = "#e6e5de";
// The first one installed wins: Segoe UI locally on Windows, Liberation Sans on the CI runner.
const FONT = "Segoe UI, Liberation Sans, Arial, DejaVu Sans, sans-serif";
/** How far back the card's chart reaches. */
const SPAN_MS = 365 * 24 * 3600 * 1000;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtMonth = (t: number) =>
  new Date(t).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

export interface LatestDraw {
  time: number;
  score: number;
  invitations: number;
  program: string;
  short: string;
}

export function latestDraw(data: PageData): LatestDraw {
  let best: LatestDraw & { number: number } | null = null;
  for (const p of data.programs) {
    for (const [time, score, invitations, number] of p.rounds as [number, number, number, number, string][]) {
      if (!best || time > best.time || (time === best.time && number > best.number)) {
        best = { time, score, invitations, number, program: p.label, short: p.short };
      }
    }
  }
  if (!best) throw new Error("no rounds to preview");
  return best;
}

export function previewSvg(data: PageData): string {
  const latest = latestDraw(data);
  const t1 = latest.time;
  const t0 = t1 - SPAN_MS;

  const series = data.programs
    .map((p) => ({
      ...p,
      pts: (p.rounds as [number, number, number][]).filter(([t]) => t >= t0),
    }))
    .filter((p) => p.pts.length);
  const scores = series.flatMap((p) => p.pts.map(([, s]) => s));
  const lo = Math.floor((Math.min(...scores) - 10) / 50) * 50;
  const hi = Math.ceil((Math.max(...scores) + 10) / 50) * 50;

  // Chart box
  const L = 128, R = WIDTH - 72, T = 250, B = 560;
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * (R - L);
  const y = (s: number) => B - ((s - lo) / (hi - lo)) * (B - T);
  const r = (n: number) => Math.min(11, 3.5 + Math.sqrt(n) / 10);
  const f = (n: number) => n.toFixed(1);

  const step = hi - lo > 250 ? 100 : 50;
  const grid: string[] = [];
  for (let s = Math.ceil(lo / step) * step; s <= hi; s += step) {
    grid.push(
      `<line x1="${L}" x2="${R}" y1="${f(y(s))}" y2="${f(y(s))}" stroke="${GRID}" stroke-width="2"/>`,
      `<text x="${L - 18}" y="${f(y(s) + 8)}" text-anchor="end" font-size="22" fill="${MUTED}">${s}</text>`
    );
  }

  const lines = series
    .filter((p) => p.line && p.pts.length > 1)
    .map(
      (p) =>
        `<polyline fill="none" stroke="${p.light}" stroke-width="3" stroke-linejoin="round" stroke-opacity="0.55" points="${p.pts
          .map(([t, s]) => `${f(x(t))},${f(y(s))}`)
          .join(" ")}"/>`
    );
  const dots = series.flatMap((p) =>
    p.pts.map(
      ([t, s, n]) =>
        `<circle cx="${f(x(t))}" cy="${f(y(s))}" r="${f(r(n))}" fill="${p.light}" fill-opacity="0.85"/>`
    )
  );
  const ring = `<circle cx="${f(x(latest.time))}" cy="${f(y(latest.score))}" r="${f(r(latest.invitations) + 7)}" fill="none" stroke="${INK}" stroke-width="3.5"/>`;

  const invites = `${latest.invitations.toLocaleString("en-US")} invitation${latest.invitations === 1 ? "" : "s"}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="${FONT}">
<rect width="${WIDTH}" height="${HEIGHT}" fill="${PAGE}"/>
<text x="72" y="104" font-size="44" font-weight="800" fill="${INK}">Canada Express Entry</text>
<text x="72" y="158" font-size="44" font-weight="800" fill="${INK}">CRS cutoffs</text>
<text x="72" y="204" font-size="24" fill="${MUTED}">Every invitation round since 2015, updated daily</text>
<text x="${WIDTH - 72}" y="78" text-anchor="end" font-size="22" fill="${MUTED}">Latest draw · ${esc(fmtDate(latest.time))}</text>
<text x="${WIDTH - 72}" y="168" text-anchor="end" font-size="96" font-weight="800" fill="${INK}">${latest.score}</text>
<text x="${WIDTH - 72}" y="206" text-anchor="end" font-size="24" fill="${MUTED}">${esc(latest.short)} · ${invites}</text>
${grid.join("\n")}
${lines.join("\n")}
${dots.join("\n")}
${ring}
<text x="${L}" y="602" font-size="22" fill="${MUTED}">${esc(fmtMonth(t0))}</text>
<text x="${R}" y="602" text-anchor="end" font-size="22" fill="${MUTED}">${esc(fmtMonth(t1))}</text>
</svg>`;
}

export function previewPng(data: PageData): Buffer {
  const resvg = new Resvg(previewSvg(data), {
    font: { loadSystemFonts: true, defaultFontFamily: "Liberation Sans" },
    fitTo: { mode: "width", value: WIDTH },
  });
  return resvg.render().asPng();
}
