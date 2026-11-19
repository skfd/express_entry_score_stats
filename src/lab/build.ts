/**
 * Lab: design experiments, each its own page under /lab/<slug>/.
 *
 * An experiment is a static HTML template in this folder. The build embeds
 * today's data where the template says LAB_DATA and writes it to
 * dist/lab/<slug>/index.html, plus a small index at dist/lab/. Lab pages are
 * not indexed and carry no analytics, and nothing here touches the live page.
 *
 * An experiment that works out leaves the lab: its template becomes
 * src/page.html, as "expressive" did.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { DrawData } from "../types.js";
import { buildData } from "../page-data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const DATA_FILE = join(ROOT, "src", "data", "rounds.json");
const OUT_DIR = join(ROOT, "dist", "lab");
const DATA_TOKEN = "/*LAB_DATA*/null";

const EXPERIMENTS: Array<{ slug: string; title: string; blurb: string }> = [];

function indexPage(): string {
  const items = EXPERIMENTS.map(
    (e) => `    <li><a href="${e.slug}/">${e.title}</a><span>${e.blurb}</span></li>`
  ).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Lab - Express Entry CRS cutoffs</title>
  <style>
    :root { color-scheme: light dark; --page: #f9f9f7; --ink: #0b0b0b; --muted: #6f6d68; --faint: #e4e3dc; }
    @media (prefers-color-scheme: dark) { :root { --page: #252524; --ink: #dcdad4; --muted: #a19f98; --faint: #3d3d3b; } }
    body { margin: 0; background: var(--page); color: var(--ink); font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
    main { max-width: 640px; margin: 0 auto; padding: 32px 20px; }
    h1 { font-size: 44px; line-height: 1; letter-spacing: -0.03em; margin: 0 0 8px; }
    p { color: var(--muted); margin: 0 0 24px; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { border-top: 1px solid var(--faint); padding: 16px 0; }
    li a { display: block; font-size: 22px; font-weight: 700; color: var(--ink); }
    li span { color: var(--muted); }
    a { color: inherit; }
  </style>
</head>
<body>
  <main>
    <h1>Lab</h1>
    <p>Design experiments on the <a href="../">Express Entry CRS cutoffs</a> page. Same daily data, different ideas. None of this is the live site.</p>
${
  EXPERIMENTS.length
    ? `    <ul>\n${items}\n    </ul>`
    : "    <p>Nothing on the bench right now. The last experiment, Expressive, became the page itself.</p>"
}
  </main>
</body>
</html>
`;
}

function main() {
  const data: DrawData = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  // "<" is escaped so no string in the data can close the script element
  const json = JSON.stringify(buildData(data)).replace(/</g, "\\u003c");

  for (const e of EXPERIMENTS) {
    const template = readFileSync(join(__dirname, `${e.slug}.html`), "utf-8");
    if (!template.includes(DATA_TOKEN)) {
      throw new Error(`${e.slug}.html has no ${DATA_TOKEN} placeholder`);
    }
    const dir = join(OUT_DIR, e.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), template.replace(DATA_TOKEN, () => json), "utf-8");
    console.log(`Lab: ${join(dir, "index.html")}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "index.html"), indexPage(), "utf-8");
  console.log(`Lab: ${join(OUT_DIR, "index.html")}`);
}

main();
