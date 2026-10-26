\# Uncrmple: Document Photo Repair SaaS



\## 1. Product Overview



Build a mobile-friendly web application that transforms poorly photographed paper documents into clean, readable, scan-like digital files.



The product is designed for people who already have a photo of a document and want to fix it without taking another photo.



Product name: \*\*Uncrmple\*\*. Keep it defined in one place per app (`src/config.ts`, `waitlist/src/config.ts`) rather than repeating it throughout the codebase.



Core promise:



\*\*Fix the photo. Keep the document.\*\*



Supporting message:



Turn messy document photos into clean, readable scans in seconds.



\## 2. Problem Statement



People frequently photograph documents using their phones or cameras instead of scanning them. The resulting images may contain:



\- Perspective distortion from photographing a page at an angle.

\- Rotated or skewed pages.

\- Shadows and uneven lighting.

\- Gray, yellow, or textured backgrounds.

\- Low contrast and faded-looking text.

\- Mild blur or poor image quality.

\- Multiple pages that need to be combined into one PDF.



Existing scanner applications often focus on capturing a document correctly. This product focuses on repairing existing photos, especially when the user cannot or does not want to retake them.



\## 3. Target Users



Initial target: everyday document users.



Examples include:



\- Students handling worksheets, notes, and assignments.

\- Office workers handling forms and paperwork.

\- Freelancers submitting receipts, contracts, and supporting documents.

\- Individuals submitting applications or other paperwork.

\- Small-business owners handling routine administrative documents.



Do not optimize the initial product for enterprise document management or highly specialized document workflows.



\## 4. Product Principles



1\. Repair existing photos instead of requiring a new capture.

2\. Prioritize faithful document preservation over cosmetic enhancement.

3\. Make the default workflow simple and automatic.

4\. Allow manual correction when automatic processing fails.

5\. Keep ordinary processing local to the browser whenever practical.

6\. Be transparent about cloud processing and data retention.

7\. Keep the web application independent of any single image-processing provider.

8\. Design the processing engine so compatible logic can be reused by a future mobile application.

9\. Avoid adding features that do not support the core document-repair workflow.



\## 5. MVP Scope



\### A. Image Upload



\- Upload JPG, JPEG, PNG, and WebP images.

\- Support drag-and-drop and a standard file picker.

\- Display file names, image previews, and validation errors.

\- Validate file types, dimensions, and file sizes.

\- Provide clear progress and error states.

\- Support multiple images for a simple batch workflow, subject to practical browser memory limits.



\### A2. Photo Assessment



After upload and before repair, analyse each photo and report how likely a useful repair is. The assessment is shown per photo and never blocks repair.



\- Report separate findings, not one quality score: geometry, lighting and glare, sharpness, resolution, completeness (cut-off page edges), and contrast of text.

\- Summarise as one of: good repair candidate, repair possible with limitations, poor repair candidate (suggest retaking the photo when possible).

\- Each finding carries a confidence; a metric that cannot be measured reliably is reported as not measured, never guessed.

\- Use conventional, browser-side image analysis. No OCR and no machine-learning classifier in V1.

\- The assessment is an estimate, not a guarantee. A later step may compare the repaired output with the original (planned, not yet built).



\### B. Automatic Document Repair



Implement a processing pipeline that can:



\- Detect document boundaries when possible.

\- Correct perspective distortion.

\- Correct rotation and skew.

\- Reduce shadows and uneven illumination.

\- Improve text contrast.

\- Offer color, grayscale, and black-and-white output presets.



Use conventional image processing for operations it can perform reliably. Do not assume that every image can be repaired successfully.



\### C. Manual Correction



When automatic document detection fails, allow users to adjust the four document corners manually.



Users must be able to preview the corrected result before accepting it.



\### D. Preview and Comparison



\- Show the original and processed images.

\- Allow the user to compare both versions.

\- Provide an option to return to the original.

\- Do not overwrite or destroy the original image.

\- Clearly report processing failures rather than presenting an unchanged image as a successful repair.



\### E. Export



\- Download the repaired image.

\- Combine multiple repaired pages into a single PDF.

\- Preserve page order.

\- Provide basic output quality and paper-size options where practical.

\- Keep PDF generation client-side when feasible.



\### F. User Experience



\- Responsive desktop and mobile layouts.

\- Clear upload, processing, preview, and download states.

\- Accessible controls and keyboard support where applicable.

\- Useful empty, loading, success, and error states.

\- No mandatory account registration for basic MVP usage.



\## 6. Explicitly Out of Scope for V1



Do not implement these unless explicitly requested later:



\- Native Android or iOS applications.

\- OCR or searchable PDFs.

\- AI-generated or reconstructed text.

\- Cloud document storage or document history.

\- User accounts and team collaboration.

\- Subscription billing or credit purchases.

\- Enterprise administration.

\- Public processing APIs.

\- AI chat or general image editing.

\- Automatic email or cloud-drive integrations.



Keep the architecture extensible enough to support some of these features later without implementing them now.



\## 7. Image Accuracy and Safety



Document fidelity is more important than visual attractiveness.



The product must not silently invent, replace, or reconstruct document text, names, amounts, dates, identification numbers, or other factual content.



Treat aggressive AI restoration as a future optional capability requiring separate evaluation.



The application must:



\- Preserve the original input.

\- Make processed results available for user review.

\- Avoid claiming that an image is fully legible if it is not.

\- Avoid guaranteeing official acceptance of the output.

\- Communicate when processing fails or a result may be unreliable.



\## 8. Privacy Requirements



Documents may contain personal, financial, educational, or other sensitive information.



For the MVP:



\- Prefer browser-side processing.

\- Do not upload images to a server unless a feature explicitly requires it.

\- Do not add analytics that capture document contents.

\- Do not retain document images in persistent storage by default.

\- Do not introduce accounts or cloud history prematurely.

\- Clearly disclose any future cloud-based image processing.

\- If server-side processing is introduced, define temporary-file cleanup, access controls, transport security, and retention limits before launch.



\## 9. Future Product Direction



The web SaaS remains the primary product.



Potential future capabilities include:



\- Advanced restoration for difficult images.

\- Higher-volume batch processing.

\- Paid credits and subscriptions.

\- User accounts and cross-device access.

\- A native mobile app with direct camera capture.

\- Offline-capable processing for supported operations.

\- Shared processing services for web and mobile.

\- Business-oriented bulk processing and API access.



These are future options, not MVP requirements.



\## 10. Success Criteria



The MVP should demonstrate that:



1\. Users can repair common document-photo problems without assistance.

2\. Automatic correction works on a useful range of real-world images.

3\. Users can manually recover from detection failures.

4\. Output remains faithful to the original document.

5\. Users can export usable images and multi-page PDFs.

6\. The application works on common desktop and mobile browsers.

7\. Image processing remains reasonably fast and stable on supported devices.

8\. The codebase can evolve without coupling the entire product to one image-processing implementation.



The immediate objective is to validate repair quality and user demand, not to build a complete SaaS platform.


\## 11. ID \& Card Crop (added after MVP scope)

A second mode extracts rectangular cards (ID, membership, access, employee cards) from photos: detect the four corners, correct perspective, optional conservative touch-ups, export as image or PDF. It shares the browser-only privacy model, the manual corner editor, and the export code. It is not an identity-verification feature and must never claim a crop is suitable for official verification. See `docs/card-crop.md` for design, limitations and the real-photo evaluation plan.
