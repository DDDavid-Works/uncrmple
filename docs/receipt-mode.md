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
- **Pass bar (adopted 2026-11-23):** after repair, **at most 2 percent of the amounts shown are
  silently wrong** (wrong and shown without a warning; see "Catching misreads with the receipt's
  own arithmetic"), with the share of amounts that carry a warning reported alongside; and under
  8 seconds per receipt on a mid-range phone. It applies to chat-app copies as well as camera
  photos, since forwarded copies are what users will often have.
  - Replaces the first proposal, at least 90 percent of amounts exact: on chat-app copies about a
    third of the amounts are misread whatever the settings, so exact reading cannot be the bar.
    What must not happen is a wrong amount that looks right (rule 2).
  - Exact reading is still reported: it decides how many warnings a user has to clear.
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
- `rotate` (optional): for a photo taken sideways or upside down, the clockwise turn (90, 180 or
  270) that stands the text upright, as you would press Rotate in the app.
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

#### First full-resolution receipt (2026-11-23)

Photo: a thermal fast-food receipt (one meal, card payment), a camera original at 4032 × 3024,
flat apart from a fold, photographed sideways on a dark desk. The repaired receipt is
1424 × 3791 px. Truth drafted by Claude from the photo; amounts check out (177.68 + 21.32 =
199.00); card number and approval code hidden. 43 scored lines, 8 with amounts.

A sideways photo needs turning before it can be read. The app already has Rotate; the evaluation
page now takes the turn from an optional `rotate` field in the truth file (0, 90, 180 or 270,
clockwise) and applies it to every input, the way a user would press Rotate. Without it every
input read 0 or 1 of 43 lines. Read upside down by mistake, it still read 1 line; turned the
right way, everything below.

| Reading | Scale | Input | Lines found | Amounts in row | Amounts anywhere | Total | Time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Whole page, layout 4 | 1× | Raw photo (turned) | 16 / 43 | 0 / 8 | 0 | misread | 11.5 s |
| Row by row | 1× | Receipt mode | 38 / 43 | 5 / 8 | 7 | correct | 2.2 s |
| Row by row | 2× | Receipt mode | 37 / 43 | 5 / 8 | 7 | correct | 5.0 s |
| Whole page, layout 4 | 1× | Receipt mode | 41 / 43 | 5 / 8 | 7 | misread | 1.9 s |
| Whole page, layout 6 | 1× | Receipt mode | **41 / 43** | **6 / 8** | **7** | **correct** | 1.9 s |
| Whole page, layout 6 | 1× | Document Repair, grayscale | 41 / 43 | 6 / 8 | 7 | correct | 2.7 s |

What it shows:

- At full resolution the repaired receipt reads well: almost every line comes back word for word,
  including the long accreditation and permit numbers. The repair is what makes it work; the raw
  photo gave no amounts at all.
- On this flat receipt, whole-page reading beats row by row. Row by row cuts every row to one
  strip height, from the typical row spacing, so the large "PHP 199.00" total was cut into two
  partial rows (TOTAL DUE read twice, the card amount lost), and the VAT Amount row was dropped
  entirely. Row by row needs strips sized to each row's own print before it can be compared
  fairly; until then, which reading to use is still open (the crumpled invoice favoured rows).
- Enlarging 2× does not help a full-resolution photo.
- The two amounts missed by the best run:
  1. `199. 00V`: a space read inside the amount. A reader that joins a split amount would catch it.
  2. `21.37` for 21.32: **a wrong digit read with confidence.** The receipt's own arithmetic
     exposes it (177.68 + 21.37 is not 199.00). Phase 3 should check printed sums (VATable sales +
     VAT = total, items = subtotal) and flag the amounts that do not add up for the user to check,
     never correct them (rule 2).
- 6 of 8 (75 percent) is still short of the 90 percent bar, but on one receipt with eight amounts,
  every miss is 12 points. More full-resolution receipts are needed, crumpled and faded ones
  especially.

#### Eight receipts (2026-11-23)

Six more printed receipts, all chat-app copies (2048 × 1536) photographed sideways, the receipt
filling about a third of the frame: three from one variety store (one short, one faded, one with
11 items), a Robinsons Easymart receipt, a faded and creased O!Save receipt, and a 14-item receipt
with every amount circled in pen. Truth drafted by Claude from the photos; every receipt's amounts
add up to its printed total. Eight handwritten photos sent in the same batch were moved to
`test-photos/receipts/handwritten/`, which the evaluation page does not read (out of scope, see
Risks). A 322 px wide copy of a long duty-free receipt is read but not scored: it is too small to
type a truth file from without guessing.

Pooled over all eight scored receipts, 1×:

| Reading | Input | Lines found | Amounts in row | Amounts anywhere | Totals correct |
| --- | --- | --- | --- | --- | --- |
| Whole page, layout 6 | Receipt mode | 72% | 52% | 76% | 3 / 8 |
| Whole page, layout 6 | Document Repair, grayscale | 82% | 55% | 76% | 4 / 8 |
| Row by row | Receipt mode | 48% | 22% | 34% | 1 / 8 |
| Row by row | Document Repair, grayscale | 64% | 26% | 47% | 2 / 8 |

What it shows:

- **The repair did not find five of the six new receipts.** All five were photographed on a white
  desk; the outline of a white receipt on white was too weak, so the repair fell back to the
  whole photo (the app then offers the corners for the user to fix, but the evaluation page does
  not). OCR was then reading a small receipt in the middle of a large photo of a desk. The two
  receipts photographed on wood or a dark desk were found. The evaluation page now shows how the
  page was found for every run, in red when it fell back to the whole photo.
- Because of that, these numbers measure page finding as much as reading. They are not yet a
  fair test of the OCR, and Receipt mode's contrast stretch, measured over the whole photo
  including the desk, likely explains why it did worse than plain grayscale on the faded
  receipts (4 of 20 lines against 18 of 20 on one of them).
- Row by row is clearly worse on this batch: it traces rows across the desk and the receipt alike.
  Whole-page reading stays the default for now.
- Where the receipt was found (Jollibee, the 11-item variety-store receipt), whole-page reading
  got 41 of 43 and 21 of 30 lines, and 6 of 8 and 11 of 17 amounts in row.
- Before judging the OCR further, either the page finding has to cope with a white receipt on a
  light surface, or the evaluation page has to use the corners a user would set by hand. Page
  finding was chosen; see below.

#### Page finding on a pale desk (2026-11-23)

Why it failed: on these photos the desk and the receipt are equally bright (about 150 grey levels
each; the camera exposes for the white paper), and the light falls off across the desk, so no
brightness step marks the receipt's edge. Every outline the detector proposed was rejected, or a
large one following the lighting was offered. The edge is still plain in a sensitive edge map, and
the colours differ slightly: the desk is a little warm (red 5-8 levels above blue), the paper
neutral.

What changed (`src/lib/image-processing/opencv/detect.ts`, `src/lib/image-processing/tint.ts`):
a last-resort stage that runs only when the existing stages find no outline or only a weakly
supported one. It magnifies two colour differences (warm against cool, green against magenta)
that ignore brightness, counts a straight line as a page side when the tint changes across it,
also traces regions of one tint, and scores every outline again on the sensitive edges. One is
used only if at least 60 percent of it lies on those edges and at least half of it separates two
tints. Print is neutral, so the margin of a text block cannot pass. A neutral desk gives no tint
step and nothing is found; Adjust corners remains the fallback.

Checks: a synthetic test of a white receipt on a warm pale desk under a lighting gradient (the
committed detector returns a wrong outline there; the new one finds the receipt within 8 px), and
a neutral-desk version where no colour outline may be made up. All 18 document photos and the four
other receipt photos detect exactly as before (compared side by side with the committed detector).

On the receipts:

- Found now: four of the five white-desk receipts (#3, #5, #2, #6). Still missed: the faded
  receipt #4, whose bottom edge shows almost no change of tint either (manual corners).
- Whole page, layout 6, 1×, eight receipts pooled: lines found rose from 72 to 77 percent (Receipt
  mode) and 82 to 84 percent (grayscale); one more total read correctly (4 of 8). Amounts in row
  fell from 52 to 44 percent; at 2× they are back to 51 percent.
- The fall is not row assignment: with the receipt cropped, rows now come back whole and in the
  right place (`Vat Exempt Sales 420 00`). What is left is digits and decimal points misread on
  receipts only 640-830 px wide once cropped (`106.00` for 100.00, `420 00`, `G.00`). Reading the
  whole photo had matched a few of those by luck. These chat-app copies are at the limit of what
  Tesseract can read; camera originals would answer whether the OCR itself is good enough.
- Pen circles around amounts are read as brackets: `(1,320.00)`, which on a receipt means a
  negative amount. Phase 3 must not turn a bracketed amount into a discount without the user
  seeing it; flag it like any amount that does not add up.
- Not caused by this change, seen along the way: on the 11-item receipt photographed on wood, one
  corner of the found outline sits on the photo's top edge, so a strip of wood is included.

#### Catching misreads with the receipt's own arithmetic (2026-11-23)

Most test receipts come from friends through chat apps, so camera originals are hard to get, and
users will often have the same: a forwarded copy. On those, reading every digit right is out of
reach. What matters is that a wrong amount is never shown as if it were right (rule 2). So the
spike now also measures **silently wrong** amounts: wrong, and shown without a warning.

`src/dev/receipt-eval/checks.ts` gives every amount read a status, without correcting anything:

- **confirmed** when a sum printed on the receipt proves it: quantity × unit price on the line,
  items adding up to the total, VAT parts adding up, total + change = cash, or another line
  printing the same value (subtotal = total, cash = total). Zero proves nothing.
- **flagged** when a check fails or the reading is doubtful. A malformed number (`1.328.65`,
  `159,43`) or a failed quantity × price is never cleared. Brackets (a negative amount, or a pen
  circle), low OCR confidence (under 60) and items that do not add up to the total are cleared when
  another sum proves the amount.
- **unchecked** otherwise.

A space read inside an amount (`199. 00`) is joined first. Words such as TOTAL are used only to
find where to check, never shown as labels. The audit takes, for every priced row the scorer
found, the amount the app would show there (chosen without looking at the truth) and compares it
with the truth.

Whole page, layout 6, 1×, eight receipts, 64 amounts shown:

| Input | Wrong | Caught | Silently wrong if only flagged amounts are warned about | Silently wrong if every unconfirmed amount is | Warnings (flag only / unless confirmed) |
| --- | --- | --- | --- | --- | --- |
| Receipt mode | 23 (36%) | 21 | **2 (3%)** | **0** | 48% / 75% |
| Document Repair, grayscale | 20 (31%) | 16 | 4 (6%) | 1 (2%) | 41% / 66% |

What it shows:

- **The checks catch almost every misread:** 21 of 23 on Receipt mode. No wrong amount was ever
  confirmed by a sum in Receipt mode; every confirmed amount was right. The one wrong "confirmed"
  amount under grayscale is a scoring artefact: on the unfound faded receipt the scorer matched
  the truth line "VAT Sales" to the OCR line "NONVAT Sales 114.00" (the words contain each other),
  and 114.00 is right for the line it is printed on.
- **The two that slip through** with flag-only warnings are both unchecked, not confirmed:
  `21.37` for 21.32 (VAT that no longer adds up with VATable sales) and `1,580.00` for cash
  1,590.00 (cash − total = change fails, but the change is 0.00, which proves nothing). Warning
  about every unconfirmed amount catches both.
- **The cost is warnings.** About half of all amounts are flagged, three quarters if every
  unconfirmed amount is warned about. On these chat-app copies that is honest, since a third of
  the amounts are wrong, but it shapes the table design (Phase 4): warnings have to be quick to
  clear, such as tapping the amount to see the photo of that row.
- **Receipt mode beats plain grayscale here** once warnings count: more of its misreads are caught
  (21 of 23 against 16 of 20) and fewer slip through.
- A first refinement already cut false alarms: when items fall short of the total (often because
  an item row was not read at all), amounts proven by quantity × price or by the VAT and cash sums
  stay confirmed instead of all being flagged (warnings 56 to 48 percent, catches unchanged).
- A ninth receipt, the Maya card-terminal slip for the Jollibee meal (a camera original, HEIC
  converted to JPEG; crinkled, with a faint watermark behind the text), was found and read well:
  23 of 24 lines. Its one amount, `₱199.00` in a larger font, came back as `#19900`: the peso sign
  read as `#` and the decimal point lost. That is not taken for an amount, so the row shows none
  (not silently wrong), but the English language data does not know `₱` and it is common on
  Philippine receipts. Meanwhile `16.08` from the time `16:08:54` was taken for an amount on a row
  that has none. The audit only looks at rows that should have an amount, so amounts made up on
  text rows are not counted yet; Phase 3 should not show a number on a date or time row.
- Two more chat-app copies (2026-11-24):
  - **A coffee-shop receipt** (sideways, crinkled, bright sunlight with a hard shadow across it,
    and a printer whose decimal point looks like a comma: `180,00`). The receipt was found, but
    only 10 of 24 lines were read and no amount came out right. The checks flagged all three
    amounts it showed (two read with commas, `TOTAL 30.00` for 390.00, which does not add up), so
    none was silently wrong. Cash and change are printed without decimals (`1,000`, `610`), which
    the checks do not treat as amounts yet.
  - **An aquarium ticket invoice held in the hand** (a thumb in the frame, the dark desk beside it,
    a fold, a blurred header). The repair **refused** it: the detector's best outline took in the
    thumb and part of the desk (79 percent of the photo, weakly supported), and measured inside
    it the photo has too little paper to pass the "looks like a paper page" check. In the app the
    user is told so and can mark the corners or clean up the whole image; the evaluation page
    counts it as failed. This is the existing repair's behaviour, not caused by the pale-desk
    stage (which answers only with strong evidence and found none here), but hand-held receipt
    photos with fingers in them will be common.
  - Pooled over ten scored receipts (Receipt mode, whole page, 1×): 67 amounts shown, 26 wrong,
    24 caught, 2 silently wrong (3.0 percent) with flag-only warnings and 0 with warnings on every
    unconfirmed amount (76 percent of amounts warned about).

#### A receipt held in the hand, running off the photo (fixed 2026-11-24)

Why the aquarium invoice was refused, two causes:

1. **No outline fitted the receipt.** It fills the photo from top to bottom, so it has no top or
   bottom edge to close a shape with; a diagonal shadow splits it for the brightness threshold;
   and its right edge bows gently, so the line finder gets only short pieces. The best outline
   left took in the thumb and the dark desk.
2. **The "looks like a paper page" check saw no print.** The forwarded copy is soft-focus, so at
   full size almost no print reaches a strong edge (0.011 of pixels, under the 0.015 floor meant
   for blank or plain images), although the paper measures 88 percent paper-like with no colour.

What changed:

- `src/lib/image-processing/strip.ts`, a new cue in the detector: a strip of paper running off
  both ends of the photo (either way round). Each side is found row by row as the strongest wide
  step between paper and a darker surface, ranked by brightness *ratio* so a shadow across the
  paper (which dims both sides alike) does not win; a straight line is fitted through those steps
  ignoring rows where something else wins (a thumb); and at the photo's ends the band between the
  sides must still be paper, so a sheet lying inside the photo is not stretched to the frame. The
  strip goes through the same scoring as every other outline.
- `src/lib/image-processing/assessment/likeness.ts`: for the "any print at all" test only, print
  is also measured at half size, where a blurred stroke is twice as steep; a plain image still has
  none. Every other measure and threshold is unchanged, so a blurred page is now "uncertain"
  (repaired, with a note) instead of refused.

Checks: unit tests for the strip (with thumb, shadow, bowed edge, both orientations; nothing for a
sheet inside the photo, nothing for a plain image) and for blurred print; an end-to-end repair
test of a synthetic soft-focus hand-held receipt, which the committed code refuses and the new
code crops to the receipt. All 39 test photos (documents, receipts, handwritten) compared before
and after: 37 unchanged; the aquarium invoice now repaired; the coffee-shop receipt now cropped
along its true top edge instead of a wedge of desk. A first version stretched the card-terminal
slip to the frame; the end check above was added for that, and it is back to its old outline.

Results after the fix (whole page, layout 6, 1×, eleven receipts):

- Aquarium invoice: repaired, 7 of 22 lines (soft focus and the shadow), 8 of 9 amounts read
  somewhere; one wrong amount unchecked (`331.47` for 337.47 VAT).
- Coffee-shop receipt: 16 of 24 lines (was 10), total now correct.
- Pooled: 70 amounts shown, 27 wrong, 24 caught; silently wrong 3 (4.3 percent) with flag-only
  warnings, 0 with warnings on every unconfirmed amount (76 percent of amounts warned about).

#### Camera originals (2026-11-25)

Five camera originals (iPhone HEIC, converted to JPEG on this computer as iOS does on upload):
two receipts photographed twice each at different distances, and the full-size photo of the long
duty-free receipt whose 322 px chat copy could not be scored before. The truth format now accepts
`"currency": "USD"` for that receipt, which prices in US dollars; its 57 items add up exactly to
the printed subtotal, and one truth list serves both of its photos.

| Receipt | Photo | Lines found | Amounts in row | Amounts anywhere | Total |
| --- | --- | --- | --- | --- | --- |
| Duty-free, 57 items | camera original | **64 / 94** | 28 / 63 | **58 / 63** | correct |
| Duty-free, 57 items | 322 px chat copy | 3 / 94 | 0 / 63 | 4 / 63 | not found |
| Hardware shop invoice | close | 10 / 31 | 1 / 9 | 2 / 9 | misread |
| Hardware shop invoice | farther | 9 / 31 | 0 / 9 | 0 / 9 | misread |
| Supermarket receipt | farther | 8 / 30 | 2 / 9 | 6 / 9 | correct |
| Supermarket receipt | close | 11 / 30 | 2 / 9 | 4 / 9 | misread |

What it shows:

- **Resolution matters as expected:** the same duty-free receipt goes from unreadable (3 lines) to
  64 lines and 58 of 63 amounts read somewhere. The checks flagged every one of its 12 wrong
  amounts; none was silently wrong.
- **Two camera originals read badly for another reason: the repaired page is tilted.** On the
  supermarket receipt the top corners are cut off at an angle, the outline's corners do not sit on
  paper corners, and the corrected page comes out a few degrees off level with a wedge of table in
  one corner; the slanted rows run into each other in the OCR (`terninal No: 0001 fe LIne: 13:
  11:46`). The crinkled hardware invoice reads as badly. This is a repair problem (corner finding
  and levelling), not an OCR one, and it affects Document Repair too. Not yet investigated.
- Closer is not reliably better here: the tilt dominates.
- Pooled over all 17 photos (Receipt mode, whole page, 1×): 121 amounts shown, 47 wrong, 40
  caught; silently wrong 7 (5.8 percent) with flag-only warnings, **0** with warnings on every
  unconfirmed amount (82 percent of amounts warned about). Desktop time per receipt (repair +
  read): median 3.3 s, slowest 6.4 s; phone timing still not measured.

#### Tilted pages from receipts with clipped corners (fixed 2026-11-25)

Why the supermarket receipt came out tilted: the detector chose the right outline, but a later
step (`pivotSides`, which turns a side of a traced outline onto a faint page edge when the outline
has run on over another sheet the page lies on) moved its top corner out into the table. The
receipt's top corners are cut off at an angle, so the traced top side joins the bottoms of the two
cuts and lies on the paper with no edge under it, which makes it a candidate to turn; and on a
wooden table almost any line shows the small steps the pivot looks for. The turned top side
sloped about 9 degrees, the perspective correction sheared the page, and the levelling step then
saw the print lean differently in different bands and left it alone.

Fix (`src/lib/image-processing/pivot.ts`): pivoting may only take area off the outline, never add
it; a turn that would put a corner outside the traced outline is not made. That is what pivoting
was for in the first place (an outline that ran on over another sheet is too big). Tested with a
scene where the only edge a turn can find lies beyond the outline: the committed code turns onto
it, the new code leaves the outline alone. All 44 photos compared before and after: only the two
photos of this receipt changed, both to the right outline; the levelling step now measures a
consistent 2 to 2.5 degree lean and corrects it.

| Photo | Lines found | Amounts in row | Amounts anywhere | Total |
| --- | --- | --- | --- | --- |
| Supermarket receipt, farther | 8 → **21 / 30** | 2 → 6 / 9 | 6 → **9 / 9** | correct |
| Supermarket receipt, close | 11 → **21 / 30** | 2 → 6 / 9 | 4 → **8 / 9** | misread → correct |

Pooled over all 17 photos: 126 amounts shown, 44 wrong, 39 caught; silently wrong 5 (4.0
percent) with flag-only warnings, 0 with warnings on every unconfirmed amount (80 percent warned
about).

Still open: the crinkled hardware invoice. Its outline is right, but the paper bends (the header
rows climb, the rows below are level) and the faint dot-matrix print covers too little of the page
(about 20 percent) for the flattening step to act on, so it declines ("too little evidence").
That is a limit of flattening, not of the outline.
- Pass bar adopted from here on (see Phase 1): at most 2 percent silently wrong, with the share of
  warnings reported alongside. On today's eight receipts Receipt mode meets it only when every
  unconfirmed amount is warned about (0 of 64), at the cost of a warning on 75 percent of amounts.
  Phone timing is still unmeasured.

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
