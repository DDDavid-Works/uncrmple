import { CONTACT_EMAIL } from "../links";
import { OPERATOR_COUNTRY, OPERATOR_NAME, PRIVACY_UPDATED, PRODUCT_NAME } from "../config";

// The privacy policy, served by the app at /privacy/ (scripts/prerender.mjs writes it as static HTML).
// Until the waitlist site is retired it also keeps its own copy (waitlist/src/PrivacyPage.tsx), which
// Railway builds on its own; src/legal/legal.test.tsx fails if the two texts differ. Bump
// PRIVACY_UPDATED in src/config.ts on any change.

function Mail() {
  return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
}

function External({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function PrivacyPolicy() {
  return (
    <main className="legal">
      <h1>Privacy policy</h1>
      <p className="legal-updated">Last updated {PRIVACY_UPDATED}</p>

      <p>This policy covers the {PRODUCT_NAME} website, its waitlist and the {PRODUCT_NAME} repair app.</p>

      <h2>Who we are</h2>
      <p>
        {PRODUCT_NAME} is run by {OPERATOR_NAME}, an individual based in {OPERATOR_COUNTRY}, who is responsible for
        the personal information described here and is also our data protection officer. For any privacy question or
        request, email <Mail />.
      </p>

      <h2>Your document photos</h2>
      <p>
        The {PRODUCT_NAME} app repairs your photos inside your browser, on your own device. Your photos, the repaired
        images and any PDF you create are never uploaded to us or anyone else, and we cannot see them. They stay in
        your browser's memory until you remove them, close the page or reload it. Files you download are saved only
        where you choose.
      </p>
      <p>
        The app remembers one thing in your browser's storage: whether you chose the light or dark theme. That
        setting never leaves your device.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your email address</strong>, if you join the waitlist. We don't ask for anything else.
        </li>
        <li>
          <strong>Technical data</strong>, such as your IP address, browser type and the time of your visit. Our
          hosting provider and our form provider may record this when your browser loads the site or the app, or sends
          the form.
        </li>
      </ul>
      <p>
        The site and the app set no cookies and use no advertising or tracking tools. Their fonts, images and
        image-processing code are served from our own servers.
      </p>

      <h2>Anonymous usage counts in the app</h2>
      <p>
        To learn whether the app works for people, it counts a short, fixed list of actions, for example "a PDF of 2
        to 5 pages was made", "a page was repaired automatically" or "the corners were set by hand". Counts say only
        which action happened, using fixed words and ranges. They never include your photos, any part of them, file
        names, sizes or any text from your documents.
      </p>
      <p>
        The app sends these counts to our own server, which passes them to{" "}
        <External href="https://umami.is/privacy">Umami</External>, a privacy-focused analytics service. No
        cookies are used and nothing is stored on your device. Umami uses your IP address and browser type, without
        storing them, to tell visits apart and to show the country a visit came from.
      </p>

      <h2>Why we use it</h2>
      <ul>
        <li>
          We use your email only to tell you about the {PRODUCT_NAME} launch and early access. We rely on your
          consent, which you give by joining the waitlist and can withdraw at any time.
        </li>
        <li>
          Technical data is used to deliver the site and the form and to keep them secure, for example against
          spam. This is in our legitimate interest in running the service.
        </li>
        <li>
          Anonymous usage counts tell us which parts of the app are used and where repairs fail, so we can improve
          them. This is in our legitimate interest in improving the service.
        </li>
      </ul>
      <p>We don't sell your information, share it for advertising or use it to build profiles.</p>

      <h2>Who handles it for us</h2>
      <ul>
        <li>
          <External href="https://web3forms.com/privacy">Web3Forms</External> receives the waitlist form and
          forwards your email address to our inbox.
        </li>
        <li>
          <External href="https://railway.com/legal/privacy">Railway</External> hosts this website and the app. It
          serves their files but never receives your document photos.
        </li>
        <li>Our email provider stores the inbox where signups arrive and sends our launch emails.</li>
        <li>
          <External href="https://umami.is/privacy">Umami</External> receives the app's anonymous usage counts and
          shows us totals. It never receives your document photos.
        </li>
      </ul>
      <p>
        These providers may store data outside {OPERATOR_COUNTRY} and outside your own country, including in the
        United States. We only use providers that commit to protecting it.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your email address until 12 months after {PRODUCT_NAME} launches and then delete it. We delete it
        sooner if you unsubscribe or ask us to. Our providers' own logs are kept under their policies, linked above.
      </p>

      <h2>Your rights</h2>
      <p>
        Under the Philippine Data Privacy Act of 2012, and laws such as the GDPR if you are in the EU or UK, you can
        ask us to:
      </p>
      <ul>
        <li>tell you what information we hold about you and give you a copy;</li>
        <li>correct it;</li>
        <li>delete it or stop using it;</li>
        <li>stop emailing you. Every email we send will also include a way to unsubscribe.</li>
      </ul>
      <p>
        Email <Mail /> and we will reply within 30 days. You can also complain to the{" "}
        <External href="https://privacy.gov.ph">National Privacy Commission</External> of the Philippines, or to the
        data protection authority where you live.
      </p>

      <h2>Children</h2>
      <p>
        The waitlist is not meant for anyone under 16, and we don't knowingly collect their information. If you think
        a child has signed up, email us and we will delete it.
      </p>

      <h2>Security</h2>
      <p>
        The site and the form use encrypted connections (HTTPS). Only {OPERATOR_NAME} can see the waitlist. If a
        breach ever affects your information, we will tell you and the authorities as the law requires.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy, we will update the date at the top. If a change affects how we use your email, we
        will tell waitlist members by email before it takes effect.
      </p>
    </main>
  );
}
