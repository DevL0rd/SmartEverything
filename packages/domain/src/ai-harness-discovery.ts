import { z } from 'zod';
import { HARNESS_EXTENSION_SOURCE_REQUEST } from './ai-harness-extensions';

export const HARNESS_DISCOVERY_REQUEST = z.strictObject({
  kind: z.enum(['skill', 'extension']),
  query: z.string().trim().default(''),
  page: z.int().min(1).default(1),
  page_size: z.int().min(1).default(20),
  source: HARNESS_EXTENSION_SOURCE_REQUEST.optional(),
  refresh: z.boolean().default(false),
});
export type HarnessDiscoveryRequest = z.infer<typeof HARNESS_DISCOVERY_REQUEST>;
export const HARNESS_DISCOVERY_ITEM = z.object({
  id: z.string().min(1),
  kind: z.enum(['skill', 'extension']),
  name: z.string().min(1),
  description: z.string().min(1),
  publisher: z.string().min(1),
  license: z.string().min(1).nullable(),
  source_url: z.string().min(1),
  installed_id: z.string().min(1).nullable(),
  install: z.strictObject({
    source: HARNESS_EXTENSION_SOURCE_REQUEST,
    select: z.array(z.string().min(1)),
  }),
});
export type HarnessDiscoveryItem = z.infer<typeof HARNESS_DISCOVERY_ITEM>;
export const HARNESS_DISCOVERY_PAGE = z.object({
  source: z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    url: z.string().min(1),
  }),
  snapshot: z.string().min(1),
  fetched_at: z.iso.datetime({ offset: true }),
  items: z.array(HARNESS_DISCOVERY_ITEM),
  total: z.int().nonnegative(),
  next_page: z.int().min(1).nullable(),
});
export type HarnessDiscoveryPage = z.infer<typeof HARNESS_DISCOVERY_PAGE>;
export const HARNESS_SKILL_UPDATES = z.object({ automatic: z.boolean().default(true) });
export const HARNESS_SKILL_UPDATES_WRITE = z.strictObject({ automatic: z.boolean() });
export type HarnessSkillUpdates = z.infer<typeof HARNESS_SKILL_UPDATES>;
export const HARNESS_SKILL_UPDATE_RESULT = z.object({
  updated: z.int().nonnegative(),
  unchanged: z.int().nonnegative(),
  skipped: z.int().nonnegative(),
  revision: z.string().min(1),
});
export type HarnessSkillUpdateResult = z.infer<typeof HARNESS_SKILL_UPDATE_RESULT>;
