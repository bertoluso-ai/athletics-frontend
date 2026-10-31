import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Contact } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Legal Notice" };

export default function LegalNoticePage() {
  return (
    <LegalPage title="Legal Notice" intro="Information about the owner of this website, as required by the Spanish Law 34/2002 on Information Society Services and E-commerce (LSSI-CE) and equivalent rules.">
      <h2>Website owner</h2>
      <table>
        <tbody>
          <tr>
            <td>Website</td>
            <td>
              {LEGAL.siteName} &ndash; {LEGAL.domain}
            </td>
          </tr>
          <tr>
            <td>Owner</td>
            <td>{LEGAL.operatorName}</td>
          </tr>
          <tr>
            <td>Address</td>
            <td>{LEGAL.operatorAddress}</td>
          </tr>
          {LEGAL.operatorTaxId && (
            <tr>
              <td>Tax ID</td>
              <td>{LEGAL.operatorTaxId}</td>
            </tr>
          )}
          <tr>
            <td>Contact</td>
            <td>
              <Contact />
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Purpose</h2>
      <p>A free statistical and reference website about athletics: results, rankings and records. It is independent and not affiliated with any federation or event organiser.</p>

      <h2>Intellectual and industrial property</h2>
      <p>
        See section 4 of the <Link href="/terms">Terms of Use</Link>. Third-party names, logos and trademarks belong to their owners and are used only to identify events and organisations.
        If you believe content on the site infringes your rights, write to <Contact /> with the details and we will review it promptly.
      </p>

      <h2>Liability</h2>
      <p>
        The owner makes reasonable efforts to keep the information accurate but does not guarantee it (see <Link href="/terms">Terms of Use</Link>) and is not responsible for the content of linked third-party sites.
      </p>

      <h2>Applicable law</h2>
      <p>This notice is governed by the law of {LEGAL.country}. For consumers, the mandatory rules of their country of residence apply.</p>
    </LegalPage>
  );
}
