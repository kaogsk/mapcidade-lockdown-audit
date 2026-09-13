import { Rule, errMsg, type Db, type Row, type RuleResult } from "./base.js";
import { quoted, safeStr } from "../util/str.js";

/** "  id=.. name=.. single_tile=.. tiled=.." line for R1/R2/R3. */
function tileLine(r: Row): string {
  return (
    `  id=${safeStr(r.layer_source_id)} name=${quoted(r.name)} ` +
    `single_tile=${safeStr(r.single_tile)} tiled=${safeStr(r.tiled)}`
  );
}

function idsAffected(rows: Row[]): string {
  return rows
    .filter((r) => "layer_source_id" in r)
    .map((r) => safeStr(r.layer_source_id))
    .join(", ");
}

/** R1: WMS layers must have single_tile=true and tiled=false. */
export class RuleWmsSingleTile extends Rule {
  readonly ruleId = "R1";
  readonly name = "WMS: single_tile=TRUE and tiled=FALSE";

  async run(db: Db, city: string): Promise<RuleResult> {
    let rows: Row[];
    try {
      rows = await db.execute(
        city,
        `
                SELECT layer_source_id, name, source_type, single_tile, tiled
                FROM layer_source
                WHERE UPPER(source_type) = 'WMS'
                  AND (single_tile IS DISTINCT FROM true OR tiled IS DISTINCT FROM false)
            `,
      );
    } catch (e) {
      return this.skip(`Error querying layer_source: ${errMsg(e)}`);
    }
    if (rows.length === 0) {
      return this.ok("All WMS layers have single_tile=true and tiled=false.");
    }
    let details = `${String(rows.length)} WMS layer(s) out of spec:\n`;
    details += rows.map(tileLine).join("\n");
    const ids = idsAffected(rows);
    const fix =
      `UPDATE layer_source SET single_tile = true, tiled = false\n` +
      `WHERE UPPER(source_type) = 'WMS'\n` +
      `  AND (single_tile IS DISTINCT FROM true OR tiled IS DISTINCT FROM false);\n` +
      `-- affected ids: ${ids}`;
    return this.fail(details, [fix]);
  }
}

/** R2: XYZ layers must have single_tile=false and tiled=true. */
export class RuleXyzTiled extends Rule {
  readonly ruleId = "R2";
  readonly name = "XYZ: single_tile=FALSE and tiled=TRUE";

  async run(db: Db, city: string): Promise<RuleResult> {
    let rows: Row[];
    try {
      rows = await db.execute(
        city,
        `
                SELECT layer_source_id, name, source_type, single_tile, tiled
                FROM layer_source
                WHERE UPPER(source_type) = 'XYZ'
                  AND (single_tile IS DISTINCT FROM false OR tiled IS DISTINCT FROM true)
            `,
      );
    } catch (e) {
      return this.skip(`Error querying layer_source: ${errMsg(e)}`);
    }
    if (rows.length === 0) {
      return this.ok("All XYZ layers have single_tile=false and tiled=true.");
    }
    let details = `${String(rows.length)} XYZ layer(s) out of spec:\n`;
    details += rows.map(tileLine).join("\n");
    const ids = idsAffected(rows);
    const fix =
      `UPDATE layer_source SET single_tile = false, tiled = true\n` +
      `WHERE UPPER(source_type) = 'XYZ'\n` +
      `  AND (single_tile IS DISTINCT FROM false OR tiled IS DISTINCT FROM true);\n` +
      `-- affected ids: ${ids}`;
    return this.fail(details, [fix]);
  }
}

/** R3: OSM layers must have single_tile=false and tiled=true. */
export class RuleOsmTiled extends Rule {
  readonly ruleId = "R3";
  readonly name = "OSM: single_tile=FALSE and tiled=TRUE";

  async run(db: Db, city: string): Promise<RuleResult> {
    let rows: Row[];
    try {
      rows = await db.execute(
        city,
        `
                SELECT layer_source_id, name, source_type, single_tile, tiled
                FROM layer_source
                WHERE UPPER(source_type) = 'OSM'
                  AND (single_tile IS DISTINCT FROM false OR tiled IS DISTINCT FROM true)
            `,
      );
    } catch (e) {
      return this.skip(`Error querying layer_source: ${errMsg(e)}`);
    }
    if (rows.length === 0) {
      return this.ok("All OSM layers have single_tile=false and tiled=true.");
    }
    let details = `${String(rows.length)} OSM layer(s) out of spec:\n`;
    details += rows.map(tileLine).join("\n");
    const ids = idsAffected(rows);
    const fix =
      `UPDATE layer_source SET single_tile = false, tiled = true\n` +
      `WHERE UPPER(source_type) = 'OSM'\n` +
      `  AND (single_tile IS DISTINCT FROM false OR tiled IS DISTINCT FROM true);\n` +
      `-- affected ids: ${ids}`;
    return this.fail(details, [fix]);
  }
}

/** R4: layer_source.priority must never be NULL. */
export class RulePriorityNotNull extends Rule {
  readonly ruleId = "R4";
  readonly name = "layer_source: priority without NULL";

  async run(db: Db, city: string): Promise<RuleResult> {
    let rows: Row[];
    try {
      rows = await db.execute(
        city,
        `
                SELECT layer_source_id, name, source_type
                FROM layer_source
                WHERE priority IS NULL
            `,
      );
    } catch (e) {
      return this.skip(`Error querying layer_source: ${errMsg(e)}`);
    }
    if (rows.length === 0) {
      return this.ok("No layer with priority=NULL.");
    }
    let details = `${String(rows.length)} layer(s) with priority=NULL:\n`;
    details += rows
      .map(
        (r) =>
          `  id=${safeStr(r.layer_source_id)} name=${quoted(r.name)} type=${safeStr(r.source_type)}`,
      )
      .join("\n");
    const fix = "UPDATE layer_source SET priority = 0 WHERE priority IS NULL;";
    return this.fail(details, [fix]);
  }
}

/** R5: URLs in layer_source must not point at an external DNS (except the known-allowed provider). */
export class RuleExternalUrls extends Rule {
  readonly ruleId = "R5";
  readonly name = "layer_source: URLs without external DNS";

  private static readonly ALLOWED_PREFIXES = [
    "/",
    "http://10.",
    "https://10.",
    "http://localhost",
    "https://localhost",
  ];
  private static readonly ALLOWED_KEYWORD = "geodata-provider";

  async run(db: Db, city: string): Promise<RuleResult> {
    let rows: Row[];
    try {
      rows = await db.execute(
        city,
        "SELECT layer_source_id, name, source_type, url FROM layer_source WHERE url IS NOT NULL",
      );
    } catch (e) {
      return this.skip(`Error querying layer_source: ${errMsg(e)}`);
    }

    const suspicious: Row[] = [];
    for (const r of rows) {
      const url = toStrOrEmpty(r.url);
      if (!url.trim()) continue;
      const isInternal = RuleExternalUrls.ALLOWED_PREFIXES.some((p) => url.startsWith(p));
      const lower = url.toLowerCase();
      const isAllowedKeyword = lower.includes(RuleExternalUrls.ALLOWED_KEYWORD);
      const isOwnCity = lower.includes(city.toLowerCase());
      const isMapProvider = lower.includes("mapdata.example.com");
      if (!isInternal && !isAllowedKeyword && !isOwnCity && !isMapProvider) {
        suspicious.push(r);
      }
    }

    if (suspicious.length === 0) {
      return this.ok("No layer URL with suspicious external DNS found.");
    }
    let details = `${String(suspicious.length)} URL(s) with potential external DNS:\n`;
    details += suspicious
      .map((r) => `  id=${safeStr(r.layer_source_id)} name=${quoted(r.name)} url=${quoted(r.url)}`)
      .join("\n");
    const fixLines = ["-- Review and change the URLs below to relative paths:"];
    for (const r of suspicious) {
      fixLines.push(
        `-- UPDATE layer_source SET url = '/tiles/...' WHERE layer_source_id = ${safeStr(r.layer_source_id)}; -- current: ${safeStr(r.url)}`,
      );
    }
    return this.fail(details, [fixLines.join("\n")]);
  }
}

function toStrOrEmpty(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}
