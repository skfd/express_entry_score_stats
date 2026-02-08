import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { DrawRound, DrawData, ScoreDistribution } from "./types.js";

const JSON_URL =
  "https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json";
const SOURCE_URL =
  "https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds.html";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "data");
const OUTPUT_FILE = join(DATA_DIR, "rounds.json");

function parseNumber(str: string): number {
  if (!str || str === "undefined" || str === "N/A") return 0;
  return parseInt(str.replace(/,/g, "").trim(), 10) || 0;
}

function parseDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }
  return dateStr;
}

function parseDistribution(round: Record<string, string>): ScoreDistribution | undefined {
  // dd1-dd18 map to score ranges (dd3 and dd9 are aggregates of sub-ranges, skip them)
  const dd1 = parseNumber(round.dd1);
  const total = parseNumber(round.dd18);
  if (!total) return undefined;

  return {
    range601_1200: dd1,
    range501_600: parseNumber(round.dd2),
    range491_500: parseNumber(round.dd4),
    range481_490: parseNumber(round.dd5),
    range471_480: parseNumber(round.dd6),
    range461_470: parseNumber(round.dd7),
    range451_460: parseNumber(round.dd8),
    range441_450: parseNumber(round.dd10),
    range431_440: parseNumber(round.dd11),
    range421_430: parseNumber(round.dd12),
    range411_420: parseNumber(round.dd13),
    range401_410: parseNumber(round.dd14),
    range351_400: parseNumber(round.dd15),
    range301_350: parseNumber(round.dd16),
    range0_300: parseNumber(round.dd17),
    total,
    asOfDate: round.drawDistributionAsOn || "",
  };
}

async function main() {
  console.log("Fetching Express Entry data from JSON endpoint...");

  const response = await fetch(JSON_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const roundsObj = json.rounds as Record<string, Record<string, string>>;

  const rounds: DrawRound[] = [];

  for (const [key, round] of Object.entries(roundsObj)) {
    const num = parseNumber(round.drawNumber);
    if (!num) continue;

    const drawRound: DrawRound = {
      number: num,
      date: parseDate(round.drawDateFull || round.drawDate || ""),
      roundType: round.drawName || round.drawText2 || "",
      invitationsIssued: parseNumber(round.drawSize),
      crsScore: parseNumber(round.drawCRS),
    };

    const dist = parseDistribution(round);
    if (dist) {
      drawRound.distribution = dist;
    }

    rounds.push(drawRound);
  }

  // Sort by round number
  rounds.sort((a, b) => a.number - b.number);

  const data: DrawData = {
    fetchedAt: new Date().toISOString(),
    source: SOURCE_URL,
    rounds,
  };

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

  console.log(`\nSaved ${rounds.length} rounds to ${OUTPUT_FILE}`);

  // Print summary
  const types = new Set(rounds.map((r) => r.roundType));
  console.log(`\nRound types found:`);
  types.forEach((t) => {
    const count = rounds.filter((r) => r.roundType === t).length;
    console.log(`  - ${t} (${count} rounds)`);
  });

  const withDist = rounds.filter((r) => r.distribution);
  console.log(`\nRounds with distribution data: ${withDist.length}`);

  if (rounds.length > 0) {
    console.log(
      `\nDate range: ${rounds[0].date} to ${rounds[rounds.length - 1].date}`
    );
    console.log(
      `CRS score range: ${Math.min(...rounds.map((r) => r.crsScore))} - ${Math.max(...rounds.map((r) => r.crsScore))}`
    );
  }

  // Show latest distribution
  const latestWithDist = [...rounds].reverse().find((r) => r.distribution);
  if (latestWithDist?.distribution) {
    console.log(`\nLatest pool distribution (as of ${latestWithDist.distribution.asOfDate}):`);
    console.log(`  601-1200: ${latestWithDist.distribution.range601_1200.toLocaleString()}`);
    console.log(`  501-600:  ${latestWithDist.distribution.range501_600.toLocaleString()}`);
    console.log(`  491-500:  ${latestWithDist.distribution.range491_500.toLocaleString()}`);
    console.log(`  481-490:  ${latestWithDist.distribution.range481_490.toLocaleString()}`);
    console.log(`  471-480:  ${latestWithDist.distribution.range471_480.toLocaleString()}`);
    console.log(`  461-470:  ${latestWithDist.distribution.range461_470.toLocaleString()}`);
    console.log(`  451-460:  ${latestWithDist.distribution.range451_460.toLocaleString()}`);
    console.log(`  441-450:  ${latestWithDist.distribution.range441_450.toLocaleString()}`);
    console.log(`  431-440:  ${latestWithDist.distribution.range431_440.toLocaleString()}`);
    console.log(`  421-430:  ${latestWithDist.distribution.range421_430.toLocaleString()}`);
    console.log(`  411-420:  ${latestWithDist.distribution.range411_420.toLocaleString()}`);
    console.log(`  401-410:  ${latestWithDist.distribution.range401_410.toLocaleString()}`);
    console.log(`  351-400:  ${latestWithDist.distribution.range351_400.toLocaleString()}`);
    console.log(`  301-350:  ${latestWithDist.distribution.range301_350.toLocaleString()}`);
    console.log(`  0-300:    ${latestWithDist.distribution.range0_300.toLocaleString()}`);
    console.log(`  Total:    ${latestWithDist.distribution.total.toLocaleString()}`);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
