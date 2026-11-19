/**
 * The data the page embeds: every round grouped by program, the candidate pool
 * and its history, and the yearly departures estimate.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { DrawData, DrawRound, ScoreDistribution } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEFT_FILE = join(__dirname, "data", "left-without-pr.json");

function categorize(roundType: string): string {
  const lower = roundType.toLowerCase();
  if (lower.includes("no program specified") || lower === "general") return "General";
  if (lower.includes("provincial nominee")) return "Provincial Nominee";
  // 2026 categories that mention "Canadian Work Experience": match before CEC
  if (lower.includes("physician")) return "Physicians";
  if (lower.includes("senior manager")) return "Senior managers";
  if (lower.includes("military")) return "Military recruits";
  if (lower.includes("canadian experience")) return "Canadian Experience Class";
  if (lower.includes("federal skilled worker")) return "Federal Skilled Workers";
  if (lower.includes("federal skilled trades")) return "Federal Skilled Trades";
  if (lower.includes("french")) return "French language";
  if (lower.includes("healthcare") || lower.includes("health care")) return "Healthcare";
  if (lower.includes("stem")) return "STEM";
  if (lower.includes("trade")) return "Trades";
  if (lower.includes("transport")) return "Transport";
  if (lower.includes("agriculture") || lower.includes("agri-food")) return "Agriculture";
  if (lower.includes("education")) return "Education";
  return roundType;
}

type Family = "main" | "occupation" | "new";
const FAMILY_LABELS: Record<Family, string> = {
  main: "Main programs",
  occupation: "Occupation categories",
  new: "Newer categories",
};
const FAMILY_ORDER: Family[] = ["main", "occupation", "new"];
const OCCUPATION_CATEGORIES = new Set([
  "Healthcare",
  "STEM",
  "Trades",
  "Transport",
  "Agriculture",
  "Education",
]);

// [light, dark]
const SLOT = {
  blue: ["#2a78d6", "#3987e5"],
  orange: ["#eb6834", "#d95926"],
  aqua: ["#1baf7a", "#199e70"],
  yellow: ["#eda100", "#c98500"],
  magenta: ["#e87ba4", "#d55181"],
  green: ["#008300", "#0ca30c"],
  violet: ["#6250d6", "#9085e9"],
  red: ["#e34948", "#e66767"],
} as const;

const MAIN_COLORS: Record<string, readonly [string, string]> = {
  General: SLOT.blue,
  "Canadian Experience Class": SLOT.orange,
  "French language": SLOT.aqua,
  "Provincial Nominee": SLOT.red,
  "Federal Skilled Trades": SLOT.green,
  "Federal Skilled Workers": SLOT.magenta,
};

const SLUGS: Record<string, string> = {
  General: "general",
  "Provincial Nominee": "pnp",
  "Canadian Experience Class": "cec",
  "French language": "french",
  "Federal Skilled Trades": "fst",
  "Federal Skilled Workers": "fsw",
  Healthcare: "healthcare",
  STEM: "stem",
  Trades: "trades",
  Transport: "transport",
  Agriculture: "agriculture",
  Education: "education",
  Physicians: "physicians",
  "Senior managers": "senior-managers",
  "Military recruits": "military",
};

/** Names short enough to label a line's end on a phone. */
const SHORT: Record<string, string> = {
  "Provincial Nominee": "PNP",
  "Canadian Experience Class": "CEC",
  "French language": "French",
  "Federal Skilled Trades": "FST",
  "Federal Skilled Workers": "FSW",
  Healthcare: "Health",
  Agriculture: "Agri",
  "Senior managers": "Managers",
  "Military recruits": "Military",
};

function slugFor(category: string): string {
  return (
    SLUGS[category] ??
    category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  );
}

function familyOf(category: string): Family {
  if (MAIN_COLORS[category]) return "main";
  return OCCUPATION_CATEGORIES.has(category) ? "occupation" : "new";
}

function colorsFor(category: string): readonly [string, string] {
  const fam = familyOf(category);
  if (fam === "main") return MAIN_COLORS[category];
  return fam === "occupation" ? SLOT.violet : SLOT.yellow;
}

const utc = (isoDate: string) => Date.parse(isoDate + "T00:00:00Z");

export function buildData(data: DrawData) {
  const grouped = new Map<string, DrawRound[]>();
  for (const round of data.rounds) {
    const cat = categorize(round.roundType);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(round);
  }

  const programs = [...grouped.entries()]
    .sort(
      (a, b) =>
        FAMILY_ORDER.indexOf(familyOf(a[0])) - FAMILY_ORDER.indexOf(familyOf(b[0])) ||
        b[1].length - a[1].length
    )
    .map(([cat, rounds]) => {
      const [light, dark] = colorsFor(cat);
      const family = familyOf(cat);
      return {
        label: cat,
        short: SHORT[cat] ?? cat,
        slug: slugFor(cat),
        family,
        light,
        dark,
        // Programs sharing a family colour get circles only: same-coloured
        // lines from different programs would read as one series.
        line: family === "main",
        // [time, cutoff, invitations, round number, round type]
        rounds: [...rounds]
          .sort((a, b) => utc(a.date) - utc(b.date))
          .map((r) => [utc(r.date), r.crsScore, r.invitationsIssued, r.number, r.roundType]),
      };
    });

  // Pool snapshots, oldest first, one per date IRCC took one. Each is score
  // bins from low to high; the newest is the pool drawn beside the chart.
  const BINS: Array<[number, number, keyof ScoreDistribution]> = [
    [0, 300, "range0_300"],
    [301, 350, "range301_350"],
    [351, 400, "range351_400"],
    [401, 410, "range401_410"],
    [411, 420, "range411_420"],
    [421, 430, "range421_430"],
    [431, 440, "range431_440"],
    [441, 450, "range441_450"],
    [451, 460, "range451_460"],
    [461, 470, "range461_470"],
    [471, 480, "range471_480"],
    [481, 490, "range481_490"],
    [491, 500, "range491_500"],
    [501, 600, "range501_600"],
    [601, 1200, "range601_1200"],
  ];
  const seen = new Set<string>();
  const snapshots = data.rounds
    .filter((r) => r.distribution && r.distribution.total > 0)
    .sort((a, b) => utc(a.date) - utc(b.date))
    .filter((r) => {
      const key = r.distribution!.asOfDate || r.date;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const counts = (d: ScoreDistribution) => BINS.map(([, , key]) => Number(d[key]) || 0);
  const latest = snapshots[snapshots.length - 1];
  let pool = null;
  if (latest) {
    const d = latest.distribution!;
    const n = counts(d);
    pool = {
      asOf: d.asOfDate || latest.date,
      total: d.total,
      bins: BINS.map(([lo, hi], i) => ({ lo, hi, n: n[i] })),
    };
  }
  // [time, total, ...count per bin]
  const poolHistory = snapshots.map((r) => [
    utc(r.date),
    r.distribution!.total,
    ...counts(r.distribution!),
  ]);

  return {
    fetchedAt: data.fetchedAt,
    source: data.source,
    roundCount: data.rounds.length,
    families: FAMILY_ORDER.map((id) => ({ id, label: FAMILY_LABELS[id] })),
    programs,
    pool,
    poolHistory,
    // Not IRCC rounds data: a yearly estimate from two other sources, kept as
    // a static snapshot in src/data (it says how it was worked out).
    leftWithoutPr: JSON.parse(readFileSync(LEFT_FILE, "utf-8")),
  };
}
