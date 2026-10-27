import { BeforeAfter } from "./components/BeforeAfter";
import { Logo as LogoMark } from "./components/Logo";
import { WaitlistForm } from "./components/WaitlistForm";
import { CONTACT_EMAIL, DESCRIPTION, PRODUCT_NAME, WAITLIST_ENDPOINT, WAITLIST_FIELDS, WORDMARK } from "./config";

const STEPS = [
  { title: "Upload", text: "Drop in the photos of your pages you already have." },
  { title: "Repair", text: "Straighten the page, remove shadows and boost faded text." },
  { title: "Review", text: "Compare with the original and adjust the corners if needed." },
  { title: "Export", text: "Download clean images or combine pages into one PDF." },
];

const BENEFITS = [
  { title: "No retake needed", text: "Tilted, shadowed, grey or low contrast? Fix the photo you already have." },
  { title: "Faithful to the original", text: "We clean up the page. We never invent or rewrite what the document says." },
  { title: "Private by design", text: "Photos are processed in your browser. Not uploaded. Not stored." },
  { title: "No account to start", text: "Open it, drop a photo, get your file. Simple as paper should be." },
];

function Logo() {
  return (
    <span className="logo">
      <LogoMark className="logo-mark" />
      <span aria-hidden="true">{WORDMARK}</span>
      <span className="visually-hidden">{PRODUCT_NAME}</span>
    </span>
  );
}

export function App() {
  return (
    <>
      <header className="site-header wrap">
        <Logo />
        <a className="btn" href="#waitlist">
          Join the waitlist
        </a>
      </header>
      <main>
        <section className="hero wrap">
          <div className="hero-copy">
            <p className="eyebrow">A SECOND CHANCE FOR YOUR FIRST PHOTO</p>
            <h1>
              <mark>Fix</mark> the photo. Keep the document.
            </h1>
            <p className="lead">{DESCRIPTION}</p>
            <WaitlistForm
              endpoint={WAITLIST_ENDPOINT}
              fields={WAITLIST_FIELDS}
              note="No uploads. No account. Just a cleaner document."
            />
          </div>
          <BeforeAfter />
        </section>

        <section className="wrap section" aria-labelledby="how">
          <h2 id="how">
            Messy photo. <mark>Sorted.</mark>
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
            A cleaner page. <mark>Nothing lost.</mark>
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
            <p>
              Repairs run locally in your browser. Your photos are never uploaded or stored. The waitlist only collects
              your email. Your result is a cleaned-up copy of your photo, not a guaranteed official document.
            </p>
          </div>
        </section>

        <section id="waitlist" className="band band-accent" aria-labelledby="cta-title">
          <div className="wrap cta">
            <h2 id="cta-title">Stop retaking photos.</h2>
            <p>Keep the photo. Lose the shadows. Get early access to {PRODUCT_NAME}.</p>
            <WaitlistForm
              endpoint={WAITLIST_ENDPOINT}
              fields={WAITLIST_FIELDS}
              note="Only launch news. No paper trail of spam."
              className="form-center"
            />
          </div>
        </section>
      </main>
      <footer className="site-footer wrap">
        <Logo />
        <p className="fine">&copy; {PRODUCT_NAME} {new Date().getFullYear()}</p>
        <nav aria-label="Footer" className="footer-links">
          <a href="#privacy">Privacy</a>
          <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
        </nav>
      </footer>
    </>
  );
}
