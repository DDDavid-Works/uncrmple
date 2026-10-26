import { WaitlistForm } from "./components/WaitlistForm";
import { DESCRIPTION, PRODUCT_NAME, TAGLINE, WAITLIST_ENDPOINT, WAITLIST_FIELDS } from "./config";

const STEPS = [
  { title: "Upload", text: "Drop in the photos of your pages you already have." },
  { title: "Repair", text: "Straighten the page, remove shadows and boost faded text." },
  { title: "Review", text: "Compare with the original and adjust the corners if needed." },
  { title: "Export", text: "Download clean images or combine pages into one PDF." },
];

const BENEFITS = [
  { title: "No retake needed", text: "Fix photos you can't or don't want to retake: tilted, shadowed, grey or low contrast." },
  { title: "Faithful to the original", text: "We clean up the page. We never invent or rewrite what the document says." },
  { title: "Private by design", text: "Your photos are processed in your browser and are not uploaded or stored." },
  { title: "No account to start", text: "Open it, drop a photo, get your file." },
];

export function App() {
  return (
    <>
      <header className="site-header">
        <span className="brand">{PRODUCT_NAME}</span>
      </header>
      <main>
        <section className="hero">
          <h1>{TAGLINE}</h1>
          <p className="lead">{DESCRIPTION}</p>
          <WaitlistForm endpoint={WAITLIST_ENDPOINT} fields={WAITLIST_FIELDS} />
        </section>

        <section aria-labelledby="how">
          <h2 id="how">How it works</h2>
          <ol className="steps">
            {STEPS.map((s) => (
              <li key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="why">
          <h2 id="why">Why people will use it</h2>
          <ul className="benefits">
            {BENEFITS.map((b) => (
              <li key={b.title}>
                <h3>{b.title}</h3>
                <p>{b.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="privacy" aria-labelledby="privacy">
          <h2 id="privacy">Your documents stay yours</h2>
          <p>
            Documents often hold personal or financial details. Repairs run locally in your browser, and the waitlist
            only collects your email address. Results are a cleaned-up copy of your photo and aren't guaranteed to be
            accepted as an official document.
          </p>
        </section>
      </main>
      <footer className="site-footer">
        <p>
          &copy; {new Date().getFullYear()} {PRODUCT_NAME}
        </p>
      </footer>
    </>
  );
}
