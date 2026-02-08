import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { DrawData, DrawRound } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "data", "rounds.json");
const OUTPUT_DIR = join(__dirname, "..", "dist");
const OUTPUT_FILE = join(OUTPUT_DIR, "index.html");

/** Normalize round types into broader categories for charting */
function categorize(roundType: string): string {
  const lower = roundType.toLowerCase();

  if (lower.includes("no program specified") || lower === "general")
    return "General";

  if (lower.includes("provincial nominee")) return "Provincial Nominee Program";

  if (lower.includes("canadian experience"))
    return "Canadian Experience Class";

  if (lower.includes("federal skilled worker"))
    return "Federal Skilled Workers";

  if (lower.includes("federal skilled trades"))
    return "Federal Skilled Trades";

  if (lower.includes("french")) return "French Language Proficiency";

  if (lower.includes("healthcare") || lower.includes("health care"))
    return "Healthcare Occupations";

  if (lower.includes("stem")) return "STEM Occupations";

  if (lower.includes("trade")) return "Trade Occupations";

  if (lower.includes("transport")) return "Transport Occupations";

  if (lower.includes("agriculture") || lower.includes("agri-food"))
    return "Agriculture & Agri-food";

  if (lower.includes("education")) return "Education Occupations";

  // Keep original if no match
  return roundType;
}

const COLORS: Record<string, string> = {
  General: "#2563eb",
  "Provincial Nominee Program": "#dc2626",
  "Canadian Experience Class": "#16a34a",
  "Federal Skilled Workers": "#9333ea",
  "Federal Skilled Trades": "#ea580c",
  "French Language Proficiency": "#0891b2",
  "Healthcare Occupations": "#e11d48",
  "STEM Occupations": "#4f46e5",
  "Trade Occupations": "#b45309",
  "Transport Occupations": "#6d28d9",
  "Agriculture & Agri-food": "#15803d",
  "Education Occupations": "#d97706",
};

function getColor(category: string, index: number): string {
  if (COLORS[category]) return COLORS[category];
  const fallback = [
    "#f59e0b",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
    "#f97316",
    "#14b8a6",
    "#a855f7",
  ];
  return fallback[index % fallback.length];
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

  // Sort categories by count (descending) for legend order
  const categories = [...grouped.entries()].sort(
    (a, b) => b[1].length - a[1].length
  );

  console.log(`\nCategories:`);
  for (const [cat, rounds] of categories) {
    console.log(`  ${cat}: ${rounds.length} rounds`);
  }

  // Build Chart.js datasets
  const datasets = categories.map(([cat, rounds], idx) => {
    const color = getColor(cat, idx);
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
      })),
      borderColor: color,
      backgroundColor: color + "33",
      pointRadius: 3,
      pointHoverRadius: 6,
      borderWidth: 1.5,
      tension: 0.1,
      showLine: true,
    };
  });

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
  <title>Canada Express Entry - CRS Score Trends</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath fill='%23f59e0b' d='M32 4L29 12l-4-2 2 7-8-4 2 6H14l5 5-7 3 8 3-3 7 6-3 1 7 4-5 2 8h4l2-8 4 5 1-7 6 3-3-7 8-3-7-3 5-5h-7l2-6-8 4 2-7-4 2z'/%3E%3Crect fill='%23f59e0b' x='29' y='46' width='6' height='14' rx='1'/%3E%3C/svg%3E" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3"></script>
  <style>
    :root {
      --bg: #0f172a;
      --bg-card: #1e293b;
      --bg-hover: #334155;
      --border: #334155;
      --text: #e2e8f0;
      --text-heading: #f1f5f9;
      --text-muted: #94a3b8;
      --text-faint: #64748b;
      --text-input: #f8fafc;
      --text-placeholder: #475569;
      --grid-line: #1e293b;
      --grid-line-y: #334155;
      --tooltip-bg: #1e293b;
      --tooltip-title: #f1f5f9;
      --tooltip-body: #cbd5e1;
      --tooltip-border: #334155;
      --link: #60a5fa;
    }
    .light {
      --bg: #f8fafc;
      --bg-card: #ffffff;
      --bg-hover: #e2e8f0;
      --border: #cbd5e1;
      --text: #1e293b;
      --text-heading: #0f172a;
      --text-muted: #64748b;
      --text-faint: #94a3b8;
      --text-input: #0f172a;
      --text-placeholder: #94a3b8;
      --grid-line: #e2e8f0;
      --grid-line-y: #cbd5e1;
      --tooltip-bg: #ffffff;
      --tooltip-title: #0f172a;
      --tooltip-body: #334155;
      --tooltip-border: #e2e8f0;
      --link: #2563eb;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 20px;
      transition: background 0.2s, color 0.2s;
    }
    h1 {
      text-align: center;
      margin-bottom: 4px;
      font-size: 1.5rem;
      color: var(--text-heading);
    }
    .subtitle {
      text-align: center;
      margin-bottom: 20px;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .chart-container {
      position: relative;
      max-width: 1400px;
      margin: 0 auto;
      background: var(--bg-card);
      border-radius: 12px;
      padding: 20px;
    }
    canvas { width: 100% !important; }
    .toolbar {
      max-width: 1400px;
      margin: 0 auto 12px;
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .toolbar-group {
      display: flex;
      gap: 4px;
      background: var(--bg-card);
      border-radius: 8px;
      padding: 4px;
    }
    .toolbar-group button {
      padding: 6px 16px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 500;
      transition: all 0.15s;
    }
    .toolbar-group button:hover { background: var(--bg-hover); color: var(--text); }
    .toolbar-group button.active {
      background: #3b82f6;
      color: white;
    }
    .toolbar-group button.active.projection-on {
      background: #8b5cf6;
      color: white;
    }
    .controls {
      max-width: 1400px;
      margin: 0 auto 16px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }
    .controls button {
      padding: 6px 14px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg-card);
      color: var(--text);
      cursor: pointer;
      font-size: 0.8rem;
      transition: all 0.15s;
    }
    .controls button:hover { background: var(--bg-hover); }
    .controls button.active {
      background: #3b82f6;
      border-color: #3b82f6;
      color: white;
    }
    .stats {
      max-width: 1400px;
      margin: 20px auto 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .stat-card {
      background: var(--bg-card);
      border-radius: 8px;
      padding: 14px;
    }
    .stat-card h3 {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .stat-card .value {
      font-size: 1.3rem;
      font-weight: 700;
    }
    .score-bar {
      max-width: 1400px;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .score-bar label {
      font-size: 0.9rem;
      color: var(--text-muted);
      font-weight: 500;
      white-space: nowrap;
    }
    .score-bar input {
      width: 100px;
      padding: 8px 12px;
      border: 2px solid var(--border);
      border-radius: 10px;
      background: var(--bg-card);
      color: var(--text-input);
      font-size: 1.4rem;
      font-weight: 700;
      text-align: center;
      letter-spacing: 0.08em;
      outline: none;
      transition: border-color 0.2s;
      -moz-appearance: textfield;
    }
    .score-bar input::-webkit-outer-spin-button,
    .score-bar input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .score-bar input:focus {
      border-color: #f59e0b;
    }
    .score-bar input::placeholder {
      color: var(--text-placeholder);
      font-weight: 400;
      font-size: 0.9rem;
    }
    .score-cards {
      display: contents;
    }
    .score-result-card {
      background: var(--bg-card);
      border-radius: 8px;
      padding: 8px 14px;
      border-left: 3px solid var(--border);
    }
    .score-result-card .cat-name {
      font-size: 0.65rem;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 180px;
    }
    .score-result-card .result-text {
      font-size: 0.8rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .score-result-card .result-text.eligible { color: #16a34a; }
    .score-result-card .result-text.projected { color: #d97706; }
    .score-result-card .result-text.unlikely { color: #dc2626; }
    .section-heading {
      text-align: center;
      margin-top: 32px;
      margin-bottom: 4px;
      font-size: 1.3rem;
      color: var(--text-heading);
    }
    .pool-position-inline {
      display: contents;
    }
    .pool-chip {
      background: var(--bg-card);
      border-radius: 8px;
      padding: 6px 12px;
      border-left: 3px solid #f59e0b;
      white-space: nowrap;
    }
    .pool-chip .chip-label {
      font-size: 0.6rem;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 1px;
    }
    .pool-chip .chip-val {
      font-size: 0.85rem;
      font-weight: 700;
    }
    .pool-chip .chip-val.good { color: #16a34a; }
    .pool-chip .chip-val.warn { color: #d97706; }
    .pool-chip .chip-val.bad { color: #dc2626; }
    .footer {
      text-align: center;
      margin-top: 20px;
      font-size: 0.75rem;
      color: var(--text-faint);
    }
    .footer a { color: var(--link); }
  </style>
</head>
<body>
  <h1>Canada Express Entry &mdash; CRS Score Trends</h1>
  <p class="subtitle">Minimum CRS score required per invitation round, grouped by program type</p>

  <div class="toolbar">
    <div class="toolbar-group" id="timeRange">
      <button class="active" data-range="all">All Time</button>
      <button data-range="3y">Last 3 Years</button>
    </div>
    <div class="toolbar-group" id="projectionMode">
      <button class="active" data-proj="off">Off</button>
      <button data-proj="linear">Linear</button>
      <button data-proj="moving-avg">Moving Avg</button>
      <button data-proj="poly">Polynomial</button>
    </div>
    <div class="toolbar-group" id="themeToggle">
      <button data-theme="auto" class="active">Auto</button>
      <button data-theme="light">Light</button>
      <button data-theme="dark">Dark</button>
    </div>
  </div>
  <div class="score-bar">
    <label for="scoreInput">Your CRS Score</label>
    <input type="number" id="scoreInput" min="0" max="1200" placeholder="480" />
    <div id="poolPosition" class="pool-position-inline" style="display:none;"></div>
    <div class="score-cards" id="scoreResults"></div>
  </div>
  <div class="controls" id="controls"></div>
  <div class="chart-container">
    <canvas id="chart"></canvas>
  </div>
  <div class="stats" id="stats"></div>

  <h2 class="section-heading">CRS Score Pool Distribution</h2>
  <p class="subtitle">Number of candidates in the Express Entry pool by score range over time</p>
  <div class="toolbar">
    <div class="toolbar-group" id="distView">
      <button class="active" data-view="current">Current Snapshot</button>
      <button data-view="history">History</button>
    </div>
  </div>
  <div class="chart-container" id="distChartContainer">
    <canvas id="distChart"></canvas>
  </div>

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
  </p>

  <script>
    const originalDatasets = ${chartData};
    const distributionSnapshots = ${distributionData};
    const PROJECTION_MONTHS = 6;
    const MOVING_AVG_WINDOW = 6;

    // Stubs — replaced once distribution chart is initialized
    var onScoreChanged = function(score) {};
    var onTimeRangeChanged = function() {};
    var onThemeChanged = function() {};

    // ========== URL state persistence ==========

    function readURL() {
      const p = new URLSearchParams(window.location.search);
      return {
        range: p.get('range') || 'all',
        proj: p.get('proj') || 'off',
        hide: p.get('hide') ? p.get('hide').split(',').filter(Boolean) : [],
        score: p.get('score') || '',
        theme: p.get('theme') || 'auto',
      };
    }

    function writeURL() {
      const p = new URLSearchParams();
      if (timeRange !== 'all') p.set('range', timeRange);
      if (projectionMode !== 'off') p.set('proj', projectionMode);
      if (hiddenCategories.size > 0) {
        const indices = [];
        originalDatasets.forEach((ds, i) => { if (hiddenCategories.has(ds.label)) indices.push(i); });
        p.set('hide', indices.join(','));
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

    // ========== Theme management ==========

    const darkColors = {
      gridX: '#1e293b', gridY: '#334155',
      tick: '#94a3b8', axisTitle: '#94a3b8',
      tooltipBg: '#1e293b', tooltipTitle: '#f1f5f9',
      tooltipBody: '#cbd5e1', tooltipBorder: '#334155',
    };
    const lightColors = {
      gridX: '#e2e8f0', gridY: '#cbd5e1',
      tick: '#64748b', axisTitle: '#64748b',
      tooltipBg: '#ffffff', tooltipTitle: '#0f172a',
      tooltipBody: '#334155', tooltipBorder: '#e2e8f0',
    };

    function resolveTheme(pref) {
      if (pref === 'light') return 'light';
      if (pref === 'dark') return 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function getThemeColors() {
      return resolveTheme(currentTheme) === 'light' ? lightColors : darkColors;
    }

    let chartRef = null;

    function applyTheme() {
      const effective = resolveTheme(currentTheme);
      document.documentElement.classList.toggle('light', effective === 'light');

      // Update chart colors
      if (chartRef) {
        const c = getThemeColors();
        chartRef.options.scales.x.grid.color = c.gridX;
        chartRef.options.scales.x.ticks.color = c.tick;
        chartRef.options.scales.x.title.color = c.axisTitle;
        chartRef.options.scales.y.grid.color = c.gridY;
        chartRef.options.scales.y.ticks.color = c.tick;
        chartRef.options.scales.y.title.color = c.axisTitle;
        chartRef.options.plugins.tooltip.backgroundColor = c.tooltipBg;
        chartRef.options.plugins.tooltip.titleColor = c.tooltipTitle;
        chartRef.options.plugins.tooltip.bodyColor = c.tooltipBody;
        chartRef.options.plugins.tooltip.borderColor = c.tooltipBorder;
        chartRef.update('none');
      }
      onThemeChanged();
    }

    // Apply theme immediately (before chart creation, for CSS)
    applyTheme();

    // Listen for system theme changes when in auto mode
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (currentTheme === 'auto') applyTheme();
    });

    // ========== Projection math ==========

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

    // Polynomial (quadratic) regression: y = a*x^2 + b*x + c
    // Normalises timestamps to avoid floating-point blowup
    function polyRegression(pts) {
      const n = pts.length;
      if (n < 4) return linearRegression(pts); // fall back
      const xMin = pts[0].x;
      const xRange = pts[n - 1].x - xMin || 1;
      const norm = pts.map(p => ({ x: (p.x - xMin) / xRange, y: p.y }));

      let s0=n, s1=0, s2=0, s3=0, s4=0, t0=0, t1=0, t2=0;
      for (const p of norm) {
        const x = p.x, x2 = x*x;
        s1 += x; s2 += x2; s3 += x2*x; s4 += x2*x2;
        t0 += p.y; t1 += x*p.y; t2 += x2*p.y;
      }
      // Solve 3x3 system via Cramer's rule
      const M = [
        [s0, s1, s2],
        [s1, s2, s3],
        [s2, s3, s4],
      ];
      const T = [t0, t1, t2];
      function det3(m) {
        return m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])
             - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])
             + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
      }
      const D = det3(M);
      if (Math.abs(D) < 1e-20) return linearRegression(pts);
      function replCol(m, col, v) {
        return m.map((row, i) => row.map((c, j) => j === col ? v[i] : c));
      }
      const c = det3(replCol(M, 0, T)) / D;
      const b = det3(replCol(M, 1, T)) / D;
      const a = det3(replCol(M, 2, T)) / D;
      return {
        eval: (x) => {
          const xn = (x - xMin) / xRange;
          return a * xn * xn + b * xn + c;
        },
        a, b, c,
      };
    }

    // Moving average (trailing window) — returns smoothed series + projected continuation
    function movingAvgProjection(filtered, dsLabel, dsColor) {
      if (filtered.length < MOVING_AVG_WINDOW) return null;

      const sorted = [...filtered].sort((a, b) => new Date(a.x).getTime() - new Date(b.x).getTime());
      // Smoothed overlay on historical data
      const smoothed = [];
      for (let i = MOVING_AVG_WINDOW - 1; i < sorted.length; i++) {
        let sum = 0;
        for (let j = i - MOVING_AVG_WINDOW + 1; j <= i; j++) sum += sorted[j].y;
        smoothed.push({
          x: sorted[i].x,
          y: Math.round(sum / MOVING_AVG_WINDOW),
          roundNumber: '~',
          roundType: dsLabel + ' (moving avg)',
          invitations: 0,
          isProjection: true,
          projMethod: 'moving-avg',
        });
      }

      // Project forward: use slope of last few smoothed points
      if (smoothed.length >= 2) {
        const tail = smoothed.slice(-3);
        const pts = tail.map(p => ({ x: new Date(p.x).getTime(), y: p.y }));
        const reg = linearRegression(pts);
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
              roundNumber: '~',
              roundType: dsLabel + ' (moving avg forecast)',
              invitations: 0,
              isProjection: true,
              projMethod: 'moving-avg',
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
        _isProjection: true,
      };
    }

    // Generic regression projection (linear or poly)
    function regressionProjection(filtered, dsLabel, dsColor, regFn, dashPattern, suffix) {
      if (filtered.length < 3) return null;
      const sorted = [...filtered].sort((a, b) => new Date(a.x).getTime() - new Date(b.x).getTime());
      const pts = sorted.map(d => ({ x: new Date(d.x).getTime(), y: d.y }));
      const reg = regFn(pts);
      if (!reg) return null;

      const projPoints = [];
      // Trend line over historical range
      const firstT = pts[0].x, lastT = pts[pts.length - 1].x;
      const totalSteps = 40;
      const projEndDate = new Date(lastT);
      projEndDate.setMonth(projEndDate.getMonth() + PROJECTION_MONTHS);
      const projEndT = projEndDate.getTime();

      for (let i = 0; i <= totalSteps; i++) {
        const t = firstT + (projEndT - firstT) * (i / totalSteps);
        const isFuture = t > lastT;
        projPoints.push({
          x: new Date(t).toISOString().split('T')[0],
          y: Math.max(0, Math.round(reg.eval(t))),
          roundNumber: '~',
          roundType: dsLabel + ' (' + suffix + (isFuture ? ' forecast' : ' trend') + ')',
          invitations: 0,
          isProjection: true,
          projMethod: suffix,
        });
      }

      return {
        label: dsLabel + ' (' + suffix + ')',
        data: projPoints,
        borderColor: dsColor,
        backgroundColor: 'transparent',
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        borderDash: dashPattern,
        tension: 0.3,
        showLine: true,
        _isProjection: true,
      };
    }

    // ========== Dataset builder ==========

    function buildDatasets() {
      const cutoff = timeRange === '3y'
        ? new Date(new Date().getFullYear() - 3, new Date().getMonth(), new Date().getDate()).getTime()
        : 0;

      const result = [];

      for (const ds of originalDatasets) {
        const filtered = cutoff > 0
          ? ds.data.filter(d => new Date(d.x).getTime() >= cutoff)
          : ds.data.slice();

        result.push({ ...ds, data: filtered });

        if (projectionMode === 'off' || filtered.length < 3) continue;

        if (projectionMode === 'linear') {
          const proj = regressionProjection(filtered, ds.label, ds.borderColor, linearRegression, [6, 4], 'linear');
          if (proj) result.push(proj);
        }
        if (projectionMode === 'moving-avg') {
          const proj = movingAvgProjection(filtered, ds.label, ds.borderColor);
          if (proj) result.push(proj);
        }
        if (projectionMode === 'poly') {
          const proj = regressionProjection(filtered, ds.label, ds.borderColor, polyRegression, [8, 3, 2, 3], 'polynomial');
          if (proj) result.push(proj);
        }
      }

      return result;
    }

    // ========== Category toggle buttons ==========

    // Restore hidden categories from URL
    const hiddenCategories = new Set();
    initState.hide.forEach(idx => {
      const i = parseInt(idx, 10);
      if (originalDatasets[i]) hiddenCategories.add(originalDatasets[i].label);
    });

    const controlsEl = document.getElementById('controls');
    const allBtn = document.createElement('button');
    allBtn.textContent = 'All';
    allBtn.className = hiddenCategories.size === 0 ? 'active' : '';
    allBtn.onclick = () => toggleAll();
    controlsEl.appendChild(allBtn);

    const categoryButtons = [];
    originalDatasets.forEach((ds, i) => {
      const btn = document.createElement('button');
      btn.textContent = ds.label;
      btn.style.borderLeftColor = ds.borderColor;
      btn.style.borderLeftWidth = '3px';
      btn.className = hiddenCategories.has(ds.label) ? '' : 'active';
      btn.onclick = () => toggleDataset(i, btn);
      controlsEl.appendChild(btn);
      categoryButtons.push(btn);
    });

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
                const dateStr = new Date(d.x).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
                if (d.isProjection) return d.roundType.split('(')[0].trim() + ' — ' + dateStr;
                return 'Round #' + d.roundNumber + ' — ' + dateStr;
              },
              label: (item) => {
                const d = item.raw;
                if (d.isProjection) {
                  const method = d.projMethod || 'projected';
                  const methodLabels = { linear: 'Linear', 'moving-avg': 'Moving Avg', polynomial: 'Polynomial' };
                  return [
                    (methodLabels[method] || method) + ' projection',
                    'Projected CRS: ' + d.y,
                  ];
                }
                return [
                  d.roundType,
                  'CRS Score: ' + d.y,
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
            time: { unit: 'month', displayFormats: { month: 'MMM yyyy' } },
            grid: { color: getThemeColors().gridX },
            ticks: { color: getThemeColors().tick, maxRotation: 45 },
            title: { display: true, text: 'Date', color: getThemeColors().axisTitle },
          },
          y: {
            grid: { color: getThemeColors().gridY },
            ticks: { color: getThemeColors().tick },
            title: { display: true, text: 'CRS Score (minimum to be invited)', color: getThemeColors().axisTitle },
          },
        },
      },
    });

    chartRef = chart;
    chart.canvas.parentNode.style.height = '550px';
    chart.resize();

    // Apply URL-restored hidden state to the initial render
    if (hiddenCategories.size > 0) {
      chart.data.datasets.forEach((ds, i) => {
        const base = ds.label.replace(/ \\((?:linear|ma|polynomial|proj)\\)$/, '');
        chart.getDatasetMeta(i).hidden = hiddenCategories.has(base);
      });
      chart.update('none');
    }

    // ========== Rebuild ==========

    function rebuildChart() {
      const ds = buildDatasets();
      chart.data.datasets = ds;
      ds.forEach((d, i) => {
        const base = d.label.replace(/ \\((?:linear|ma|polynomial|proj)\\)$/, '');
        chart.getDatasetMeta(i).hidden = hiddenCategories.has(base);
      });
      chart.update();
      if (userScore > 0) buildScoreResults(userScore);
    }

    function toggleDataset(origIdx, btn) {
      const label = originalDatasets[origIdx].label;
      if (hiddenCategories.has(label)) { hiddenCategories.delete(label); btn.classList.add('active'); }
      else { hiddenCategories.add(label); btn.classList.remove('active'); }
      allBtn.classList.toggle('active', hiddenCategories.size === 0);
      rebuildChart();
      writeURL();
    }

    function toggleAll() {
      const allVis = hiddenCategories.size === 0;
      if (allVis) {
        originalDatasets.forEach(ds => hiddenCategories.add(ds.label));
        categoryButtons.forEach(b => b.classList.remove('active'));
        allBtn.classList.remove('active');
      } else {
        hiddenCategories.clear();
        categoryButtons.forEach(b => b.classList.add('active'));
        allBtn.classList.add('active');
      }
      rebuildChart();
      writeURL();
    }

    // ========== Toolbar handlers ==========

    // Set initial active states from URL
    document.querySelectorAll('#timeRange button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.range === timeRange);
    });
    document.querySelectorAll('#projectionMode button').forEach(btn => {
      const match = btn.dataset.proj === projectionMode;
      btn.classList.toggle('active', match);
      btn.classList.toggle('projection-on', match && projectionMode !== 'off');
    });

    document.querySelectorAll('#timeRange button').forEach(btn => {
      btn.addEventListener('click', () => {
        timeRange = btn.dataset.range;
        document.querySelectorAll('#timeRange button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        rebuildChart();
        updateStats();
        onTimeRangeChanged();
        writeURL();
      });
    });

    document.querySelectorAll('#projectionMode button').forEach(btn => {
      btn.addEventListener('click', () => {
        projectionMode = btn.dataset.proj;
        document.querySelectorAll('#projectionMode button').forEach(b => {
          b.classList.remove('active');
          b.classList.remove('projection-on');
        });
        btn.classList.add('active');
        if (projectionMode !== 'off') btn.classList.add('projection-on');
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
        document.querySelectorAll('#themeToggle button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyTheme();
        writeURL();
      });
    });

    // ========== Stats ==========

    function updateStats() {
      const statsEl = document.getElementById('stats');
      statsEl.innerHTML = '';
      const cutoff = timeRange === '3y'
        ? new Date(new Date().getFullYear() - 3, new Date().getMonth(), new Date().getDate()).getTime()
        : 0;
      const allRounds = originalDatasets.flatMap(ds => ds.data)
        .filter(d => cutoff === 0 || new Date(d.x).getTime() >= cutoff);
      allRounds.sort((a, b) => new Date(a.x).getTime() - new Date(b.x).getTime());
      if (!allRounds.length) return;
      const latest = allRounds[allRounds.length - 1];
      const scores = allRounds.map(r => r.y);
      [
        { label: 'Rounds Shown', value: allRounds.length },
        { label: 'Latest CRS Score', value: latest.y + ' (' + latest.roundType + ')' },
        { label: 'Lowest CRS', value: Math.min(...scores) },
        { label: 'Highest CRS', value: Math.max(...scores) },
        { label: 'Program Types', value: originalDatasets.length },
        { label: 'Date Range', value: allRounds[0].x + ' to ' + allRounds[allRounds.length - 1].x },
      ].forEach(s => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML = '<h3>' + s.label + '</h3><div class="value">' + s.value + '</div>';
        statsEl.appendChild(card);
      });
    }

    updateStats();

    // ========== Score input + horizontal line + eligibility results ==========

    const scoreInput = document.getElementById('scoreInput');
    const scoreResultsEl = document.getElementById('scoreResults');

    if (userScore > 0) {
      scoreInput.value = userScore;
      applyScore(userScore);
    }

    scoreInput.addEventListener('input', () => {
      const val = parseInt(scoreInput.value, 10);
      userScore = (val >= 0 && val <= 1200) ? val : 0;
      applyScore(userScore);
      writeURL();
    });

    function applyScore(score) {
      // Update annotation line
      if (score > 0) {
        chart.options.plugins.annotation.annotations.scoreLine = {
          type: 'line',
          yMin: score,
          yMax: score,
          borderColor: '#f59e0b',
          borderWidth: 2,
          borderDash: [8, 4],
          label: {
            display: true,
            content: 'Your score: ' + score,
            position: 'start',
            backgroundColor: '#f59e0bcc',
            color: '#0f172a',
            font: { weight: 'bold', size: 12 },
            padding: { top: 3, bottom: 3, left: 8, right: 8 },
            borderRadius: 4,
          },
        };
      } else {
        delete chart.options.plugins.annotation.annotations.scoreLine;
      }
      chart.update('none');

      // Build eligibility results
      buildScoreResults(score);

      // Update pool position and distribution chart
      onScoreChanged(score);
    }

    function buildScoreResults(score) {
      scoreResultsEl.innerHTML = '';
      if (!score || score <= 0) return;

      const cutoff = timeRange === '3y'
        ? new Date(new Date().getFullYear() - 3, new Date().getMonth(), new Date().getDate()).getTime()
        : 0;

      originalDatasets.forEach(ds => {
        if (hiddenCategories.has(ds.label)) return;

        const filtered = cutoff > 0
          ? ds.data.filter(d => new Date(d.x).getTime() >= cutoff)
          : ds.data;

        if (filtered.length < 2) return;

        const sorted = [...filtered].sort((a, b) => new Date(a.x).getTime() - new Date(b.x).getTime());

        // Find historical rounds where user's score was enough (CRS cutoff <= score)
        const eligible = sorted.filter(d => d.y <= score);
        const lastEligible = eligible.length > 0 ? eligible[eligible.length - 1] : null;

        // Find if the most recent round qualifies
        const mostRecent = sorted[sorted.length - 1];
        const currentlyEligible = mostRecent.y <= score;

        // Check projection if active
        let projectedDate = null;
        if (projectionMode !== 'off' && !currentlyEligible) {
          projectedDate = getProjectedCrossing(sorted, score, ds.label);
        }

        const card = document.createElement('div');
        card.className = 'score-result-card';
        card.style.borderLeftColor = ds.borderColor;

        const catName = document.createElement('div');
        catName.className = 'cat-name';
        catName.textContent = ds.label;
        card.appendChild(catName);

        const result = document.createElement('div');
        result.className = 'result-text';

        if (currentlyEligible) {
          result.classList.add('eligible');
          const count = eligible.length;
          result.textContent = 'Eligible now (' + count + ' past round' + (count !== 1 ? 's' : '') + ')';
        } else if (projectedDate) {
          result.classList.add('projected');
          const isPoolAware = projectedDate.endsWith('*');
          result.textContent = 'Projected: ' + projectedDate.replace(' *', '');
          if (isPoolAware) result.title = 'Pool-aware projection (accounts for candidate density at each score range)';
        } else if (lastEligible) {
          result.classList.add('projected');
          const d = new Date(lastEligible.x);
          result.textContent = 'Last eligible: ' + d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short' });
        } else {
          result.classList.add('unlikely');
          result.textContent = 'Score too low for this category';
        }

        card.appendChild(result);
        scoreResultsEl.appendChild(card);
      });
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

    function getProjectedCrossing(sorted, score, label) {
      const pts = sorted.map(d => ({ x: new Date(d.x).getTime(), y: d.y }));

      // Try pool-aware projection first
      if (distributionSnapshots.length >= 3) {
        const poolResult = getPoolAwareProjection(sorted, score, label);
        if (poolResult) return poolResult;
      }

      // Fall back to trend-based projection
      let regFn = linearRegression;
      if (projectionMode === 'poly') regFn = polyRegression;

      if (projectionMode === 'moving-avg') {
        // For moving avg, use tail slope
        if (sorted.length < MOVING_AVG_WINDOW) return null;
        const smoothed = [];
        for (let i = MOVING_AVG_WINDOW - 1; i < sorted.length; i++) {
          let sum = 0;
          for (let j = i - MOVING_AVG_WINDOW + 1; j <= i; j++) sum += sorted[j].y;
          smoothed.push({ x: new Date(sorted[i].x).getTime(), y: sum / MOVING_AVG_WINDOW });
        }
        const tail = smoothed.slice(-3);
        regFn = () => linearRegression(tail);
      }

      const reg = regFn(pts);
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

      // Fit a regression to the user's ratio trend
      let regFn = linearRegression;
      if (projectionMode === 'poly') regFn = polyRegression;
      if (projectionMode === 'moving-avg') {
        if (userRatioSeries.length >= MOVING_AVG_WINDOW) {
          const smoothed = [];
          for (let i = MOVING_AVG_WINDOW - 1; i < userRatioSeries.length; i++) {
            let sum = 0;
            for (let j = i - MOVING_AVG_WINDOW + 1; j <= i; j++) sum += userRatioSeries[j].y;
            smoothed.push({ x: userRatioSeries[i].x, y: sum / MOVING_AVG_WINDOW });
          }
          const tail = smoothed.slice(-3);
          regFn = () => linearRegression(tail);
        }
      }

      const reg = regFn(userRatioSeries);
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

    const distColors = [
      '#7c3aed', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4',
      '#14b8a6', '#10b981', '#22c55e', '#84cc16', '#eab308',
      '#f59e0b', '#f97316', '#ef4444', '#dc2626', '#991b1b'
    ];

    let distView = 'current';
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
      container.style.height = distView === 'current' ? '400px' : '450px';

      if (distView === 'current') {
        // Current snapshot — horizontal bar chart
        const latest = getLatestDistribution();
        if (!latest) return;

        const values = distRangeLabels.map(r => latest.ranges[r] || 0);

        distChartRef = new Chart(dCtx, {
          type: 'bar',
          data: {
            labels: distRangeLabels,
            datasets: [{
              label: 'Candidates',
              data: values,
              backgroundColor: distColors.map(c => c + 'cc'),
              borderColor: distColors,
              borderWidth: 1,
            }],
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (item) => {
                    const v = item.raw;
                    const pct = latest.total > 0 ? ((v / latest.total) * 100).toFixed(1) : '0';
                    return v.toLocaleString() + ' candidates (' + pct + '%)';
                  },
                },
                backgroundColor: getThemeColors().tooltipBg,
                titleColor: getThemeColors().tooltipTitle,
                bodyColor: getThemeColors().tooltipBody,
                borderColor: getThemeColors().tooltipBorder,
                borderWidth: 1,
              },
              annotation: userScore > 0 ? {
                annotations: {
                  scoreLine: {
                    type: 'line',
                    xMin: 0, xMax: Math.max(...values) * 1.1,
                    yMin: getScoreRangeIndex(userScore), yMax: getScoreRangeIndex(userScore),
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    borderDash: [6, 3],
                    label: {
                      display: true,
                      content: 'Your score: ' + userScore,
                      position: 'end',
                      backgroundColor: '#f59e0bcc',
                      color: '#0f172a',
                      font: { weight: 'bold', size: 11 },
                      padding: { top: 2, bottom: 2, left: 6, right: 6 },
                      borderRadius: 3,
                    },
                  },
                },
              } : {},
            },
            scales: {
              x: {
                grid: { color: getThemeColors().gridX },
                ticks: {
                  color: getThemeColors().tick,
                  callback: function(v) {
                    if (v >= 1000) return (v / 1000).toFixed(0) + 'k';
                    return v;
                  },
                },
                title: { display: true, text: 'Number of Candidates', color: getThemeColors().axisTitle },
              },
              y: {
                grid: { color: getThemeColors().gridY },
                ticks: { color: getThemeColors().tick, font: { size: 11 } },
                title: { display: true, text: 'CRS Score Range', color: getThemeColors().axisTitle },
              },
            },
          },
        });
      } else {
        // History view — stacked area chart of pool over time
        const cutoff = timeRange === '3y'
          ? new Date(new Date().getFullYear() - 3, new Date().getMonth(), new Date().getDate()).getTime()
          : 0;
        const filtered = cutoff > 0
          ? distributionSnapshots.filter(s => new Date(s.date).getTime() >= cutoff)
          : distributionSnapshots;

        if (!filtered.length) return;

        // Build datasets — one per score range, stacked
        const datasets = distRangeLabels.map((range, idx) => ({
          label: range,
          data: filtered.map(s => ({ x: s.date, y: s.ranges[range] || 0 })),
          backgroundColor: distColors[idx] + '99',
          borderColor: distColors[idx],
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
                labels: {
                  color: getThemeColors().tick,
                  font: { size: 10 },
                  boxWidth: 12,
                  padding: 8,
                },
              },
              tooltip: {
                callbacks: {
                  title: (items) => {
                    const d = new Date(items[0].raw.x);
                    return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
                  },
                  label: (item) => {
                    return item.dataset.label + ': ' + item.raw.y.toLocaleString();
                  },
                  footer: (items) => {
                    const total = items.reduce((s, it) => s + it.raw.y, 0);
                    return 'Total pool: ' + total.toLocaleString();
                  },
                },
                backgroundColor: getThemeColors().tooltipBg,
                titleColor: getThemeColors().tooltipTitle,
                bodyColor: getThemeColors().tooltipBody,
                footerColor: getThemeColors().tooltipTitle,
                borderColor: getThemeColors().tooltipBorder,
                borderWidth: 1,
              },
            },
            scales: {
              x: {
                type: 'time',
                time: { unit: 'month', displayFormats: { month: 'MMM yyyy' } },
                grid: { color: getThemeColors().gridX },
                ticks: { color: getThemeColors().tick, maxRotation: 45 },
                stacked: true,
              },
              y: {
                stacked: true,
                grid: { color: getThemeColors().gridY },
                ticks: {
                  color: getThemeColors().tick,
                  callback: function(v) {
                    if (v >= 1000) return (v / 1000).toFixed(0) + 'k';
                    return v;
                  },
                },
                title: { display: true, text: 'Candidates in Pool', color: getThemeColors().axisTitle },
              },
            },
          },
        });
      }
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

    // Pool position info when user enters score
    function updatePoolPosition(score) {
      const el = document.getElementById('poolPosition');
      if (!score || score <= 0 || !distributionSnapshots.length) {
        el.style.display = 'none';
        return;
      }

      const latest = getLatestDistribution();
      if (!latest) { el.style.display = 'none'; return; }

      // Count people at or above user's score
      const rangeOrder = distRangeLabels;
      const userIdx = getScoreRangeIndex(score);
      let above = 0;
      for (let i = 0; i < userIdx; i++) {
        above += latest.ranges[rangeOrder[i]] || 0;
      }
      // For the user's own range, estimate roughly half are above
      const inRange = latest.ranges[rangeOrder[userIdx]] || 0;
      above += Math.round(inRange * 0.5);

      const total = latest.total;
      const percentile = total > 0 ? ((1 - above / total) * 100).toFixed(1) : '0';
      const topPct = total > 0 ? ((above / total) * 100).toFixed(1) : '0';

      let colorClass = 'good';
      if (parseFloat(topPct) > 50) colorClass = 'bad';
      else if (parseFloat(topPct) > 25) colorClass = 'warn';

      // Competition ratio: candidates above you vs typical invitation size
      // Use median of last 10 General rounds as reference invitation size
      const allRoundsFlat = originalDatasets.flatMap(ds => ds.data)
        .filter(d => d.invitations > 0)
        .sort((a, b) => new Date(a.x).getTime() - new Date(b.x).getTime());
      const recentInv = allRoundsFlat.slice(-10).map(d => d.invitations).sort((a, b) => a - b);
      const medInv = recentInv.length > 0 ? recentInv[Math.floor(recentInv.length / 2)] : 0;

      // Use pool-aware count (with proportional estimation within ranges)
      const abovePool = countAboveScore(latest, score);
      const compRatio = medInv > 0 ? (abovePool / medInv) : 0;
      const compStr = compRatio.toFixed(1) + ':1';
      let compClass = 'good';
      if (compRatio > 5) compClass = 'bad';
      else if (compRatio > 2) compClass = 'warn';

      el.style.display = 'contents';
      el.innerHTML =
        '<div class="pool-chip" title="Candidates with CRS scores above yours in the pool"><div class="chip-label">Above you</div><div class="chip-val ' + colorClass + '">' + abovePool.toLocaleString() + '</div></div>' +
        '<div class="pool-chip" title="Candidates above your score / typical invitations per round (' + medInv.toLocaleString() + '). Below 1:1 = likely invited."><div class="chip-label">Competition</div><div class="chip-val ' + compClass + '">' + compStr + '</div></div>' +
        '<div class="pool-chip" title="Your position in the pool of ' + total.toLocaleString() + ' candidates"><div class="chip-label">Percentile</div><div class="chip-val ' + colorClass + '">Top ' + topPct + '%</div></div>';
    }

    // Wire up dist view toggle
    document.querySelectorAll('#distView button').forEach(btn => {
      btn.addEventListener('click', () => {
        distView = btn.dataset.view;
        document.querySelectorAll('#distView button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        buildDistChart();
      });
    });

    // Build initial dist chart
    if (distributionSnapshots.length > 0) {
      buildDistChart();
      if (userScore > 0) updatePoolPosition(userScore);
    }

    // Wire up score and time range changes to distribution chart
    onScoreChanged = function(score) {
      updatePoolPosition(score);
      if (distView === 'current') buildDistChart();
    };
    onTimeRangeChanged = function() {
      if (distView === 'history') buildDistChart();
    };
    onThemeChanged = function() {
      buildDistChart();
    };

    // Apply pool position if score was set from URL
    if (userScore > 0) {
      updatePoolPosition(userScore);
      if (distView === 'current') buildDistChart();
    }
  </script>
</body>
</html>`;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, html);
  console.log(`\nGenerated visualization at ${OUTPUT_FILE}`);
}

main();
