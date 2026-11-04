---
title: How to remove shadows from a photo of a document
description: Shadows from your phone and your hand make document photos hard to read. Here is why they happen, how they are removed, and how to avoid them.
date: 2026-11-04
---

Almost every document photo taken at a desk has a shadow in it. You lean over the page to take the picture, and your phone, your hand or your head blocks part of the light. The page comes out bright on one side and grey on the other, and the text in the dark part is hard to read.

Shadows also make photos look worse when you print them or turn them into a PDF: the grey areas print as grey blotches, and they make the file larger.

## Why simply making the photo brighter doesn't work

The obvious fix is to raise the brightness or contrast. That brightens the whole page by the same amount, so the shadowed part gets lighter but the part that was already bright turns pure white, and faint text or pencil there disappears.

The problem is that the lighting is uneven. A good fix has to brighten each part of the page by a different amount.

## How shadow removal works

Most of a document page is blank paper, and blank paper is the same colour everywhere. So any change in the brightness of the paper across the photo is caused by the lighting, not by the page itself.

Shadow removal uses this:

1. **Estimate the lighting.** The tool looks past the text to the paper around it and builds a smooth map of how bright the paper is at every point of the page.
2. **Divide it out.** Each pixel is compared with the paper brightness around it. Paper becomes evenly white, and ink keeps its darkness relative to the paper next to it, in both the bright and the shadowed areas.
3. **Clean up the style.** The evened-out page can then be kept in colour, turned to grayscale, or turned to crisp black and white for printing and faxing.

Because this works from the page itself, it handles soft shadows, a gradual fall-off of light across the page, and the yellow tint of indoor lighting.

## What it can't fix

- **Very dark shadows.** If part of the page is nearly black in the photo, there is little detail left to recover, and the text there may stay faint or noisy.
- **Glare.** A bright reflection from a lamp or window on glossy paper washes the text out to white. Removing shadows cannot bring back text that isn't in the photo.
- **Large dark areas on the page.** Photos, logos or solid boxes printed on the page can be mistaken for shadow, and may come out lighter than they really are.

## How to take a photo with fewer shadows

- **Use daylight from a window**, with the window to one side of the page rather than behind you.
- **Avoid a single overhead lamp** directly above you. It puts your shadow right on the page.
- **Step back and zoom in slightly**, so your phone is further from the page and casts a smaller, softer shadow.
- **Turn off the flash.** It causes glare on glossy paper and a bright spot in the middle of the page.
- **Hold the phone flat over the page**, not tilted toward the light, so there is no reflection.

## Removing shadows from a photo you already have

If the photo is already taken, Uncrmple evens out the lighting across the page, straightens it and lets you choose a Color, Grayscale or Black & white result, then export an image or a PDF. It runs entirely in your browser, so your documents are never uploaded.
