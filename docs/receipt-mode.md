# Receipt mode (planned, not built)

Third workflow alongside Document Repair and ID & Card Crop: repair a photo of a shop receipt, then
read its printed lines into a table the user can copy in part or in full. Everything runs in the
browser; nothing is uploaded, stored or logged.

Status (2026-11-21): Phase 2 built (Receipt mode with repair only, see below). Reading text (OCR)
is not built; the spike harness exists but has not run on real receipts. Nothing below may be
presented to users as working until the phase that builds it is done and tested.

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
- Handwritten booklet receipts (pre-printed forms filled in by hand). Decided 2026-11-21: skipped
  for now. Receipt mode still repairs them like any receipt, but reading their handwritten
  values is not pursued. Options considered and set aside: a fill-in table with zoomed cell
  crops; a small on-device handwritten-digit reader for the form's Amount cells (research
  spike); an opt-in cloud read (on hold with the other AI options). Revisit only if real users
  show they need it, for example from the share of booklet receipts in the spike set or a
  waitlist question.
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
| Versions | `tesseract.js` 7.0.0 and `tesseract.js-core` 6.1.2 (Apache-2.0, both published 2025-12-15); `@tesseract.js-data/eng` 1.0.0 (MIT, 2023). Installed as dev dependencies for the spike only (2026-11-21). |
| Maintenance | Last release about 11 months ago. Check for newer releases and open security issues before Phase 3 moves them to runtime dependencies. |
| Size | Worker script 0.1 MB; LSTM engine (`*.wasm.js`, WASM embedded) 3.9 MB, about 1.5 MB gzipped; English data `best_int` 3.0 MB or full 10.9 MB, both already gzipped. First use with `best_int`: about 4.6 MB over the network if the server compresses the engine. |
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
  The format is defined and checked in `src/dev/receipt-eval/truth.ts`; see "Writing ground
  truth" below.
- **Harness:** `receipt-eval.html` (`src/dev/receipt-eval.ts`), dev server only, like
  `card-eval.html`. Start the dev server and open `/receipt-eval.html`, pick the settings, press
  Run. It runs OCR on the raw photo, on the Receipt mode output (grayscale with the receipt curve,
  as the app starts it) and on the Document Repair output (grayscale, black & white or colour), as
  ticked, and scores each against the truth file (`src/dev/receipt-eval/score.ts`).
  - Settings: English data `best_int` or full; Tesseract page layout 4 (single column), 3
    (automatic) or 6 (single block); scale before OCR 1×, 1.5× or 2× (enlarges small print).
    With the LSTM engine the full data gave exactly the same result as `best_int` (its LSTM model
    is the same), so `best_int` is the one to use.
  - Engine, worker and language data are served from `node_modules` on the dev server; the IndexedDB
    cache is off. No other host is contacted.
  - Per receipt: the photo, each input's OCR text (lines under 60 confidence in red), its scores,
    and a list of missing lines and wrong amounts. A summary table pools all receipts per input.
    Results are also on `window.__receiptEval`.
  - A photo without a truth file is read but not scored; a truth file with mistakes is listed with
    its errors and not scored.
  - Scoring: a truth line is found when an OCR line contains its words with at most 20 percent
    character errors (spaces, punctuation and amounts ignored). An amount is in row when the
    matched OCR line, or an unmatched line right under it (a wrapped name, a `2 x 18.50` line),
    holds it digit for digit; "anywhere" counts it on any line.
  - Checked on one synthetic receipt rendered from the template (not a photo): every line and
    amount found on raw, grayscale and colour input; black & white misread two amounts. This only
    shows the harness works, not how OCR does on real receipts.
  - After Receipt mode was added, checked on one drawn faded receipt photo (print 178 on paper
    shading from 236 to 200, on a dark table, slightly turned): raw photo and Document Repair
    grayscale read no lines; Receipt mode read 11 of 14 lines, 7 of 9 amounts and the total, missing
    the faintest lines at the bottom. A drawing, not a photo: it shows the lift can matter for OCR,
    not how much.
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

### Writing ground truth

For each photo `test-photos/receipts/IMG_1234.jpg`, copy `src/dev/receipt-eval/truth-template.json`
(a fictional receipt) to `test-photos/receipts/IMG_1234.truth.json` and replace its values with
what the receipt prints. Type from the paper receipt if you still have it, otherwise from the photo
zoomed in, never from an OCR result.

- `photo`: the photo's file name. `shop`: the kind of shop, not its name (supermarket, convenience,
  restaurant, pharmacy, fuel, other).
- `conditions`: any of `faded`, `crumpled`, `folded`, `long`, `curled`, `shadow`, `glare`,
  `angled`, `blurry`, `low-light`; empty list if none.
- `lines`: every printed line, top to bottom, one entry each. Skip blank lines, rules (`-----`),
  barcodes and logos.
  - `kind`: `text` for lines without a price (shop name, address, TIN, date, footer); `item` for a
    bought item; `summary` for subtotal, VAT, discount, cash, change and other priced lines;
    `total` for the amount due (exactly one).
  - `text`: the words as printed, keeping capitals and abbreviations. If an item name wraps onto a
    second line, join both into one entry.
  - `amount`: exactly as printed, as text: `"1,234.50"`, `"-20.00"`, `"(10.00)"`, `"P 95.00"`.
    Required on `item`, `summary` and `total` lines.
  - `qty` and `unitPrice`: only on item lines that clearly print them, as in `2 x 18.50`.
  - `ignore`: `"unreadable"` if you cannot read the line either; `"private"` for card numbers,
    names, phone numbers or loyalty IDs, with the text typed as `"[hidden]"`. Ignored lines are
    left out of scoring.
- `notes`: anything unusual (two columns, handwriting, a stamp over the text).

The harness reports every mistake in a file at once (unknown kind, an amount that is not a number,
two totals and so on), so a typo shows up the first time the file is loaded.

### First real printed receipt (2026-11-21)

One photo is not a result, but it is the first contact with a real printed receipt. Photo: a
dot-matrix sales invoice on continuous paper, crumpled, photographed at an angle on a table,
1536 × 2048 px (a downsized messaging-app copy, not a camera original), so the repaired invoice
is only about 1300 px wide and the print about 12 px tall. Truth typed from the photo by Claude,
amounts checked by the receipt's own arithmetic; customer and cashier lines hidden.

| Input | Scale | Lines found | Amounts in row | Amounts anywhere | Total |
| --- | --- | --- | --- | --- | --- |
| Raw photo | 1× or 2× | 3 / 35 | 0 / 18 | 0 | not found |
| Receipt mode | 1× | 16 / 35 | 8 / 18 | 12 | misread |
| Receipt mode | 2× | 19 / 35 | 8 / 18 | 14 | correct |
| Document Repair, grayscale | 1× | 19 / 35 | 5 / 18 | 10 | misread |
| Document Repair, grayscale | 2× | 18 / 35 | 5 / 18 | 15 | misread |

(Layout 4; layout 3 at 2× was about the same. About 1.6 s per read at 1×, 2.8 s at 2× on a
desktop.)

What it shows:

- Far below the pass bar (90 percent of amounts in row): 8 of 18 at best.
- Repair is essential (the raw photo gave nothing usable); Receipt mode did as well as or better
  than Document Repair on every count.
- Enlarging 2× helped a little (the total became correct) but not enough.
- Two kinds of failure, about equally often:
  1. **Rows broken apart.** On wavy, crumpled paper Tesseract's line finding merges or splits
     rows: a table header joined to the first item, a whole item line lost, a totals row joined
     to the item above. The words are often read but end up with the wrong numbers.
  2. **Digits and separators misread:** `1,422.08` for 1,488.08, `1.328.65` for 1,328.65,
     `159,43` for 159.43. These must not be "corrected" by guessing (rule 2); they would be
     flagged as low confidence.
- Next: real camera originals at full resolution, flat and crumpled, before drawing any
  conclusion. If rows still break apart on full-resolution photos, finding the rows ourselves
  (from the repaired page's text lines, which the dewarp code already traces) and reading each
  row separately is the first thing to try, before considering another OCR engine.

#### Row by row (tried 2026-11-22, same invoice)

The rows are found with the page tracer the repair already uses (`traceLines`), joined across
columns into whole rows, cut out as strips that follow each row's own curve, and stacked level
with white gaps into one image that Tesseract reads in one pass as a single block
(`src/dev/receipt-eval/rows.ts`, "Reading: Row by row" on the evaluation page). Reading each strip
separately worked as well but took about 45 s per receipt; the stacked image takes 3-5 s.

Scoring was also changed so that two blocks printed side by side on one row ("Received the above
merchandise…" and "Grand Total 1,488.08") can match different parts of the same OCR line; the
numbers below are all scored that way.

| Reading | Scale | Input | Lines found | Amounts in row | Amounts anywhere | Total | Time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Whole page | 1× | Receipt mode | 16 / 35 | 8 / 18 | 12 | misread | 1.7 s |
| Whole page | 2× | Receipt mode | 19 / 35 | 8 / 18 | 14 | correct | 3.2 s |
| Row by row | 1× | Receipt mode | 24 / 35 | 8 / 18 | 11 | misread | 3.4 s |
| Row by row | 2× | Receipt mode | **25 / 35** | **11 / 18** | **16** | **correct** | 4.6 s |
| Row by row | 2× | Document Repair, grayscale | 22 / 35 | 11 / 18 | 16 | correct | 5.0 s |

What it shows:

- Row by row fixes most of the broken rows: item lines now come back whole, with their code,
  description, quantity, price, discount and amount on one line.
- Best result so far: 11 of 18 amounts in row (61 percent), 16 of 18 read somewhere, total correct.
  Still well short of the 90 percent bar.
- What is left is mostly small print misread at this resolution: `£36.00` for 630.00, `1,423.08`
  for 1,488.08, decimal points lost. Enlarging helps only so much; the information is not in a
  1300 px wide invoice photo. The right-hand totals block (VATable Sales, VAT Amount) was not
  traced as rows, so those lines were missed.
- Same caution as above: one downsized photo. Full-resolution photos are needed before tuning
  anything further.

### Phase 2: receipt mode, repair only (built 2026-11-21, before the spike ran)

- Third option in `ModeSelector` ("Receipt"), between Document Repair and ID & Card Crop.
- Receipt repair pipeline assembled from existing steps: detection tuned for tall, narrow pages,
  a thermal-fade contrast lift, the same corner editor, existing image and PDF export.
- Tests: options, geometry on very tall pages, switching modes keeps photos loaded.
- Useful on its own, before OCR ships.

What was built:

| Part | Code | Notes |
| --- | --- | --- |
| Paper profile | `PaperProfile` in `types/repair.ts`, `options.ts` | `EnhanceOptions.profile`: `"document"` (default) or `"receipt"`; validated. Receipts start in grayscale. |
| Faded-print lift | `levels()` in `opencv/enhance.ts` | Same lighting correction as documents. The contrast stretch then takes its black point from the darkest 1 percent of the print instead of capping it at 90, limited to at most about 3.5×; paper stays white. Dark print is treated as before. Measured inside a 4 percent inset so slivers of table left at the edges are not taken for ink. |
| Workflow | `App.tsx`, `useRepair(documents, "receipt")` | The Document Repair workflow (repair, corners, styles, rotate, Repair all, assessment, export) with its own results: a photo repaired in one mode is not shown as repaired in the other. Downloads are named `*-receipt.png`, `receipts.pdf`, `receipts.zip`. No sample photo. |
| Detection, geometry, PDF | unchanged | Detection already accepts long receipts; a synthetic 240 × 900 receipt on a table is found and keeps its proportions. A4 and Letter fit a tall receipt by its height (narrow on the page); "Fit to image" keeps its size. |

Checks: unit tests for the profile, the levels and the PDF layout; OpenCV tests on a synthetic faded
receipt (print 172 on paper 232: grayscale print about 70 with the receipt curve against about 168
with the document curve; paper above 240; a crease stays much lighter than the print; dark print
unchanged; a dark border does not stop the lift); UI tests for the mode, the receipt options sent
to the engine, file names and separate results. In the browser, a drawn faded receipt on a dark
table: darkest 0.5 percent of the print went from 194 (document curve) to 103 (receipt curve).

Known limitations:

1. **Tuned on synthetic images only.** No real receipt photo has been through it. The 1 percent ink
   percentile, the 3.5× limit and the 4 percent inset need checking on the spike's photos.
2. **Creases and texture darken with the print.** The stretch is linear: a crease 20 levels below
   the paper becomes about 3.5 times as visible. It stays far lighter than the print in tests, but
   heavily crumpled receipts may look busier than in Document Repair.
3. **Thin print stays partly gray.** Antialiased 1-2 px strokes do not reach black; the lift cannot
   add ink that the photo does not show.
4. **Black & white** still thresholds the lighting-corrected page with Otsu, unchanged from
   Document Repair.
5. **Long receipts on A4 or Letter** print narrow, about 4 cm wide for a 600 × 4000 px receipt.
   Splitting a long receipt across pages is not offered.
6. **Usage counts** do not tell receipt downloads from document downloads (`image_download` is
   counted as a page).
7. **Free or paid** is not decided; the mode is open to everyone like the rest of the app.
8. The mode selector was checked at 375 px wide (no overflow), not at 320 px.

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
5. **Handwritten booklet receipts.** Many Philippine receipts are pre-printed booklet forms
   (delivery, charge or cash receipts) filled in by hand. First real photo (2026-11-21, a pink
   carbon-copy delivery receipt with blue pen): raw photo, almost nothing read; after repair (any
   style) the printed form text was read almost word for word, including the printed receipt
   number, but none of the handwritten date, name, item or amount. Tesseract does not read
   handwriting, so for these receipts the values that matter would not reach the table. Receipt
   mode helped the repair: the form is straight and clean, though blue pen on pink comes out
   light gray in grayscale (colour keeps it more visible), and the dye along the carbon copy's
   edges leaves speckle. The print was already dark, so the receipt curve matched the document
   curve, as designed. Handwritten receipts are out of scope for now (see Scope).

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
