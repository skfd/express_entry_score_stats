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

function main() {
  const data: DrawData = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  // "<" is escaped so no string in the data can close the script element
  const json = JSON.stringify({ ...buildData(data), beta: BETA }).replace(/</g, "\\u003c");

  let html = readFileSync(TEMPLATE_FILE, "utf-8");
  for (const [slot, value] of Object.entries({ ...SLOTS, [DATA_SLOT]: json })) {
    if (!html.includes(slot)) throw new Error(`page.html has no ${slot} slot`);
    html = html.replace(slot, () => value);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, html, "utf-8");
  console.log(`Generated ${OUTPUT_FILE}${BETA ? " (beta preview)" : ""}: ${data.rounds.length} rounds`);
}

main();
