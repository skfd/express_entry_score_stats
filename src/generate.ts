/**
 * Builds the page: src/page.html with today's data embedded, written to
 * dist/index.html. The template is plain HTML, CSS and JavaScript; the only
 * things filled in here are the data and what differs on the /beta/ preview.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { DrawData } from "./types.js";
import { buildData } from "./page-data.js";
import { previewPng, latestDraw, fmtDate, WIDTH, HEIGHT } from "./og-image.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "data", "rounds.json");
const TEMPLATE_FILE = join(__dirname, "page.html");
const OUTPUT_DIR = join(__dirname, "..", "dist");
const OUTPUT_FILE = join(OUTPUT_DIR, "index.html");

/** BETA=1 builds the /beta/ preview: marked as beta, not indexed, no analytics. */
const BETA = process.env.BETA === "1";

const SLOTS: Record<string, string> = {
  "<!--TITLE_PREFIX-->": BETA ? "[Beta] " : "",
  "<!--HEAD-->": BETA
    ? '<meta name="robots" content="noindex, nofollow">'
    : '<script data-goatcounter="https://express-entry-score-stats.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>',
  "<!--BADGE-->": BETA ? '<span class="badge">Beta</span>' : "",
  "<!--LIVE_LINK-->": BETA ? ' &middot; <a href="../">live page</a>' : "",
};
const DATA_SLOT = "/*PAGE_DATA*/null";

/** Link previews need absolute addresses. SITE_URL overrides it for a fork or a custom domain. */
const SITE_URL =
  (process.env.SITE_URL ?? "https://skfd.github.io/express_entry_score_stats/").replace(/\/?$/, "/") +
  (BETA ? "beta/" : "");

const attr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Open Graph and Twitter card tags for the preview card chat apps and feeds show. */
function previewTags(pageData: ReturnType<typeof buildData>, roundNumber: number): string {
  const latest = latestDraw(pageData);
  const title = `${BETA ? "[Beta] " : ""}Canada Express Entry - CRS cutoffs`;
  const description =
    `Latest draw: ${latest.program}, CRS ${latest.score}, ${fmtDate(latest.time)}. ` +
    `Every Express Entry cutoff since 2015 on one chart. Check where your score lands.`;
  const alt = `Chart of Express Entry CRS cutoffs over the past year. Latest draw ${latest.score} (${latest.program}) on ${fmtDate(latest.time)}.`;
  // The newest round number in the address makes apps that cache images fetch a new one after each draw.
  const image = `${SITE_URL}og.png?r=${roundNumber}`;
  const tags: Array<[string, string, string]> = [
    ["name", "description", description],
    ["property", "og:type", "website"],
    ["property", "og:site_name", "Express Entry CRS cutoffs"],
    ["property", "og:url", SITE_URL],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:image", image],
    ["property", "og:image:type", "image/png"],
    ["property", "og:image:width", String(WIDTH)],
    ["property", "og:image:height", String(HEIGHT)],
    ["property", "og:image:alt", alt],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
    ["name", "twitter:image", image],
    ["name", "twitter:image:alt", alt],
  ];
  return tags.map(([k, n, v]) => `<meta ${k}="${n}" content="${attr(v)}">`).join("\n");
}

function main() {
  const data: DrawData = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  // "<" is escaped so no string in the data can close the script element
  const pageData = buildData(data);
  const json = JSON.stringify({ ...pageData, beta: BETA }).replace(/</g, "\\u003c");
  const roundNumber = Math.max(...data.rounds.map((r) => r.number));
  const head = SLOTS["<!--HEAD-->"] + "\n" + previewTags(pageData, roundNumber);

  let html = readFileSync(TEMPLATE_FILE, "utf-8");
  for (const [slot, value] of Object.entries({ ...SLOTS, "<!--HEAD-->": head, [DATA_SLOT]: json })) {
    if (!html.includes(slot)) throw new Error(`page.html has no ${slot} slot`);
    html = html.replace(slot, () => value);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, html, "utf-8");
  // The page is already written: a card that fails to draw must not stop the deploy.
  try {
    writeFileSync(join(OUTPUT_DIR, "og.png"), previewPng(pageData));
  } catch (err) {
    console.error("::warning::Link preview og.png not drawn:", err);
  }
  console.log(`Generated ${OUTPUT_FILE}${BETA ? " (beta preview)" : ""}: ${data.rounds.length} rounds`);
}

main();
