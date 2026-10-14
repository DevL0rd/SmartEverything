import { z } from 'zod';

export const HARNESS_DISCOVERY_REQUEST = z.strictObject({
  kind: z.enum(['skill', 'extension']),
  query: z.string().trim().max(200).default(''),
  page: z.int().min(1).max(1000).default(1),
  page_size: z.int().min(1).max(50).default(20),
  snapshot: z.string().min(1).max(200).optional(),
  refresh: z.boolean().default(false),
});
export type HarnessDiscoveryRequest = z.infer<typeof HARNESS_DISCOVERY_REQUEST>;
export const HARNESS_DISCOVERY_ITEM = z.object({
  id: z.string().min(1).max(400),
  kind: z.enum(['skill', 'extension']),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  publisher: z.string().min(1).max(200),
  license: z.string().min(1).max(200).nullable(),
  source_url: z.url({ protocol: /^https$/ }).max(4096),
  installed_id: z.string().min(1).max(400).nullable(),
  acquisition: z.discriminatedUnion('state', [
    z.object({ state: z.literal('available'), url: z.url({ protocol: /^https$/ }).max(4096) }),
    z.object({ state: z.literal('unsupported'), reason: z.string().min(1).max(2000) }),
  ]),
});
export type HarnessDiscoveryItem = z.infer<typeof HARNESS_DISCOVERY_ITEM>;
export const HARNESS_DISCOVERY_PAGE = z.object({
  source: z.object({
    id: z.string().min(1).max(200),
    label: z.string().min(1).max(200),
    url: z.url(),
  }),
  snapshot: z.string().min(1).max(200),
  fetched_at: z.iso.datetime({ offset: true }),
  stale: z.boolean(),
  warning: z.string().min(1).max(2000).optional(),
  items: z.array(HARNESS_DISCOVERY_ITEM).max(50),
  total: z.int().nonnegative(),
  next_page: z.int().min(1).max(1000).nullable(),
});
export type HarnessDiscoveryPage = z.infer<typeof HARNESS_DISCOVERY_PAGE>;
export const HARNESS_SKILL_UPDATES = z.object({ automatic: z.boolean().default(true) });
export const HARNESS_SKILL_UPDATES_WRITE = z.strictObject({ automatic: z.boolean() });
export type HarnessSkillUpdates = z.infer<typeof HARNESS_SKILL_UPDATES>;
export const HARNESS_SKILL_UPDATE_RESULT = z.object({
  updated: z.int().nonnegative(),
  unchanged: z.int().nonnegative(),
  skipped: z.int().nonnegative(),
  revision: z.string().min(1).max(200),
});
export type HarnessSkillUpdateResult = z.infer<typeof HARNESS_SKILL_UPDATE_RESULT>;
