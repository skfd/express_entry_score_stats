import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { DrawData, DrawRound } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "data", "rounds.json");
const OUTPUT_DIR = join(__dirname, "..", "dist");
const OUTPUT_FILE = join(OUTPUT_DIR, "index.html");

/** BETA=1 builds the /beta/ preview: banner, not indexed, no analytics. */
const BETA = process.env.BETA === "1";

/**
 * Circle radius for a round, so the circle's area is proportional to the
 * number of invitations issued. A 7,000-invitation round (about the 99th
 * percentile) gets REF_RADIUS; the rare giant draws are capped so they don't
 * swallow the chart, and tiny draws stay visible.
 */
const REF_INVITATIONS = 7000;
const REF_RADIUS = 12;
const MIN_RADIUS = 2;
const MAX_RADIUS = 18;
function radiusFor(invitations: number): number {
  const r = REF_RADIUS * Math.sqrt(Math.max(0, invitations) / REF_INVITATIONS);
  return Math.round(Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, r)) * 10) / 10;
}

/** Normalize round types into broader categories for charting */
function categorize(roundType: string): string {
  const lower = roundType.toLowerCase();

  if (lower.includes("no program specified") || lower === "general")
    return "General";

  if (lower.includes("provincial nominee")) return "Provincial Nominee";

  // 2026 categories that mention "Canadian Work Experience" — match before CEC
  if (lower.includes("physician")) return "Physicians";
  if (lower.includes("senior manager")) return "Senior managers";
  if (lower.includes("military")) return "Military recruits";

  if (lower.includes("canadian experience"))
    return "Canadian Experience Class";

  if (lower.includes("federal skilled worker"))
    return "Federal Skilled Workers";

  if (lower.includes("federal skilled trades"))
    return "Federal Skilled Trades";

  if (lower.includes("french")) return "French language";

  if (lower.includes("healthcare") || lower.includes("health care"))
    return "Healthcare";

  if (lower.includes("stem")) return "STEM";

  if (lower.includes("trade")) return "Trades";

  if (lower.includes("transport")) return "Transport";

  if (lower.includes("agriculture") || lower.includes("agri-food"))
    return "Agriculture";

  if (lower.includes("education")) return "Education";

  // Keep original if no match; it lands in the "new" family below
  return roundType;
}

/**
 * Programs are grouped into three families. Main programs each get their own
 * hue; every occupation category shares one hue, and every newer category
 * (including any round type that appears later and isn't matched above)
 * shares another. That keeps the chart to 8 colours however many categories
 * IRCC adds.
 */
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

// Slots from the validated reference palette (light / dark steps).
// Hue choice by overlap: the four series that share the 2023–2026 band get
// orange / aqua / violet / yellow, the most mutually separable set; the
// weakest pair (orange–yellow) goes to CEC vs the 2026 categories, which sit
// far apart in score. PNP sits alone at 650–900, so red is safe there.
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

// Short, stable names for ?programs= links (unknown categories get a generated slug)
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
function slugFor(category: string): string {
  return SLUGS[category] ?? category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function familyOf(category: string): Family {
  if (MAIN_COLORS[category]) return "main";
  if (OCCUPATION_CATEGORIES.has(category)) return "occupation";
  return "new";
}

function colorsFor(category: string): readonly [string, string] {
  const fam = familyOf(category);
  if (fam === "main") return MAIN_COLORS[category];
  return fam === "occupation" ? SLOT.violet : SLOT.yellow;
}

function main() {
  const raw = readFileSync(DATA_FILE, "utf-8");
  const data: DrawData = JSON.parse(raw);
  console.log(`Loaded ${data.rounds.length} rounds from ${DATA_FILE}`);

  // Group by category
  const grouped = new Map<string, DrawRound[]>();
  for (const round of data.rounds) {
    const cat = categorize(round.roundType);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(round);
  }

  // Legend order: by family, then by round count (descending)
  const categories = [...grouped.entries()].sort(
    (a, b) =>
      FAMILY_ORDER.indexOf(familyOf(a[0])) - FAMILY_ORDER.indexOf(familyOf(b[0])) ||
      b[1].length - a[1].length
  );

  console.log(`\nCategories:`);
  for (const [cat, rounds] of categories) {
    console.log(`  ${cat}: ${rounds.length} rounds`);
  }

  // Build Chart.js datasets
  const datasets = categories.map(([cat, rounds]) => {
    const [colorLight, colorDark] = colorsFor(cat);
    const family = familyOf(cat);
    const sortedRounds = [...rounds].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    return {
      label: cat,
      data: sortedRounds.map((r) => ({
        x: r.date,
        y: r.crsScore,
        invitations: r.invitationsIssued,
        roundNumber: r.number,
        roundType: r.roundType,
        r: radiusFor(r.invitationsIssued),
      })),
      family,
      slug: slugFor(cat),
      colorLight,
      colorDark,
      borderWidth: 1.5,
      tension: 0.1,
      // Programs that share a family colour get points only: same-coloured
      // lines from different programs would read as one series.
      showLine: family === "main",
    };
  });
  const familyLabels = JSON.stringify(FAMILY_LABELS);

  const chartData = JSON.stringify(datasets);

  // Build distribution snapshots over time (deduplicated by asOfDate)
  const distRounds = data.rounds
    .filter((r) => r.distribution && r.distribution.total > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const seenDates = new Set<string>();
  const distSnapshots: Array<{
    date: string;
    ranges: Record<string, number>;
    total: number;
  }> = [];

  for (const r of distRounds) {
    const d = r.distribution!;
    const key = d.asOfDate || r.date;
    if (seenDates.has(key)) continue;
    seenDates.add(key);
    distSnapshots.push({
      date: r.date,
      ranges: {
        "601-1200": d.range601_1200,
        "501-600": d.range501_600,
        "491-500": d.range491_500,
        "481-490": d.range481_490,
        "471-480": d.range471_480,
        "461-470": d.range461_470,
        "451-460": d.range451_460,
        "441-450": d.range441_450,
        "431-440": d.range431_440,
        "421-430": d.range421_430,
        "411-420": d.range411_420,
        "401-410": d.range401_410,
        "351-400": d.range351_400,
        "301-350": d.range301_350,
        "0-300": d.range0_300,
      },
      total: d.total,
    });
  }

  const distributionData = JSON.stringify(distSnapshots);
  console.log(`\nDistribution snapshots: ${distSnapshots.length}`);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${BETA ? "[Beta] " : ""}Canada Express Entry - CRS Score Trends</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath fill='%23f59e0b' d='M32 4L29 12l-4-2 2 7-8-4 2 6H14l5 5-7 3 8 3-3 7 6-3 1 7 4-5 2 8h4l2-8 4 5 1-7 6 3-3-7 8-3-7-3 5-5h-7l2-6-8 4 2-7-4 2z'/%3E%3Crect fill='%23f59e0b' x='29' y='46' width='6' height='14' rx='1'/%3E%3C/svg%3E" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3"></script>
  <style>
    :root {
      color-scheme: dark;
      --page: #0d0d0d;
      --surface: #1a1a19;
      --surface-raised: #2c2c2a;
      --ink: #f0efec;
      --ink-2: #c3c2b7;
      --muted: #898781;
      --grid: #2c2c2a;
      --axis: #383835;
      --hairline: rgba(255, 255, 255, 0.10);
      --good-text: #0ca30c;
      --bad-text: #e66767;
      --link: #6ea8f0;
      --focus: #3987e5;
    }
    .light {
      color-scheme: light;
      --page: #f9f9f7;
      --surface: #fcfcfb;
      --surface-raised: #ffffff;
      --ink: #0b0b0b;
      --ink-2: #52514e;
      --muted: #898781;
      --grid: #e1e0d9;
      --axis: #c3c2b7;
      --hairline: rgba(11, 11, 11, 0.10);
      --good-text: #006300;
      --bad-text: #b42318;
      --link: #2a78d6;
      --focus: #2a78d6;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      background: var(--page);
      color: var(--ink);
      padding: 24px 20px 32px;
      line-height: 1.4;
      font-variant-numeric: tabular-nums;
    }
    .page { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
    header h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.01em; }
    .subtitle { font-size: 0.875rem; color: var(--ink-2); margin-top: 4px; }
    .card {
      background: var(--surface);
      border: 1px solid var(--hairline);
      border-radius: 12px;
      padding: 20px;
    }
    h2 { font-size: 1.1rem; font-weight: 650; }

    /* ---- Score hero ---- */
    .hero-top { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .hero-label { font-size: 1rem; font-weight: 600; }
    .hero input {
      width: 120px;
      padding: 8px 12px;
      border: 1px solid var(--axis);
      border-radius: 10px;
      background: var(--surface-raised);
      color: var(--ink);
      font: inherit;
      font-size: 1.75rem;
      font-weight: 700;
      text-align: center;
      outline: none;
      -moz-appearance: textfield;
    }
    .hero input::-webkit-outer-spin-button,
    .hero input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    .hero input:focus { border-color: var(--focus); box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus) 25%, transparent); }
    .hero input::placeholder { color: var(--muted); font-weight: 400; }
    .pool-chips { display: flex; gap: 24px; flex-wrap: wrap; }
    .pool-chip .chip-label { font-size: 0.75rem; color: var(--muted); }
    .pool-chip .chip-val { font-size: 1.1rem; font-weight: 650; }
    .hint { font-size: 0.875rem; color: var(--ink-2); margin-top: 12px; }
    .results {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
      gap: 8px;
      margin-top: 16px;
    }
    .results:empty { display: none; }
    .result {
      border: 1px solid var(--hairline);
      border-radius: 8px;
      padding: 10px 12px;
      background: var(--surface-raised);
    }
    .result .name { font-size: 0.8rem; color: var(--ink-2); display: flex; align-items: center; gap: 6px; }
    .result .big { font-size: 1.25rem; font-weight: 700; margin-top: 2px; }
    .result .big small { display: block; font-size: 0.8rem; font-weight: 500; color: var(--ink-2); }
    .result .sub { font-size: 0.75rem; color: var(--ink-2); margin-top: 2px; }
    .result .sub.good { color: var(--good-text); }
    .result .sub.bad { color: var(--bad-text); }
    .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; display: inline-block; }

    /* ---- Latest-draw tiles ---- */
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .tile { background: var(--surface); border: 1px solid var(--hairline); border-radius: 12px; padding: 14px 16px; }
    .tile .label { font-size: 0.75rem; color: var(--muted); }
    .tile .value { font-size: 1.5rem; font-weight: 700; margin-top: 2px; }
    .tile .sub { font-size: 0.8rem; color: var(--ink-2); margin-top: 2px; }
    .tile .rows { margin-top: 6px; display: grid; gap: 3px; font-size: 0.85rem; }
    .tile .rows div { display: flex; align-items: center; gap: 6px; }
    .tile .rows b { margin-left: auto; font-weight: 650; }

    /* ---- Toolbar ---- */
    .chart-toolbar { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    .seg-label { font-size: 0.75rem; color: var(--muted); margin-right: 6px; }
    .seg { display: inline-flex; align-items: center; }
    .toolbar-group {
      display: inline-flex;
      gap: 2px;
      background: var(--page);
      border: 1px solid var(--hairline);
      border-radius: 8px;
      padding: 2px;
    }
    .toolbar-group button {
      padding: 4px 12px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--ink-2);
      cursor: pointer;
      font: inherit;
      font-size: 0.8rem;
    }
    .toolbar-group button:hover { color: var(--ink); }
    .toolbar-group button.active {
      background: var(--surface-raised);
      color: var(--ink);
      font-weight: 600;
      box-shadow: 0 0 0 1px var(--hairline), 0 1px 2px rgba(0, 0, 0, 0.12);
    }

    /* ---- Legend chips ---- */
    .legend { display: grid; gap: 6px; }
    .legend-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
    .legend-row .fam { font-size: 0.75rem; color: var(--muted); min-width: 150px; padding: 2px 0; }
    .programs { margin-top: 18px; }
    .programs-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
    .programs-title { font-size: 1rem; font-weight: 600; }
    .programs-hint { font-size: 0.85rem; color: var(--ink-2); }
    .link-btn { background: none; border: none; color: var(--link); cursor: pointer; font: inherit; font-size: 0.85rem; padding: 0; }
    .chip.picked { border-color: var(--ink); font-weight: 600; }
    .hero .chart-toolbar { margin-top: 24px; }
    .chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 3px 10px 3px 8px;
      border: 1px solid var(--hairline);
      border-radius: 999px;
      background: transparent;
      color: var(--ink);
      font: inherit;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .chip:hover { background: var(--surface-raised); }
    .chip.off { color: var(--muted); }
    .chip.off .dot { background: transparent !important; box-shadow: inset 0 0 0 1.5px var(--muted); }

    .chart-box { position: relative; }
    canvas { width: 100% !important; }

    .beta-banner {
      font-size: 0.85rem; color: var(--ink); background: var(--surface);
      border: 1px dashed var(--axis); border-radius: 8px; padding: 8px 12px;
    }
    .beta-banner a { color: var(--link); }
    .footer { font-size: 0.75rem; color: var(--muted); text-align: center; }
    .footer a { color: var(--link); }

    @media (max-width: 600px) {
      body { padding: 16px 12px 24px; }
      .card { padding: 14px; }
      header h1 { font-size: 1.25rem; }
      .legend-row .fam { min-width: 0; width: 100%; }
      .results { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .tile .value { font-size: 1.25rem; }
    }
  </style>
  ${BETA
    ? '<meta name="robots" content="noindex, nofollow">'
    : '<script data-goatcounter="https://express-entry-score-stats.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>'}
</head>
<body>
  <main class="page">
    ${BETA ? '<p class="beta-banner"><b>Beta preview.</b> Not the live site, which is <a href="../">here</a>.</p>' : ""}
    <header>
      <h1>Canada Express Entry &mdash; CRS cutoffs</h1>
      <p class="subtitle">The lowest CRS score invited in each round, by program. Bigger circles mean more invitations.</p>
    </header>

    <section class="tiles" id="stats"></section>

    <section class="card hero">
      <div class="hero-top">
        <label for="scoreInput" class="hero-label">Your CRS score</label>
        <input type="number" id="scoreInput" min="0" max="1200" placeholder="480" inputmode="numeric" />
        <div id="poolPosition" class="pool-chips"></div>
      </div>
      <div class="programs">
        <div class="programs-head">
          <span class="programs-title">Your programs</span>
          <span class="programs-hint" id="programsHint"></span>
          <button id="clearPrograms" class="link-btn">Clear</button>
        </div>
        <div class="legend" id="controls"></div>
      </div>
      <p class="hint" id="scoreHint"></p>
      <div class="results" id="scoreResults"></div>
      <div class="chart-toolbar">
        <div class="seg"><span class="seg-label">Range</span>
          <div class="toolbar-group" id="timeRange">
            <button class="active" data-range="3y">Last 3 years</button>
            <button data-range="all">All time</button>
          </div>
        </div>
        <div class="seg"><span class="seg-label">Trend</span>
          <div class="toolbar-group" id="projectionMode">
            <button class="active" data-proj="off">Off</button>
            <button data-proj="on">On</button>
          </div>
        </div>
        <div class="seg"><span class="seg-label">Theme</span>
          <div class="toolbar-group" id="themeToggle">
            <button data-theme="auto" class="active">Auto</button>
            <button data-theme="light">Light</button>
            <button data-theme="dark">Dark</button>
          </div>
        </div>
      </div>
      <div class="chart-box"><canvas id="chart"></canvas></div>
    </section>

    <section class="card">
      <h2>Who&rsquo;s in the pool</h2>
      <p class="subtitle" id="distSubtitle">Candidates in the Express Entry pool by score range.</p>
      <div class="chart-box" id="distChartContainer" style="margin-top: 12px;">
        <canvas id="distChart"></canvas>
      </div>
    </section>

    <p class="footer">
    Contains information licensed under the <a href="https://open.canada.ca/en/open-government-licence-canada">Open Government Licence &ndash; Canada</a>.
    Data source: <a href="${data.source}">IRCC Express Entry Rounds</a>
    &middot; Fetched ${new Date(data.fetchedAt).toLocaleDateString()}
    &middot; ${data.rounds.length} rounds total
    <br>
    Built with <a href="https://www.chartjs.org/">Chart.js</a>,
    <a href="https://github.com/chartjs/chartjs-adapter-date-fns">chartjs-adapter-date-fns</a>,
    and <a href="https://github.com/chartjs/chartjs-plugin-annotation">chartjs-plugin-annotation</a>
    (MIT License)
    &middot; <a href="https://github.com/skfd/express_entry_score_stats">View on GitHub</a>
    </p>
  </main>

  <script>
    const originalDatasets = ${chartData};
    const familyLabels = ${familyLabels};
    const distributionSnapshots = ${distributionData};
    const PROJECTION_MONTHS = 6;
    const MOVING_AVG_WINDOW = 6;
    const DAY_MS = 24 * 60 * 60 * 1000;
    // A line segment spanning more than ~6 months without a round is not drawn:
    // it would show a trend across a stretch with no data.
    const GAP_MS = 183 * DAY_MS;

    originalDatasets.forEach(ds => {
      // Circle area is proportional to invitations issued in the round
      ds.pointRadius = (c) => (c.raw && c.raw.r) || 3;
      ds.pointHoverRadius = (c) => ((c.raw && c.raw.r) || 3) + 3;
      ds.segment = {
        borderColor: (c) => (c.p1.parsed.x - c.p0.parsed.x > GAP_MS ? 'transparent' : undefined),
      };
    });

    // Stubs — replaced once distribution chart is initialized
    var onScoreChanged = function(score) {};
    var onTimeRangeChanged = function() {};
    var onThemeChanged = function() {};

    // Date-only strings (YYYY-MM-DD) are local calendar dates; new Date('2026-10-28')
    // would be UTC midnight, which shows as Oct 27 west of Greenwich.
    const fmtDate = (s, opts) => new Date(String(s).length === 10 ? s + 'T00:00:00' : s)
      .toLocaleDateString('en-CA', opts || { year: 'numeric', month: 'short', day: 'numeric' });
    const median = (arr) => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };

    // ========== URL state persistence ==========

    function readURL() {
      const p = new URLSearchParams(window.location.search);
      const proj = p.get('proj');
      return {
        range: p.get('range') === 'all' ? 'all' : '3y',
        // Older links used proj=linear|moving-avg|poly; any of them means "trend on"
        proj: proj && proj !== 'off' ? 'on' : 'off',
        programs: p.get('programs') ? p.get('programs').split(',').filter(Boolean) : [],
        // Older links hid programs by position: ?hide=0,2
        hide: p.get('hide') ? p.get('hide').split(',').filter(Boolean) : [],
        score: p.get('score') || '',
        theme: p.get('theme') || 'auto',
      };
    }

    function writeURL() {
      const p = new URLSearchParams();
      if (timeRange !== '3y') p.set('range', timeRange);
      if (projectionMode !== 'off') p.set('proj', 'on');
      if (selectedPrograms.size > 0) {
        p.set('programs', originalDatasets.filter(ds => selectedPrograms.has(ds.label)).map(ds => ds.slug).join(','));
      }
      if (userScore > 0) p.set('score', String(userScore));
      if (currentTheme !== 'auto') p.set('theme', currentTheme);
      const qs = p.toString();
      const url = window.location.pathname + (qs ? '?' + qs : '');
      history.replaceState(null, '', url);
    }

    const initState = readURL();
    let projectionMode = initState.proj;
    let timeRange = initState.range;
    let userScore = initState.score ? parseInt(initState.score, 10) : 0;
    let currentTheme = initState.theme;

    // The reader's programs. Empty = nothing picked = show everything.
    const selectedPrograms = new Set();
    initState.programs.forEach(slug => {
      const ds = originalDatasets.find(d => d.slug === slug);
      if (ds) selectedPrograms.add(ds.label);
    });
    if (!selectedPrograms.size && initState.hide.length) {
      const hidden = new Set(initState.hide.map(i => parseInt(i, 10)));
      originalDatasets.forEach((ds, i) => { if (!hidden.has(i)) selectedPrograms.add(ds.label); });
      if (selectedPrograms.size === originalDatasets.length) selectedPrograms.clear();
    }
    const isHidden = (label) => selectedPrograms.size > 0 && !selectedPrograms.has(label);

    function rangeCutoff() {
      if (timeRange !== '3y') return 0;
      const n = new Date();
      return new Date(n.getFullYear() - 3, n.getMonth(), n.getDate()).getTime();
    }

    // Yearly ticks for all time; quarterly for the last 3 years
    function timeAxis() {
      return timeRange === '3y'
        ? { unit: 'quarter', displayFormats: { quarter: 'MMM yyyy' }, tooltipFormat: 'PP' }
        : { unit: 'year', displayFormats: { year: 'yyyy' }, tooltipFormat: 'PP' };
    }

    // ========== Theme management ==========

    const darkColors = {
      grid: '#2c2c2a', tick: '#898781', axisTitle: '#898781',
      ink: '#f0efec', surface: '#1a1a19',
      tooltipBg: '#2c2c2a', tooltipTitle: '#f0efec',
      tooltipBody: '#c3c2b7', tooltipBorder: '#383835',
    };
    const lightColors = {
      grid: '#e1e0d9', tick: '#898781', axisTitle: '#898781',
      ink: '#0b0b0b', surface: '#fcfcfb',
      tooltipBg: '#ffffff', tooltipTitle: '#0b0b0b',
      tooltipBody: '#52514e', tooltipBorder: '#e1e0d9',
    };

    function resolveTheme(pref) {
      if (pref === 'light') return 'light';
      if (pref === 'dark') return 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function getThemeColors() {
      return resolveTheme(currentTheme) === 'light' ? lightColors : darkColors;
    }

    // Series colours are stepped separately for each surface
    function paintDatasets() {
      const light = resolveTheme(currentTheme) === 'light';
      originalDatasets.forEach(ds => {
        const c = light ? ds.colorLight : ds.colorDark;
        ds.borderColor = c;
        ds.backgroundColor = c + '40';
      });
      legendDots.forEach((dot, i) => { if (dot) dot.style.background = originalDatasets[i].borderColor; });
    }

    let chartRef = null;
    const legendDots = [];

    function applyTheme() {
      const effective = resolveTheme(currentTheme);
      document.documentElement.classList.toggle('light', effective === 'light');
      paintDatasets();

      if (chartRef) {
        const c = getThemeColors();
        const o = chartRef.options;
        o.scales.x.grid.color = c.grid;
        o.scales.x.ticks.color = c.tick;
        o.scales.y.grid.color = c.grid;
        o.scales.y.ticks.color = c.tick;
        o.scales.y.title.color = c.axisTitle;
        o.plugins.tooltip.backgroundColor = c.tooltipBg;
        o.plugins.tooltip.titleColor = c.tooltipTitle;
        o.plugins.tooltip.bodyColor = c.tooltipBody;
        o.plugins.tooltip.borderColor = c.tooltipBorder;
        updateScoreLine();
        rebuildChart();
        updateStats();
      }
      onThemeChanged();
    }

    // Apply theme immediately (before chart creation, for CSS)
    applyTheme();

    // Listen for system theme changes when in auto mode
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (currentTheme === 'auto') applyTheme();
    });

    // ========== Trend math ==========

    // Linear regression: y = slope * x + intercept
    function linearRegression(pts) {
      const n = pts.length;
      if (n < 2) return null;
      let sx = 0, sy = 0, sxy = 0, sxx = 0;
      for (const p of pts) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
      const d = n * sxx - sx * sx;
      if (Math.abs(d) < 1e-10) return null;
      const slope = (n * sxy - sx * sy) / d;
      const intercept = (sy - slope * sx) / n;
      return { eval: (x) => slope * x + intercept, slope, intercept };
    }

    // Trend = trailing moving average of the last MOVING_AVG_WINDOW rounds,
    // continued PROJECTION_MONTHS ahead along the slope of its last 3 points.
    function movingAvgProjection(filtered, dsLabel, dsColor) {
      if (filtered.length < MOVING_AVG_WINDOW) return null;

      const sorted = [...filtered].sort((a, b) => new Date(a.x).getTime() - new Date(b.x).getTime());
      const smoothed = [];
      for (let i = MOVING_AVG_WINDOW - 1; i < sorted.length; i++) {
        let sum = 0;
        for (let j = i - MOVING_AVG_WINDOW + 1; j <= i; j++) sum += sorted[j].y;
        smoothed.push({
          x: sorted[i].x,
          y: Math.round(sum / MOVING_AVG_WINDOW),
          roundType: dsLabel + ' (trend)',
          invitations: 0,
          isProjection: true,
        });
      }

      if (smoothed.length >= 2) {
        const tail = smoothed.slice(-3);
        const reg = linearRegression(tail.map(p => ({ x: new Date(p.x).getTime(), y: p.y })));
        if (reg) {
          const lastDate = new Date(smoothed[smoothed.length - 1].x);
          const endDate = new Date(lastDate);
          endDate.setMonth(endDate.getMonth() + PROJECTION_MONTHS);
          const startT = lastDate.getTime(), endT = endDate.getTime();
          for (let i = 1; i <= 12; i++) {
            const t = startT + (endT - startT) * (i / 12);
            smoothed.push({
              x: new Date(t).toISOString().split('T')[0],
              y: Math.max(0, Math.round(reg.eval(t))),
              roundType: dsLabel + ' (forecast)',
              invitations: 0,
              isProjection: true,
            });
          }
        }
      }

      return {
        label: dsLabel + ' (ma)',
        data: smoothed,
        borderColor: dsColor,
        backgroundColor: 'transparent',
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2.5,
        borderDash: [2, 3],
        tension: 0.3,
        showLine: true,
        segment: {
          borderColor: (c) => (c.p1.parsed.x - c.p0.parsed.x > GAP_MS ? 'transparent' : undefined),
        },
        _isProjection: true,
      };
    }

    // ========== Dataset builder ==========

    function buildDatasets() {
      const cutoff = rangeCutoff();
      const result = [];

      for (const ds of originalDatasets) {
        const filtered = cutoff > 0
          ? ds.data.filter(d => new Date(d.x).getTime() >= cutoff)
          : ds.data.slice();

        result.push({ ...ds, data: filtered });

        // Trend lines only for main programs: in a shared-colour family several
        // same-coloured trend lines would be indistinguishable.
        if (projectionMode === 'off' || ds.family !== 'main' || filtered.length < 3) continue;
        const proj = movingAvgProjection(filtered, ds.label, ds.borderColor);
        if (proj) result.push(proj);
      }

      return result;
    }

    // ========== Your programs (also the chart legend) ==========
    // First tap picks just that program; later taps add or remove. Clear = all.

    const controlsEl = document.getElementById('controls');
    const categoryButtons = [];

    ['main', 'occupation', 'new'].forEach(fam => {
      const idxs = originalDatasets.map((d, i) => i).filter(i => originalDatasets[i].family === fam);
      if (!idxs.length) return;
      const row = document.createElement('div');
      row.className = 'legend-row';
      const famLabel = document.createElement('span');
      famLabel.className = 'fam';
      famLabel.textContent = familyLabels[fam];
      row.appendChild(famLabel);
      idxs.forEach(i => {
        const ds = originalDatasets[i];
        const btn = document.createElement('button');
        btn.className = 'chip';
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = ds.borderColor;
        btn.appendChild(dot);
        btn.appendChild(document.createTextNode(ds.label));
        btn.title = ds.data.length + ' round' + (ds.data.length !== 1 ? 's' : '');
        btn.onclick = () => toggleProgram(i);
        row.appendChild(btn);
        categoryButtons[i] = btn;
        legendDots[i] = dot;
      });
      controlsEl.appendChild(row);
    });

    const clearBtn = document.getElementById('clearPrograms');
    const programsHintEl = document.getElementById('programsHint');
    clearBtn.onclick = () => { selectedPrograms.clear(); afterLegendChange(); };

    function syncLegend() {
      categoryButtons.forEach((btn, i) => {
        if (!btn) return;
        const label = originalDatasets[i].label;
        btn.classList.toggle('picked', selectedPrograms.has(label));
        btn.classList.toggle('off', isHidden(label));
        btn.setAttribute('aria-pressed', String(selectedPrograms.has(label)));
      });
      clearBtn.style.display = selectedPrograms.size ? '' : 'none';
      programsHintEl.textContent = selectedPrograms.size
        ? 'Tap to add or remove.'
        : 'Tap the ones you qualify for, to focus the cards and chart on them.';
    }
    syncLegend();

    // ========== Chart ==========

    const ctx = document.getElementById('chart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'scatter',
      data: { datasets: buildDatasets() },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: true },
        plugins: {
          annotation: { annotations: {} },
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const d = items[0].raw;
                if (d.isProjection) return d.roundType + ' — ' + fmtDate(d.x);
                return 'Round #' + d.roundNumber + ' — ' + fmtDate(d.x);
              },
              label: (item) => {
                const d = item.raw;
                if (d.isProjection) return 'Trend CRS: ' + d.y;
                return [
                  d.roundType,
                  'CRS cutoff: ' + d.y,
                  'Invitations: ' + d.invitations.toLocaleString(),
                ];
              },
            },
            backgroundColor: getThemeColors().tooltipBg,
            titleColor: getThemeColors().tooltipTitle,
            bodyColor: getThemeColors().tooltipBody,
            borderColor: getThemeColors().tooltipBorder,
            borderWidth: 1,
            padding: 12,
          },
        },
        scales: {
          x: {
            type: 'time',
            time: timeAxis(),
            grid: { color: getThemeColors().grid },
            border: { display: false },
            ticks: { color: getThemeColors().tick, maxRotation: 0, autoSkipPadding: 16 },
          },
          y: {
            grid: { color: getThemeColors().grid },
            border: { display: false },
            ticks: { color: getThemeColors().tick },
            title: { display: true, text: 'CRS cutoff (lowest score invited)', color: getThemeColors().axisTitle },
          },
        },
      },
    });

    chartRef = chart;
    chart.canvas.parentNode.style.height = (window.innerWidth < 600 ? 420 : 520) + 'px';
    chart.resize();

    // Apply URL-restored program selection to the initial render
    if (selectedPrograms.size > 0) {
      chart.data.datasets.forEach((ds, i) => {
        const base = ds.label.replace(/ \\((?:ma)\\)$/, '');
        chart.getDatasetMeta(i).hidden = isHidden(base);
      });
      chart.update('none');
    }

    // ========== Rebuild ==========

    function rebuildChart() {
      const ds = buildDatasets();
      chart.data.datasets = ds;
      ds.forEach((d, i) => {
        const base = d.label.replace(/ \\((?:ma)\\)$/, '');
        chart.getDatasetMeta(i).hidden = isHidden(base);
      });
      chart.update();
      if (userScore > 0) buildScoreResults(userScore);
    }

    function afterLegendChange() {
      syncLegend();
      updateStats();
      rebuildChart();
      writeURL();
    }

    function toggleProgram(origIdx) {
      const label = originalDatasets[origIdx].label;
      if (selectedPrograms.has(label)) selectedPrograms.delete(label);
      else selectedPrograms.add(label);
      afterLegendChange();
    }

    // ========== Toolbar handlers ==========

    // Set initial active states from URL
    document.querySelectorAll('#timeRange button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.range === timeRange);
    });
    document.querySelectorAll('#projectionMode button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.proj === projectionMode);
    });

    document.querySelectorAll('#timeRange button').forEach(btn => {
      btn.addEventListener('click', () => {
        timeRange = btn.dataset.range;
        document.querySelectorAll('#timeRange button').forEach(b => b.classList.toggle('active', b === btn));
        chart.options.scales.x.time = timeAxis();
        rebuildChart();
        onTimeRangeChanged();
        writeURL();
      });
    });

    document.querySelectorAll('#projectionMode button').forEach(btn => {
      btn.addEventListener('click', () => {
        projectionMode = btn.dataset.proj;
        document.querySelectorAll('#projectionMode button').forEach(b => b.classList.toggle('active', b === btn));
        rebuildChart();
        writeURL();
      });
    });

    // Set initial active state for theme toggle from URL
    document.querySelectorAll('#themeToggle button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === currentTheme);
    });

    document.querySelectorAll('#themeToggle button').forEach(btn => {
      btn.addEventListener('click', () => {
        currentTheme = btn.dataset.theme;
        document.querySelectorAll('#themeToggle button').forEach(b => b.classList.toggle('active', b === btn));
        applyTheme();
        writeURL();
      });
    });

    // ========== Latest-draw tiles (independent of the range filter) ==========

    function updateStats() {
      const statsEl = document.getElementById('stats');
      const rounds = originalDatasets
        .flatMap((ds, i) => ds.data.map(d => ({ ...d, prog: ds.label, idx: i })))
        .sort((a, b) => new Date(a.x).getTime() - new Date(b.x).getTime());
      if (!rounds.length) { statsEl.innerHTML = ''; return; }

      const latest = rounds[rounds.length - 1];
      const latestT = new Date(latest.x).getTime();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const days = Math.max(0, Math.round((today.getTime() - new Date(latest.x + 'T00:00:00').getTime()) / DAY_MS));
      const last30 = rounds.filter(r => latestT - new Date(r.x).getTime() < 30 * DAY_MS).length;

      const year = new Date(latest.x).getUTCFullYear();
      const thisYear = rounds.filter(r => r.x.slice(0, 4) === String(year));
      const yearInv = thisYear.reduce((s, r) => s + (r.invitations || 0), 0);

      // Median cutoff per program over the 6 months before the latest round
      const recent = rounds.filter(r => latestT - new Date(r.x).getTime() <= 183 * DAY_MS);
      const byProg = new Map();
      recent.forEach(r => {
        if (isHidden(originalDatasets[r.idx].label)) return;
        if (!byProg.has(r.idx)) byProg.set(r.idx, []);
        byProg.get(r.idx).push(r.y);
      });
      const progRows = [...byProg.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 5)
        .map(([i, ys]) =>
          '<div><span class="dot" style="background:' + originalDatasets[i].borderColor + '"></span>' +
          esc(originalDatasets[i].label) + '<b>' + median(ys) + '</b></div>')
        .join('');

      statsEl.innerHTML =
        tile('Latest draw', latest.y + ' <small style="font-size:0.8rem;font-weight:500;color:var(--ink-2)">CRS</small>',
          esc(latest.prog) + ' &middot; ' + fmtDate(latest.x) + ' &middot; ' + latest.invitations.toLocaleString() + ' invited') +
        tile('Since the last draw', days + (days === 1 ? ' day' : ' days'),
          last30 + ' round' + (last30 !== 1 ? 's' : '') + ' in the 30 days before it') +
        tile('Invitations in ' + year, yearInv.toLocaleString(),
          thisYear.length + ' round' + (thisYear.length !== 1 ? 's' : '') + ' so far') +
        '<div class="tile"><div class="label">Median cutoff, last 6 months' + (selectedPrograms.size ? ', your programs' : '') +
        '</div><div class="rows">' + (progRows || '<div>No rounds in your programs</div>') + '</div></div>';
    }

    function tile(label, value, sub) {
      return '<div class="tile"><div class="label">' + label + '</div><div class="value">' + value +
        '</div><div class="sub">' + sub + '</div></div>';
    }

    function esc(s) {
      return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    updateStats();

    // ========== Score input + reference line + per-program results ==========

    const scoreInput = document.getElementById('scoreInput');
    const scoreResultsEl = document.getElementById('scoreResults');
    const scoreHintEl = document.getElementById('scoreHint');

    if (userScore > 0) scoreInput.value = userScore;
    applyScore(userScore);

    scoreInput.addEventListener('input', () => {
      const val = parseInt(scoreInput.value, 10);
      userScore = (val >= 0 && val <= 1200) ? val : 0;
      applyScore(userScore);
      writeURL();
    });

    function updateScoreLine() {
      const anns = chart.options.plugins.annotation.annotations;
      if (userScore > 0) {
        const c = getThemeColors();
        anns.scoreLine = {
          type: 'line',
          yMin: userScore,
          yMax: userScore,
          borderColor: c.ink,
          borderWidth: 1.5,
          borderDash: [6, 4],
          label: {
            display: true,
            content: 'Your score ' + userScore,
            position: 'start',
            backgroundColor: c.ink,
            color: c.surface,
            font: { weight: '600', size: 12 },
            padding: { top: 3, bottom: 3, left: 8, right: 8 },
            borderRadius: 4,
          },
        };
      } else {
        delete anns.scoreLine;
      }
    }

    function applyScore(score) {
      updateScoreLine();
      chart.update('none');
      buildScoreResults(score);
      onScoreChanged(score);
    }

    // One card per visible program that held a round in the past 12 months:
    // how many of its last 10 cutoffs the score met, and how the last one went.
    function buildScoreResults(score) {
      scoreResultsEl.innerHTML = '';
      if (!score || score <= 0) {
        scoreHintEl.textContent = 'Enter your score to see how it compares with each program’s recent rounds.';
        return;
      }

      const latestT = Math.max(...originalDatasets.flatMap(ds => ds.data.map(d => new Date(d.x).getTime())));
      let shown = 0;

      originalDatasets.forEach(ds => {
        if (isHidden(ds.label) || !ds.data.length) return;
        const sorted = [...ds.data].sort((a, b) => new Date(a.x).getTime() - new Date(b.x).getTime());
        const last = sorted[sorted.length - 1];
        if (!selectedPrograms.size && latestT - new Date(last.x).getTime() > 365 * DAY_MS) return;

        const lastN = sorted.slice(-10);
        const met = lastN.filter(d => d.y <= score).length;
        const metLast = last.y <= score;

        let status;
        if (metLast) {
          status = '<div class="sub good">✓ Met the last cutoff (' + last.y + ')</div>';
        } else {
          status = '<div class="sub bad">✗ Last cutoff ' + last.y + ' (+' + (last.y - score) + ')</div>';
          if (projectionMode !== 'off') {
            const projected = getProjectedCrossing(sorted, score, ds.label);
            if (projected) status += '<div class="sub">Trend reaches you around ' + projected.replace(' *', '') + '</div>';
          }
        }

        const card = document.createElement('div');
        card.className = 'result';
        card.innerHTML =
          '<div class="name"><span class="dot" style="background:' + ds.borderColor + '"></span>' + esc(ds.label) + '</div>' +
          '<div class="big">' + met + '/' + lastN.length + ' <small>recent cutoffs met</small></div>' +
          status +
          '<div class="sub">Last round ' + fmtDate(last.x, { year: 'numeric', month: 'short', day: 'numeric' }) + '</div>';
        scoreResultsEl.appendChild(card);
        shown++;
      });

      scoreHintEl.textContent = selectedPrograms.size
        ? 'Your programs. A cutoff is met when your score is at or above it.'
        : 'Programs that held a round in the past 12 months. A cutoff is met when your score is at or above it.';
    }

    // ========== Pool-aware projection helpers ==========

    // Given a CRS cutoff score, count candidates at or above it using a distribution snapshot
    function countAboveScore(dist, cutoffScore) {
      // Score range boundaries (lower bound of each range, high to low)
      const ranges = [
        { key: '601-1200', lo: 601 },
        { key: '501-600', lo: 501 },
        { key: '491-500', lo: 491 },
        { key: '481-490', lo: 481 },
        { key: '471-480', lo: 471 },
        { key: '461-470', lo: 461 },
        { key: '451-460', lo: 451 },
        { key: '441-450', lo: 441 },
        { key: '431-440', lo: 431 },
        { key: '421-430', lo: 421 },
        { key: '411-420', lo: 411 },
        { key: '401-410', lo: 401 },
        { key: '351-400', lo: 351 },
        { key: '301-350', lo: 301 },
        { key: '0-300', lo: 0 },
      ];
      let total = 0;
      for (const r of ranges) {
        const count = dist.ranges[r.key] || 0;
        if (cutoffScore <= r.lo) {
          // Entire range is above the cutoff
          total += count;
        } else {
          // Cutoff falls within this range — estimate proportionally
          // Range spans r.lo to r.hi (derive hi from next range's lo - 1, or 1200)
          const hi = r.key === '601-1200' ? 1200 : parseInt(r.key.split('-')[1]);
          const span = hi - r.lo + 1;
          if (cutoffScore <= hi) {
            const above = hi - cutoffScore + 1;
            total += Math.round(count * (above / span));
          }
          // If cutoff > hi, none from this range count
          break; // Lower ranges are all below cutoff
        }
      }
      return total;
    }

    // Find the distribution snapshot closest to a given date
    function findClosestDist(dateMs) {
      if (!distributionSnapshots.length) return null;
      let best = null;
      let bestDiff = Infinity;
      for (const snap of distributionSnapshots) {
        const diff = Math.abs(new Date(snap.date).getTime() - dateMs);
        if (diff < bestDiff) { bestDiff = diff; best = snap; }
      }
      // Only use if within 30 days
      if (bestDiff > 30 * 24 * 60 * 60 * 1000) return null;
      return best;
    }

    // Slope of the last 3 points of a trailing moving average; plain linear fit
    // when there are too few points to smooth. pts: [{x: ms, y}] sorted by x.
    function maTailRegression(pts) {
      if (pts.length < MOVING_AVG_WINDOW) return linearRegression(pts);
      const smoothed = [];
      for (let i = MOVING_AVG_WINDOW - 1; i < pts.length; i++) {
        let sum = 0;
        for (let j = i - MOVING_AVG_WINDOW + 1; j <= i; j++) sum += pts[j].y;
        smoothed.push({ x: pts[i].x, y: sum / MOVING_AVG_WINDOW });
      }
      return linearRegression(smoothed.slice(-3));
    }

    function getProjectedCrossing(sorted, score, label) {
      const pts = sorted.map(d => ({ x: new Date(d.x).getTime(), y: d.y }));

      // Try pool-aware projection first
      if (distributionSnapshots.length >= 3) {
        const poolResult = getPoolAwareProjection(sorted, score, label);
        if (poolResult) return poolResult;
      }

      // Fall back to the cutoff trend (same moving average as the chart)
      const reg = maTailRegression(pts);
      if (!reg) return null;

      // Search forward up to 3 years for crossing point
      const lastT = pts[pts.length - 1].x;
      const maxT = lastT + 3 * 365.25 * 24 * 60 * 60 * 1000;
      const step = 7 * 24 * 60 * 60 * 1000; // weekly

      for (let t = lastT; t <= maxT; t += step) {
        const projected = reg.eval(t);
        if (projected <= score) {
          const d = new Date(t);
          return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short' });
        }
      }
      return null;
    }

    // Pool-aware projection: uses competition ratio (candidates above cutoff / invitations)
    // instead of raw CRS score trend. This accounts for the non-linear density of
    // candidates at different score ranges — cutoffs stall at dense bands.
    function getPoolAwareProjection(sorted, userScore, label) {
      // Build competition ratio time series for this category
      // For each historical round, compute: candidatesAboveCutoff / invitationsIssued
      const ratioSeries = [];
      for (const d of sorted) {
        if (!d.invitations || d.invitations <= 0) continue;
        const dateMs = new Date(d.x).getTime();
        const dist = findClosestDist(dateMs);
        if (!dist) continue;
        const above = countAboveScore(dist, d.y);
        ratioSeries.push({
          x: dateMs,
          ratio: above / d.invitations,
          cutoff: d.y,
          invitations: d.invitations,
        });
      }

      if (ratioSeries.length < 3) return null;

      // Current: how competitive is it for the user's score?
      const latestDist = getLatestDistribution();
      if (!latestDist) return null;
      const userAbove = countAboveScore(latestDist, userScore);

      // Get typical invitation size for this category (median of recent rounds)
      const recentInvitations = sorted.slice(-10)
        .map(d => d.invitations)
        .filter(n => n > 0)
        .sort((a, b) => a - b);
      if (!recentInvitations.length) return null;
      const medianInvitations = recentInvitations[Math.floor(recentInvitations.length / 2)];

      const userRatio = userAbove / medianInvitations;

      // If ratio is already <= 1, user would likely be invited now
      if (userRatio <= 1.0) return null;

      // Project how the competition ratio for the user's score has been changing
      // Use the pool snapshots to compute the user's ratio at each snapshot
      const userRatioSeries = [];
      for (const snap of distributionSnapshots) {
        const dateMs = new Date(snap.date).getTime();
        const above = countAboveScore(snap, userScore);
        userRatioSeries.push({ x: dateMs, y: above / medianInvitations });
      }

      if (userRatioSeries.length < 2) return null;

      // Fit the same moving-average trend to the user's ratio
      const reg = maTailRegression(userRatioSeries);
      if (!reg) return null;

      // Search forward for when the ratio drops to <= 1.0 (favorable)
      const lastT = userRatioSeries[userRatioSeries.length - 1].x;
      const maxT = lastT + 3 * 365.25 * 24 * 60 * 60 * 1000;
      const step = 7 * 24 * 60 * 60 * 1000;

      for (let t = lastT; t <= maxT; t += step) {
        const projected = reg.eval(t);
        if (projected <= 1.0) {
          const d = new Date(t);
          return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short' }) + ' *';
        }
      }
      return null;
    }

    // ========== Distribution Chart ==========

    const distRangeLabels = [
      '601-1200', '501-600', '491-500', '481-490', '471-480',
      '461-470', '451-460', '441-450', '431-440', '421-430',
      '411-420', '401-410', '351-400', '301-350', '0-300'
    ];

    // Score bands are ordered, so they get one hue, light to dark (higher score
    // = more ink on light, more light on dark). With a score entered, bands
    // below it go neutral grey so the blue part is "candidates at or above you".
    const DIST_RAMP = {
      light: { lo: '#86b6ef', hi: '#0d366b', below: '#dcdad3' },
      dark: { lo: '#184f95', hi: '#b7d3f6', below: '#3a3a37' },
    };

    function mixHex(a, b, t) {
      const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
      const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
      return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
    }

    let distChartRef = null;

    function getLatestDistribution() {
      if (!distributionSnapshots.length) return null;
      return distributionSnapshots[distributionSnapshots.length - 1];
    }

    function buildDistChart() {
      const dCtx = document.getElementById('distChart').getContext('2d');

      if (distChartRef) {
        distChartRef.destroy();
        distChartRef = null;
      }

      const container = document.getElementById('distChartContainer');
      container.style.height = (window.innerWidth < 600 ? 360 : 420) + 'px';

      const cutoff = rangeCutoff();
      const filtered = cutoff > 0
        ? distributionSnapshots.filter(s => new Date(s.date).getTime() >= cutoff)
        : distributionSnapshots;

      if (!filtered.length) return;

      const theme = getThemeColors();
      const ramp = DIST_RAMP[resolveTheme(currentTheme)];
      const cutIdx = userScore > 0 ? getScoreRangeIndex(userScore) : distRangeLabels.length - 1;
      const n = distRangeLabels.length;
      const colorFor = (i) => i <= cutIdx ? mixHex(ramp.lo, ramp.hi, (n - 1 - i) / (n - 1)) : ramp.below;

      const sub = document.getElementById('distSubtitle');
      if (userScore > 0) {
        const latest = getLatestDistribution();
        const above = latest ? countAboveScore(latest, userScore) : 0;
        sub.textContent = 'Candidates in the Express Entry pool by score range. Blue: your range (' +
          distRangeLabels[cutIdx] + ') and above. Of those, about ' + above.toLocaleString() +
          ' have ' + userScore + ' or more in the latest count. Grey: below your range.';
      } else {
        sub.textContent = 'Candidates in the Express Entry pool by score range. Darker bands are higher scores.';
      }

      // One dataset per score range, stacked with the highest scores on top
      const datasets = distRangeLabels.map((range, i) => ({ range, i })).reverse().map(({ range, i }) => ({
        label: range,
        data: filtered.map(s => ({ x: s.date, y: s.ranges[range] || 0 })),
        backgroundColor: colorFor(i),
        borderColor: theme.surface,
        borderWidth: 1,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0.3,
      }));

      distChartRef = new Chart(dCtx, {
        type: 'line',
        data: { datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              reverse: true,
              labels: { color: theme.tick, font: { size: 10 }, boxWidth: 10, padding: 8 },
            },
            tooltip: {
              itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
              callbacks: {
                title: (items) => fmtDate(items[0].raw.x),
                label: (item) => item.dataset.label + ': ' + item.raw.y.toLocaleString(),
                labelColor: (item) => ({ borderColor: item.dataset.backgroundColor, backgroundColor: item.dataset.backgroundColor }),
                footer: (items) => {
                  const total = items.reduce((s, it) => s + it.raw.y, 0);
                  return 'Total pool: ' + total.toLocaleString();
                },
              },
              backgroundColor: theme.tooltipBg,
              titleColor: theme.tooltipTitle,
              bodyColor: theme.tooltipBody,
              footerColor: theme.tooltipTitle,
              borderColor: theme.tooltipBorder,
              borderWidth: 1,
            },
          },
          scales: {
            x: {
              type: 'time',
              time: timeAxis(),
              grid: { color: theme.grid },
              border: { display: false },
              ticks: { color: theme.tick, maxRotation: 0, autoSkipPadding: 16 },
              stacked: true,
            },
            y: {
              stacked: true,
              grid: { color: theme.grid },
              border: { display: false },
              ticks: {
                color: theme.tick,
                callback: function(v) {
                  if (v >= 1000) return (v / 1000).toFixed(0) + 'k';
                  return v;
                },
              },
              title: { display: true, text: 'Candidates in the pool', color: theme.axisTitle },
            },
          },
        },
      });
    }

    function getScoreRangeIndex(score) {
      // Returns the y-axis index for the bar chart where the user's score falls
      if (score >= 601) return 0;
      if (score >= 501) return 1;
      if (score >= 491) return 2;
      if (score >= 481) return 3;
      if (score >= 471) return 4;
      if (score >= 461) return 5;
      if (score >= 451) return 6;
      if (score >= 441) return 7;
      if (score >= 431) return 8;
      if (score >= 421) return 9;
      if (score >= 411) return 10;
      if (score >= 401) return 11;
      if (score >= 351) return 12;
      if (score >= 301) return 13;
      return 14;
    }

    function getScoreRangeLabel(score) {
      const idx = getScoreRangeIndex(score);
      return distRangeLabels[idx];
    }

    // Pool position when the user enters a score
    function updatePoolPosition(score) {
      const el = document.getElementById('poolPosition');
      const latest = getLatestDistribution();
      if (!score || score <= 0 || !latest) {
        el.innerHTML = '';
        return;
      }

      const abovePool = countAboveScore(latest, score);
      const total = latest.total;
      const topPct = total > 0 ? ((abovePool / total) * 100).toFixed(1) : '0';

      // Typical round size: median invitations over the 10 most recent rounds
      const allRoundsFlat = originalDatasets.flatMap(ds => ds.data)
        .filter(d => d.invitations > 0)
        .sort((a, b) => new Date(a.x).getTime() - new Date(b.x).getTime());
      const medInv = median(allRoundsFlat.slice(-10).map(d => d.invitations));
      const compRatio = medInv > 0 ? (abovePool / medInv) : 0;

      const chip = (label, value, title) =>
        '<div class="pool-chip" title="' + title + '"><div class="chip-label">' + label +
        '</div><div class="chip-val">' + value + '</div></div>';

      el.innerHTML =
        chip('Ahead of you in the pool', abovePool.toLocaleString(),
          'Candidates with a CRS score above yours in the latest pool count (' + fmtDate(latest.date) + ')') +
        chip('Rounds’ worth ahead', compRatio.toFixed(1) + '&times;',
          'Candidates ahead of you divided by a typical round (' + medInv.toLocaleString() + ' invitations, median of the last 10). Below 1 means one typical round would reach you.') +
        chip('Your place', 'Top ' + topPct + '%',
          'Share of the ' + total.toLocaleString() + ' candidates in the pool with a higher score');
    }

    // Wire up score and time range changes to distribution chart
    onScoreChanged = function(score) {
      updatePoolPosition(score);
      buildDistChart();
    };
    onTimeRangeChanged = function() {
      buildDistChart();
    };
    onThemeChanged = function() {
      buildDistChart();
    };

    // Build initial dist chart
    if (distributionSnapshots.length > 0) {
      buildDistChart();
      if (userScore > 0) updatePoolPosition(userScore);
    }

    // Apply pool position if score was set from URL
    if (userScore > 0) {
      updatePoolPosition(userScore);
    }
  </script>
</body>
</html>`;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, html);
  console.log(`\nGenerated visualization at ${OUTPUT_FILE}`);
}

main();
