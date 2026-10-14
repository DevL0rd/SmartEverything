import { z } from 'zod';
import {
  HARNESS_ARTIFACT_INTEGRITY,
  HARNESS_DESIRED_ENTRY,
  HARNESS_SKILL_ASSET,
} from './ai-harness-configuration';

export const HARNESS_SKILL_IMPORT_FORMATS = [
  'immutable-github-skill-v1',
  'immutable-json-skill-bundle-v1',
] as const;
export const HARNESS_SKILL_SOURCE_URL = z
  .url({ protocol: /^https$/ })
  .max(4096)
  .refine(
    immutableGithubSkillUrl,
    'Expected a public raw GitHub skill URL pinned to a full commit.',
  );
export const HARNESS_SKILL_RESOLVE = z.strictObject({
  url: HARNESS_SKILL_SOURCE_URL,
  integrity: HARNESS_ARTIFACT_INTEGRITY.optional(),
});
export const HARNESS_SKILL_PRESENTATION = z.strictObject({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  publisher: z.string().min(1).max(200),
});
export type HarnessSkillPresentation = z.infer<typeof HARNESS_SKILL_PRESENTATION>;
export const HARNESS_EXTENSION_ITEM = z.object({
  id: z.string().min(1).max(400),
  kind: z.enum(['extension', 'skill']),
  included: z.boolean(),
  ...HARNESS_SKILL_PRESENTATION.shape,
  capabilities: z.array(z.string().min(1).max(1000)).max(30),
  requirements: z.array(z.string().min(1).max(1000)).max(30),
  runtimes: z.array(z.literal('smarteverything')).max(1),
  platforms: z.array(z.enum(['linux', 'macos', 'windows', 'android'])).max(4),
  selection: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('entry'), entry: HARNESS_DESIRED_ENTRY }),
    z.object({
      kind: z.literal('skill_asset'),
      parent_id: z.literal('skills'),
      asset: HARNESS_SKILL_ASSET,
    }),
  ]),
  acquisition: z.discriminatedUnion('state', [
    z.object({
      state: z.literal('available'),
      format: z.enum(['builtin', ...HARNESS_SKILL_IMPORT_FORMATS]),
    }),
    z.object({ state: z.literal('unsupported'), reason: z.string().min(1).max(2000) }),
  ]),
});
export type HarnessExtensionItem = z.infer<typeof HARNESS_EXTENSION_ITEM>;
export type HarnessSkillResolve = z.infer<typeof HARNESS_SKILL_RESOLVE>;
export const HARNESS_BUNDLED_SKILL = z.object({
  id: z.string().regex(/^smarteverything-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  kind: z.literal('bundled_skill'),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  publisher: z.literal('SmartEverything'),
  revision: z.string().regex(/^[a-f0-9]{64}$/u),
  content: z.string().min(1).max(100_000),
});
export const AI_HARNESS_EXTENSIONS = z.object({
  items: z.array(HARNESS_EXTENSION_ITEM).max(1200),
  bundled_skills: z.array(HARNESS_BUNDLED_SKILL).max(32).optional(),
  import_formats: z.array(z.enum(HARNESS_SKILL_IMPORT_FORMATS)).max(2),
});
export type AiHarnessExtensions = z.infer<typeof AI_HARNESS_EXTENSIONS>;
export const HARNESS_CONFIGURATION_NOTICE_CAPABILITY = 'ai-harness-configuration-notices-v1';
export const AI_HARNESS_CONFIGURATION_NOTICE = z.object({
  type: z.literal('ai_harness_configuration'),
  reason: z.enum(['desired', 'report', 'host']),
  revision: z.string().min(1).max(200),
});
export type AiHarnessConfigurationNotice = z.infer<typeof AI_HARNESS_CONFIGURATION_NOTICE>;

function immutableGithubSkillUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    url.hostname === 'raw.githubusercontent.com' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[a-f0-9]{40}\/(?:[A-Za-z0-9_.-]+\/)*(?:SKILL\.md|[A-Za-z0-9_.-]+\.json)$/.test(
      url.pathname,
    ) &&
    url.pathname.split('/').every((part) => part !== '.' && part !== '..')
  );
}
