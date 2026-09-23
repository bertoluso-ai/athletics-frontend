import { BigQuery } from "@google-cloud/bigquery";

// En local usa las credenciales por defecto de gcloud (ya configuradas en
// esta máquina). En Vercel, se espera GOOGLE_APPLICATION_CREDENTIALS_BASE64
// con la clave de la service account codificada en base64 (nunca la clave
// en claro ni committeada al repo).
function getCredentials() {
  const b64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
  if (!b64) return undefined;
  const json = Buffer.from(b64, "base64").toString("utf-8");
  return JSON.parse(json);
}

const credentials = getCredentials();

export const bigquery = new BigQuery({
  projectId: "athletics-database",
  ...(credentials ? { credentials } : {}),
});

export async function runQuery<T = Record<string, unknown>>(
  query: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const [rows] = await bigquery.query({
    query,
    params,
    location: "EU",
  });
  return rows as T[];
}
