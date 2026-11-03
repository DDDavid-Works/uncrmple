import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { resetAssessmentDetails } from "../features/assess/details-state";
import { resetCollapsedSteps } from "../features/preview/Inspector";

// Collapsed steps and opened details are remembered for the session; start every test fresh.
afterEach(() => {
  resetCollapsedSteps();
  resetAssessmentDetails();
});
