import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Contact } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Use - AthleticsInfoRanking" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" intro={`By using ${LEGAL.siteName} (${LEGAL.domain}) you agree to these terms. If you do not agree, please do not use the site.`}>
      <h2>1. What the site is</h2>
      <p>
        {LEGAL.siteName} is an independent, free statistical and reference site about athletics (track &amp; field, road running and race walking): results, rankings, records and related
        information. It is provided for information and entertainment only.
      </p>

      <h2>2. Accuracy of the data</h2>
      <p>
        Results are compiled automatically from public sources and processed by us (identification of athletes, merging of duplicates, rankings and scores). Despite automated quality
        checks, <strong>errors, omissions and wrong matches can occur</strong>, particularly in older or less documented results. Rankings, &ldquo;Quality&rdquo; scores and points are our own
        statistical indicators, not official classifications. The site is provided &ldquo;as is&rdquo; and we do not guarantee that it is complete, current or error-free. If you find a mistake,
        please tell us via <Contact /> or the &ldquo;Report a data error&rdquo; link; see <Link href="/about">About &amp; data</Link>.
      </p>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>You may browse the site and share links to it, and quote small extracts with attribution to {LEGAL.siteName}.</li>
        <li>You may not use automated tools (bots, scrapers) to copy the site&rsquo;s data in bulk, republish our compiled database or rankings, or overload the service, without our written permission.</li>
        <li>You may not attempt to gain unauthorised access to the site or to interfere with its security or operation.</li>
      </ul>

      <h2>4. Intellectual property</h2>
      <p>
        The design, code, selection and arrangement of the data, and the rankings and scores we calculate belong to the site owner. Individual sports results are factual information
        published by their organisers. Athlete photographs come from Wikimedia Commons and are shown with their author and licence (for example CC BY or CC BY-SA); those licences, not these
        terms, govern their reuse. Names, logos and trademarks of competitions, federations and organisations (such as World Athletics or the Diamond League) belong to their respective
        owners; the site is <strong>not affiliated with, endorsed by or sponsored by</strong> any of them and uses their names only to identify events.
      </p>

      {LEGAL.adsEnabled && (
        <>
          <h2>Advertising</h2>
          <p>
            The site may display advertising served by third parties (Google AdSense). Ads are clearly separate from our content; we do not endorse the advertised products or services and are
            not responsible for them. Ads are shown according to your cookie choices (see the <Link href="/cookies">Cookie Policy</Link>).
          </p>
        </>
      )}
      <h2>5. Links to other websites</h2>
      <p>The site may link to third-party websites. We do not control them and are not responsible for their content or privacy practices.</p>

      <h2>6. Limitation of liability</h2>
      <p>
        To the extent permitted by law, we are not liable for losses arising from the use of, or inability to use, the site or from reliance on its information. Nothing in these terms limits
        liability that cannot be limited by law or any rights you have as a consumer.
      </p>

      <h2>7. Changes and availability</h2>
      <p>We may modify, suspend or discontinue the site or these terms at any time. The date at the top shows the latest revision; continued use means you accept the updated terms.</p>

      <h2>8. Governing law</h2>
      <p>
        These terms are governed by the law of {LEGAL.country}, without prejudice to the mandatory consumer-protection rules of your country of residence. See also the{" "}
        <Link href="/legal-notice">Legal Notice</Link>, <Link href="/privacy">Privacy Policy</Link> and <Link href="/cookies">Cookie Policy</Link>.
      </p>
    </LegalPage>
  );
}
