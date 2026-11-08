import { z } from 'zod';
import { API_ERROR_CODES } from './api/errors';
import {
  HARNESS_EXTENSION_ITEM,
  HARNESS_EXTENSION_SOURCE_REQUEST,
  HARNESS_GIT_ORIGIN,
} from './ai-harness-extensions';
import { JSON_VALUE } from './values';

const COMMIT = z.string().regex(/^[a-f0-9]{40}$/u);
export const HARNESS_DISCOVERY_KIND = z.enum(['skill', 'plugin']);
export type HarnessDiscoveryKind = z.infer<typeof HARNESS_DISCOVERY_KIND>;

export const HARNESS_DISCOVERY_REQUEST = z.strictObject({
  kind: HARNESS_DISCOVERY_KIND.optional(),
  query: z.string().trim().default(''),
  publisher: z.string().trim().min(1).optional(),
  installed: z.boolean().optional(),
  page: z.int().min(1).default(1),
  page_size: z.int().min(1).default(20),
  source: HARNESS_EXTENSION_SOURCE_REQUEST.optional(),
  snapshot: z.string().optional(),
  refresh: z.boolean().default(false),
});
export type HarnessDiscoveryRequest = z.infer<typeof HARNESS_DISCOVERY_REQUEST>;

export const HARNESS_DISCOVERY_REFERENCE = z.strictObject({
  source: HARNESS_EXTENSION_SOURCE_REQUEST,
  snapshot: COMMIT,
  id: z.string().min(1),
  origin: HARNESS_GIT_ORIGIN.optional(),
});
export type HarnessDiscoveryReference = z.infer<typeof HARNESS_DISCOVERY_REFERENCE>;

export const HARNESS_DISCOVERY_ITEM = z.object({
  id: z.string().min(1),
  kind: HARNESS_DISCOVERY_KIND,
  name: z.string().min(1),
  description: z.string().min(1),
  publisher: z.string().min(1),
  license: z.string().min(1).nullable(),
  source_url: z.string().min(1),
  executes: z.boolean(),
  reference: HARNESS_DISCOVERY_REFERENCE,
  installed_id: z.string().min(1).nullable(),
  installed_version: z.string().min(1).nullable(),
  available_version: z.string().min(1).nullable(),
  update: z.enum(['not_installed', 'current', 'update_available', 'unknown']),
});
export type HarnessDiscoveryItem = z.infer<typeof HARNESS_DISCOVERY_ITEM>;

export const HARNESS_DISCOVERY_SOURCE = z.object({
  source: HARNESS_EXTENSION_SOURCE_REQUEST,
  label: z.string().min(1),
  publisher: z.string().min(1),
  snapshot: COMMIT,
  fetched_at: z.iso.datetime({ offset: true }),
});
export type HarnessDiscoverySource = z.infer<typeof HARNESS_DISCOVERY_SOURCE>;

export const HARNESS_DISCOVERY_PAGE = z.object({
  sources: z.array(HARNESS_DISCOVERY_SOURCE),
  unavailable_sources: z.array(HARNESS_EXTENSION_SOURCE_REQUEST).default([]),
  snapshot: z.string(),
  items: z.array(HARNESS_DISCOVERY_ITEM),
  total: z.int().nonnegative(),
  next_page: z.int().min(1).nullable(),
});
export type HarnessDiscoveryPage = z.infer<typeof HARNESS_DISCOVERY_PAGE>;

export const HARNESS_DISCOVERY_REFERENCES = z.strictObject({
  items: z.array(HARNESS_DISCOVERY_REFERENCE).min(1),
});

const ITEM_FAILURE = z.object({
  reference: HARNESS_DISCOVERY_REFERENCE,
  ok: z.literal(false),
  error: z.object({ code: z.enum(API_ERROR_CODES), message: z.string().min(1) }),
});

export const HARNESS_EXTENSION_PREVIEW = z.object({
  id: z.string().min(1),
  kind: HARNESS_DISCOVERY_KIND,
  name: z.string().min(1),
  description: z.string().min(1),
  license: z.string().min(1).nullable(),
  source_url: z.string().min(1),
  commit: COMMIT,
  version: z.string().min(1),
  manifest: z.record(z.string(), JSON_VALUE),
  files: z.array(
    z.object({ path: z.string().min(1), bytes: z.int().nonnegative(), executable: z.boolean() }),
  ),
  hooks: z.array(
    z.object({
      event: z.string().min(1),
      matcher: z.string().nullable(),
      type: z.string().min(1),
      command: z.string().nullable(),
    }),
  ),
  mcp_servers: z.array(
    z.object({
      name: z.string().min(1),
      transport: z.enum(['stdio', 'http']),
      command: z.string().nullable(),
      args: z.array(z.string()),
      url: z.string().nullable(),
      env: z.array(z.string()),
      headers: z.array(z.string()),
    }),
  ),
  scripts: z.array(z.string().min(1)),
  executes: z.boolean(),
});
export type HarnessExtensionPreview = z.infer<typeof HARNESS_EXTENSION_PREVIEW>;

export const HARNESS_PREVIEW_RESULTS = z.object({
  results: z.array(
    z.discriminatedUnion('ok', [
      z.object({
        reference: HARNESS_DISCOVERY_REFERENCE,
        ok: z.literal(true),
        preview: HARNESS_EXTENSION_PREVIEW,
      }),
      ITEM_FAILURE,
    ]),
  ),
});
export type HarnessPreviewResults = z.infer<typeof HARNESS_PREVIEW_RESULTS>;

export const HARNESS_EXTENSION_INSTALL = HARNESS_DISCOVERY_REFERENCES.extend({
  confirm_executes: z.boolean().default(false),
});
export const HARNESS_INSTALL_RESULTS = z.object({
  results: z.array(
    z.discriminatedUnion('ok', [
      z.object({
        reference: HARNESS_DISCOVERY_REFERENCE,
        ok: z.literal(true),
        item: HARNESS_EXTENSION_ITEM,
      }),
      ITEM_FAILURE,
    ]),
  ),
});
export type HarnessInstallResults = z.infer<typeof HARNESS_INSTALL_RESULTS>;

export const HARNESS_SOURCE_ENTRY = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  source: HARNESS_EXTENSION_SOURCE_REQUEST,
});
export type HarnessSourceEntry = z.infer<typeof HARNESS_SOURCE_ENTRY>;
export const HARNESS_SOURCES = z.object({ sources: z.array(HARNESS_SOURCE_ENTRY) });
export type HarnessSources = z.infer<typeof HARNESS_SOURCES>;
export const HARNESS_SOURCE_ADD = z.strictObject({
  source: HARNESS_EXTENSION_SOURCE_REQUEST,
  label: z.string().trim().min(1).optional(),
});

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
