import { z } from 'zod';
import { PLUGIN_KEY, PLUGIN_TITLE } from './plugin-parts';
import type { JsonValue } from './values';

export const PLUGIN_LIST_ITEMS_MAX = 1000;

export const PLUGIN_LIST_ITEM_LENGTH_MAX = 500;

const SETTING_BASE = {
  title: PLUGIN_TITLE,
  description: z.string().max(300).nullable().default(null),
  humanOnly: z.boolean().default(false),
  live: z.boolean().default(false),
  group: PLUGIN_TITLE.nullable().default(null),
};

function wholeMatch(pattern: string): RegExp {
  return new RegExp(`^(?:${pattern})$`, 'u');
}

function compiles(pattern: string): boolean {
  try {
    wholeMatch(pattern);
    return true;
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      return false;
    }
    throw cause;
  }
}

const LIST_ITEM = z.strictObject({
  pattern: z
    .string()
    .min(1)
    .max(200)
    .refine(compiles, 'a regular expression the whole item must match')
    .nullable()
    .default(null),
  maxLength: z.int().min(1).max(PLUGIN_LIST_ITEM_LENGTH_MAX).default(200),
});

export const PLUGIN_SETTING = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('string'),
    ...SETTING_BASE,
    secret: z.boolean().default(false),
    default: z.string().max(2000).nullable().default(null),
  }),
  z.strictObject({
    type: z.literal('number'),
    ...SETTING_BASE,
    minimum: z.number().nullable().default(null),
    maximum: z.number().nullable().default(null),
    default: z.number().nullable().default(null),
  }),
  z.strictObject({
    type: z.literal('boolean'),
    ...SETTING_BASE,
    default: z.boolean().default(false),
  }),
  z.strictObject({
    type: z.literal('enum'),
    ...SETTING_BASE,
    options: z
      .array(z.strictObject({ value: PLUGIN_KEY, label: PLUGIN_TITLE }))
      .min(1)
      .max(30),
    default: PLUGIN_KEY.nullable().default(null),
  }),
  z.strictObject({
    type: z.literal('list'),
    ...SETTING_BASE,
    item: LIST_ITEM.prefault({}),
    picker: PLUGIN_KEY.nullable().default(null),
    maxItems: z.int().min(1).max(PLUGIN_LIST_ITEMS_MAX).default(100),
    default: z.array(z.string()).max(PLUGIN_LIST_ITEMS_MAX).default([]),
  }),
]);

export type PluginSetting = z.output<typeof PLUGIN_SETTING>;

export type PluginListSetting = Extract<PluginSetting, { readonly type: 'list' }>;

export function listItemProblem(setting: PluginListSetting, item: string): string | null {
  if (item.length === 0 || item.length > setting.item.maxLength) {
    return `Use 1 to ${String(setting.item.maxLength)} characters`;
  }
  const { pattern } = setting.item;
  return pattern === null || wholeMatch(pattern).test(item)
    ? null
    : 'That is not in the expected form';
}

function listFits(setting: PluginListSetting, value: JsonValue): boolean {
  return (
    Array.isArray(value) &&
    value.length <= setting.maxItems &&
    new Set(value).size === value.length &&
    value.every((item) => typeof item === 'string' && listItemProblem(setting, item) === null)
  );
}

function numberFits(
  setting: Extract<PluginSetting, { readonly type: 'number' }>,
  value: JsonValue,
): boolean {
  return (
    typeof value === 'number' &&
    (setting.minimum === null || value >= setting.minimum) &&
    (setting.maximum === null || value <= setting.maximum)
  );
}

export function settingFits(setting: PluginSetting, value: JsonValue): boolean {
  switch (setting.type) {
    case 'string':
      return typeof value === 'string' && value.length <= 2000;
    case 'number':
      return numberFits(setting, value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'enum':
      return setting.options.some((option) => option.value === value);
    case 'list':
      return listFits(setting, value);
  }
}
