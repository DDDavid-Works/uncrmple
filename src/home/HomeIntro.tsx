import { DESCRIPTION, PRODUCT_NAME, TAGLINE } from "../config";
import { MODES } from "../features/mode/ModeSelector";
import { STEPS } from "../features/onboarding/StartSteps";
import { LegalPage } from "../legal/LegalPage";
import { BLOG_URL } from "../links";

/**
 * What the home page holds before the app's script runs: built into index.html by scripts/prerender.mjs,
 * so search engines and link previews that do not run scripts can read what the app does. The app
 * replaces it as soon as it starts (src/main.tsx). Every line comes from text the app itself shows.
 */
export function HomeIntro() {
  return (
    <LegalPage>
      <main className="legal home-intro">
        <h1>{PRODUCT_NAME}: fix photos of paper documents</h1>
        <p>
          <strong>{TAGLINE}</strong> {DESCRIPTION}
        </p>
        <h2>What it fixes</h2>
        <ul>
          {MODES.map((m) => (
            <li key={m.value}>
              <strong>{m.label}.</strong> {m.hint}
            </li>
          ))}
        </ul>
        <h2>How it works</h2>
        <ol>
          {STEPS.document.map((s) => (
            <li key={s}>{s}.</li>
          ))}
        </ol>
        <p>Nothing is uploaded: photos are repaired on your device, in your browser.</p>
        <p className="home-intro__loading" role="status">
          Loading the app… It needs JavaScript to run.
        </p>
        <p>
          <a href={BLOG_URL}>Read guides on fixing document photos</a>
        </p>
      </main>
    </LegalPage>
  );
}
