import { randomUUID } from "crypto";
import { runQuery } from "./bigquery";

// Public "report a data error" feature -- any visitor can flag something
// wrong on any page, no login/token needed (unlike the registry verdict
// tool, which is an internal admin-only workflow). Reviewed by hand later
// via a query on this table; no UI to browse reports yet.

export async function saveErrorReport(r: { pageUrl: string; description: string }) {
  await runQuery(
    `
    INSERT INTO \`athletics-database.tablasauxiliares.data_error_reports\`
      (report_id, page_url, description, status, reported_at)
    VALUES (@report_id, @page_url, @description, 'new', CURRENT_TIMESTAMP())
  `,
    {
      report_id: randomUUID(),
      page_url: r.pageUrl.slice(0, 2000),
      description: r.description.slice(0, 2000),
    }
  );
}
