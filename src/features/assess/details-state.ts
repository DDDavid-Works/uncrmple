/**
 * Whether the photo check's finding explanations are shown. Kept for the session (not stored), so
 * the choice carries over when another page is selected. In its own module so test setup can reset
 * it without loading the panel and, through it, the image engine.
 */
let open = false;

export const detailsShown = () => open;
export const setDetailsShown = (value: boolean) => {
  open = value;
};
/** Hide the explanations again; for tests. */
export const resetAssessmentDetails = () => {
  open = false;
};
