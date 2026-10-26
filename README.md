# Document Photo Repair

**Fix the photo. Keep the document.**

A mobile-friendly web app that turns poorly photographed paper documents into clean, readable, scan-like images and PDFs. It repairs photos you already have: it is not a scanner, an OCR platform or a general-purpose AI image editor.

Everything runs in your browser. Photos are never uploaded, stored or logged.

## Features

- **Document Repair**: detects the page, corrects perspective, evens out lighting and shadows, and applies a cleanup style.
- **Manual corners**: if detection misses or clips the page, drag the four corners yourself. "Repair again" keeps your adjusted corners.
- **Photo assessment**: reports what can and cannot be fixed (sharpness, lighting, page coverage) before you repair.
- **Original vs. repaired**: compare the two, and return to the untouched original at any time.
- **ID & Card Crop**: a second mode that finds a card in a photo and straightens it. See [docs/card-crop.md](docs/card-crop.md).
- **Export**: download repaired images, or combine several pages into one PDF.

Repair cannot recover severe blur or missing text, and it never replaces document content with generated guesses.

## Getting started

Requires Node.js and npm.

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
| `npm run preview` | Serve the production build |

## Stack

React, TypeScript (strict), Vite, and [OpenCV.js](https://www.npmjs.com/package/@techstark/opencv-js) for image processing. No backend, database or authentication.

## Project layout

```
src/
  features/   upload, assess, repair, preview, card, mode, export
  lib/        browser, files, image-processing, pdf
  types/      shared types
  tests/      workflow tests
docs/         design notes
waitlist/     separate landing page and waitlist site
```

Image processing sits behind a replaceable interface in `src/lib/image-processing`, kept separate from the React UI.

## Waitlist site

`waitlist/` is an independent Vite project with its own dependencies.

```bash
cd waitlist
npm install
npm run dev
```

Copy `waitlist/.env.example` to `waitlist/.env.local` and set `VITE_WEB3FORMS_ACCESS_KEY` to enable signups. Without it the form says signups are not open yet.

## Privacy

- Client-side processing only; no analytics on document content.
- File types are checked from file contents, not just extensions.
- `test-photos/` is git-ignored. Do not commit private documents or personal information.

See [PROJECT.md](PROJECT.md) for the product vision and MVP scope.
