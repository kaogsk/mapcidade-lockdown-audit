import {
  RuleWmsSingleTile,
  RuleXyzTiled,
  RuleOsmTiled,
  RulePriorityNotNull,
  RuleExternalUrls,
} from "./layerSource.js";
import { RuleZoomParcelBuilding, RuleZoomStreetBlock } from "./scales.js";
import { RuleSpatialIndexes, RuleAdditionalIndexes } from "./indexes.js";
import { RuleInvalidGeometries } from "./geometry.js";
import type { Rule } from "./base.js";

export const ALL_RULES: Rule[] = [
  new RuleWmsSingleTile(),
  new RuleXyzTiled(),
  new RuleOsmTiled(),
  new RulePriorityNotNull(),
  new RuleExternalUrls(),
  new RuleZoomParcelBuilding(),
  new RuleZoomStreetBlock(),
  new RuleSpatialIndexes(),
  new RuleAdditionalIndexes(),
  new RuleInvalidGeometries(),
];

export * from "./base.js";
