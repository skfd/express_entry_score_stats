# Express Entry CRS Score Tracker

Visualize historical CRS cutoff scores for all Canada Express Entry invitation rounds since 2015. See trends by program type. Check how your score compares.

## Features

- All 394+ rounds fetched from the [official IRCC JSON endpoint](https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json) (source: [Express Entry rounds page](https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds.html)).
- Separate series for each program: General, PNP, CEC, French, Healthcare, STEM, and more, grouped into main programs, occupation categories and newer categories. Circle size shows how many invitations a round issued.
- Enter your CRS score to see a reference line (circles near it are nudged to the side they fall on) and an arrow at your place in the candidate pool.
- Show the last year, the last 3 years or all time. Phones start on the last year, larger screens on 3 years.
- Starts on the main programs. Tap programs to add or remove them, or show all of them.
- All settings persist in the URL. Bookmark any configuration.
- Auto-updates daily via GitHub Actions.

## Usage

### View the chart

Open the deployed GitHub Pages site. Everything runs in the browser.

### Run locally

```
npm install
npm run download
npm run generate
```

Open `dist/chart.html` in a browser.

`download` fetches the latest round data (including CRS score pool distribution) from the [IRCC JSON endpoint](https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json) and saves it to `src/data/rounds.json`.
`generate` builds a self-contained HTML file with all data embedded.

### Deploy to GitHub Pages

1. Push to GitHub.
2. Go to Settings > Pages > Source > GitHub Actions.
3. The included workflow handles the rest.

Data refreshes automatically every day.

### Beta preview

Push work to the `beta` branch to preview it at `/beta/` on the same site
(https://skfd.github.io/express_entry_score_stats/beta/) before it reaches `main`.
The preview uses the same daily data, is not indexed by search engines and has no
analytics. Each deploy of `main` rebuilds it, so it stays up until the `beta`
branch is deleted.

### Lab

Design experiments live at `/lab/` (https://skfd.github.io/express_entry_score_stats/lab/),
one page each, built from the same daily data. They are not indexed, have no
analytics and do not touch the live page. An experiment is a static HTML template
in `src/lab/`; `npm run lab` embeds the data and writes it to `dist/lab/<name>/`.

- `expressive` applies the principles behind Material 3 Expressive (not its look):
  the chart is the page, the candidate pool is drawn along the same score axis,
  and your score is the one thing in full contrast.

## Data Source

All data—including historic CRS cutoff scores, invitation counts, and CRS score pool distribution snapshots—comes from the official IRCC (Immigration, Refugees and Citizenship Canada) JSON endpoint:

```
https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json
```

This is the same data that powers the [official Express Entry rounds page](https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds.html). The JSON includes per-round distribution data across 15 CRS score ranges (0–300 up to 601–1200), along with the date each distribution snapshot was taken.
