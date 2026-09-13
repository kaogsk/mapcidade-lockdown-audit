import { Rule, type Db, type Row, type RuleResult, errMsg } from "./base.js";
import { safeStr, toStr } from "../util/str.js";

/** Extra indexes the playbook expects: [index name, DDL]. */
export const ADDITIONAL_INDEXES: [string, string][] = [
  [
    "idx_audit_log_record_key_trgm",
    "CREATE INDEX IF NOT EXISTS idx_audit_log_record_key_trgm ON audit_log USING GIN (record_key gin_trgm_ops);",
  ],
  [
    "street_view_image_name_idx",
    'CREATE INDEX IF NOT EXISTS street_view_image_name_idx ON public.street_view_image ("name");',
  ],
  ["audit_log_gid_idx", "CREATE INDEX IF NOT EXISTS audit_log_gid_idx ON public.audit_log (gid);"],
  [
    "audit_log_next_idx",
    'CREATE INDEX IF NOT EXISTS audit_log_next_idx ON public.audit_log ("next");',
  ],
  [
    "audit_log_previous_idx",
    "CREATE INDEX IF NOT EXISTS audit_log_previous_idx ON public.audit_log (previous);",
  ],
  [
    "audit_log_table_name_idx",
    "CREATE INDEX IF NOT EXISTS audit_log_table_name_idx ON public.audit_log (table_name);",
  ],
  ["audit_log_pk_idx", "CREATE INDEX IF NOT EXISTS audit_log_pk_idx ON public.audit_log (pk);"],
  [
    "audit_log_user_id_idx",
    "CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON public.audit_log (user_id);",
  ],
  [
    "layer_attribute_dictionary_table_id_idx",
    "CREATE INDEX IF NOT EXISTS layer_attribute_dictionary_table_id_idx ON public.layer_attribute_dictionary (table_id);",
  ],
  [
    "layer_attribute_dictionary_attribute_idx",
    "CREATE INDEX IF NOT EXISTS layer_attribute_dictionary_attribute_idx ON public.layer_attribute_dictionary (attribute_name);",
  ],
  [
    "layer_permission_theme_id_idx",
    "CREATE INDEX IF NOT EXISTS layer_permission_theme_id_idx ON public.layer_permission (theme_id);",
  ],
  [
    "layer_permission_field_id_idx",
    "CREATE INDEX IF NOT EXISTS layer_permission_field_id_idx ON public.layer_permission (field_id);",
  ],
  [
    "map_group_parent_map_id_idx",
    "CREATE INDEX IF NOT EXISTS map_group_parent_map_id_idx ON public.map_group USING btree (parent_map_id);",
  ],
  [
    "user_access_log_user_id_idx",
    "CREATE INDEX IF NOT EXISTS user_access_log_user_id_idx ON public.user_access_log (user_id);",
  ],
  [
    "form_config_theme_id_idx",
    "CREATE INDEX IF NOT EXISTS form_config_theme_id_idx ON public.form_config (theme_id);",
  ],
  [
    "feature_flag_feature_name_idx",
    "CREATE INDEX IF NOT EXISTS feature_flag_feature_name_idx ON public.feature_flag (feature_name);",
  ],
  [
    "token_blacklist_token_idx",
    'CREATE INDEX IF NOT EXISTS token_blacklist_token_idx ON public.token_blacklist ("token");',
  ],
  [
    "profile_features_feature_id_idx",
    "CREATE INDEX IF NOT EXISTS profile_features_feature_id_idx ON public.profile_features (feature_id);",
  ],
  [
    "profile_features_profile_id_idx",
    "CREATE INDEX IF NOT EXISTS profile_features_profile_id_idx ON public.profile_features (profile_id);",
  ],
  [
    "theme_context_id_idx",
    "CREATE INDEX IF NOT EXISTS theme_context_id_idx ON public.theme (context_id);",
  ],
  ["theme_source_group_id_idx", "CREATE INDEX IF NOT EXISTS theme_source_group_id_idx ON public.theme (source_group_id);"],
  ["theme_table_id_idx", "CREATE INDEX IF NOT EXISTS theme_table_id_idx ON public.theme (table_id);"],
  ["theme_profile_id_idx", "CREATE INDEX IF NOT EXISTS theme_profile_id_idx ON public.theme (profile_id);"],
  [
    "document_table_hash_name_idx",
    "CREATE INDEX IF NOT EXISTS document_table_hash_name_idx ON public.document_table (hash_name);",
  ],
  [
    "action_button_theme_id_idx",
    "CREATE INDEX IF NOT EXISTS action_button_theme_id_idx ON public.action_button (theme_id);",
  ],
  [
    "user_profile_profile_id_idx",
    "CREATE INDEX IF NOT EXISTS user_profile_profile_id_idx ON public.user_profile (profile_id);",
  ],
  [
    "user_profile_user_id_idx",
    "CREATE INDEX IF NOT EXISTS user_profile_user_id_idx ON public.user_profile (user_id);",
  ],
];

const SPATIAL_SQL = `
SELECT
    n.nspname AS schema,
    c.relname AS table_name,
    a.attname AS column_name,
    'CREATE INDEX ON "' || n.nspname || '"."' || c.relname || '" USING gist(' || a.attname || ');' AS ddl
FROM pg_attribute a
JOIN pg_class c ON a.attrelid = c.oid
JOIN pg_type t ON a.atttypid = t.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
LEFT JOIN pg_index i ON c.oid = i.indrelid AND a.attnum = ANY(i.indkey)
WHERE t.typname = 'geometry'
  AND c.relkind = 'r'
  AND i.indrelid IS NULL
ORDER BY n.nspname, c.relname
`;

const CHECK_INDEX_SQL = (name: string): string => `
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND indexname = '${name}'
`;

/** R8: Tables with a geometry column but no GIST index. */
export class RuleSpatialIndexes extends Rule {
  readonly ruleId = "R8";
  readonly name = "Missing spatial indexes";

  async run(db: Db, city: string): Promise<RuleResult> {
    let rows: Row[];
    try {
      rows = await db.execute(city, SPATIAL_SQL);
    } catch (e) {
      return this.skip(`Error querying pg_attribute: ${errMsg(e)}`);
    }
    if (rows.length === 0) {
      return this.ok("All tables with geometry have a GIST index.");
    }
    let details = `${String(rows.length)} table(s) without a spatial index:\n`;
    details += rows
      .map((r) => `  ${safeStr(r.schema)}.${safeStr(r.table_name)} (${safeStr(r.column_name)})`)
      .join("\n");
    const fix = rows
      .map((r) => toStr(r.ddl))
      .filter((ddl) => ddl)
      .join("\n");
    return this.fail(details, [fix]);
  }
}

/** R9: Checks whether the playbook's extra indexes exist. */
export class RuleAdditionalIndexes extends Rule {
  readonly ruleId = "R9";
  readonly name = "Playbook's additional indexes";

  async run(db: Db, city: string): Promise<RuleResult> {
    const missing: string[] = [];
    for (const [idxName, ddl] of ADDITIONAL_INDEXES) {
      try {
        const rows = await db.execute(city, CHECK_INDEX_SQL(idxName));
        if (rows.length === 0) {
          missing.push(ddl);
        }
      } catch {
        missing.push(`-- Could not verify: ${idxName}`);
      }
    }
    if (missing.length === 0) {
      return this.ok("All of the playbook's additional indexes are present.");
    }
    const details = `${String(missing.length)} index(es) missing.`;
    const fix = missing.join("\n");
    return this.fail(details, [fix]);
  }
}
