# Uncrmple

**Fix the photo. Keep the document.**

Uncrmple is a mobile-friendly web app that turns poorly photographed paper documents into clean, readable, scan-like images and PDFs. It repairs photos you already have: it is not a scanner, an OCR platform or a general-purpose AI image editor.

Everything runs in your browser. Photos are never uploaded, stored or logged.

## Features

- **Upload**: drag and drop, pick files, or paste images (Ctrl+V). JPEG, PNG and WebP, checked from the file contents.
- **Photo check**: before repair, reports geometry, lighting, sharpness, resolution, completeness and text contrast, each with a confidence, and sums them up as a good, limited or poor repair candidate. Resolution is judged by the size of the text where enough lines are found, so large type in a small photo is not rated poor. The check is an estimate and never blocks a repair.
- **Document Repair**: detects the page, corrects perspective, levels print that still leans inside the page, flattens curved or creased lines when a trial shows it helps, evens out lighting and shadows, and applies a Color, Grayscale or Black & white style.
- **Repair all**: repairs every page not yet repaired, one at a time, with progress and a Stop button. The pages are locked while it runs. Pages that failed are left for you to fix by hand.
- **Manual corners**: if detection misses or clips the page, drag the four corners yourself, or clean up the whole image without cropping. "Repair again" keeps your adjusted corners.
- **Rotate**: turn a repaired page (or a cropped card) a quarter left or right.
- **Compare**: original and repaired side by side, or a wipe between the straightened page and the cleaned result. The original is never changed.
- **ID & Card Crop**: a second mode that finds a card in a photo, straightens it and offers optional touch-ups. See [docs/card-crop.md](docs/card-crop.md).
- **Export**: download one repaired image, every image as a ZIP (numbered in page order), or all pages as one PDF (same shape as the image, A4 or US Letter).

Repair cannot recover severe blur or missing text, and it never replaces document content with generated guesses.

### The workspace

On wide screens the app is three columns: the pages on the left, the viewer in the centre, and a numbered panel on the right with 01 photo check, 02 repair settings (or card touch-ups) and 03 export. Each step collapses from its header. With more than one page, arrows in the viewer move between pages. On narrower screens the panel moves under the viewer, and on phones the pages become a sideways strip.

### Limits

| Limit | Value |
| --- | --- |
| File size | 25 MB per image |
| Image size | 100 px to 12,000 px per side, at most 50 megapixels |
| Open at once | 20 images, and 600 megapixels in total |

The total-pixel limit keeps memory in check, since every page keeps its original and full-size results until it is removed. It is provisional until tested on a mid-range phone. HEIC photos are not accepted: convert them to JPEG first.

## Getting started

Requires Node.js 22.12 or newer and npm.

```bash
npm install
npm run dev
```

The app is served at http://localhost:7200.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run typecheck` | TypeScript strict type check |
| `npm test` | Run the Vitest suite |
| `npm run preview` | Serve the production build, with the same security headers as production |

### Configuration

Both are optional and read at build time.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_SITE_URL` | `https://uncrmple.app` | Site that hosts the privacy policy and terms linked from the footer |
| `VITE_CONTACT_EMAIL` | the project contact address | Contact link in the footer |

### Evaluation pages (dev server only)

`doc-eval.html` runs the repair pipeline over every photo in `test-photos/documents/` in each output style, and `card-eval.html` runs card detection over `test-photos/cards/`. Both read from the local dev server only and are not part of the production build. Use them to check detection changes against real photos before and after.

## How it works

Processing runs in a Web Worker, from decoding the file to encoding the results, so large photos never freeze the page. Where a worker cannot decode images (no `OffscreenCanvas`) or fails to start, the same jobs run on the page with the same results.

Page detection combines several cues (edges, brightness, low colour saturation and long straight boundary lines) and scores each candidate outline by how well its sides follow real edges, how clearly they separate the page from its surroundings, and its size. Outlines no flat sheet could make are rejected. On bright, low-contrast photos (white paper on a pale wall), where the usual edge thresholds miss the paper edge, the candidates are scored again on softer edges.

## Stack

React, TypeScript (strict), Vite, and [OpenCV.js](https://www.npmjs.com/package/@techstark/opencv-js) for image processing. PDFs and ZIPs are written by small built-in encoders, with no library. No backend, database or authentication.

## Project layout

```
src/
  components/ shared UI (footer, logo, compare slider, theme switch)
  features/   upload, assess, repair, preview, pages, card, mode, export
  lib/        browser, engine (Web Worker), files, image-processing, pdf, zip
  types/      shared types
  tests/      workflow tests
docs/         design notes
waitlist/     separate landing page and waitlist site
```

Image processing sits behind a replaceable interface in `src/lib/image-processing`, kept separate from the React UI.

## Deployment

Both the app and the waitlist deploy to Railway, which builds with Railpack and serves `dist/` with Caddy.

- `Caddyfile.template` replaces Railpack's default Caddyfile to add security headers. `src/tests/security-headers.test.ts` keeps it in step with `src/security-headers.ts`, which `vite preview` also uses.
- `Staticfile` turns off the `index.html` fallback, so missing paths return 404.
- Every host except `uncrmple.app` is sent `X-Robots-Tag: noindex`, so the temporary Railway address stays out of search and the app becomes indexable on the official domain with no change. `public/robots.txt` allows crawling so that header can be seen.

## Waitlist site

`waitlist/` is an independent Vite project with its own dependencies.

```bash
cd waitlist
npm install
npm run dev
```

Copy `waitlist/.env.example` to `waitlist/.env.local` and set `VITE_WEB3FORMS_ACCESS_KEY` to enable signups. Without it the form says signups are not open yet. The waitlist site also hosts the privacy policy (`/privacy/`) and terms of use (`/terms/`) that the app links to.

### Blog

The blog lives at `/blog/` on the waitlist site, and the app's footer links to it. Each post is a Markdown file in `waitlist/content/blog/`. The file name becomes its address (`fix-a-photo.md` → `/blog/fix-a-photo/`):

```md
---
title: How to fix a photo of a receipt
description: One or two sentences for search results, 70 to 160 characters.
date: 2026-11-04
updated: 2026-11-20   # optional, when the post is revised
draft: true           # optional, leaves the post out of the build
---

Start sections at `##`; the title is the page heading.
```

The build checks every post and fails, naming the file, if the title is over 60 characters, the description is outside 70–160, a date is invalid or the body has a `#` heading. Each post page is plain HTML with no script, and gets its own title, description, canonical link, Open Graph article tags, `BlogPosting` and breadcrumb structured data, an entry in the sitemap with its last-modified date, and an item in the RSS feed (`/blog/feed.xml`). `npm run dev` shows posts as you write them; the SEO tags are only added by `npm run build`. Posts are written by us and committed, so their HTML is not sanitised.

The posts sit inside `waitlist/` because Railway builds that folder on its own. At launch, when the app takes over uncrmple.app, the blog has to move into the app build with the privacy policy and terms, keeping the same addresses.

## Privacy and security

- Client-side processing only; no analytics on document content.
- A Content-Security-Policy lets the page and its worker connect only to local `blob:` URLs, so document data cannot be sent to any server. It is sent as a header because a meta tag does not reach the worker. OpenCV.js needs `'unsafe-eval'`; inline and third-party scripts stay blocked.
- File types are checked from file contents, not just extensions.
- `test-photos/` is git-ignored. Do not commit private documents or personal information.

See [PROJECT.md](PROJECT.md) for the product vision, MVP scope and pricing direction.
