import chalk from "chalk";
import Table from "cli-table3";
import type { RuleResult } from "./rules/base.js";

/** "YYYY-MM-DD HH:MM" timestamp for the markdown report header. */
export function formatNow(d: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

interface Counts {
  total: number;
  ok: number;
  fail: number;
  skip: number;
}

function counts(results: RuleResult[]): Counts {
  return {
    total: results.length,
    ok: results.filter((r) => r.status === "OK").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    skip: results.filter((r) => r.status === "SKIP").length,
  };
}

/** Terminal output. */
export function renderResults(city: string, results: RuleResult[]): void {
  console.log();
  console.log(chalk.bold.cyan(`──── Lockdown Audit — city: ${city} ────`));
  console.log();

  for (const r of results) {
    let icon: string;
    let color: (s: string) => string;
    if (r.status === "OK") {
      icon = chalk.bold.green("✓ COMPLIANT");
      color = chalk.green;
    } else if (r.status === "FAIL") {
      icon = chalk.bold.red("✗ NON-COMPLIANT");
      color = chalk.red;
    } else {
      icon = chalk.bold.yellow("⚠ SKIP");
      color = chalk.yellow;
    }

    console.log(`${color(`[${r.id}]`)} ${r.name}  ${icon}`);
    if (r.details) {
      for (const line of r.details.split("\n")) {
        console.log(chalk.dim(`    ${line}`));
      }
    }
    if (r.fixQueries.length > 0) {
      console.log(chalk.bold.yellow("    Corrective queries (do NOT run automatically):"));
      for (const sql of r.fixQueries) {
        for (const line of sql.split("\n")) {
          console.log(chalk.cyan(`        ${line}`));
        }
      }
    }
    console.log();
  }

  renderSummary(results);
}

function renderSummary(results: RuleResult[]): void {
  const c = counts(results);
  const table = new Table({ head: ["Status", "Count"], colAligns: ["left", "right"] });
  table.push(
    [chalk.green("COMPLIANT (OK)"), String(c.ok)],
    [chalk.red("NON-COMPLIANT (FAIL)"), String(c.fail)],
    [chalk.yellow("SKIPPED"), String(c.skip)],
    [chalk.white("TOTAL"), String(c.total)],
  );
  const emoji = c.fail === 0 ? "🎯" : "⚠️";
  console.log(chalk.cyan(`${emoji} Summary`));
  console.log(table.toString());
}

/** Markdown report — pure string, no side effects. */
export function renderMarkdown(city: string, results: RuleResult[], now = formatNow()): string {
  const c = counts(results);

  const lines: string[] = [];
  lines.push(`# Lockdown Audit — \`${city}\``);
  lines.push(`\n> Generated at ${now}\n`);

  lines.push("## Summary\n");
  lines.push("| Status | Count |");
  lines.push("|---|---|");
  lines.push(`| ✅ Compliant (OK) | ${String(c.ok)} |`);
  lines.push(`| ❌ Non-compliant (FAIL) | ${String(c.fail)} |`);
  lines.push(`| ⚠️ Skipped | ${String(c.skip)} |`);
  lines.push(`| **Total** | **${String(c.total)}** |\n`);

  lines.push("## Detail\n");
  for (const r of results) {
    let icon: string;
    if (r.status === "OK") {
      icon = "✅";
    } else if (r.status === "FAIL") {
      icon = "❌";
    } else {
      icon = "⚠️";
    }

    lines.push(`### ${icon} [${r.id}] ${r.name}\n`);
    lines.push(`**Status:** \`${r.status}\`\n`);
    if (r.details) {
      lines.push(r.details + "\n");
    }
    if (r.fixQueries.length > 0) {
      lines.push("**Corrective queries** *(do not run automatically)*\n");
      for (const sql of r.fixQueries) {
        lines.push(`\`\`\`sql\n${sql}\n\`\`\`\n`);
      }
    }
  }

  return lines.join("\n");
}
