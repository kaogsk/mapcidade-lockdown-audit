import { Rule, errMsg, type Db, type Row, type RuleResult } from "./base.js";
import { quoted, safeStr } from "../util/str.js";

/** SELECT of layers below the expected max_zoom_level. */
function zoomQuery(keyword: string, minZoom: number): string {
  return `
        SELECT s.layer_source_id, t.theme_name AS name, s.max_zoom_level AS current_zoom
        FROM layer_source s
        JOIN theme t ON t.theme_id = s.theme_id
        WHERE (t.theme_name ILIKE '%${keyword}%')
          AND s.max_zoom_level IS NOT NULL
          AND s.max_zoom_level < ${String(minZoom)}
    `;
}

/** Shared engine for the two scale rules (R6/R7). */
abstract class ZoomRule extends Rule {
  protected abstract readonly keywords: [string, string];
  protected abstract readonly minZoom: number;
  protected abstract readonly targetLabel: string;

  async run(db: Db, city: string): Promise<RuleResult> {
    const problems: Row[] = [];
    for (const kw of this.keywords) {
      try {
        const rows = await db.execute(city, zoomQuery(kw, this.minZoom));
        problems.push(...rows);
      } catch (e) {
        return this.skip(`Error querying theme (${kw}): ${errMsg(e)}`);
      }
    }
    if (problems.length === 0) {
      return this.ok(`All ${this.targetLabel} themes have max_zoom_level >= ${String(this.minZoom)}.`);
    }
    let details = `${String(problems.length)} theme(s) with zoom below ${String(this.minZoom)}:\n`;
    details += problems
      .map(
        (r) =>
          `  id=${safeStr(r.layer_source_id)} name=${quoted(r.name)} current_zoom=${safeStr(r.current_zoom)}`,
      )
      .join("\n");
    const fixLines = [`-- Raise max_zoom_level to >= ${String(this.minZoom)} on the themes below:`];
    for (const r of problems) {
      fixLines.push(
        `UPDATE layer_source SET max_zoom_level = ${String(this.minZoom)} WHERE layer_source_id = ${safeStr(r.layer_source_id)};` +
          ` -- ${safeStr(r.name)}`,
      );
    }
    return this.fail(details, [fixLines.join("\n")]);
  }
}

/** R6: Parcel/Building themes must have max_zoom_level >= 19. */
export class RuleZoomParcelBuilding extends ZoomRule {
  readonly ruleId = "R6";
  readonly name = "Scale: Parcel/Building max_zoom_level >= 19";
  protected readonly keywords: [string, string] = ["Parcel", "Building"];
  protected readonly minZoom = 19;
  protected readonly targetLabel = "Parcel/Building";
}

/** R7: Street/Block themes must have max_zoom_level >= 15. */
export class RuleZoomStreetBlock extends ZoomRule {
  readonly ruleId = "R7";
  readonly name = "Scale: Street/Block max_zoom_level >= 15";
  protected readonly keywords: [string, string] = ["Street", "Block"];
  protected readonly minZoom = 15;
  protected readonly targetLabel = "Street/Block";
}
