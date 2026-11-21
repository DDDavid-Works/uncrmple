import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { resetAssessmentDetails } from "../features/assess/details-state";
import { reloadTips, TIPS_STORAGE_KEY } from "../features/onboarding/tips";
import { resetCollapsedSteps } from "../features/preview/Inspector";

// Collapsed steps and opened details are remembered for the session; start every test fresh.
afterEach(() => {
  resetCollapsedSteps();
  resetAssessmentDetails();
  // First-run tips are remembered per device; every test starts as a first visit.
  try {
    localStorage.removeItem(TIPS_STORAGE_KEY);
  } catch {
    // A test may have blocked storage.
  }
  reloadTips();
});
