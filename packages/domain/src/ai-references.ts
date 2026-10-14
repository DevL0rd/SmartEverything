import { z } from 'zod';
import { AI_PROJECT_PATH } from './ai-project-files';

export const AI_REFERENCE_KINDS = [
  'managed_path',
  'device_path',
  'skill',
  'plugin',
  'chat',
  'command',
  'agent',
] as const;
const IDENTITY = z.string().min(1).max(4096);
const REVISION = z.string().min(1).max(300);
const ENTRY = z.enum(['file', 'directory']);
const DEVICE = z.strictObject({ kind: z.literal('device'), device_id: z.uuid() });
const RELATIVE_PATH = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (path) =>
      !path.includes('\\') &&
      !path.includes('\0') &&
      path.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
    'Expected a plain relative workspace path.',
  );

const MANAGED_PATH_REFERENCE = z.strictObject({
  kind: z.literal('managed_path'),
  chat_id: z.uuid(),
  path: AI_PROJECT_PATH.refine(
    (path) => !path.split('/').includes('.operations'),
    'Operation receipts cannot be referenced.',
  ),
  entry_kind: ENTRY,
  version: REVISION,
});
const DEVICE_PATH_REFERENCE = z.strictObject({
  kind: z.literal('device_path'),
  target: DEVICE,
  workspace_root: IDENTITY,
  path: RELATIVE_PATH,
  entry_kind: ENTRY,
  version: REVISION,
});
export const AI_REFERENCE_DIRECTORY = z.discriminatedUnion('kind', [
  MANAGED_PATH_REFERENCE.extend({ entry_kind: z.literal('directory') }),
  DEVICE_PATH_REFERENCE.extend({ entry_kind: z.literal('directory') }),
]);

export const AI_REFERENCE = z.discriminatedUnion('kind', [
  MANAGED_PATH_REFERENCE,
  DEVICE_PATH_REFERENCE,
  z.strictObject({
    kind: z.literal('skill'),
    name: z.string().min(1).max(200),
    provider: z.string().min(1).max(200),
    source: IDENTITY,
    identity: IDENTITY,
    revision: REVISION,
    resource_base: IDENTITY,
  }),
  z.strictObject({ kind: z.literal('plugin'), asset_id: IDENTITY, revision: REVISION }),
  z.strictObject({ kind: z.literal('chat'), chat_id: z.uuid(), message_id: z.uuid().optional() }),
  z.strictObject({ kind: z.literal('command'), definition_id: IDENTITY, revision: REVISION }),
  z.strictObject({ kind: z.literal('agent'), identity: IDENTITY, revision: REVISION }),
]);
export type AiReference = z.output<typeof AI_REFERENCE>;
export type AiReferenceKind = AiReference['kind'];
export const AI_REFERENCES_MAX = 20;
export const AI_MESSAGE_REFERENCE = z
  .strictObject({
    reference: AI_REFERENCE,
    label: z.string().min(1).max(300),
    token: z.string().min(2).max(500).startsWith('@'),
    start: z.int().nonnegative().max(16_000),
    end: z.int().positive().max(16_000),
  })
  .refine(
    (item) => item.end - item.start === item.token.length,
    'The reference span must match its exact token length.',
  );
export const AI_MESSAGE_REFERENCES = z.array(AI_MESSAGE_REFERENCE).max(AI_REFERENCES_MAX);
export type AiMessageReference = z.output<typeof AI_MESSAGE_REFERENCE>;

export function referencesMatchText(text: string, refs: readonly AiMessageReference[]): boolean {
  const ordered = [...refs].sort((left, right) => left.start - right.start);
  return ordered.every(
    (item, index) =>
      text.slice(item.start, item.end) === item.token &&
      (index === 0 || (ordered[index - 1]?.end ?? 0) <= item.start),
  );
}

export const AI_REFERENCE_SEARCH = z
  .strictObject({
    query: z.string().max(200).default(''),
    container: AI_REFERENCE_DIRECTORY.optional(),
    kinds: z
      .array(z.enum(AI_REFERENCE_KINDS))
      .min(1)
      .max(AI_REFERENCE_KINDS.length)
      .refine((kinds) => new Set(kinds).size === kinds.length, 'Reference kinds must be unique.')
      .optional(),
    directory: AI_PROJECT_PATH.refine(
      (path) => !path.split('/').includes('.operations'),
      'Operation receipts cannot be searched.',
    ).optional(),
    limit: z.int().min(1).max(50).default(20),
    cursor: z.uuid().optional(),
  })
  .refine(
    (request) => request.directory === undefined || request.container === undefined,
    'Use one exact directory container or one managed directory path.',
  );
export type AiReferenceSearch = z.output<typeof AI_REFERENCE_SEARCH>;
export const AI_REFERENCE_SUMMARY = z.object({
  reference: AI_REFERENCE,
  label: z.string().min(1).max(300),
  subtitle: z.string().max(4096),
  description: z.string().max(1000).optional(),
});
export type AiReferenceSummary = z.output<typeof AI_REFERENCE_SUMMARY>;
export const AI_REFERENCE_SOURCE_STATUS = z
  .object({
    kind: z.enum(AI_REFERENCE_KINDS),
    state: z.enum(['available', 'unavailable']),
    reason: z.string().min(1).max(1000).optional(),
  })
  .refine(
    (source) => source.state === 'available' || source.reason !== undefined,
    'Unavailable reference sources must explain why.',
  );
export type AiReferenceSourceStatus = z.output<typeof AI_REFERENCE_SOURCE_STATUS>;
export const AI_REFERENCE_SEARCH_RESULT = z.object({
  items: z.array(AI_REFERENCE_SUMMARY).max(50),
  sources: z.array(AI_REFERENCE_SOURCE_STATUS).max(AI_REFERENCE_KINDS.length),
  next_cursor: z.uuid().nullable(),
  incomplete: z.boolean(),
});
export type AiReferenceSearchResult = z.output<typeof AI_REFERENCE_SEARCH_RESULT>;
