import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Contact } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`This policy explains what personal data ${LEGAL.siteName} (${LEGAL.domain}) processes, why, and what rights you have. We keep it short because we collect very little: there are no accounts and no forms.`}
    >
      <h2>1. Who is responsible</h2>
      <p>
        The data controller is {LEGAL.operatorName}, {LEGAL.operatorAddress}. You can contact us at <Contact />.
      </p>

      <h2>2. Visitors: what we process</h2>
      <h3>Technical logs</h3>
      <p>
        When you load a page, our hosting provider receives your IP address, browser type, the page requested and the time. This is needed to deliver the site, keep it secure and
        prevent abuse. Legal basis: our legitimate interest in operating and protecting the service (GDPR art. 6(1)(f)). Logs are kept by the provider for a limited period.
      </p>
      <h3>Your cookie choice</h3>
      <p>
        We store your cookie choice in your browser (local storage) so we do not ask you again. It contains no personal data and is strictly necessary for the banner to work. See the{" "}
        <Link href="/cookies">Cookie Policy</Link>.
      </p>
      <h3>Analytics (only if you accept)</h3>
      <p>
        If you accept analytics, we use Google Analytics 4 to understand which pages are visited and how the site is used (pages, approximate location, device and browser). IP addresses are
        anonymised. Legal basis: your consent (GDPR art. 6(1)(a) and the ePrivacy rules); you can withdraw it at any time from &ldquo;Cookie settings&rdquo; in the footer. Google may process data
        outside the European Economic Area under safeguards such as standard contractual clauses or the EU-US Data Privacy Framework. If you decline, nothing from Google Analytics is loaded.
      </p>
      {LEGAL.adsEnabled && (
        <>
          <h3>Advertising (only if you accept)</h3>
          <p>
            The site shows advertising through Google AdSense. If you accept the Advertising category, Google and its partners may use cookies and similar technologies, and your IP address and
            browsing information, to show and measure ads and, where allowed, to personalise them. Legal basis: your consent (GDPR art. 6(1)(a) and the ePrivacy rules), which you can withdraw at
            any time from &ldquo;Cookie settings&rdquo; in the footer. If you decline, no ads are loaded for you. Google acts as an independent controller for this processing and may transfer data
            outside the EEA under safeguards such as standard contractual clauses or the EU-US Data Privacy Framework. You can manage ad personalisation at{" "}
            <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">adssettings.google.com</a>.
          </p>
        </>
      )}
      <h3>Search and navigation</h3>
      <p>
        The search box and filters send your query to our servers only to return results. We do not use them to profile or identify you.
      </p>
      <h3>When you write to us</h3>
      <p>
        If you email us (for example, to report a data error), we use your address and message only to answer you and handle your request, and keep it as long as needed for that purpose.
      </p>
      <h3>Images and other resources from third parties</h3>
      <p>
        Country flags and athlete photos may be loaded from third-party services (flagcdn.com and Wikimedia Commons). To deliver those images, those services receive your IP address and
        browser details, as with any website resource. We do not control their processing; see their own privacy policies.
      </p>

      <h2>3. Athletes: information about the people in the results</h2>
      <p>
        {LEGAL.siteName} is a statistical and reference site about athletics. It publishes sports results and related information about athletes: name, nationality, year of birth when publicly known,
        competition results and, where a free licence allows it, a photograph credited to its author. This information comes from public sources (see{" "}
        <Link href="/about">About &amp; data</Link>). Legal basis: legitimate interest and the public interest in sports information (GDPR art. 6(1)(f)), balanced against the rights of the
        people concerned. We publish only sports-related information and no contact details, addresses, health data or other sensitive categories.
      </p>
      <p>
        If you appear on the site, you can ask us to <strong>correct, update or remove</strong> information about you, or object to its publication, by writing to <Contact />. We will review
        every request individually and answer within one month. Requests concerning minors receive particular care.
      </p>

      <h2>4. Who receives data</h2>
      <ul>
        <li>Vercel Inc. &ndash; web hosting (technical logs).</li>
        <li>Hetzner Online GmbH (Germany) &ndash; hosting of the database that serves the site. It holds sports data, not visitor data.</li>
        <li>Google (Cloud, Google Analytics and, only if you accept, AdSense advertising) &ndash; data processing, analytics and ads.</li>
        <li>flagcdn.com and Wikimedia Foundation &ndash; images (see above).</li>
      </ul>
      {LEGAL.adsEnabled ? (
        <p>We do not sell personal data. Advertising is served by Google only with your consent (see section 2).</p>
      ) : (
        <p>We do not sell personal data and we do not use it for advertising.</p>
      )}

      <h2>5. Your rights</h2>
      <p>
        You have the right to access, rectify, erase, restrict and object to the processing of your personal data, to data portability where it applies, and to withdraw consent at any time.
        To exercise them, email <Contact />. If you think we have not handled your data properly, you can complain to {LEGAL.authorityName} or to the authority of your country.
      </p>

      <h2>6. Children</h2>
      <p>The site is not directed at children and does not knowingly collect their data from visitors.</p>

      <h2>7. Changes</h2>
      <p>We may update this policy; the date at the top shows the latest revision.</p>
    </LegalPage>
  );
}
