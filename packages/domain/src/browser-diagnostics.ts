import { z } from 'zod';

export const PREVIEW_DIAGNOSTICS_CAPABILITY = 'preview-diagnostics-v1';
export const PREVIEW_BROWSER_DATA_CAPABILITY = 'preview-browser-data-v2';
export const PREVIEW_DIAGNOSTICS_PATH = '/api/preview-diagnostics';
export const PREVIEW_DIAGNOSTICS_PROTOCOL = 'se-preview-diagnostics-v1';
export const PREVIEW_LOG_MAX_BYTES = 8192;
export const PREVIEW_LOG_RECORD_MAX_BYTES = 64 * 1024;
export const PREVIEW_CAPTURE_MAX_BYTES = 4 * 1024 * 1024;
const ID = z.string().min(1).max(512);
export const PREVIEW_CONSOLE_RECORD = z.strictObject({
  id: z.int().positive(),
  time: z.iso.datetime({ offset: true }),
  level: z.enum(['error', 'warning', 'info', 'debug']),
  message: z.string(),
  source: z.string().nullable(),
  stack: z.string().nullable(),
  truncatedBytes: z.int().nonnegative(),
});
export type PreviewConsoleRecord = z.infer<typeof PREVIEW_CONSOLE_RECORD>;
export const PREVIEW_RECORD_REFUSAL = z.strictObject({
  recordId: z.int().positive(),
  byteLength: z.int().positive(),
  reason: z.string().max(512),
});
export type PreviewRecordRefusal = z.infer<typeof PREVIEW_RECORD_REFUSAL>;
export function legacyConsoleRecords(records: readonly PreviewConsoleRecord[]): boolean {
  return records.every(
    (record) =>
      record.message.length <= 8192 &&
      (record.source === null || record.source.length <= 2048) &&
      (record.stack === null || record.stack.length <= 2048),
  );
}
export const NATIVE_BROWSER_OBSERVE = z.literal(2).optional();
export const NATIVE_BROWSER_DIAGNOSTIC = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('epoch'),
    id: ID,
    epoch: ID,
    clearCookies: z.boolean().optional(),
    clearStorage: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('snapshot'),
    id: ID,
    epoch: ID,
    lastRecordId: z.int().nonnegative(),
    refusedRecords: z.array(PREVIEW_RECORD_REFUSAL).max(64),
  }),
  PREVIEW_RECORD_REFUSAL.extend({ kind: z.literal('record-refused'), id: ID, epoch: ID }),
  z.object({ kind: z.literal('availability'), id: ID, epoch: ID, visible: z.boolean() }),
  z.object({
    kind: z.literal('records'),
    id: ID,
    epoch: ID,
    records: z.array(PREVIEW_CONSOLE_RECORD).max(64),
  }),
]);
export type NativeBrowserDiagnostic = z.infer<typeof NATIVE_BROWSER_DIAGNOSTIC>;
export const NATIVE_BROWSER_OPERATION = z.strictObject({
  id: ID,
  epoch: ID,
  action: z.enum(['capture', 'clear-cache', 'clear-cookies', 'clear-storage']),
});
export const PREVIEW_PIXELS = z.strictObject({
  dataBase64: z
    .string()
    .min(1)
    .max(Math.ceil(PREVIEW_CAPTURE_MAX_BYTES / 3) * 4),
  mime: z.literal('image/png'),
  width: z.int().min(1).max(16000),
  height: z.int().min(1).max(16000),
  scale: z.number().positive().max(8),
  capturedAt: z.iso.datetime({ offset: true }),
});
export type PreviewPixels = z.infer<typeof PREVIEW_PIXELS>;
export interface NativeBrowserDiagnostics {
  readonly version: 1;
  readonly rawVersion?: 2;
  readonly subscribeRaw?: (listener: (event: NativeBrowserDiagnostic) => void) => () => void;
  readonly subscribe: (listener: (event: NativeBrowserDiagnostic) => void) => () => void;
  readonly perform: (
    input: z.infer<typeof NATIVE_BROWSER_OPERATION>,
  ) => Promise<PreviewPixels | null>;
}
export const PREVIEW_VIEW_SCOPE = z.strictObject({
  clientId: z.uuid(),
  profileId: z.uuid(),
  chatId: z.uuid(),
  viewerId: z.uuid(),
  browserId: ID,
  documentId: ID,
  revision: z.uuid().nullable(),
  epoch: ID,
});
export type PreviewDiagnosticScope = z.infer<typeof PREVIEW_VIEW_SCOPE>;
export const PREVIEW_VIEW_WRITE = z.strictObject({
  scope: PREVIEW_VIEW_SCOPE,
  visible: z.boolean(),
  records: z.array(PREVIEW_CONSOLE_RECORD).max(64),
  lastRecordId: z.int().nonnegative().optional(),
  refusedRecords: z.array(PREVIEW_RECORD_REFUSAL).max(64).optional(),
});
export const PREVIEW_BROWSER_REQUEST = z.strictObject({
  requestId: z.uuid(),
  scope: PREVIEW_VIEW_SCOPE,
  action: NATIVE_BROWSER_OPERATION.shape.action,
});
export const PREVIEW_VIEW_RESPONSE = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('perform'), request: PREVIEW_BROWSER_REQUEST }),
  z.strictObject({ kind: z.literal('accepted'), epoch: ID, delivery: z.enum(['none', 'shared']) }),
  z.strictObject({ kind: z.literal('refused'), reason: z.string().max(1024) }),
]);
export const PREVIEW_VIEW_MESSAGE = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('write'), value: PREVIEW_VIEW_WRITE }),
  z.strictObject({
    kind: z.literal('operation-result'),
    request: PREVIEW_BROWSER_REQUEST,
    pixels: PREVIEW_PIXELS.nullable(),
    reason: z.string().max(1024).nullable(),
  }),
]);
const SELECTOR = z.strictObject({
  viewerId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  browserId: ID.optional(),
  epoch: ID.optional(),
});
export const PREVIEW_LOG_READ = SELECTOR.extend({
  diagnosticsVersion: z.literal(2).optional(),
  cursor: z.int().nonnegative().optional(),
  direction: z.enum(['before', 'after']).default('before'),
  limit: z.int().min(1).max(200).default(100),
  byteLimit: z.int().min(512).max(262144).default(65536),
  snapshot: z.int().nonnegative().optional(),
});
export const PREVIEW_LOG_SEARCH = PREVIEW_LOG_READ.extend({
  text: z.string().min(1).max(1024),
  level: PREVIEW_CONSOLE_RECORD.shape.level.optional(),
  source: z.string().max(1024).optional(),
  afterTime: z.iso.datetime({ offset: true }).optional(),
  beforeTime: z.iso.datetime({ offset: true }).optional(),
  firstId: z.int().positive().optional(),
  lastId: z.int().positive().optional(),
  before: z.int().min(0).max(20).default(0),
  after: z.int().min(0).max(20).default(0),
});
export const PREVIEW_CAPTURE_SELECTOR = SELECTOR;
export const PREVIEW_ERROR_RULE = z.strictObject({
  scopeKey: z.string().min(1).max(512),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  reason: z.string().min(1).max(1024),
  createdAt: z.iso.datetime({ offset: true }),
});
export type PreviewErrorRule = z.infer<typeof PREVIEW_ERROR_RULE>;
export const PREVIEW_ERROR_POLICY_WRITE = z.discriminatedUnion('operation', [
  PREVIEW_CAPTURE_SELECTOR.extend({
    operation: z.literal('ignore'),
    recordId: z.int().positive(),
    reason: PREVIEW_ERROR_RULE.shape.reason,
  }),
  z.strictObject({
    operation: z.literal('restore'),
    scopeKey: PREVIEW_ERROR_RULE.shape.scopeKey,
    fingerprint: PREVIEW_ERROR_RULE.shape.fingerprint,
  }),
  z.strictObject({ operation: z.literal('clear') }),
]);
export const PREVIEW_LOG_PAGE = z.strictObject({
  scope: PREVIEW_VIEW_SCOPE,
  records: z.array(PREVIEW_CONSOLE_RECORD),
  snapshot: z.int().nonnegative(),
  previousCursor: z.int().nonnegative().nullable(),
  nextCursor: z.int().nonnegative().nullable(),
  omittedRecords: z.int().nonnegative(),
  retainedFrom: z.int().positive().nullable(),
  truncated: z.boolean(),
  matches: z.int().nonnegative(),
  errors: z.int().nonnegative(),
  delivery: z.enum(['none', 'shared']),
  refusedRecords: z.array(PREVIEW_RECORD_REFUSAL).max(64).optional(),
});
export type PreviewLogPage = z.infer<typeof PREVIEW_LOG_PAGE>;
export const PREVIEW_CAPTURE_RESULT = z.strictObject({
  scope: PREVIEW_VIEW_SCOPE,
  artifactId: z.uuid(),
  width: z.int().positive(),
  height: z.int().positive(),
  scale: z.number().positive(),
  capturedAt: z.iso.datetime({ offset: true }),
});
