import { render } from "@testing-library/react";
import shell from "../../privacy/index.html?raw";
import { PrivacyPage as WaitlistPrivacyPage } from "../../waitlist/src/PrivacyPage";
import { PRIVACY_UPDATED as WAITLIST_PRIVACY_UPDATED } from "../../waitlist/src/config";
import { PRIVACY_UPDATED } from "../config";
import { PRIVACY_URL } from "../links";
import { pages } from "./entry-server";

const privacy = pages.find((p) => p.file === "privacy/index.html")!;

function pageText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.querySelector("main")!.textContent!.replace(/\s+/g, " ").trim();
}

describe("privacy policy page", () => {
  it("is pre-rendered with the policy, its date and the usage counts it discloses", () => {
    const html = privacy.render();
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("h1")?.textContent).toBe("Privacy policy");
    expect(pageText(html)).toContain(`Last updated ${PRIVACY_UPDATED}`);
    expect(pageText(html)).toContain("Anonymous usage counts in the app");
    expect(doc.querySelector("a[href='/']")).not.toBeNull();
    expect(doc.querySelector("nav[aria-label='Footer']")).not.toBeNull();
  });

  it("points search engines at the official address", () => {
    expect(privacy.canonical).toBe(PRIVACY_URL);
    expect(privacy.title).toMatch(/^Privacy policy \| /);
  });

  it("needs nothing the Content-Security-Policy forbids", () => {
    // No inline styles or scripts: the page CSP allows only this site's files.
    expect(privacy.render()).not.toMatch(/ style="|<script/);
    expect(shell).not.toMatch(/<script>(?!<\/script>)|<script(?![^>]*\ssrc=)[^>]*>/);
    expect(shell).toContain("<!--head-->");
    expect(shell).toContain("<!--app-html-->");
  });

  // The waitlist site keeps its own copy until it is retired, since Railway builds it on its own.
  it("says exactly what the waitlist site's copy says, with the same date", () => {
    const { container } = render(<WaitlistPrivacyPage />);
    expect(pageText(privacy.render())).toBe(pageText(container.innerHTML));
    expect(PRIVACY_UPDATED).toBe(WAITLIST_PRIVACY_UPDATED);
  });
});
