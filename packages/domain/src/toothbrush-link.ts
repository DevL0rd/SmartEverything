import { z } from 'zod';
import { BRUSH_BRANDS, BRUSH_LINK_PHASES, BRUSH_POLICIES } from './toothbrush-base';
import { GATT_PROPERTIES, GATT_UUID, HEX } from './treadmill';

export const BRUSH_GATT_CHARACTERISTIC = z.strictObject({
  uuid: GATT_UUID,
  properties: z.array(z.enum(GATT_PROPERTIES)),
  value: HEX.optional(),
});

export const BRUSH_GATT_SERVICE = z.strictObject({
  uuid: GATT_UUID,
  characteristics: z.array(BRUSH_GATT_CHARACTERISTIC),
});

export const BRUSH_GATT_DUMP = z.strictObject({
  name: z.string().min(1),
  services: z.array(BRUSH_GATT_SERVICE).min(1),
});

export type BrushGattDump = z.infer<typeof BRUSH_GATT_DUMP>;

export const BRUSH_TRANSPORTS = ['gatt', 'condor'] as const;

export type BrushTransport = (typeof BRUSH_TRANSPORTS)[number];

export const LINK_SUBSCRIPTION = z.strictObject({
  service: GATT_UUID,
  characteristic: GATT_UUID,
  mode: z.enum(['notify', 'indicate']),
});

export const LINK_READ = z.strictObject({ service: GATT_UUID, characteristic: GATT_UUID });

export const BRUSH_WRITE_STEP = z.strictObject({
  kind: z.literal('write'),
  service: GATT_UUID,
  characteristic: GATT_UUID,
  hex: HEX,
  writeType: z.enum(['with_response', 'without_response']),
});

export const BRUSH_CONDOR_STEP = z.strictObject({ kind: z.literal('condor_frame'), hex: HEX });

export const BRUSH_READ_STEP = z.strictObject({
  kind: z.literal('read'),
  service: GATT_UUID,
  characteristic: GATT_UUID,
});

export const BRUSH_STEP = z.discriminatedUnion('kind', [
  BRUSH_WRITE_STEP,
  BRUSH_CONDOR_STEP,
  BRUSH_READ_STEP,
]);

export type BrushStep = z.infer<typeof BRUSH_STEP>;

export const BRUSH_ADVERT_FILTER = z.strictObject({
  companyId: z.number().int().min(0).max(65535),
});

export const BRUSH_LINK_PLAN = z.strictObject({
  deviceId: z.uuid(),
  address: z.string().min(1),
  transport: z.enum(BRUSH_TRANSPORTS),
  brand: z.enum(BRUSH_BRANDS),
  bonded: z.boolean(),
  adverts: BRUSH_ADVERT_FILTER.nullable(),
  prepare: z.array(BRUSH_STEP),
  subscriptions: z.array(LINK_SUBSCRIPTION),
  reads: z.array(LINK_READ),
  sync: z.array(LINK_READ),
  initial: z.array(BRUSH_STEP),
  policy: z.enum(BRUSH_POLICIES),
  holder: z.boolean(),
});

export type BrushLinkPlan = z.infer<typeof BRUSH_LINK_PLAN>;

export const PHONE_BRUSHES = z.strictObject({ brushes: z.array(BRUSH_LINK_PLAN) });

export type PhoneBrushes = z.infer<typeof PHONE_BRUSHES>;

export const BRUSH_FRAME = z.strictObject({
  at: z.iso.datetime({ offset: true }),
  characteristic: GATT_UUID,
  hex: HEX,
});

export type BrushFrame = z.infer<typeof BRUSH_FRAME>;

export const BRUSH_ADVERT = z.strictObject({
  at: z.iso.datetime({ offset: true }),
  rssi: z.number().int(),
  hex: HEX,
});

export type BrushAdvert = z.infer<typeof BRUSH_ADVERT>;

export const BRUSH_LINK_REPORT = z.strictObject({
  phase: z.enum(BRUSH_LINK_PHASES),
  rssi: z.number().int().nullable(),
  detail: z.string().nullable(),
});

export type BrushLinkReport = z.infer<typeof BRUSH_LINK_REPORT>;

export const BRUSH_FRAME_BATCH = z.strictObject({
  frames: z.array(BRUSH_FRAME),
  adverts: z.array(BRUSH_ADVERT).optional(),
  link: BRUSH_LINK_REPORT,
});

export type BrushFrameBatch = z.infer<typeof BRUSH_FRAME_BATCH>;

export const BRUSH_TRANSFER = z.strictObject({
  completeOn: GATT_UUID.nullable(),
  cancel: BRUSH_STEP.nullable(),
  deadlineMs: z.number().int().positive(),
});

export const BRUSH_FETCH = z.strictObject({
  sessionId: z.number().int().nonnegative(),
  steps: z.array(BRUSH_STEP),
});

export const BRUSH_BATCH_RESULT = z.strictObject({
  live: z.boolean(),
  accepted: z.number().int().nonnegative(),
  fetch: z.array(BRUSH_FETCH),
  transfer: BRUSH_TRANSFER.nullable(),
});

export type BrushBatchResult = z.infer<typeof BRUSH_BATCH_RESULT>;

export const BRUSH_ACTION_ANSWER = z.strictObject({
  requestId: z.string().min(1),
  ok: z.boolean(),
  detail: z.string(),
});

export type BrushActionAnswer = z.infer<typeof BRUSH_ACTION_ANSWER>;

export const BRUSH_ACTION_RESULT = z.strictObject({ ok: z.boolean(), detail: z.string() });

export type BrushActionResult = z.infer<typeof BRUSH_ACTION_RESULT>;
