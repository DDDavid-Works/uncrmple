import { BeforeAfter } from "./components/BeforeAfter";
import { SiteFooter, SiteHeader } from "./components/SiteChrome";
import { WaitlistForm } from "./components/WaitlistForm";
import { CONTACT_EMAIL, DESCRIPTION, PRIVACY_PATH, PRODUCT_NAME, WAITLIST_ENDPOINT, WAITLIST_FIELDS } from "./config";

const STEPS = [
  { title: "Upload", text: "Drop in the document photos you already have." },
  { title: "Repair", text: "Straighten the document, remove shadows and boost faded text." },
  { title: "Review", text: "Compare with the original and adjust the corners if needed." },
  { title: "Export", text: "Download clean images or combine pages into one PDF." },
];

const BENEFITS = [
  { title: "No retake needed", text: "Tilted, shadowed, grey or low contrast? Fix the shot you already have." },
  { title: "Faithful to the original", text: "Cleans up the document. No content rewrite or generation." },
  { title: "Private by design", text: "Your documents are processed in your browser. Not uploaded. Not stored." },
  { title: "No account to start", text: "Open it, drop in a document photo, get your file. Simple as paper should be." },
];

const CONSENT = (
  <>
    By joining, you agree to get {PRODUCT_NAME} launch emails. See our <a href={PRIVACY_PATH}>privacy policy</a>.
  </>
);

export function App() {
  return (
    <>
      <SiteHeader waitlistHref="#waitlist" />
      <main>
        <section className="hero wrap">
          <div className="hero-copy">
            <p className="eyebrow">FOR RECEIPTS, FORMS, LETTERS AND NOTES</p>
            <h1>
              <mark>Fix</mark> your document photos.
            </h1>
            <p className="lead">{DESCRIPTION}</p>
            <WaitlistForm
              endpoint={WAITLIST_ENDPOINT}
              fields={WAITLIST_FIELDS}
              consent={CONSENT}
              note="No uploads. No account. Just a cleaner document."
            />
          </div>
          <BeforeAfter />
        </section>

        <section className="wrap section" aria-labelledby="how">
          <h2 id="how">
            Crooked. Skewed. Dim. <mark>Fixed.</mark>
          </h2>
          <ol className="cards cards-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card">
                <span className="card-num">{String(i + 1).padStart(2, "0")}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="wrap section" aria-labelledby="why">
          <h2 id="why">
            A cleaner document. <mark>Nothing lost.</mark>
          </h2>
          <ul className="cards cards-2">
            {BENEFITS.map((b) => (
              <li key={b.title} className="card card-compact">
                <h3>{b.title}</h3>
                <p>{b.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="privacy" className="band band-dark" aria-labelledby="privacy-title">
          <div className="wrap band-split">
            <h2 id="privacy-title">
              Your documents <mark>stay yours.</mark>
            </h2>
            <div>
              <p>
                Repairs run locally in your browser. Your document photos are never uploaded or stored. The waitlist asks
                only for your email. Your result is a cleaned-up copy of your photo, not a guaranteed official document.
              </p>
              <p className="privacy-note">
                Your email is sent through{" "}
                <a href="https://web3forms.com/privacy" target="_blank" rel="noopener noreferrer">
                  Web3Forms
                </a>
                , which delivers it to our inbox. We only use it to tell you about the launch. To be removed, email{" "}
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Read the full{" "}
                <a href={PRIVACY_PATH}>privacy policy</a>.
              </p>
            </div>
          </div>
        </section>

        <section id="waitlist" className="band band-accent" aria-labelledby="cta-title">
          <div className="wrap cta">
            <h2 id="cta-title">Stop retaking document photos.</h2>
            <p>Keep the document. Lose the shadows. Get early access to {PRODUCT_NAME}.</p>
            <WaitlistForm
              endpoint={WAITLIST_ENDPOINT}
              fields={WAITLIST_FIELDS}
              consent={CONSENT}
              note="Only launch news. No paper trail of spam."
              className="form-center"
            />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
