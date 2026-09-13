/** One database row (column name -> value). */
export type Row = Record<string, unknown>;

export type RuleStatus = "OK" | "FAIL" | "SKIP";

/** Result of one audit rule. */
export interface RuleResult {
  id: string; // e.g. "R1"
  name: string;
  status: RuleStatus;
  details: string;
  fixQueries: string[]; // corrective SQL — NEVER executed automatically
}

/**
 * Read-only database client. Production wires this to a real Postgres
 * driver; the demo wires it to a seeded in-memory fixture (see fixtureDb.ts).
 */
export interface Db {
  execute(city: string, sql: string): Promise<Row[]>;
}

/** Base class for rules. */
export abstract class Rule {
  abstract readonly ruleId: string;
  abstract readonly name: string;
  abstract run(db: Db, city: string): Promise<RuleResult>;

  protected skip(reason: string): RuleResult {
    return { id: this.ruleId, name: this.name, status: "SKIP", details: reason, fixQueries: [] };
  }

  protected ok(details = ""): RuleResult {
    return { id: this.ruleId, name: this.name, status: "OK", details, fixQueries: [] };
  }

  protected fail(details: string, fixQueries: string[] = []): RuleResult {
    return { id: this.ruleId, name: this.name, status: "FAIL", details, fixQueries };
  }
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
