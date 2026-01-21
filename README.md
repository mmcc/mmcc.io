# mmcc.io

Personal site and blog built with [Astro](https://astro.build/).

## Development

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` - Start dev server
- `npm run build` - Build for production (runs type check + lint first)
- `npm run preview` - Preview production build
- `npm run check` - Run TypeScript + Biome checks
- `npm run format` - Format code with Biome
- `npm run lint` - Lint with Biome

## Syncing external posts

```bash
npm run sync           # Fetch posts from mux.com + demuxed.com
npm run sync --dry-run # Preview without writing
```

Uses Puppeteer to scrape author pages (bypasses Vercel bot protection).

## Deployment

Pushes to `main`/`master` automatically deploy to GitHub Pages via Actions.

## TODO

- [x] Add `GITHUB_TOKEN` env var and fetch real commit activity for /oss sparklines
