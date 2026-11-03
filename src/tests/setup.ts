import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { resetCollapsedSteps } from "../features/preview/Inspector";

// Collapsed steps are remembered for the session; start every test with all of them open.
afterEach(() => resetCollapsedSteps());
