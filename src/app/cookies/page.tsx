import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Contact } from "@/components/LegalPage";
import { CookieSettingsLink } from "@/components/Analytics";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Cookie Policy" };

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      intro={
        LEGAL.adsEnabled
          ? `${LEGAL.siteName} sets no cookies of its own. The only optional cookies come from Google (analytics and advertising), and only if you accept them.`
          : `${LEGAL.siteName} sets no cookies of its own. The only optional cookies come from Google Analytics, and only if you accept them.`
      }
    >
      <h2>What we use</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Purpose</th>
            <th>Type</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>air-analytics-consent</td>
            <td>Remembers your cookie choice so we do not ask again (stored in your browser&rsquo;s local storage, not sent to us).</td>
            <td>Strictly necessary</td>
            <td>Until you clear it</td>
          </tr>
          <tr>
            <td>_ga, _ga_*</td>
            <td>Google Analytics: distinguishes visits and sessions to produce anonymous usage statistics. Set only if you accept analytics.</td>
            <td>Analytics (optional)</td>
            <td>Up to 2 years</td>
          </tr>
          {LEGAL.adsEnabled && (
            <tr>
              <td>__gads, __gpi, IDE (and similar)</td>
              <td>Google AdSense / DoubleClick: show and measure ads, limit repetition and, where allowed, personalise ads. Set only if you accept advertising.</td>
              <td>Advertising (optional)</td>
              <td>Up to 13 months</td>
            </tr>
          )}
        </tbody>
      </table>
      {LEGAL.adsEnabled ? <p>No advertising cookies are set unless you accept the Advertising category.</p> : <p>We use no advertising or tracking cookies.</p>}

      <h2>Your choices</h2>
      <p>
        The first time you visit, a banner lets you accept all cookies or open <em>Cookie settings</em> to choose by category. You can change your choice at any time: <CookieSettingsLink className="text-orange-400 hover:underline" />.
        You can also delete cookies and site data from your browser settings; the banner will then ask again.
      </p>

      <h2>More information</h2>
      <p>
        See our <Link href="/privacy">Privacy Policy</Link> for how data is processed, or write to <Contact />.
      </p>
    </LegalPage>
  );
}
