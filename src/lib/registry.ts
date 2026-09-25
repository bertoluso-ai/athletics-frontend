import { runQuery } from "./bigquery";

// Read side of the competition registry (athletics-database.registry.*),
// used by the /competitions debugging pages while the new grouping is being
// validated against what production shows today.

const R = "`athletics-database.registry";

export type RegistryFlag = "multi_date" | "raw_split" | "missing_years" | "diff";

export type RegistryCompetitionRow = {
  competition_id: string;
  canonical_name: string;
  city: string | null;
  country: string | null;
  profile: string;
  first_year: number;
  last_year: number;
  n_editions: number;
  n_raw_names: number;
  n_rows: number;
  best_tier: string | null;
  sources: string[];
  n_multi_date_years: number;
  n_raw_split: number;
  n_missing_years: number;
  in_diff: boolean;
};

export async function listRegistryCompetitions(opts: {
  q?: string;
  flag?: RegistryFlag | "";
  tier?: string;
  limit?: number;
}): Promise<RegistryCompetitionRow[]> {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.q) {
    // matches the shown name or any raw name grouped under it
    where.push(`(LOWER(f.canonical_name) LIKE @q OR f.competition_id IN (
      SELECT competition_id FROM ${R}.edition_map\` WHERE LOWER(event_name) LIKE @q))`);
    params.q = `%${opts.q.toLowerCase()}%`;
  }
  if (opts.flag === "multi_date") where.push("f.n_multi_date_years > 0");
  if (opts.flag === "raw_split") where.push("f.n_raw_split > 0");
  if (opts.flag === "missing_years") where.push("f.n_missing_years > 0");
  if (opts.flag === "diff") where.push("f.in_diff");
  if (opts.tier) {
    where.push("f.best_tier = @tier");
    params.tier = opts.tier;
  }
  return runQuery<RegistryCompetitionRow>(
    `
    SELECT f.*
    FROM ${R}.competition_flags\` f
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY \`athletics-database.registry.tier_rank\`(f.best_tier), f.n_rows DESC
    LIMIT ${Math.min(opts.limit ?? 200, 500)}
  `,
    params
  );
}

export type RegistryEditionRow = {
  year: number;
  date: string | null;
  city: string | null;
  country: string | null;
  best_tier: string | null;
  raw_names: string[];
  sources: string[];
  n_rows: number;
  n_dates: number;
};

export type RegistryRawRow = {
  event_name: string;
  source: string;
  base_key: string;
  rule: string;
  years: number[];
  n_rows: number;
  other_competitions: number;
};

export type RegistryLinkRow = {
  key_a: string;
  key_b: string;
  same_date: boolean;
  no_overlap: boolean;
  gap_years: number;
  worst_rank: number;
  decision: string;
  inside: boolean; // both ends belong to this competition
  other_id: string | null;
  other_name: string | null;
};

export async function getRegistryCompetition(id: string) {
  const [comp] = await runQuery<RegistryCompetitionRow>(
    `SELECT * FROM ${R}.competition_flags\` WHERE competition_id = @id`,
    { id }
  );
  if (!comp) return null;

  const [editions, raws, links] = await Promise.all([
    runQuery<RegistryEditionRow>(
      `
      SELECT year, CAST(MIN(date) AS STRING) AS date,
        APPROX_TOP_COUNT(city, 1)[OFFSET(0)].value AS city,
        APPROX_TOP_COUNT(country, 1)[OFFSET(0)].value AS country,
        ARRAY_AGG(best_tier IGNORE NULLS ORDER BY \`athletics-database.registry.tier_rank\`(best_tier) LIMIT 1)[SAFE_OFFSET(0)] AS best_tier,
        ARRAY_AGG(DISTINCT event_name) AS raw_names,
        ARRAY_AGG(DISTINCT source) AS sources,
        SUM(n_rows) AS n_rows,
        COUNT(DISTINCT DIV(UNIX_DATE(date), 4)) AS n_dates
      FROM ${R}.edition_map\`
      WHERE competition_id = @id
      GROUP BY year
      ORDER BY year DESC
    `,
      { id }
    ),
    runQuery<RegistryRawRow>(
      `
      WITH mine AS (
        SELECT event_name, source, base_key, ARRAY_AGG(DISTINCT year ORDER BY year) AS years, SUM(n_rows) AS n_rows
        FROM ${R}.edition_map\` WHERE competition_id = @id
        GROUP BY event_name, source, base_key
      )
      SELECT m.*,
        SPLIT(m.base_key, '|')[OFFSET(0)] AS rule,
        (SELECT COUNT(DISTINCT competition_id) FROM ${R}.edition_map\` x
          WHERE x.event_name = m.event_name AND x.competition_id != @id) AS other_competitions
      FROM mine m
      ORDER BY m.n_rows DESC
    `,
      { id }
    ),
    runQuery<RegistryLinkRow>(
      `
      WITH keys AS (SELECT DISTINCT base_key FROM ${R}.edition_map\` WHERE competition_id = @id),
      key_comp AS (SELECT DISTINCT base_key, competition_id FROM ${R}.edition_map\`),
      names AS (SELECT competition_id, canonical_name FROM ${R}.competitions\`),
      -- which end(s) of each link are ours, precomputed: BigQuery allows no
      -- subqueries inside a join predicate
      q AS (
        SELECT q.*, ka.base_key IS NOT NULL AS a_in, kb.base_key IS NOT NULL AS b_in
        FROM ${R}.review_queue\` q
        LEFT JOIN keys ka ON ka.base_key = q.key_a
        LEFT JOIN keys kb ON kb.base_key = q.key_b
        WHERE q.decision != 'reject'
      )
      SELECT q.key_a, q.key_b, q.same_date, q.no_overlap, q.gap_years, q.worst_rank, q.decision,
        (q.a_in AND q.b_in) AS inside,
        o.competition_id AS other_id, n.canonical_name AS other_name
      FROM q
      LEFT JOIN key_comp o
        ON o.base_key = IF(q.a_in, q.key_b, q.key_a)
       AND o.competition_id != @id
      LEFT JOIN names n ON n.competition_id = o.competition_id
      WHERE q.a_in OR q.b_in
      ORDER BY inside DESC, q.decision
    `,
      { id }
    ),
  ]);

  return { comp, editions, raws, links };
}

export type RegistryDiffRow = {
  kind: "MERGE" | "SPLIT";
  diff_id: string;
  competition_ids: string[];
  name: string;
  other_side: string[];
  raw_names: string[];
  y0: number;
  y1: number;
  best_rank: number;
  verdict: string | null;
  note: string | null;
};

export async function listRegistryDiffs(opts: { kind?: string; pending?: boolean }): Promise<RegistryDiffRow[]> {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.kind) {
    where.push("d.kind = @kind");
    params.kind = opts.kind;
  }
  if (opts.pending) where.push("v.verdict IS NULL");
  return runQuery<RegistryDiffRow>(
    `
    WITH latest AS (
      SELECT diff_id, ARRAY_AGG(STRUCT(verdict, note) ORDER BY created_at DESC LIMIT 1)[OFFSET(0)] AS v
      FROM ${R}.verdicts\` GROUP BY diff_id
    )
    SELECT d.*, v.verdict, v.note
    FROM ${R}.diff_vs_production\` d
    LEFT JOIN (SELECT diff_id, v.verdict, v.note FROM latest) v USING (diff_id)
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY d.best_rank, d.kind, d.name
  `,
    params
  );
}

export type RawLookupRow = {
  event_name: string;
  source: string;
  years: number[];
  base_key: string;
  competition_id: string;
  canonical_name: string;
  production_series: string[];
};

export async function lookupRawName(q: string): Promise<RawLookupRow[]> {
  return runQuery<RawLookupRow>(
    `
    SELECT m.event_name, m.source, ARRAY_AGG(DISTINCT m.year ORDER BY m.year) AS years, m.base_key,
      m.competition_id, ANY_VALUE(c.canonical_name) AS canonical_name,
      ARRAY(SELECT DISTINCT display_series_name FROM \`athletics-database.athletics_all.events_enriched\` e
            WHERE e.event_name = m.event_name AND display_series_name IS NOT NULL) AS production_series
    FROM ${R}.edition_map\` m
    JOIN ${R}.competitions\` c USING (competition_id)
    WHERE LOWER(m.event_name) LIKE @q
    GROUP BY m.event_name, m.source, m.base_key, m.competition_id
    ORDER BY m.event_name
    LIMIT 100
  `,
    { q: `%${q.toLowerCase()}%` }
  );
}

export async function saveVerdict(v: {
  diff_id: string;
  kind: string;
  verdict: "ok" | "wrong";
  note: string;
  competition_ids: string[];
  raw_names: string[];
}) {
  await runQuery(
    `
    INSERT INTO ${R}.verdicts\` (diff_id, kind, verdict, note, competition_ids, raw_names, created_at)
    VALUES (@diff_id, @kind, @verdict, @note, @competition_ids, @raw_names, CURRENT_TIMESTAMP())
  `,
    v
  );
}

// Plain-language explanation of each grouping rule (first segment of base_key).
export const RULE_LABELS: Record<string, string> = {
  cur: "Curated alias",
  tour: "Touring championship (name only, any host)",
  champ: "Championship, one edition a year (any country)",
  fix: "Same name + country + city",
};
