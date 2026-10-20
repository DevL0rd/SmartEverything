import { z } from 'zod';

export const WATCH_CAPTURE_OUTCOMES = [
  'read',
  'stages_undecoded',
  'unreadable',
  'unsupported',
  'implausible',
] as const;

export type WatchCaptureOutcome = (typeof WATCH_CAPTURE_OUTCOMES)[number];

const SHA256 = z.string().regex(/^[0-9a-f]{64}$/u, 'must be a lowercase sha256 hex digest');

const BYTE = z.int().min(0).max(255);

export const WATCH_CAPTURE_FILE = z.strictObject({
  fileId: z.string().regex(/^[0-9a-f]{14}$/u, 'must be the 7-byte watch file id in hex'),
  family: z.string().trim().min(1).max(40),
  type: BYTE,
  subtype: BYTE,
  detail: BYTE,
  version: BYTE,
  watchTime: z.iso.datetime({ offset: true }),
  outcome: z.enum(WATCH_CAPTURE_OUTCOMES),
  note: z.string().nullable(),
  bytes: z.base64(),
});

export type WatchCaptureFile = z.output<typeof WATCH_CAPTURE_FILE>;

export const WATCH_CAPTURE_UPLOAD = z.strictObject({
  deviceId: z.uuid(),
  files: z.array(WATCH_CAPTURE_FILE).min(1),
});

export const WATCH_CAPTURE_ENTRY = z.strictObject({
  sha256: SHA256,
  deviceId: z.uuid(),
  clientId: z.string().min(1),
  fileId: z.string(),
  family: z.string(),
  type: BYTE,
  subtype: BYTE,
  detail: BYTE,
  version: BYTE,
  watchTime: z.string(),
  outcome: z.enum(WATCH_CAPTURE_OUTCOMES),
  note: z.string().nullable(),
  size: z.int().min(0),
  capturedAt: z.string(),
});

export type WatchCaptureEntry = z.output<typeof WATCH_CAPTURE_ENTRY>;

export const WATCH_CAPTURE_SAVED = z.strictObject({
  stored: z.array(SHA256),
  duplicates: z.array(SHA256),
});

export const WATCH_CAPTURE_SUMMARY = z.strictObject({
  files: z.int().min(0),
  bytes: z.int().min(0),
  entries: z.array(WATCH_CAPTURE_ENTRY),
});

export type WatchCaptureSummary = z.output<typeof WATCH_CAPTURE_SUMMARY>;

export const DEVELOPER_DEVICE = z.strictObject({ developer: z.boolean() });
