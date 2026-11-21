import { CONTACT_EMAIL } from "../links";
import { OPERATOR_COUNTRY, OPERATOR_NAME, PRIVACY_UPDATED, PRODUCT_NAME } from "../config";

// The privacy policy, served by the app at /privacy/ (scripts/prerender.mjs writes it as static HTML).
// Since launch (21 November 2026) this is the only live copy; the retired waitlist site's copy
// (waitlist/src/PrivacyPage.tsx) is no longer kept in step. Bump PRIVACY_UPDATED in src/config.ts on any change.

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

      <p>
        This policy covers the {PRODUCT_NAME} website, the {PRODUCT_NAME} repair app and the email addresses collected
        by our waitlist before launch.
      </p>

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
          <strong>Your email address</strong>, if you joined the waitlist before launch. We didn't ask for anything
          else, and the waitlist is now closed.
        </li>
        <li>
          <strong>Technical data</strong>, such as your IP address, browser type and the time of your visit.
          Cloudflare and our hosting provider may record this when your browser loads the site or the app.
        </li>
      </ul>
      <p>
        The site and the app set no cookies and use no advertising or tracking tools. Their fonts, images and
        image-processing code are served by this site, not loaded from other services.
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
          We use waitlist email addresses only to tell you about the {PRODUCT_NAME} launch and early access. We rely
          on the consent you gave by joining the waitlist, which you can withdraw at any time.
        </li>
        <li>
          Technical data is used to deliver the site and the app and to keep them secure, for example against
          attacks and abuse. This is in our legitimate interest in running the service.
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
          <External href="https://www.cloudflare.com/privacypolicy/">Cloudflare</External> carries all traffic to
          this website and the app, protecting them and caching their files. It sees technical data such as your IP
          address but never receives your document photos.
        </li>
        <li>
          <External href="https://web3forms.com/privacy">Web3Forms</External> received the waitlist form and
          forwarded your email address to our inbox. Now that the waitlist is closed, it receives nothing new.
        </li>
        <li>
          <External href="https://railway.com/legal/privacy">Railway</External> hosts this website and the app. It
          serves their files but never receives your document photos.
        </li>
        <li>
          <External href="https://policies.google.com/privacy">Gmail</External>, Google's email service, stores the
          inbox where signups arrived and sends our launch emails.
        </li>
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
        We keep waitlist email addresses until 21 November 2027, 12 months after {PRODUCT_NAME} launched, and then
        delete them. We delete yours sooner if you unsubscribe or ask us to. Our providers' own logs are kept under their policies, linked above.
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
        The waitlist was not meant for anyone under 16, and we don't knowingly collect their information. If you think
        a child signed up, email us and we will delete it.
      </p>

      <h2>Security</h2>
      <p>
        The site and the app use encrypted connections (HTTPS). Only {OPERATOR_NAME} can see the waitlist email
        addresses. If a
        breach ever affects your information, we will tell you and the authorities as the law requires.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy, we will update the date at the top. If a change affects how we use your email, we
        will tell the people on the waitlist by email before it takes effect.
      </p>
    </main>
  );
}
