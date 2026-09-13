import { describe, it, expect } from "vitest";
import {
  RuleWmsSingleTile,
  RuleXyzTiled,
  RuleOsmTiled,
  RulePriorityNotNull,
  RuleExternalUrls,
} from "../src/rules/layerSource.js";
import { RuleZoomParcelBuilding, RuleZoomStreetBlock } from "../src/rules/scales.js";
import { RuleSpatialIndexes, RuleAdditionalIndexes } from "../src/rules/indexes.js";
import { RuleInvalidGeometries } from "../src/rules/geometry.js";
import { ALL_RULES } from "../src/rules/index.js";
import { runAudit } from "../src/audit.js";
import { FakeDb, ConstDb, ThrowingDb, includes } from "./fakeDb.js";

const CITY = "rivermeadow";

describe("R1 RuleWmsSingleTile", () => {
  it("OK when no row is out of spec", async () => {
    const res = await new RuleWmsSingleTile().run(new ConstDb([]), CITY);
    expect(res.status).toBe("OK");
    expect(res.fixQueries).toEqual([]);
  });

  it("FAIL lists layers and builds an UPDATE with affected ids", async () => {
    const rows = [
      { layer_source_id: 10, name: "Base Imagery", source_type: "WMS", single_tile: false, tiled: true },
      { layer_source_id: 12, name: "Blocks", source_type: "WMS", single_tile: null, tiled: true },
    ];
    const res = await new RuleWmsSingleTile().run(new ConstDb(rows), CITY);
    expect(res.status).toBe("FAIL");
    expect(res.details).toContain("2 WMS layer(s) out of spec");
    expect(res.details).toContain('id=10 name="Base Imagery" single_tile=false tiled=true');
    expect(res.details).toContain("single_tile=(none) tiled=true");
    expect(res.fixQueries[0]).toContain("UPDATE layer_source SET single_tile = true, tiled = false");
    expect(res.fixQueries[0]).toContain("-- affected ids: 10, 12");
  });

  it("SKIP when the query fails", async () => {
    const res = await new RuleWmsSingleTile().run(new ThrowingDb("conn refused"), CITY);
    expect(res.status).toBe("SKIP");
    expect(res.details).toContain("Error querying layer_source: conn refused");
  });
});

describe("R2/R3 XYZ and OSM", () => {
  it("R2 FAIL builds UPDATE tiled=true", async () => {
    const res = await new RuleXyzTiled().run(
      new ConstDb([{ layer_source_id: 5, name: "Base", source_type: "XYZ", single_tile: true, tiled: false }]),
      CITY,
    );
    expect(res.status).toBe("FAIL");
    expect(res.fixQueries[0]).toContain("UPDATE layer_source SET single_tile = false, tiled = true");
    expect(res.fixQueries[0]).toContain("WHERE UPPER(source_type) = 'XYZ'");
  });

  it("R3 OK with no rows", async () => {
    expect((await new RuleOsmTiled().run(new ConstDb([]), CITY)).status).toBe("OK");
  });
});

describe("R4 priority NULL", () => {
  it("FAIL with fixed fix", async () => {
    const res = await new RulePriorityNotNull().run(
      new ConstDb([{ layer_source_id: 3, name: "X", source_type: "WMS" }]),
      CITY,
    );
    expect(res.status).toBe("FAIL");
    expect(res.fixQueries).toEqual([
      "UPDATE layer_source SET priority = 0 WHERE priority IS NULL;",
    ]);
  });
});

describe("R5 external URLs", () => {
  it("OK for internal/relative/allowed URLs", async () => {
    const rows = [
      { layer_source_id: 1, name: "a", source_type: "WMS", url: "/tiles/wms" },
      { layer_source_id: 2, name: "b", source_type: "WMS", url: "http://10.0.0.1/wms" },
      { layer_source_id: 3, name: "c", source_type: "WMS", url: "https://geodata-provider.example.org/api" },
      { layer_source_id: 4, name: "d", source_type: "WMS", url: "https://rivermeadow.example.org/x" },
      { layer_source_id: 5, name: "e", source_type: "WMS", url: "https://mapdata.example.com/tiles" },
      { layer_source_id: 6, name: "f", source_type: "WMS", url: null },
      { layer_source_id: 7, name: "g", source_type: "WMS", url: "   " },
    ];
    const res = await new RuleExternalUrls().run(new ConstDb(rows), CITY);
    expect(res.status).toBe("OK");
  });

  it("FAIL for suspicious external DNS", async () => {
    const rows = [{ layer_source_id: 9, name: "ext", source_type: "WMS", url: "https://tiles.random-vendor.net/wms" }];
    const res = await new RuleExternalUrls().run(new ConstDb(rows), CITY);
    expect(res.status).toBe("FAIL");
    expect(res.details).toContain("1 URL(s) with potential external DNS");
    expect(res.details).toContain('url="https://tiles.random-vendor.net/wms"');
    expect(res.fixQueries[0]).toContain("WHERE layer_source_id = 9");
  });
});

describe("R6/R7 zoom scales", () => {
  it("R6 queries both keywords (Parcel, Building) and accumulates problems", async () => {
    const db = new FakeDb([
      {
        when: includes("%Parcel%"),
        reply: [{ layer_source_id: 100, name: "Parcel", current_zoom: 17 }],
      },
      {
        when: includes("%Building%"),
        reply: [{ layer_source_id: 101, name: "Building Footprint", current_zoom: 18 }],
      },
    ]);
    const res = await new RuleZoomParcelBuilding().run(db, CITY);
    expect(res.status).toBe("FAIL");
    expect(res.details).toContain("2 theme(s) with zoom below 19");
    expect(res.fixQueries[0]).toContain(
      "UPDATE layer_source SET max_zoom_level = 19 WHERE layer_source_id = 100;",
    );
  });

  it("R7 OK when no keyword returns a problem", async () => {
    expect((await new RuleZoomStreetBlock().run(new ConstDb([]), CITY)).status).toBe("OK");
  });

  it("R7 SKIP when the query fails", async () => {
    const res = await new RuleZoomStreetBlock().run(new ThrowingDb("no theme table"), CITY);
    expect(res.status).toBe("SKIP");
    expect(res.details).toContain("Error querying theme (Street)");
  });
});

describe("R8 spatial indexes", () => {
  it("FAIL concatenates the returned DDLs", async () => {
    const rows = [
      {
        schema: "public",
        table_name: "parcel",
        column_name: "geom",
        ddl: 'CREATE INDEX ON "public"."parcel" USING gist(geom);',
      },
    ];
    const res = await new RuleSpatialIndexes().run(new ConstDb(rows), CITY);
    expect(res.status).toBe("FAIL");
    expect(res.details).toContain("public.parcel (geom)");
    expect(res.fixQueries[0]).toBe('CREATE INDEX ON "public"."parcel" USING gist(geom);');
  });

  it("OK with no rows", async () => {
    expect((await new RuleSpatialIndexes().run(new ConstDb([]), CITY)).status).toBe("OK");
  });
});

describe("R9 additional indexes", () => {
  it("FAIL when all are missing (checks return empty)", async () => {
    const res = await new RuleAdditionalIndexes().run(new ConstDb([]), CITY);
    expect(res.status).toBe("FAIL");
    expect(res.details).toBe("27 index(es) missing.");
    expect(res.fixQueries[0]).toContain("idx_audit_log_record_key_trgm");
  });

  it("OK when all are present", async () => {
    const res = await new RuleAdditionalIndexes().run(new ConstDb([{ indexname: "x" }]), CITY);
    expect(res.status).toBe("OK");
  });
});

describe("R10 invalid geometries", () => {
  it("SKIP when there are no candidate tables", async () => {
    const db = new FakeDb([{ when: includes("pg_tables"), reply: [] }]);
    const res = await new RuleInvalidGeometries().run(db, CITY);
    expect(res.status).toBe("SKIP");
  });

  it("FAIL counts invalid rows and falls back to the geometry column", async () => {
    const db = new FakeDb([
      { when: includes("pg_tables"), reply: [{ tablename: "parcel" }, { tablename: "block" }] },
      // parcel: geom column works
      {
        when: (sql) => sql.includes("FROM parcel") && sql.includes("ST_IsValid(geom)"),
        reply: [{ total_invalid: 3 }],
      },
      // block: geom fails, geometry works (fallback)
      {
        when: (sql) => sql.includes("FROM block") && sql.includes("ST_IsValid(geom)"),
        reply: { throw: "column geom does not exist" },
      },
      {
        when: (sql) => sql.includes("FROM block") && sql.includes("ST_IsValid(geometry)"),
        reply: [{ total_invalid: 2 }],
      },
    ]);
    const res = await new RuleInvalidGeometries().run(db, CITY);
    expect(res.status).toBe("FAIL");
    expect(res.details).toContain("5 invalid geometries across 2 table(s)");
    expect(res.details).toContain("parcel: 3 invalid");
    expect(res.details).toContain("block: 2 invalid");
    const blockFix = res.fixQueries.find((f) => f.includes("UPDATE block"));
    expect(blockFix).toContain("st_multi(st_buffer(geometry, 0))");
  });

  it("OK when there is no invalid geometry", async () => {
    const db = new FakeDb([
      { when: includes("pg_tables"), reply: [{ tablename: "parcel" }] },
      { when: includes("ST_IsValid(geom)"), reply: [{ total_invalid: 0 }] },
    ]);
    const res = await new RuleInvalidGeometries().run(db, CITY);
    expect(res.status).toBe("OK");
    expect(res.details).toContain("across the 1 table(s) checked");
  });
});

describe("runAudit (engine)", () => {
  it("runs all 10 rules and returns one result per rule", async () => {
    const results = await runAudit(new ConstDb([]), CITY);
    expect(results).toHaveLength(ALL_RULES.length);
    expect(results.map((r) => r.id)).toEqual([
      "R1",
      "R2",
      "R3",
      "R4",
      "R5",
      "R6",
      "R7",
      "R8",
      "R9",
      "R10",
    ]);
  });
});
