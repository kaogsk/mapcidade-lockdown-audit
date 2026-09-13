import { describe, it, expect } from "vitest";
import { renderMarkdown, formatNow } from "../src/report.js";
import type { RuleResult } from "../src/rules/base.js";

const RESULTS: RuleResult[] = [
  {
    id: "R1",
    name: "WMS: single_tile=TRUE and tiled=FALSE",
    status: "OK",
    details: "All WMS layers have single_tile=true and tiled=false.",
    fixQueries: [],
  },
  {
    id: "R4",
    name: "layer_source: priority without NULL",
    status: "FAIL",
    details: '1 layer(s) with priority=NULL:\n  id=3 name="X" type="WMS"',
    fixQueries: ["UPDATE layer_source SET priority = 0 WHERE priority IS NULL;"],
  },
  {
    id: "R10",
    name: "Invalid geometries in main layers",
    status: "SKIP",
    details: "No cadastral layer table found matching the expected patterns.",
    fixQueries: [],
  },
];

describe("renderMarkdown", () => {
  it("snapshot with a fixed timestamp", () => {
    const md = renderMarkdown("rivermeadow", RESULTS, "2026-09-13 09:30");
    expect(md).toMatchInlineSnapshot(`
      "# Lockdown Audit — \`rivermeadow\`

      > Generated at 2026-09-13 09:30

      ## Summary

      | Status | Count |
      |---|---|
      | ✅ Compliant (OK) | 1 |
      | ❌ Non-compliant (FAIL) | 1 |
      | ⚠️ Skipped | 1 |
      | **Total** | **3** |

      ## Detail

      ### ✅ [R1] WMS: single_tile=TRUE and tiled=FALSE

      **Status:** \`OK\`

      All WMS layers have single_tile=true and tiled=false.

      ### ❌ [R4] layer_source: priority without NULL

      **Status:** \`FAIL\`

      1 layer(s) with priority=NULL:
        id=3 name="X" type="WMS"

      **Corrective queries** *(do not run automatically)*

      \`\`\`sql
      UPDATE layer_source SET priority = 0 WHERE priority IS NULL;
      \`\`\`

      ### ⚠️ [R10] Invalid geometries in main layers

      **Status:** \`SKIP\`

      No cadastral layer table found matching the expected patterns.
      "
    `);
  });

  it("summary counts match the statuses", () => {
    const md = renderMarkdown("x", RESULTS, "2026-01-01 00:00");
    expect(md).toContain("| ✅ Compliant (OK) | 1 |");
    expect(md).toContain("| **Total** | **3** |");
  });
});

describe("formatNow", () => {
  it("formats YYYY-MM-DD HH:MM", () => {
    expect(formatNow(new Date(2026, 8, 13, 9, 5))).toBe("2026-09-13 09:05");
  });
});
