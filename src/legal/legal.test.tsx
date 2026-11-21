import { render } from "@testing-library/react";
import privacyShell from "../../privacy/index.html?raw";
import termsShell from "../../terms/index.html?raw";
import { PrivacyPage as WaitlistPrivacyPage } from "../../waitlist/src/PrivacyPage";
import { TermsPage as WaitlistTermsPage } from "../../waitlist/src/TermsPage";
import {
  PRIVACY_UPDATED as WAITLIST_PRIVACY_UPDATED,
  TERMS_UPDATED as WAITLIST_TERMS_UPDATED,
} from "../../waitlist/src/config";
import { PRIVACY_UPDATED, TERMS_UPDATED } from "../config";
import { PRIVACY_URL, TERMS_URL } from "../links";
import { pages } from "../entry-server";

const page = (file: string) => pages.find((p) => p.file === file)!;
const privacy = page("privacy/index.html");
const terms = page("terms/index.html");

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const mainText = (html: string) => parse(html).querySelector("main")!.textContent!.replace(/\s+/g, " ").trim();

describe("static legal pages", () => {
  it.each([
    { name: "privacy policy", built: privacy, heading: "Privacy policy", updated: PRIVACY_UPDATED, url: PRIVACY_URL },
    { name: "terms of use", built: terms, heading: "Terms of use", updated: TERMS_UPDATED, url: TERMS_URL },
  ])("pre-render the $name with its date, a link home and the footer", ({ built, heading, updated, url }) => {
    const html = built.render();
    const doc = parse(html);
    expect(doc.querySelector("h1")?.textContent).toBe(heading);
    expect(mainText(html)).toContain(`Last updated ${updated}`);
    expect(doc.querySelector("a[href='/']")).not.toBeNull();
    expect(doc.querySelector("nav[aria-label='Footer']")).not.toBeNull();
    expect(built.canonical).toBe(url);
    expect(built.title).toMatch(new RegExp(`^${heading} \\| `));
  });

  it("disclose the anonymous usage counts in the privacy policy", () => {
    expect(mainText(privacy.render())).toContain("Anonymous usage counts in the app");
  });

  it("link the terms to the privacy policy on this site", () => {
    expect(parse(terms.render()).querySelector("main a[href='/privacy/']")).not.toBeNull();
  });

  it("need nothing the Content-Security-Policy forbids", () => {
    // No inline styles or scripts: the page CSP allows only this site's files.
    for (const built of pages) expect(built.render()).not.toMatch(/ style="|<script/);
    for (const shell of [privacyShell, termsShell]) {
      expect(shell).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
      expect(shell).toContain("<!--head-->");
      expect(shell).toContain("<!--app-html-->");
    }
  });

  // The waitlist site keeps its own copies until it is retired, since Railway builds it on its own.
  it("say exactly what the waitlist site's copies say, with the same dates", () => {
    const waitlistPrivacy = render(<WaitlistPrivacyPage />).container.innerHTML;
    const waitlistTerms = render(<WaitlistTermsPage />).container.innerHTML;
    expect(mainText(privacy.render())).toBe(mainText(waitlistPrivacy));
    expect(mainText(terms.render())).toBe(mainText(waitlistTerms));
    expect(PRIVACY_UPDATED).toBe(WAITLIST_PRIVACY_UPDATED);
    expect(TERMS_UPDATED).toBe(WAITLIST_TERMS_UPDATED);
  });
});
