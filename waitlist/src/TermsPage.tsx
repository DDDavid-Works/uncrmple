import { SiteFooter, SiteHeader } from "./components/SiteChrome";
import { CONTACT_EMAIL, OPERATOR_COUNTRY, OPERATOR_NAME, PRIVACY_PATH, PRODUCT_NAME, TERMS_UPDATED } from "./config";

export function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="wrap legal">
        <h1>Terms of use</h1>
        <p className="legal-updated">Last updated {TERMS_UPDATED}</p>

        <p>
          These terms apply to the {PRODUCT_NAME} website, its waitlist and the {PRODUCT_NAME} repair app (together,
          the "service"). The service is run by {OPERATOR_NAME} ("we", "us"). By using it you agree to these terms. If
          you don't agree, please don't use it.
        </p>

        <h2>What {PRODUCT_NAME} does</h2>
        <p>
          {PRODUCT_NAME} cleans up photos of paper documents: it straightens the page, evens out shadows and improves
          contrast. It runs on your device. It does not add, rewrite or check the content of your documents.
        </p>
        <ul>
          <li>
            A repaired image is a cleaned-up copy of your photo. It is not a certified, notarised or official copy, and
            it may not be accepted where an original or a certified copy is required.
          </li>
          <li>
            It cannot recover what your photo doesn't show, such as blurred, cut-off or covered text. Results vary from
            photo to photo.
          </li>
          <li>Check every result against the original before you rely on it or send it to anyone.</li>
        </ul>

        <h2>Your documents</h2>
        <p>
          Your documents stay yours. We claim no rights to them, and because processing happens on your device, we
          never receive them. Only use the service on documents that are yours or that you have permission to copy. You
          are responsible for the files you open and the copies you save or share.
        </p>

        <h2>What you must not do</h2>
        <ul>
          <li>
            Use the service to forge, alter or falsify a document, or to pass off a repaired image as an original or as
            something it isn't.
          </li>
          <li>Use it to break the law or to infringe anyone else's rights, including copyright and privacy.</li>
          <li>
            Disrupt the service, for example by attacking or overloading it, or by sending automated or fake waitlist
            signups.
          </li>
        </ul>

        <h2>Price and changes to the service</h2>
        <p>
          The service is currently free. If we introduce paid features, we will show the price and any extra terms
          before you pay. We may change, pause or stop the service at any time.
        </p>

        <h2>Our name and software</h2>
        <p>
          The {PRODUCT_NAME} name, logo, website and software belong to us. You may use the service for personal and
          work purposes, but you may not copy, resell or rebrand the service itself.
        </p>

        <h2>No warranty</h2>
        <p>
          The service is provided "as is" and "as available". To the fullest extent the law allows, we make no promises
          that it will be error-free or always available, that results will be accurate or fit a particular purpose, or
          that any person or authority will accept them.
        </p>

        <h2>Our liability</h2>
        <p>
          To the fullest extent the law allows, we are not liable for indirect or consequential losses, or for losses
          caused by relying on a repaired image without checking it. Our total liability to you is limited to the amount
          you paid us for the service in the 12 months before the claim. Nothing in these terms limits liability that
          cannot be limited by law, or takes away rights you have as a consumer where you live.
        </p>

        <h2>Privacy</h2>
        <p>
          Our <a href={PRIVACY_PATH}>privacy policy</a> explains what information we handle and why.
        </p>

        <h2>Law and disputes</h2>
        <p>
          These terms are governed by the laws of {OPERATOR_COUNTRY}, and disputes will be handled by its courts. If you
          live elsewhere, you keep any consumer protections your own country's law gives you.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          If we change these terms, we will update the date at the top and, for significant changes, say so on the site.
          Continuing to use the service after a change means you accept the new terms.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
