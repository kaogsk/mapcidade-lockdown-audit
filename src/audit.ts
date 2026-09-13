import { ALL_RULES } from "./rules/index.js";
import { errMsg, type Db, type RuleResult } from "./rules/base.js";

/**
 * Runs every rule against an injectable Db. Any unexpected exception from a
 * rule becomes a SKIP result instead of crashing the whole audit.
 */
export async function runAudit(
  db: Db,
  city: string,
  opts: { verbose?: boolean; onProgress?: (msg: string) => void } = {},
): Promise<RuleResult[]> {
  const results: RuleResult[] = [];
  for (const rule of ALL_RULES) {
    if (opts.verbose && opts.onProgress) {
      opts.onProgress(`  Running ${rule.ruleId}: ${rule.name}...`);
    }
    try {
      results.push(await rule.run(db, city));
    } catch (e) {
      results.push({
        id: rule.ruleId,
        name: rule.name,
        status: "SKIP",
        details: `Unexpected exception: ${errMsg(e)}`,
        fixQueries: [],
      });
    }
  }
  return results;
}
