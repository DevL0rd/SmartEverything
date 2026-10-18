import { z } from 'zod';

export const AI_PROJECT_BYTES_MAX = 25 * 1024 * 1024;
export const AI_PROJECT_CHUNK_BYTES = 256 * 1024;
export const AI_PROJECT_PATH = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (path) =>
      /^(workspace|temporary)(\/|$)/u.test(path) &&
      !path.includes('\\') &&
      !path.includes('\0') &&
      !path.includes('%') &&
      !path.split('/').some((part) => part === '.' || part === '..' || part === ''),
    'Use a plain relative path below workspace or temporary.',
  );
const PATH = { path: AI_PROJECT_PATH };
const VERSION = z.string().min(1).max(300);
const GUARD = { version: VERSION.nullable() };
export const AI_PROJECT_READ = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('stat'), ...PATH }),
  z.strictObject({
    operation: z.literal('list'),
    ...PATH,
    limit: z.int().min(1).max(1000).default(200),
  }),
  z.strictObject({
    operation: z.literal('read'),
    ...PATH,
    offset: z.int().nonnegative().default(0),
    length: z.int().min(1).max(AI_PROJECT_CHUNK_BYTES).default(AI_PROJECT_CHUNK_BYTES),
    encoding: z.enum(['utf8', 'base64']).default('utf8'),
  }),
  z.strictObject({
    operation: z.literal('search'),
    ...PATH,
    text: z.string().min(1).max(500),
    limit: z.int().min(1).max(200).default(50),
  }),
]);
export const AI_PROJECT_WRITE = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal('write'),
    ...PATH,
    ...GUARD,
    content: z.string().max(AI_PROJECT_BYTES_MAX * 2),
    encoding: z.enum(['utf8', 'base64']).default('utf8'),
  }),
  z.strictObject({
    operation: z.literal('edit'),
    ...PATH,
    version: VERSION,
    old_string: z.string().min(1).max(AI_PROJECT_BYTES_MAX),
    new_string: z.string().max(AI_PROJECT_BYTES_MAX),
    replace_all: z.boolean().default(false),
  }),
  z.strictObject({ operation: z.literal('mkdir'), ...PATH }),
  z.strictObject({
    operation: z.literal('move'),
    ...PATH,
    ...GUARD,
    destination: AI_PROJECT_PATH,
  }),
]);
export const AI_PROJECT_REMOVE = z.strictObject({
  operation: z.literal('remove'),
  ...PATH,
  ...GUARD,
  recursive: z.boolean().default(false),
});
export const AI_PROJECT_REQUEST = z.union([AI_PROJECT_READ, AI_PROJECT_WRITE, AI_PROJECT_REMOVE]);
export const AI_PROJECT_FILE = z.object({
  path: AI_PROJECT_PATH,
  type: z.enum(['file', 'directory']),
  version: VERSION,
  bytes: z.int().nonnegative(),
});
export const AI_PROJECT_RESULT = z.object({
  operation: z.enum(['stat', 'list', 'read', 'search', 'write', 'edit', 'mkdir', 'move', 'remove']),
  path: AI_PROJECT_PATH,
  file: AI_PROJECT_FILE.nullable().optional(),
  entries: z.array(AI_PROJECT_FILE).optional(),
  content: z.string().optional(),
  encoding: z.enum(['utf8', 'base64']).optional(),
  offset: z.int().nonnegative().optional(),
  next_offset: z.int().nonnegative().nullable().optional(),
  diff: z
    .object({
      before: z.string().nullable(),
      after: z.string(),
      truncated: z.boolean(),
      start_line: z.int().positive().optional(),
      language: z.string(),
      version: VERSION,
    })
    .optional(),
  before: z.string().nullable().optional(),
  after: z.string().optional(),
  hits: z
    .array(z.object({ path: AI_PROJECT_PATH, line: z.int().positive(), text: z.string() }))
    .optional(),
  truncated: z.boolean().optional(),
});
export type AiProjectRequest = z.output<typeof AI_PROJECT_REQUEST>;
export type AiProjectResult = z.output<typeof AI_PROJECT_RESULT>;
export type AiProjectFile = z.output<typeof AI_PROJECT_FILE>;
