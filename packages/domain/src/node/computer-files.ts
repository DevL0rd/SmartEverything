import { z } from 'zod';

export const FILE_KINDS = ['folder', 'file', 'link', 'other'] as const;

export const FILE_PAGE_SIZE = 500;

export const FILE_INLINE_LIMIT_BYTES = 5 * 1024 * 1024;

export const FILE_CHUNK_BYTES = 4 * 1024 * 1024;

export const LIST_CURSOR = z.coerce.number().int().min(0).default(0);

const ABSOLUTE_PATH = /^(\/|[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/;

export const FILE_PATH = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .regex(ABSOLUTE_PATH, 'must be an absolute POSIX, drive or network path');

export const FILE_ENTRY = z.strictObject({
  name: z.string().min(1),
  path: FILE_PATH,
  kind: z.enum(FILE_KINDS),
  size: z.number().nonnegative(),
  modifiedAt: z.iso.datetime({ offset: true }),
  hidden: z.boolean(),
});

export type FileEntry = z.infer<typeof FILE_ENTRY>;

export const FILE_LIST = z.strictObject({
  path: FILE_PATH,
  parent: FILE_PATH.nullable(),
  entries: z.array(FILE_ENTRY),
  total: z.int().nonnegative(),
  next: z.int().nonnegative().nullable(),
});

export type FileList = z.infer<typeof FILE_LIST>;

export const FILE_CONTENT = z.strictObject({
  name: z.string().min(1),
  path: FILE_PATH,
  size: z.number().nonnegative(),
  mimeType: z.string().min(1),
  encoding: z.enum(['text', 'base64']),
  content: z.string(),
});

export type FileContent = z.infer<typeof FILE_CONTENT>;

export const FILE_RANGE = z.strictObject({
  name: z.string().min(1),
  size: z.number().nonnegative(),
  mimeType: z.string().min(1),
  data: z.base64(),
});

export type FileRange = z.infer<typeof FILE_RANGE>;

export const FILE_PERMISSIONS = z.strictObject({
  readable: z.boolean(),
  writable: z.boolean(),
  mode: z.int().min(0).max(0o7777),
});

export const FILE_PROPERTIES = z.strictObject({
  name: z.string().min(1),
  path: FILE_PATH,
  kind: z.enum(FILE_KINDS),
  size: z.number().nonnegative(),
  mimeType: z.string().min(1).nullable(),
  modifiedAt: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }).nullable(),
  owner: z.string().min(1),
  group: z.string().min(1),
  permissions: FILE_PERMISSIONS,
  linkTarget: z.string().min(1).nullable(),
});

export type FileProperties = z.infer<typeof FILE_PROPERTIES>;

export const FILE_SEARCH_QUERY = z.strictObject({
  path: FILE_PATH,
  text: z.string().trim().min(1).max(200),
  cursor: z.string().min(1).nullable(),
});

export type FileSearchQuery = z.infer<typeof FILE_SEARCH_QUERY>;

export const FILE_SEARCH_RESULT = z.strictObject({
  path: FILE_PATH,
  matches: z.array(FILE_ENTRY),
  scanned: z.int().nonnegative(),
  next: z.string().min(1).nullable(),
});

export type FileSearchResult = z.infer<typeof FILE_SEARCH_RESULT>;

const PATHS = z.array(FILE_PATH).min(1);

export const FILE_WRITE_CHANGE = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('new_folder'), path: FILE_PATH }),
  z.strictObject({
    action: z.literal('rename'),
    path: FILE_PATH,
    name: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((name) => !name.includes('/'), {
        message: 'a name has no slash',
      }),
  }),
  z.strictObject({
    action: z.literal('move'),
    paths: PATHS,
    to: FILE_PATH,
    replace: z.boolean().default(false),
  }),
  z.strictObject({
    action: z.literal('copy'),
    paths: PATHS,
    to: FILE_PATH,
    replace: z.boolean().default(false),
  }),
  z.strictObject({ action: z.literal('trash'), paths: PATHS }),
  z.strictObject({
    action: z.literal('restore'),
    items: z.array(z.string().min(1)).min(1).describe('trashId values returned by trash'),
  }),
]);

export type FileWriteChange = z.infer<typeof FILE_WRITE_CHANGE>;

export const FILE_WRITE_RESULT = z.strictObject({
  done: z.array(
    z.strictObject({
      path: FILE_PATH,
      newPath: FILE_PATH.nullable(),
      trashId: z.string().min(1).nullable(),
    }),
  ),
  failed: z.array(z.strictObject({ path: z.string().min(1), reason: z.string().min(1) })),
});

export type FileWriteResult = z.infer<typeof FILE_WRITE_RESULT>;

export const FILE_UPLOAD_CHUNK = z.strictObject({
  path: FILE_PATH,
  start: z.int().nonnegative(),
  data: z.base64().max(Math.ceil(FILE_CHUNK_BYTES / 3) * 4),
  final: z.boolean(),
  replace: z.boolean().default(false),
});

export type FileUploadChunk = z.infer<typeof FILE_UPLOAD_CHUNK>;

export const FILE_UPLOAD_RESULT = z.strictObject({
  path: FILE_PATH,
  size: z.number().nonnegative(),
  complete: z.boolean(),
});

export type FileUploadResult = z.infer<typeof FILE_UPLOAD_RESULT>;

export const FILE_TOOL_UPLOAD = z.strictObject({
  action: z.literal('upload'),
  attachmentId: z.string().min(1).describe('The id of a file attached to the chat'),
  path: FILE_PATH,
  replace: z.boolean().default(false),
});

export const FILE_TOOL_CHANGE = z.discriminatedUnion('action', [
  ...FILE_WRITE_CHANGE.options,
  FILE_TOOL_UPLOAD,
]);

export type FileToolChange = z.infer<typeof FILE_TOOL_CHANGE>;

export const FILE_PLACE_KINDS = ['home', 'root', 'folder', 'drive'] as const;

export const FILE_PLACES = z.strictObject({
  home: FILE_PATH,
  places: z.array(
    z.strictObject({
      label: z.string().min(1),
      path: FILE_PATH,
      kind: z.enum(FILE_PLACE_KINDS),
    }),
  ),
});

export type FilePlaces = z.infer<typeof FILE_PLACES>;

export const DOWNLOAD_PATHS = z.array(FILE_PATH).min(1);

export const DOWNLOAD_SKIPPED = z.strictObject({
  path: z.string().min(1),
  reason: z.string().min(1),
});

export type DownloadSkipped = z.infer<typeof DOWNLOAD_SKIPPED>;

const DOWNLOAD_FACTS = {
  name: z.string().min(1),
  files: z.int().nonnegative(),
  folders: z.int().nonnegative(),
  bytes: z.number().nonnegative(),
  skipped: z.array(DOWNLOAD_SKIPPED),
};

export const DOWNLOAD_PLAN = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('file'),
    path: FILE_PATH,
    size: z.number().nonnegative(),
    mimeType: z.string().min(1),
    ...DOWNLOAD_FACTS,
  }),
  z.strictObject({ kind: z.literal('zip'), id: z.string().min(1), ...DOWNLOAD_FACTS }),
]);

export type DownloadPlan = z.infer<typeof DOWNLOAD_PLAN>;

export const DOWNLOAD_CHUNK = z.strictObject({ data: z.base64(), done: z.boolean() });

export type DownloadChunk = z.infer<typeof DOWNLOAD_CHUNK>;

export const COMPUTER_DOWNLOAD = z.strictObject({
  kind: z.enum(['file', 'zip']),
  name: z.string().min(1),
  size: z.number().nonnegative().nullable(),
  files: z.int().nonnegative(),
  folders: z.int().nonnegative(),
  bytes: z.number().nonnegative(),
  skipped: z.array(DOWNLOAD_SKIPPED),
  url: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

export type ComputerDownload = z.infer<typeof COMPUTER_DOWNLOAD>;
