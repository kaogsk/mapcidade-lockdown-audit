/**
 * mapcidade-lockdown-audit — read-only CLI that audits a municipal GIS
 * database against a fixed 10-rule lockdown-prevention playbook.
 *
 * Usage:
 *   npm run demo                           # seeded Rivermeadow fixture, no external services
 *   npm run dev -- --city rivermeadow --verbose
 *   npm run dev -- --city rivermeadow --md
 *
 * All rules are read-only SELECTs; fix queries are TEXT only, never executed.
 */
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import chalk from "chalk";
import type { RuleResult } from "./rules/base.js";
import { errMsg } from "./rules/base.js";
import { renderMarkdown, renderResults } from "./report.js";
import { FixtureDb } from "./fixtureDb.js";
import { runAudit } from "./audit.js";

const USAGE = `mapcidade-lockdown-audit — read-only lockdown-prevention audit

Usage: audit --city <name> [options]

Options:
  --city NAME   (required) city identifier for the report header
  --verbose     Show extra detail while each rule runs
  --md          Save the report to audit_<city>.md
  --help        Show this help
`;

async function main(): Promise<number> {
  const { values: args } = parseArgs({
    options: {
      city: { type: "string" },
      verbose: { type: "boolean", default: false },
      md: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const city = args.city;
  if (!city) {
    console.error(chalk.red("Error: --city is required.\n"));
    console.log(USAGE);
    return 2;
  }

  console.log(chalk.bold(`Connecting (seeded demo fixture, no external services)...`));
  const db = new FixtureDb();

  console.log(chalk.green(`Connected. Running the 10-rule playbook...`));
  const results: RuleResult[] = await runAudit(db, city, {
    verbose: args.verbose,
    onProgress: (msg) => console.log(chalk.dim(msg)),
  });

  renderResults(city, results);

  if (args.md) {
    const outPath = resolve(process.cwd(), `audit_${city}.md`);
    writeFileSync(outPath, renderMarkdown(city, results), "utf-8");
    console.log(chalk.cyan(`Report saved to ${outPath}`));
  }

  const failCount = results.filter((r) => r.status === "FAIL").length;
  return failCount > 0 ? 1 : 0;
}

// Only runs the CLI when invoked directly (not when imported by tests).
// pathToFileURL() normalizes both sides so this also works on Windows,
// where a plain string comparison against argv[1] never matches.
const invokedDirectly =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((e: unknown) => {
      console.error(chalk.red(`Fatal error: ${errMsg(e)}`));
      process.exitCode = 1;
    });
}

export { main };
