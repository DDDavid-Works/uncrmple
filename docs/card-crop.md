# ID & Card Crop mode

Second workflow alongside Document Repair: find a rectangular card in a photo, straighten it,
optionally touch it up and turn it, and export it. Everything runs in the browser; nothing is uploaded, stored
or logged.

## How it works

| Step | Code | Notes |
| --- | --- | --- |
| Detect | `lib/image-processing/opencv/detect-card.ts`, `card-pipeline.ts` | Runs on an 800 px copy; corners are scaled back to full resolution. |
| Score | `lib/image-processing/card-geometry.ts` | Heuristic confidence 0..1 (not a probability). |
| Straighten | `lib/image-processing/opencv/warp.ts` (shared with Document Repair) | Output size from the longer of each pair of opposite edges; proportions come from the geometry. |
| Touch up (optional) | `lib/image-processing/opencv/enhance-card.ts` | Off by default, separate from the crop. |
| Rotate (optional) | `features/card/useCardCrop.ts` | Turns the card a quarter left or right. The crop is redone from the same corners and turned before encoding, so touch-ups apply to the turned card. Reset clears the turn. |
| Quality checks | `lib/image-processing/card-quality.ts` | Glare and blur warnings only; nothing is "fixed". |
| UI | `features/card/`, `features/mode/` | Global mode selector; reuses `CornerEditor` and `ExportBar` (image, ZIP and PDF export). |
| Engine | `lib/engine/` | Detection, cropping and touch-ups run as jobs in the shared Web Worker. |

### Detection

Candidates come from five sources (luminance edges, per-channel edges with fixed sensitive
thresholds, bright regions, dark regions, and straight lines). Each convex hull is reduced to four corners by repeatedly
removing the edge that adds least area (this collapses rounded corners onto the true corner), then
each side is refitted to the outline with a consensus line fit that prefers the outermost strong
edge. The line source (`card-lines.ts`) runs a probabilistic Hough transform on both edge maps, merges
collinear segments into long lines, and intersects pairs of roughly parallel, roughly perpendicular
lines into quads. Unlike contour tracing it can still assemble a card whose outline is broken (two
tone design, partly covered by fingers). Its corners are a few pixels less exact than the contour
ones, so a line-built quad must beat the best contour quad by a margin to be chosen. Candidates are
scored on:

- edge support along the outline (30%)
- visible contrast across each of the four sides (30%)
- rectangle-likeness and card-like proportions (25%)
- size (15%)

A card is "ready" (cropped automatically) only if the score is at least 0.70, all four sides are
visible, the shape is plausible and the outline does not touch the photo border. Weaker candidates
are shown for verification, and anything below the minimum is reported as "no card found" with the
manual corner editor open. A larger candidate enclosing the winner is preferred, because a printed
photo box or header can look like a small card.

### Result states shown to the user

- Card detected and cropped (high score) - the user is still told to compare with the original.
- Card detected - please verify the corners (low score or a warning).
- Automatic detection failed - select the corners manually.
- Warnings: edges unclear, card cut off, strong perspective, low resolution, glare, blur.

A clean crop is never described as suitable for official verification.

## Known limitations

These are known, not hypothetical:

1. **Real-world reliability is unmeasured.** Every automated test uses synthetic images. Passing
   them says the geometry code is correct, not that detection works on real photographs.
2. **Card colour equal to background.** If the card outline is invisible, detection can return the
   card's inner photo box or header instead (reported as "ready" if that box has strong edges).
   Only the user's corner check catches this.
3. **Fingers and hands.** A covered *corner* is usually reconstructed from the two visible sides
   (accurate on synthetic images). A hand covering most of a *side* makes the detector follow the
   hand's edge and can still be rated "ready" with a wrong crop (about 36 px off on a synthetic card;
   tracked by the `KNOWN FAILURE` test in `detect-card.test.ts`). Skin tone is not modelled.
4. **Patterned or high-contrast backgrounds** (keyboards, tiled tables, other cards) produce
   competing rectangles. The scoring prefers the best-supported one, which is not always the card.
5. **Aspect ratio under perspective** is estimated from edge lengths, which is approximate for steep
   angles. The crop's size uses the same estimate. Known card formats are not offered.
6. **Rounded-corner cards** are cropped to the true corners, so the four corner triangles of
   background are visible in the output. This is intended; it keeps the full card.
7. **Glare and blur thresholds** (`GLARE_SHARE_MIN`, `BLUR_VARIANCE_MIN`) were set against synthetic
   images and need calibration on real photos. A blank, featureless card can be reported as blurry.
8. **Enhancement cannot recover information.** Sharpening raises edge contrast only; it does not fix
   blur. Lighting correction is clamped to gentle gradients on purpose.
9. **One job at a time.** Detection, cropping and touch-ups run in the same Web Worker as Document
   Repair (on the page only where a worker cannot decode images), so the page stays responsive, but
   jobs queue behind each other. There is no "crop all" yet.
10. **Touch dragging** of corner handles uses the existing editor and has been checked in an
    emulated mobile viewport (no horizontal overflow), but not on a physical touch device.
11. **HEIC** photos are not accepted (existing limitation): convert to JPEG first.
12. **Document assessment** is skipped in card mode, so there is no pre-crop quality report beyond
    the warnings above.

## Real-photo evaluation plan

Do this before relying on the feature or tuning thresholds. Keep every photo out of the repository;
use only photos of cards you may process (your own, or consenting volunteers; cards with sensitive
numbers can be blurred in a copy only for sharing, never for testing).

### Test set (aim for 60+ photos, at least 20 distinct cards)

Vary each axis independently, and include several combinations:

- **Card design:** light, dark, coloured, holographic or glossy, transparent window, photo-heavy,
  white with white border, ID-1 and non-standard sizes.
- **Holding:** flat on a desk, held in one hand, held in two, fingers over one edge, fingers over a
  corner, thumb over the photo.
- **Background:** plain, wood, patterned cloth, keyboard, paper, other cards, same colour as the card.
- **Angle:** straight-on, 15 degrees, 30 degrees, 45 degrees, plus rotation (portrait, upside-down).
- **Lighting:** even, window side-light, overhead glare, shadow across the card, dim indoor.
- **Size in frame:** card filling 60 percent, 25 percent, 8 percent of the photo.
- **Camera:** modern phone, older phone, webcam; one or two high-resolution (12+ MP) photos.
- **Negative controls:** photos with no card (desk only, paper, a phone screen, a book).

### Procedure

1. For each photo, record the ground-truth corners by placing them with the manual editor (or
   export the manual result and compare).
2. Run automatic detection and record: level (ready / verify / failed), score, warnings, and the
   corner error in pixels of the original photo (maximum over the four corners).
3. Judge the crop by eye against the original and note: whole card included, any background left on
   an edge, any card content cut off.

### Metrics and targets (starting points, adjust after the first pass)

| Metric | Target |
| --- | --- |
| "ready" crops whose maximum corner error exceeds 1.5 percent of the card's long side | at most 2 percent of "ready" results |
| Cards found at all ("ready" or "verify") on photos with a visible card | at least 90 percent |
| Negative controls reported as "ready" | 0 |
| Negative controls reported as "verify" | at most 10 percent |
| "ready" crops that lose any printed content | 0 |
| Median time to first result on a mid-range phone, 12 MP photo | under 5 seconds after engine load |

The most important number is the first row: a confident but wrong crop is the failure that matters.
If it exceeds the target, raise `READY_CONFIDENCE` or require stricter side visibility before
adjusting anything else.

### Calibration

- Plot score against corner error; check that "ready" separates good from bad and move the 0.70
  threshold if it does not.
- Tune `CONTRAST_THRESHOLD`, `SENSITIVE_CANNY`, `GLARE_SHARE_MIN` and `BLUR_VARIANCE_MIN` using the
  labelled set, then re-run the whole set (a threshold that helps one failure often hurts another).
- Only if conventional detection stays below target on realistic photos, evaluate a trained
  detector. That adds model weights of several MB and changes the performance and dependency
  profile, so decide it deliberately; do not add it by default.

### Manual checks per release

- Desktop and mobile browsers (Chrome, Safari on iOS, Firefox).
- Drag, keyboard and touch corner adjustment; reset; adjust after crop; cancel.
- Rotate left and right, then touch up and reset; confirm the turn is kept with touch-ups and cleared by reset.
- Download image, ZIP and PDF; open each and confirm the complete card boundary is present.
- Browser memory after processing ten large photos in a row.

## First real-photo results (3 photos, 2026-10-17 run)

Too small a set to say anything about reliability (the plan calls for 60+), but it is the first
contact with real images. Harness: `card-eval.html` (dev server only, reads
`test-photos/cards/`, never uploaded).

| Photo | What it is | Result | Verdict |
| --- | --- | --- | --- |
| `IMG_1214` | Yellow/green card on a dark surface, phone portrait 3024x4032 | VERIFY, score 0.65, "edge unclear / cut off" | Close: top, left and bottom edges right; the right edge is skewed outward, bottom-right corner clamped to the photo edge. One corner needs dragging. The verify tier worked as intended. |
| `att.S_q2vo…` | Gold card held in a hand, brown/white background, 2048x1536 | VERIFY, score 0.79, "cut off / strong perspective", 13% of photo | **Failed**: the outline is not the card (it spans background). Not offered as ready. Manual corners required. |
| `IMG_0417` | Open passport booklet (not a card) | READY, score 0.94 | Outline follows the booklet; a rectangular document, outside the card use case. |

What this shows:

- On real photos the automatic detector did **not** reliably find a hand-held card; one of two
  real cards needed a corner fix and the other needed full manual placement.
- The safety behaviour held: neither real card was rated "ready", so nothing was cropped without the
  user seeing the corners first.
- Two defects found and fixed during this run: corners could lie outside the photo (they are now
  clamped), and the "prefer the enclosing shape" rule could pick a huge junk shape (it now requires a
  card-plausible shape, not touching the frame, and a close score).
- Likely causes, not yet proven: a card with two differently coloured halves yields half-card
  candidates, and a card of similar tone to its surroundings yields weak edges. A line-based
  approach or a trained detector is the next thing to evaluate if a larger set confirms this.

### Second run, after adding the line cue (same 3 photos)

| Photo | Result | Judged by eye |
| --- | --- | --- |
| `IMG_1214` (two-tone card, dark surface) | READY, 0.99, 1.60:1 | Complete card, clean edges |
| `att.S_q2vo…` (card held in a hand) | READY, 0.99, 1.59:1 | Complete card, clean edges |
| `IMG_0417` (passport booklet) | READY, 0.94, 1.41:1 | Outline follows the booklet |

Read this carefully: the line cue was designed while looking at these same two failing photos, so
this is a **fix confirmed on its own training examples, not evidence of general reliability**. The
detector was changed in response to what those photos showed, and three photos cannot detect
over-fitting. The negative-control and varied-photo tests in the plan above are still required. In
particular, check that the new line candidates do not produce confident wrong quads on photos with
many straight edges (tables, keyboards, shelves, stacked cards). Typical time on a 12 MP photo was
0.2-1.8 s after engine load.
