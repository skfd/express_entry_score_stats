# Express Entry CRS Score Tracker

Visualize historical CRS cutoff scores for all Canada Express Entry invitation rounds since 2015. See trends by program type. Project future scores. Check if your score qualifies.

## Features

- All 394+ rounds fetched from the [official IRCC JSON endpoint](https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json) (source: [Express Entry rounds page](https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds.html)).
- Separate lines for each program: General, PNP, CEC, French, Healthcare, STEM, and more.
- Three projection modes: linear regression, moving average, and polynomial.
- Enter your CRS score to see a horizontal reference line and per-category eligibility.
- Filter to the last 3 years for a focused view.
- Toggle individual categories on and off.
- All settings persist in the URL. Bookmark any configuration.
- Auto-updates weekly via GitHub Actions.

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

Data refreshes automatically every Monday.

## Data Source

All data—including historic CRS cutoff scores, invitation counts, and CRS score pool distribution snapshots—comes from the official IRCC (Immigration, Refugees and Citizenship Canada) JSON endpoint:

```
https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json
```

This is the same data that powers the [official Express Entry rounds page](https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds.html). The JSON includes per-round distribution data across 15 CRS score ranges (0–300 up to 601–1200), along with the date each distribution snapshot was taken.
