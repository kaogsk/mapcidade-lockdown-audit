import { Rule, errMsg, type Db, type Row, type RuleResult } from "./base.js";
import { toStr } from "../util/str.js";

// Table-name patterns for cadastral layers likely to hold invalid geometry.
const LAYER_PATTERNS = [
  "building_footprint",
  "parcel",
  "block",
  "jurisdiction_boundary",
  "city_boundary",
  "street_centerline",
];

const findTablesSql = (conditions: string): string => `
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND (${conditions})
ORDER BY tablename
`;

const countInvalidSql = (table: string): string => `
SELECT COUNT(*) AS total_invalid
FROM ${table}
WHERE ST_IsValid(geom) = false
`;

const countInvalidGeometrySql = (table: string): string => `
SELECT COUNT(*) AS total_invalid
FROM ${table}
WHERE ST_IsValid(geometry) = false
`;

interface Problem {
  table: string;
  total: number;
  geomColumn: string;
}

/** R10: Invalid geometries in the main cadastral layers. */
export class RuleInvalidGeometries extends Rule {
  readonly ruleId = "R10";
  readonly name = "Invalid geometries in main layers";

  async run(db: Db, city: string): Promise<RuleResult> {
    const conditions = LAYER_PATTERNS.map((p) => `tablename ILIKE '%${p}%'`).join(" OR ");
    let tables: Row[];
    try {
      tables = await db.execute(city, findTablesSql(conditions));
    } catch (e) {
      return this.skip(`Error listing tables: ${errMsg(e)}`);
    }
    if (tables.length === 0) {
      return this.skip("No cadastral layer table found matching the expected patterns.");
    }

    const problems: Problem[] = [];
    for (const row of tables) {
      const tbl = toStr(row.tablename);
      if (!tbl) continue;
      let totalInvalid = 0;
      let geomColumn = "geom";
      try {
        const res = await db.execute(city, countInvalidSql(tbl));
        totalInvalid = Number(res[0]?.total_invalid ?? 0);
      } catch {
        try {
          const res = await db.execute(city, countInvalidGeometrySql(tbl));
          totalInvalid = Number(res[0]?.total_invalid ?? 0);
          geomColumn = "geometry";
        } catch {
          continue;
        }
      }
      if (totalInvalid > 0) {
        problems.push({ table: tbl, total: totalInvalid, geomColumn });
      }
    }

    if (problems.length === 0) {
      return this.ok(
        `No invalid geometry found across the ${String(tables.length)} table(s) checked.`,
      );
    }
    const totalOverall = problems.reduce((acc, p) => acc + p.total, 0);
    let details = `${String(totalOverall)} invalid geometr${totalOverall === 1 ? "y" : "ies"} across ${String(problems.length)} table(s):\n`;
    details += problems.map((p) => `  ${p.table}: ${String(p.total)} invalid`).join("\n");
    const fixParts: string[] = [];
    for (const p of problems) {
      const { table: tbl, geomColumn: gc } = p;
      fixParts.push(
        `-- Inspect ${tbl} first:\n` +
          `SELECT st_multi(st_buffer(${gc}, 0)), ${gc}, *\n` +
          `FROM ${tbl}\n` +
          `WHERE ST_IsValid(${gc}) = false;\n\n` +
          `-- Fix ${tbl} (only after reviewing the result above):\n` +
          `UPDATE ${tbl}\n` +
          `SET ${gc} = st_multi(st_buffer(${gc}, 0))\n` +
          `WHERE ST_IsValid(${gc}) = false;`,
      );
    }
    return this.fail(details, fixParts);
  }
}
