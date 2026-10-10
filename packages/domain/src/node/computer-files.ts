import { z } from 'zod';

export const FILE_KINDS = ['folder', 'file', 'link', 'other'] as const;

export const FILE_ENTRY_LIMIT = 500;

export const FILE_READ_LIMIT_BYTES = 5 * 1024 * 1024;

export const FILE_PATH = z.string().trim().min(1).max(4096).startsWith('/');

export const FILE_ENTRY = z.strictObject({
  name: z.string().min(1),
  path: FILE_PATH,
  kind: z.enum(FILE_KINDS),
  size: z.number().nonnegative(),
  modifiedAt: z.iso.datetime({ offset: true }),
});

export type FileEntry = z.infer<typeof FILE_ENTRY>;

export const FILE_LIST = z.strictObject({
  path: FILE_PATH,
  parent: FILE_PATH.nullable(),
  entries: z.array(FILE_ENTRY),
  total: z.int().nonnegative(),
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
