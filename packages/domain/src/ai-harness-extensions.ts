import { z } from 'zod';
import { JSON_VALUE } from './values';

export const HARNESS_EXTENSION_NAME = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
export const HARNESS_RELATIVE_PATH = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.includes('\\') &&
      !value.includes('\0') &&
      value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
    'Expected a relative path inside the folder.',
  );

export const HARNESS_SKILL_PRESENTATION = z.strictObject({
  name: z.string().min(1),
  description: z.string().min(1),
  publisher: z.string().min(1),
});

export const HARNESS_EXTENSION_SOURCE = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('included') }),
  z.strictObject({
    kind: z.literal('git'),
    url: z.string().min(1),
    ref: z.string().min(1).nullable(),
    path: HARNESS_RELATIVE_PATH.nullable(),
    commit: z
      .string()
      .regex(/^[a-f0-9]{40}$/u)
      .nullable(),
  }),
  z.strictObject({ kind: z.literal('editor') }),
]);

export const HARNESS_EXTENSION_ITEM = z.object({
  id: z.string().min(1),
  kind: z.enum(['builtin', 'skill', 'plugin']),
  ...HARNESS_SKILL_PRESENTATION.shape,
  license: z.string().min(1).nullable(),
  capabilities: z.array(z.string().min(1)),
  requirements: z.array(z.string().min(1)),
  platforms: z.array(z.enum(['linux', 'macos', 'windows', 'android'])),
  enabled: z.boolean(),
  config: z.record(z.string(), JSON_VALUE),
  source: HARNESS_EXTENSION_SOURCE,
  version: z.string().min(1).nullable(),
  executes: z.boolean(),
  confirmed: z.boolean(),
});
export type HarnessExtensionItem = z.infer<typeof HARNESS_EXTENSION_ITEM>;

export const HARNESS_BUNDLED_SKILL = z.object({
  id: z.string().regex(/^smarteverything-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  kind: z.literal('bundled_skill'),
  name: z.string().min(1),
  description: z.string().min(1),
  publisher: z.literal('SmartEverything'),
  revision: z.string().regex(/^[a-f0-9]{64}$/u),
  content: z.string().min(1),
});
export const AI_HARNESS_EXTENSIONS = z.object({
  items: z.array(HARNESS_EXTENSION_ITEM),
  bundled_skills: z.array(HARNESS_BUNDLED_SKILL).optional(),
});
export type AiHarnessExtensions = z.infer<typeof AI_HARNESS_EXTENSIONS>;

export const HARNESS_EXTENSION_SOURCE_REQUEST = z.strictObject({
  url: z.string().min(1),
  ref: z.string().min(1).optional(),
  path: HARNESS_RELATIVE_PATH.optional(),
});
export type HarnessExtensionSourceRequest = z.infer<typeof HARNESS_EXTENSION_SOURCE_REQUEST>;
export const HARNESS_EXTENSION_CANDIDATE = z.object({
  kind: z.enum(['skill', 'plugin']),
  name: HARNESS_EXTENSION_NAME,
  description: z.string().min(1),
  path: z.string(),
  license: z.string().min(1).nullable(),
  executes: z.boolean(),
  source: HARNESS_EXTENSION_SOURCE_REQUEST.optional(),
});
export type HarnessExtensionCandidate = z.infer<typeof HARNESS_EXTENSION_CANDIDATE>;
export const HARNESS_EXTENSION_RESOLUTION = z.object({
  url: z.string().min(1),
  ref: z.string().min(1).nullable(),
  commit: z.string().regex(/^[a-f0-9]{40}$/u),
  candidates: z.array(HARNESS_EXTENSION_CANDIDATE),
});
export type HarnessExtensionResolution = z.infer<typeof HARNESS_EXTENSION_RESOLUTION>;
export const HARNESS_EXTENSION_INSTALL = z.strictObject({
  source: HARNESS_EXTENSION_SOURCE_REQUEST,
  select: z.array(HARNESS_EXTENSION_NAME).optional(),
  confirm_executes: z.boolean().default(false),
});
export const HARNESS_EXTENSION_PATCH = z.strictObject({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), JSON_VALUE).optional(),
  confirm_executes: z.boolean().optional(),
});
export type HarnessExtensionPatch = z.infer<typeof HARNESS_EXTENSION_PATCH>;
export const HARNESS_SKILL_FILES = z.strictObject({
  files: z
    .array(z.strictObject({ path: HARNESS_RELATIVE_PATH, content: z.string() }))
    .min(1)
    .refine(
      (files) => files.some((file) => file.path === 'SKILL.md'),
      'A skill needs a SKILL.md file.',
    ),
});

export const HARNESS_EXTENSION_TREE = z.object({
  files: z.array(
    z.object({
      path: HARNESS_RELATIVE_PATH,
      base64: z.string(),
      executable: z.boolean().optional(),
    }),
  ),
});
export type HarnessExtensionTree = z.infer<typeof HARNESS_EXTENSION_TREE>;

export const AI_HARNESS_CONFIGURATION_NOTICE = z.object({
  type: z.literal('ai_harness_configuration'),
  reason: z.enum(['desired', 'report', 'host']),
  revision: z.string().min(1),
});
export type AiHarnessConfigurationNotice = z.infer<typeof AI_HARNESS_CONFIGURATION_NOTICE>;
