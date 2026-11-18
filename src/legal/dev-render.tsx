import { createRoot } from "react-dom/client";
import { LegalPage } from "./LegalPage";
import { PrivacyPolicy } from "./PrivacyPolicy";
import { TermsOfUse } from "./TermsOfUse";

/** Dev server only: the built pages are pre-rendered instead (see legal-entry.ts). */
export function renderInDev(root: HTMLElement): void {
  createRoot(root).render(<LegalPage>{location.pathname.startsWith("/terms") ? <TermsOfUse /> : <PrivacyPolicy />}</LegalPage>);
}
