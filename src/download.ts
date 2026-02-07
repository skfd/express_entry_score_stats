import puppeteer from "puppeteer";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { DrawRound, DrawData } from "./types.js";

const URL =
  "https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds.html";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "data");
const OUTPUT_FILE = join(DATA_DIR, "rounds.json");

function parseDate(dateStr: string): string {
  // Input formats seen: "January 21, 2026", "2026-01-21", etc.
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }
  return dateStr;
}

function parseNumber(str: string): number {
  return parseInt(str.replace(/,/g, "").trim(), 10) || 0;
}

async function main() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  console.log("Navigating to Express Entry rounds page...");
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });

  // Wait for the table to be populated with data rows
  console.log("Waiting for table data to load...");
  await page.waitForSelector("table tbody tr td", { timeout: 30000 });

  // Give extra time for all rows to render
  await new Promise((r) => setTimeout(r, 3000));

  // Check if there's pagination and get all pages
  const rounds: DrawRound[] = [];
  let pageNum = 1;

  while (true) {
    console.log(`Extracting data from page ${pageNum}...`);

    const pageRounds = await page.evaluate(() => {
      const rows = document.querySelectorAll("table tbody tr");
      const data: Array<{
        number: string;
        date: string;
        roundType: string;
        invitations: string;
        crs: string;
      }> = [];

      rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 5) {
          data.push({
            number: cells[0]?.textContent?.trim() ?? "",
            date: cells[1]?.textContent?.trim() ?? "",
            roundType: cells[2]?.textContent?.trim() ?? "",
            invitations: cells[3]?.textContent?.trim() ?? "",
            crs: cells[4]?.textContent?.trim() ?? "",
          });
        }
      });

      return data;
    });

    for (const r of pageRounds) {
      rounds.push({
        number: parseNumber(r.number),
        date: parseDate(r.date),
        roundType: r.roundType,
        invitationsIssued: parseNumber(r.invitations),
        crsScore: parseNumber(r.crs),
      });
    }

    console.log(`  Found ${pageRounds.length} rows on page ${pageNum}`);

    // Try to find and click the "next page" button
    const hasNext = await page.evaluate(() => {
      // WET DataTables pagination - look for next button
      const nextBtn = document.querySelector(
        ".next:not(.disabled) a, .paginate_button.next:not(.disabled)"
      ) as HTMLElement | null;
      if (nextBtn) {
        nextBtn.click();
        return true;
      }
      return false;
    });

    if (!hasNext) break;

    pageNum++;
    // Wait for table to update after pagination
    await new Promise((r) => setTimeout(r, 1500));
  }

  await browser.close();

  // Deduplicate by round number (in case of overlap)
  const seen = new Set<number>();
  const deduped = rounds.filter((r) => {
    if (seen.has(r.number)) return false;
    seen.add(r.number);
    return true;
  });

  // Sort by round number
  deduped.sort((a, b) => a.number - b.number);

  const data: DrawData = {
    fetchedAt: new Date().toISOString(),
    source: URL,
    rounds: deduped,
  };

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

  console.log(`\nSaved ${deduped.length} rounds to ${OUTPUT_FILE}`);

  // Print summary
  const types = new Set(deduped.map((r) => r.roundType));
  console.log(`\nRound types found:`);
  types.forEach((t) => {
    const count = deduped.filter((r) => r.roundType === t).length;
    console.log(`  - ${t} (${count} rounds)`);
  });

  if (deduped.length > 0) {
    console.log(
      `\nDate range: ${deduped[0].date} to ${deduped[deduped.length - 1].date}`
    );
    console.log(
      `CRS score range: ${Math.min(...deduped.map((r) => r.crsScore))} - ${Math.max(...deduped.map((r) => r.crsScore))}`
    );
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
