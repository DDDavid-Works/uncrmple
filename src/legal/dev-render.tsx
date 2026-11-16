import { createRoot } from "react-dom/client";
import { LegalPage } from "./LegalPage";
import { PrivacyPolicy } from "./PrivacyPolicy";

/** Dev server only: the built page is pre-rendered instead (see legal-entry.ts). */
export function renderInDev(root: HTMLElement): void {
  createRoot(root).render(
    <LegalPage>
      <PrivacyPolicy />
    </LegalPage>,
  );
}
