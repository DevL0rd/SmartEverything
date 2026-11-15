import { z } from 'zod';
import { RELEASE_LINUX_TARGETS } from '../release-bundle';
import { HUB_UPDATE_COMMIT } from '../hub-update-source';
import { APP_UPDATE_PLATFORMS } from '../app-updates';
import { RELEASE_ARTIFACT, RELEASE_FINGERPRINT, RELEASE_UPLOAD_ID } from '../release-sources';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING } from './primitives';

export const RELEASE_UPLOAD_CHUNK_PATH = '/api/releases/uploads/:uploadId/chunks/:offset';

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/u);

const BYTES = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const RELEASE_UPLOAD_OFFSET = z
  .string()
  .regex(/^(?:0|[1-9][0-9]{0,15})$/u)
  .transform(Number)
  .pipe(BYTES);

export const RELEASE_UPLOAD_BEGIN = z.strictObject({
  artifact: RELEASE_ARTIFACT,
  size: BYTES.positive(),
  sha256: SHA256,
});

export type ReleaseUploadBegin = z.infer<typeof RELEASE_UPLOAD_BEGIN>;

export const RELEASE_UPLOAD_RANGE = z
  .strictObject({ start: BYTES, end: BYTES })
  .refine((range) => range.start < range.end, { message: 'a range must not be empty' });

export type ReleaseUploadRange = z.infer<typeof RELEASE_UPLOAD_RANGE>;

export const RELEASE_UPLOAD_STATES = ['receiving', 'staged'] as const;

export type ReleaseUploadState = (typeof RELEASE_UPLOAD_STATES)[number];

export const RELEASE_STAGED = z.strictObject({
  version: z.string().min(1).max(64),
  commit: HUB_UPDATE_COMMIT,
  target: z.enum([...RELEASE_LINUX_TARGETS, ...APP_UPDATE_PLATFORMS]),
  fingerprint: RELEASE_FINGERPRINT,
  files: z.int().positive(),
  bytes: BYTES,
});

export type ReleaseStaged = z.infer<typeof RELEASE_STAGED>;

export const RELEASE_UPLOAD = z.strictObject({
  uploadId: RELEASE_UPLOAD_ID,
  artifact: RELEASE_ARTIFACT,
  size: BYTES.positive(),
  sha256: SHA256,
  state: z.enum(RELEASE_UPLOAD_STATES),
  createdAt: z.iso.datetime(),
  received: z.array(RELEASE_UPLOAD_RANGE),
  receivedBytes: BYTES,
  release: RELEASE_STAGED.nullable(),
});

export type ReleaseUpload = z.infer<typeof RELEASE_UPLOAD>;

export const RELEASE_UPLOAD_PARAMS = z.strictObject({ uploadId: RELEASE_UPLOAD_ID });

export const RELEASE_UPLOAD_LIST = z.strictObject({ uploads: z.array(RELEASE_UPLOAD) });

export const RELEASE_ENDPOINTS = {
  beginReleaseUpload: endpoint({
    method: 'POST',
    path: '/api/releases/uploads',
    access: 'owner',
    summary:
      'Start a resumable upload of one signed release bundle (.tar) from the owner’s own app or dev machine: the free disk space is checked against the size, then the bytes are sent with PUT /api/releases/uploads/:uploadId/chunks/:offset in any order',
    params: NOTHING,
    query: NOTHING,
    body: RELEASE_UPLOAD_BEGIN,
    response: RELEASE_UPLOAD,
  }),
  listReleaseUploads: endpoint({
    method: 'GET',
    path: '/api/releases/uploads',
    access: 'owner',
    summary:
      'List every release upload this Hub keeps, still receiving or staged, until it is published or discarded',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: RELEASE_UPLOAD_LIST,
  }),
  readReleaseUpload: endpoint({
    method: 'GET',
    path: '/api/releases/uploads/:uploadId',
    access: 'owner',
    summary:
      'Read one release upload with the byte ranges received so far, so an interrupted upload resumes with the missing ranges only',
    params: RELEASE_UPLOAD_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: RELEASE_UPLOAD,
  }),
  finishReleaseUpload: endpoint({
    method: 'POST',
    path: '/api/releases/uploads/:uploadId/finish',
    access: 'owner',
    summary:
      'Finish a release upload once every byte arrived: the whole bundle must match its sha256, then it is unpacked into the staging folder and its signature, trusted key, file sizes and hashes are verified; a staged upload answers with its release again',
    params: RELEASE_UPLOAD_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: RELEASE_UPLOAD,
  }),
} as const;
