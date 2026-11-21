# Receipt mode (planned, not built)

Third workflow alongside Document Repair and ID & Card Crop: repair a photo of a shop receipt, then
read its printed lines into a table the user can copy in part or in full. Everything runs in the
browser; nothing is uploaded, stored or logged.

Status: design only (Phase 0, 2026-11-21). No code exists yet. Nothing below may be presented to
users as working until the phase that builds it is done and tested.

## Why a separate mode

Receipts already go through Document Repair. A mode of their own is justified because three things
differ, not just a preset:

1. **Repair tuning:** faded thermal print needs a stronger, careful contrast lift that does not
   bring out crumple texture; very tall, narrow pages need sensible output sizing and PDF fit.
2. **Review:** the repaired image is shown next to a table of the receipt's lines.
3. **Output:** besides image and PDF, the user copies text (tab-separated) or downloads CSV.

## Scope

### In scope

- Receipts printed in **English**, starting with **Philippine** receipts (₱/PHP, VAT lines,
  Philippine date formats). Other local formats come later, only after these work.
- The receipt repair pipeline, the manual corner editor and the existing image/PDF export.
- On-device text recognition (OCR) of the **repaired** image.
- A table of the printed lines: Item and Amount columns by default, Qty and Unit price only where a
  line clearly has them (for example `2 x 45.00`). Header and footer text (shop name, address, TIN,
  "Thank you") stays as plain lines.
- Copy a cell, a row, a column, a selection or everything, as tab-separated text so pasting into a
  spreadsheet keeps the columns. A plain-text view of all recognised lines, with "Copy all".
- CSV download per receipt and for a batch.

### Out of scope (for now)

- Labelling fields ("this is the total", "this is the merchant"). The table arranges what is
  printed; it does not interpret it.
- Cloud OCR or any AI/LLM service. See "AI options" below.
- Stitching several photos of one long receipt.
- Languages other than English; handwriting.
- Expense categories, accounting-software integrations, receipt storage or history.

## Rules

These follow from `PROJECT.md` sections 7 and 8 and are not negotiable:

1. **OCR only reads the image; it never changes it.** The repaired pixels remain the record.
   Recognised text is never drawn back onto the receipt and never replaces any part of it.
2. **No guessed values.** A value the OCR is unsure of is marked, not silently corrected. A missing
   value stays empty. No step "fixes" digits to make totals add up.
3. **Every value is checkable and editable.** Tapping a row highlights the line on the repaired
   image; every cell can be edited; low-confidence cells are highlighted.
4. **Honest failure.** If no text can be read, say so ("Couldn't read text on this receipt"). An
   empty or partial table is never shown as a complete result.
5. **No network requests for OCR.** The engine, its worker and the language data are self-hosted
   and served from the site's own origin. No CDN, no telemetry.

## OCR engine: Tesseract.js (proposed)

Chosen for the spike because it runs fully in the browser, needs no server and has no per-page
cost. The dependency checks in `CLAUDE.md` must be completed before it is added to `package.json`
(Phase 3); the spike only loads it from the dev harness.

| Check | Status |
| --- | --- |
| License | Apache-2.0 (to confirm for the exact version installed) |
| Maintenance | To confirm at install: recent releases, open issues |
| Size | WASM core plus English language data, several MB in total (fast data is smaller than best). Measure the real transfer size in the spike. |
| Browser support | WASM in a Web Worker. Confirm on Safari iOS and a mid-range Android phone. |
| Network | Its defaults fetch the core and language data from a CDN. They must be overridden to self-hosted paths, or it breaks the privacy model and the CSP (`connect-src` allows only our origin). |
| CSP | `wasm-unsafe-eval` is already allowed for OpenCV. Check whether its worker needs a `blob:` worker source; if so, load the worker from a file instead of widening `worker-src`. |
| Alternative | If Tesseract misses the pass bar, evaluate one other on-device engine (for example PaddleOCR models through an ONNX runtime) before considering anything off-device. |

Language data loads only when receipt mode is first used, never on the home page or in the other
modes.

## Phases

Each phase leaves the app runnable and ends with tests, a type check and a short report.

### Phase 0: decide and document (this file)

- This design note; `PROJECT.md` updated to record the planned scope change.

### Phase 1: feasibility spike (dev-only, not shipped)

- **Samples:** 20-30 real Philippine receipts in English: supermarket, convenience store,
  restaurant, pharmacy, fuel, plus faded, crumpled, long and wrinkled ones. Stored in
  `test-photos/receipts/` (already git-ignored). Never committed. Photos that show card numbers,
  names or loyalty IDs are blurred in the copy used for testing.
- **Ground truth:** one hand-typed JSON file per receipt listing its printed lines and amounts, kept
  next to the photos (also not committed).
- **Harness:** `receipt-eval.html`, dev server only, like `card-eval.html`. It runs OCR on (a) the
  raw photo and (b) the photo after the current Document Repair, and scores both.
- **Metrics:**
  1. Line recall: share of printed lines found.
  2. Amount accuracy: share of amounts exactly right (every digit) and in the right row.
  3. Total found: whether the printed total appears exactly.
  4. Time per receipt after the engine has loaded, on desktop and on a mid-range phone.
  5. One-time download size of engine plus language data.
- **Compare:** fast and best English language data; raw versus repaired input.
- **Pass bar (proposed):** at least 90 percent of amounts exact after repair, and under 8 seconds
  per receipt on a mid-range phone.
- **Output:** a results section in this file with the numbers and a decision: go, go with limits,
  or stop. If it stops, decide together; cloud OCR is not the automatic fallback.

### Phase 2: receipt mode, repair only

- Third option in `ModeSelector` ("Receipt").
- Receipt repair pipeline assembled from existing steps: detection tuned for tall, narrow pages,
  a thermal-fade contrast lift, the same corner editor, existing image and PDF export.
- Tests: options, geometry on very tall pages, switching modes keeps photos loaded.
- Useful on its own, before OCR ships.

### Phase 3: OCR text

- OCR in a Web Worker (its own or the engine worker; decide here), with progress and cancel.
- Plain-text view of recognised lines with "Copy all".
- Honest error states. OCR confidence may feed the photo check ("print too faint to read
  reliably").

### Phase 4: table

- A pure function from words with positions to rows (no OCR inside), unit-tested with fixed
  word-position fixtures: right-most number on a line becomes Amount; wrapped item names joined;
  header and footer kept as plain lines.
- Table UI: editable cells, low-confidence highlight, row-to-image highlight, copy by cell, row,
  column, selection or all (tab-separated). One table per receipt plus "Copy all receipts" with a
  receipt-name column.

### Phase 5: export and launch

- CSV download per receipt and per batch.
- Optional, may be deferred: PDF with an invisible text layer (searchable).
- Free/paid gating in the shared config module.
- Site and waitlist copy that makes no accuracy claim the spike did not support.
- Manual checks on desktop and mobile browsers.

## Known risks

1. **Accuracy on thermal receipts is unknown.** Faded print, small fonts and dot-matrix printers
   are where Tesseract is weakest. The peso sign is often read as "P". Phase 1 measures this.
2. **Download size and speed on phones.** Mitigated by loading OCR only in receipt mode, inside a
   worker, but a first use on mobile data will still be noticeable.
3. **Table layout fails on unusual receipts** (two-column layouts, amounts not right-aligned,
   discounts on their own line). The plain-text view is always available as a fallback.
4. **Long receipts** may need more resolution than the current output sizing gives; check in
   Phase 1 by comparing results on full-size and downscaled images.

## AI options (on hold)

Decided 2026-11-21: not pursued now. A cloud vision model would likely read receipts more
accurately and return a table directly, but it sends the photo off the device, needs a backend to
hold the API key, adds a running cost per receipt and can substitute plausible values for unclear
ones. If revisited, the agreed shape is an opt-in, clearly labelled, paid "cloud read", off by
default, whose values are cross-checked against on-device OCR and the receipt's own arithmetic. It
needs its own privacy proposal under `PROJECT.md` section 8 first. On-device AI models (WebGPU or
ONNX) remain an option if Tesseract falls short, subject to download size and phone support.

## Open decisions

- Free or paid: whether receipt mode joins card-crop mode as a paid feature (`PROJECT.md`
  section 12).
- Whether OCR shares the engine worker or runs in its own.
- Whether searchable PDF ships in Phase 5 or later.
- Which other local formats follow Philippine receipts.
