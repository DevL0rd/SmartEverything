import { z } from 'zod';

export const PLUGIN_OPTION_PAGE_MAX = 50;

export const PLUGIN_OPTION_IDS_MAX = 100;

export const PLUGIN_OPTION = z.strictObject({
  id: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  detail: z.string().max(200).nullable(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  image: z.url({ protocol: /^https$/ }).nullable(),
});

export type PluginOption = z.output<typeof PLUGIN_OPTION>;

export const PLUGIN_OPTION_PAGE = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('ready'),
    options: z.array(PLUGIN_OPTION).max(PLUGIN_OPTION_PAGE_MAX),
    next: z.string().min(1).max(200).nullable(),
  }),
  z.strictObject({ state: z.literal('unavailable'), message: z.string().min(1).max(300) }),
]);

export type PluginOptionPage = z.output<typeof PLUGIN_OPTION_PAGE>;

export const PLUGIN_OPTION_QUERY = z.strictObject({
  q: z.string().trim().max(100).optional(),
  after: z.string().min(1).max(200).optional(),
  ids: z
    .string()
    .max(PLUGIN_OPTION_IDS_MAX * 21)
    .optional(),
});

export type PluginOptionQuery = z.output<typeof PLUGIN_OPTION_QUERY>;
