import { z } from 'zod';
import { ACTION_MODE } from './automation-v3/policy';
import { FLOW_TYPE } from './automation-v3/types';
import { NODE_CATEGORY_IDS } from './automation-nodes/categories';
import {
  EFFECT_BUDGET_CLASSES,
  EFFECT_RETRY_CLASSES,
  NODE_ACCESS,
  NODE_CLASSES,
  NODE_ORIGIN_KINDS,
  NODE_TIERS,
  type NodeKind,
} from './automation-nodes/define';
import { OPTION_SOURCE_IDS, PORT_EDITORS } from './automation-nodes/option-sources';
import { JSON_VALUE } from './values';

export const PLUGIN_KIND_STATUSES = ['active', 'off', 'retired'] as const;

export type PluginKindStatus = (typeof PLUGIN_KIND_STATUSES)[number];

const TEXT = z.string().min(1);

const PORT_UI = z.strictObject({
  label: TEXT.optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  unit: TEXT.optional(),
  options: z.array(z.strictObject({ id: TEXT, label: TEXT })).optional(),
  optionsFrom: z.enum(OPTION_SOURCE_IDS).optional(),
  editor: z.enum(PORT_EDITORS).optional(),
  typedBy: TEXT.optional(),
  multiple: z.boolean().optional(),
});

const INPUT_PORT_DECL = z.strictObject({
  name: TEXT,
  type: FLOW_TYPE,
  required: z.boolean(),
  default: JSON_VALUE.optional(),
  static: z.boolean().optional(),
  live: z.boolean().optional(),
  description: z.string(),
  summary: z.boolean().optional(),
  ui: PORT_UI.optional(),
});

const OUTPUT_PORT_DECL = z.strictObject({
  name: TEXT,
  type: FLOW_TYPE,
  optional: z.boolean().optional(),
  waitOnly: z.boolean().optional(),
  description: z.string(),
});

const NODE_KIND_SHAPE = z.strictObject({
  id: TEXT,
  name: TEXT,
  category: z.enum(NODE_CATEGORY_IDS),
  icon: TEXT,
  class: z.enum(NODE_CLASSES),
  description: z.string(),
  inputs: z.array(INPUT_PORT_DECL),
  outputs: z.array(OUTPUT_PORT_DECL),
  exits: z.array(TEXT),
  scopes: z
    .strictObject({
      required: z.array(TEXT),
      optional: z.array(TEXT),
      minimum: z.int().optional(),
    })
    .optional(),
  effect: z
    .strictObject({
      retry: z.enum(EFFECT_RETRY_CLASSES),
      budget: z.enum(EFFECT_BUDGET_CLASSES),
      mode: ACTION_MODE.optional(),
      timeout: z.number().optional(),
    })
    .optional(),
  stateful: z.boolean().optional(),
  summary: z.string(),
  keywords: z.array(z.string()),
  capture: z.literal('at-step').optional(),
  structural: z.boolean().optional(),
  fallible: z.boolean().optional(),
  modes: z.strictObject({ default: ACTION_MODE, allowed: z.array(ACTION_MODE) }).optional(),
  origin: z
    .strictObject({
      kind: z.enum(NODE_ORIGIN_KINDS),
      id: TEXT,
      name: TEXT,
      icon: TEXT,
      version: TEXT,
    })
    .optional(),
  version: z.int().min(1).optional(),
  replacedBy: TEXT.optional(),
  hidden: z.boolean().optional(),
  access: z.enum(NODE_ACCESS),
  tier: z.enum(NODE_TIERS),
});

export const PLUGIN_KIND_DECLARATION = z.custom<NodeKind>(
  (value) => NODE_KIND_SHAPE.safeParse(value).success,
  'a stored plugin node kind',
);

export const PLUGIN_KIND_OWNER = z.string().regex(/^(plugin|driver):.+$/);

export const AUTOMATION_PLUGIN_KIND_ROW = z.strictObject({
  kind_id: TEXT,
  owner: PLUGIN_KIND_OWNER,
  version: TEXT,
  interface_hash: z.string().regex(/^[0-9a-f]{64}$/),
  declaration: PLUGIN_KIND_DECLARATION,
  status: z.enum(PLUGIN_KIND_STATUSES),
  updated: z.iso.datetime({ offset: true }),
});

export type AutomationPluginKindRow = z.output<typeof AUTOMATION_PLUGIN_KIND_ROW>;
