# Express Entry CRS Score Tracker

Visualize historical CRS cutoff scores for all Canada Express Entry invitation rounds since 2015. See trends by program type. Project future scores. Check if your score qualifies.

## Features

- All 394+ rounds scraped directly from the official IRCC page.
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

`download` scrapes the latest data from canada.ca using Puppeteer.
`generate` builds a self-contained HTML file with all data embedded.

### Deploy to GitHub Pages

1. Push to GitHub.
2. Go to Settings > Pages > Source > GitHub Actions.
3. The included workflow handles the rest.

Data refreshes automatically every Monday.
