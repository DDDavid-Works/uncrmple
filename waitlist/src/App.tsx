import { BeforeAfter } from "./components/BeforeAfter";
import { SiteFooter, SiteHeader } from "./components/SiteChrome";
import { WaitlistForm } from "./components/WaitlistForm";
import { CONTACT_EMAIL, DESCRIPTION, PRIVACY_PATH, PRODUCT_NAME, WAITLIST_ENDPOINT, WAITLIST_FIELDS } from "./config";

const STEPS = [
  { title: "Upload", text: "Drop in one document photo or a whole stack." },
  { title: "Repair", text: "Straighten, remove shadows and boost faded text. One page or all of them at once." },
  { title: "Review", text: "Compare with the original and adjust the corners if needed." },
  { title: "Export", text: "Download clean images, a ZIP of them all, or one combined PDF." },
];

const BENEFITS = [
  { title: "No retake needed", text: "Tilted, shadowed, grey or low contrast? Fix the shot you already have." },
  { title: "Faithful to the original", text: "Cleans up the document. No content rewrite or generation." },
  { title: "Private by design", text: "Your documents are processed in your browser. Not uploaded. Not stored." },
  { title: "The whole stack in one go", text: "Drop in every receipt, press Repair all, get one PDF. No account needed." },
];

const CONSENT = (
  <>
    By joining, you agree to get {PRODUCT_NAME} launch emails. See our <a href={PRIVACY_PATH}>privacy policy</a>.
  </>
);

export function App() {
  return (
    <>
      <SiteHeader onHome />
      <main>
        <section className="hero wrap">
          <p className="eyebrow">For receipts, forms, letters and notes</p>
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
        </section>

        <div className="wrap showcase">
          <div className="showcase-panel">
            <BeforeAfter />
          </div>
        </div>

        <section id="how" className="wrap section" aria-labelledby="how-title">
          <p className="eyebrow">How it works</p>
          <h2 id="how-title">
            Crooked. Skewed. Dim. <mark>Fixed.</mark>
          </h2>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="step-num">{String(i + 1).padStart(2, "0")}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="wrap section" aria-labelledby="why">
          <p className="eyebrow">Why {PRODUCT_NAME}</p>
          <h2 id="why">
            A cleaner document. <mark>Nothing lost.</mark>
          </h2>
          <ul className="cards">
            {BENEFITS.map((b, i) => (
              <li key={b.title} className="card">
                <span className="card-num">{String(i + 1).padStart(2, "0")}</span>
                <h3>{b.title}</h3>
                <p>{b.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="privacy" className="band band-dark" aria-labelledby="privacy-title">
          <div className="wrap band-split">
            <div>
              <p className="eyebrow">Private by design</p>
              <h2 id="privacy-title">
                Your documents <mark>stay yours.</mark>
              </h2>
            </div>
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

        <section id="waitlist" className="band band-sage" aria-labelledby="cta-title">
          <div className="wrap cta">
            <p className="eyebrow">Early access</p>
            <h2 id="cta-title">Stop retaking document photos.</h2>
            <p>Keep the document. Lose the shadows. Get early access to {PRODUCT_NAME}.</p>
            <WaitlistForm
              endpoint={WAITLIST_ENDPOINT}
              fields={WAITLIST_FIELDS}
              consent={CONSENT}
              note="Only launch news. No paper trail of spam."
              className="form-center form-stack"
            />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
