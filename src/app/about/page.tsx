import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Contact } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "About & data" };

export default function AboutPage() {
  return (
    <LegalPage
      title="About & data"
      intro={`${LEGAL.siteName} brings athletics results, rankings and records together in one place: from the Olympic Games and the Diamond League to national championships, on the track, the road and in race walking.`}
    >
      <h2>Independent project</h2>
      <p>
        The site is an independent project. It is not affiliated with, endorsed by or sponsored by World Athletics, the Diamond League or any federation, organiser or athlete.
      </p>

      <h2>Where the data comes from</h2>
      <p>
        Results are gathered from public sources: results published by competition organisers and federations, public sports archives, and collaborative encyclopaedic sources such as
        Wikipedia. Athlete photographs come from Wikimedia Commons and are credited to their authors under their free licences (credits appear at the bottom of the page that shows them).
      </p>

      <h2>How we process it</h2>
      <ul>
        <li>
          <strong>Athlete identification.</strong> The same athlete appears under different spellings and sources. We group results automatically using name, gender, country, year of birth and
          discipline, and separate namesakes. This is statistical matching, so it can occasionally merge two people or split one.
        </li>
        <li>
          <strong>Deduplication.</strong> The same performance reported by several sources is shown once.
        </li>
        <li>
          <strong>Quality checks.</strong> Before each update, automatic checks look for impossible marks (for example, faster than a world record), impossible ages, duplicates and other
          anomalies. If a check fails, the update is not published.
        </li>
        <li>
          <strong>Rankings, points and &ldquo;Quality&rdquo;.</strong> They are our own statistical indicators, calculated from the competition level and the placing, and are not official
          classifications. Different disciplines and eras are not strictly comparable.
        </li>
      </ul>

      <h2>Known limits</h2>
      <p>
        Coverage is better for recent seasons and major competitions; older and smaller meetings may be incomplete. Some historical marks, wind readings or hand-timed results may be missing or
        approximate.
      </p>

      <h2>Corrections</h2>
      <p>
        Found an error, or want information about you corrected or removed? Use the &ldquo;Report a data error&rdquo; link at the bottom of any page or write to <Contact />. We review every
        report. See also the <Link href="/privacy">Privacy Policy</Link> and the <Link href="/terms">Terms of Use</Link>.
      </p>
    </LegalPage>
  );
}
