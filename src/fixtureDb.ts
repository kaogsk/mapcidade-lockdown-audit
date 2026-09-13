import type { Db, Row } from "./rules/base.js";

/**
 * Seeded in-memory double standing in for a real Postgres/PostGIS connection.
 *
 * Production wires the same `Db` interface to a live driver across dozens of
 * municipal databases; this repo ships only the demo fixture below so the
 * CLI runs with zero external services. The seeded values ("Rivermeadow")
 * are fictional and deliberately mix passing and failing rules so every
 * report section (`OK` / `FAIL` / `SKIP`) has real output to show.
 */
export class FixtureDb implements Db {
  execute(_city: string, sql: string): Promise<Row[]> {
    for (const [test, reply] of MATCHERS) {
      if (test(sql)) return Promise.resolve(reply);
    }
    return Promise.resolve([]);
  }
}

type Matcher = [(sql: string) => boolean, Row[]];
const has = (needle: string) => (sql: string): boolean => sql.includes(needle);

const MATCHERS: Matcher[] = [
  // R1 — one WMS layer misconfigured
  [
    has("UPPER(source_type) = 'WMS'"),
    [{ layer_source_id: 12, name: "Zoning Overlay", source_type: "WMS", single_tile: false, tiled: true }],
  ],
  // R2 — XYZ layers all compliant
  [has("UPPER(source_type) = 'XYZ'"), []],
  // R3 — OSM layers all compliant
  [has("UPPER(source_type) = 'OSM'"), []],
  // R4 — one layer missing priority
  [
    has("priority IS NULL"),
    [{ layer_source_id: 47, name: "Street Lighting", source_type: "XYZ" }],
  ],
  // R5 — one suspicious external URL among otherwise-fine ones
  [
    has("url IS NOT NULL"),
    [
      { layer_source_id: 3, name: "Base Imagery", source_type: "WMS", url: "/tiles/base" },
      {
        layer_source_id: 19,
        name: "Third-Party Traffic Layer",
        source_type: "XYZ",
        url: "https://tiles.random-vendor.net/traffic/{z}/{x}/{y}.png",
      },
    ],
  ],
  // R6 — one Parcel theme under the required zoom (Building themes are fine)
  [
    has("ILIKE '%Parcel%'"),
    [{ layer_source_id: 8, name: "Parcel Boundaries", current_zoom: 17 }],
  ],
  [has("ILIKE '%Building%'"), []],
  // R7 — Street/Block themes all compliant
  [has("ILIKE '%Street%'"), []],
  [has("ILIKE '%Block%'"), []],
  // R8 — one geometry table missing a spatial index
  [
    has("pg_attribute"),
    [
      {
        schema: "public",
        table_name: "street_centerline",
        column_name: "geom",
        ddl: 'CREATE INDEX ON "public"."street_centerline" USING gist(geom);',
      },
    ],
  ],
  // R9 — every additional index from the playbook is present
  [has("pg_indexes"), [{ indexname: "present" }]],
  // R10 — two cadastral tables found, one with invalid geometry
  [has("FROM pg_tables"), [{ tablename: "parcel" }, { tablename: "building_footprint" }]],
  [has("FROM parcel\n"), [{ total_invalid: 3 }]],
  [has("FROM building_footprint\n"), [{ total_invalid: 0 }]],
];
