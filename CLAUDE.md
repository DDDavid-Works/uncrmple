\# Claude Code Instructions



\## Project Context



This repository contains a mobile-friendly web SaaS for repairing existing photos of paper documents.



Read `PROJECT.md` before making implementation decisions. It defines the product vision, MVP scope, privacy requirements, and future direction.



The product repairs document photographs. It is not primarily a scanner, OCR platform, document-management system, or general-purpose AI image editor.



\## Core Development Principles



1\. Build the smallest complete and usable version of the product.

2\. Prioritize correct image processing over decorative UI.

3\. Do not implement future features prematurely.

4\. Keep code modular, typed, testable, and maintainable.

5\. Avoid unnecessary dependencies and infrastructure.

6\. Do not introduce a backend, database, authentication, or external API without a demonstrated MVP requirement.

7\. Do not use placeholder functionality that appears operational but does not actually work.

8\. Do not claim that an image-processing operation succeeded if it failed or returned an unchanged result unexpectedly.

9\. Do not replace factual document content with AI-generated guesses.

10\. Explain significant technical tradeoffs before committing to an expensive or difficult-to-reverse approach.



\## Proposed Technology Stack



Use the following stack unless a technical limitation justifies a documented change:



\- React

\- TypeScript with strict type checking

\- Vite

\- Modern CSS

\- OpenCV.js or another suitable browser-side image-processing implementation

\- A suitable client-side PDF generation library

\- A lightweight testing framework compatible with the selected stack



Avoid introducing a UI framework, state-management library, backend framework, or component library without a clear need.



Prefer native browser APIs when they are sufficient.



\## Architecture



Organize the application into clear modules. Suggested boundaries:



\- `components/`: reusable UI components.

\- `features/upload/`: file selection and validation.

\- `features/repair/`: processing workflow and repair controls.

\- `features/preview/`: original-versus-processed comparison.

\- `features/export/`: image download and PDF generation.

\- `lib/image-processing/`: image-processing implementation and adapters.

\- `lib/files/`: file validation and file handling.

\- `lib/pdf/`: PDF creation.

\- `types/`: shared TypeScript types.

\- `tests/`: automated tests.



Adjust this layout when appropriate, but preserve clear separation of responsibilities.



Do not create empty abstraction layers solely for hypothetical future use.



\## Image Processing Design



Define a stable interface for the repair pipeline.



The interface should accept an input image and explicit processing options and return either a processed result with relevant metadata or a structured error.



The implementation should be replaceable without rewriting the user interface.



Separate these concerns:



1\. Image decoding and validation.

2\. Document boundary detection.

3\. Perspective correction and geometric transforms.

4\. Lighting and shadow correction.

5\. Contrast and output-style adjustments.

6\. Result preview.

7\. Export.



Do not combine the entire pipeline into one oversized function.



\### Processing Requirements



\- Preserve the source image.

\- Avoid mutating source files or shared image buffers unexpectedly.

\- Handle different image dimensions and orientations.

\- Validate image and canvas dimensions before allocating large buffers.

\- Release temporary canvases, image resources, and processing objects when practical.

\- Handle initialization failures, processing exceptions, and unsupported inputs.

\- Do not silently fall back to the original image while reporting success.

\- Provide a usable manual-correction fallback when automatic page detection fails.

\- Ensure output dimensions and perspective transforms are sensible.

\- Test results against representative real-world document photographs.



Do not assume that conventional image processing can reliably recover severe blur or missing text.



\## Browser Performance



Document images may be large and browser image processing can consume substantial memory.



\- Avoid unnecessary image copies.

\- Resize only when appropriate and preserve sufficient output resolution.

\- Avoid blocking the UI during expensive processing.

\- Use a Web Worker for costly operations when justified and compatible with the selected libraries.

\- Provide visible processing progress where possible.

\- Handle cancellation or abandoned processing jobs cleanly.

\- Revoke object URLs when they are no longer needed.

\- Test on both desktop and mobile browsers.



Do not introduce a worker or complicated concurrency architecture before confirming it is necessary.



\## User Interface



The primary workflow should be:



Upload → Repair → Review → Export



The interface should be simple, responsive, and understandable without instructions.



Users should be able to:



\- Upload one or more document photos.

\- Understand which file is being processed.

\- See processing status and meaningful errors.

\- Compare original and repaired images.

\- Adjust document corners when needed.

\- Change basic cleanup presets.

\- Download repaired images.

\- Export multiple pages as one PDF.



Do not show controls that are not implemented.



Preserve the original image and make returning to the original straightforward.



Use accessible labels, sensible keyboard navigation, and clear focus states.



\## Privacy and Security



Default to client-side processing wherever practical.



Do not introduce:



\- Persistent document storage.

\- Third-party analytics that collect document content.

\- Unnecessary network requests.

\- Broad file-system access.

\- Unrequested external image-processing services.

\- Hardcoded secrets or credentials.



If cloud processing becomes necessary, stop and propose the required architecture and privacy disclosures before implementing it.



Validate file types and sizes. Do not trust file extensions alone.



\## Future Mobile Compatibility



The initial product is a web application. Do not build a native mobile application in the MVP.



Keep core image-processing logic separate from React UI components and browser-specific file handling.



Where practical, define interfaces that allow alternative implementations for:



\- Browser processing.

\- Native mobile processing.

\- Optional server-side processing.



Do not assume browser-specific libraries will run unchanged in React Native. Prefer portable algorithms and explicit adapters over premature cross-platform abstractions.



\## Testing



Create tests for:



\- File validation.

\- Processing-option validation.

\- Document geometry and perspective transforms.

\- Error handling.

\- PDF page ordering and export.

\- Preservation of the original image.

\- Key user-interface workflows.



Use representative sample images with permission to use them. Do not commit private documents or real personal information to the repository.



Where automated pixel-level assertions are brittle, use a combination of unit tests, geometric checks, and manual visual evaluation.



\## Dependencies



Before adding a dependency:



1\. Confirm that it is actively maintained and appropriate for the project.

2\. Check its browser compatibility, bundle size, license, and security considerations.

3\. Determine whether an existing dependency or native browser capability already solves the problem.

4\. Explain the tradeoff if it materially affects architecture or cost.



Do not add an AI API just because the product description mentions AI.



\## Implementation Workflow



Work in small, verifiable stages.



Before implementation:



1\. Inspect the existing repository.

2\. Read `PROJECT.md` and this file.

3\. Identify the current state of the application.

4\. Propose a concise implementation plan.

5\. Identify significant technical risks and unresolved decisions.



During implementation:



\- Implement one coherent milestone at a time.

\- Keep the project runnable.

\- Run relevant tests and type checks.

\- Report commands that were run and their outcomes.

\- Do not claim tests passed unless they were actually executed.

\- Do not overwrite existing user work without checking its purpose.

\- Avoid unrelated refactoring.



At the end of each milestone, report:



1\. What was implemented.

2\. Files created or changed.

3\. Tests and checks performed.

4\. Known limitations.

5\. The recommended next milestone.



If a requirement is ambiguous, make a conservative, reversible choice when possible and document it. Ask before making a decision that significantly changes product scope, architecture, cost, or privacy.



\## Definition of Done



A feature is not complete merely because the UI renders.



It must work for valid input, handle invalid input, preserve user data, provide meaningful feedback, and have appropriate tests.



The initial goal is a reliable document-repair web application, not a simulated SaaS dashboard or a collection of disconnected screens.

