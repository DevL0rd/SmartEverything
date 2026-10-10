import { z } from 'zod';
import { BODY_COMPOSITION } from './body-composition';
import { CLIENT_RECORD_ID, OUTBOX_ENTRY } from './health-entries';
import { SCALE_USER } from './profiles';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const ATTRIBUTIONS = [
  'only_profile',
  'scale',
  'weight',
  'person',
  'pending',
  'ignored',
] as const;

export type Attribution = (typeof ATTRIBUTIONS)[number];

export const BODY_READING_ROW = z.strictObject({
  id: ID,
  device_id: ID,
  profile_id: ID.nullable(),
  measured_at: MOMENT,
  weight_kg: z.number().positive().nullable(),
  impedance_low: z.number().positive().nullable(),
  impedance_high: z.number().positive().nullable(),
  heart_rate: z.int().positive().nullable(),
  scale_user: SCALE_USER.nullable(),
  attribution: z.enum(ATTRIBUTIONS),
  bmi: z.number().nullable(),
  composition: BODY_COMPOSITION.nullable(),
  version: z.int().min(1),
  saved_to_health_connect_at: MOMENT.nullable(),
  created_at: MOMENT,
  updated_at: MOMENT,
});

export type BodyReadingRow = z.infer<typeof BODY_READING_ROW>;

export const BODY_READINGS_SNAPSHOT = 100;

export const ATTRIBUTION_RULES = {
  closestKg: 3,
  runnerUpRatio: 2,
  lookbackDays: 90,
} as const;

export interface AttributionCandidate {
  readonly profileId: string;
  readonly scaleUser: number | null;
  readonly lastWeightKg: number | null;
}

export interface AttributionInput {
  readonly weightKg: number;
  readonly scaleUser: number | null;
}

export interface AttributionResult {
  readonly profileId: string | null;
  readonly attribution: Attribution;
}

const PENDING: AttributionResult = { profileId: null, attribution: 'pending' };

function bySlot(
  input: AttributionInput,
  candidates: readonly AttributionCandidate[],
): AttributionResult | null {
  if (input.scaleUser === null) {
    return null;
  }
  const owners = candidates.filter((candidate) => candidate.scaleUser === input.scaleUser);
  const [owner] = owners;
  return owners.length === 1 && owner !== undefined
    ? { profileId: owner.profileId, attribution: 'scale' }
    : null;
}

function byWeight(
  input: AttributionInput,
  candidates: readonly AttributionCandidate[],
): AttributionResult {
  const ranked = candidates
    .flatMap((candidate) =>
      candidate.lastWeightKg === null
        ? []
        : [{ candidate, distance: Math.abs(candidate.lastWeightKg - input.weightKg) }],
    )
    .sort((left, right) => left.distance - right.distance);
  const [best, runnerUp] = ranked;
  if (best === undefined || best.distance > ATTRIBUTION_RULES.closestKg) {
    return PENDING;
  }
  const clear =
    runnerUp === undefined || runnerUp.distance >= best.distance * ATTRIBUTION_RULES.runnerUpRatio;
  const enoughData = ranked.length === candidates.length;
  return clear && enoughData
    ? { profileId: best.candidate.profileId, attribution: 'weight' }
    : PENDING;
}

export function attributeReading(
  input: AttributionInput,
  candidates: readonly AttributionCandidate[],
): AttributionResult {
  const [only] = candidates;
  if (candidates.length === 1 && only !== undefined) {
    return { profileId: only.profileId, attribution: 'only_profile' };
  }
  return bySlot(input, candidates) ?? byWeight(input, candidates);
}

export const BLE_ADVERT_LIMIT = 50;

export const BLE_ADVERT = z.strictObject({
  address: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/),
  serviceUuid: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/),
  data: z.string().regex(/^([0-9a-f]{2}){5,64}$/),
  rssi: z.int().min(-127).max(20).nullable(),
  seenAt: MOMENT,
});

export type BleAdvert = z.infer<typeof BLE_ADVERT>;

export const BLE_ADVERT_BATCH = z.strictObject({
  adverts: z.array(BLE_ADVERT).min(1).max(BLE_ADVERT_LIMIT),
});

export const BLE_RELAY_RESULT = z.strictObject({
  accepted: z.int().min(0),
  ignored: z.int().min(0),
  readings: z.array(ID),
});

export const BLE_WATCH = z.strictObject({
  devices: z.array(
    z.strictObject({
      address: BLE_ADVERT.shape.address,
      serviceUuid: BLE_ADVERT.shape.serviceUuid,
      dataPrefix: z.string().regex(/^([0-9a-f]{2})*$/),
      dataMask: z.string().regex(/^([0-9a-f]{2})*$/),
    }),
  ),
});

export type BleWatch = z.infer<typeof BLE_WATCH>;

export const OUTBOX_READING = z.strictObject({
  id: ID,
  version: z.int().min(1),
  measuredAt: MOMENT,
  weightKg: z.number().positive(),
  bodyFatPercent: z.number().nullable(),
  basalMetabolicRateKcal: z.number().nullable(),
  leanMassKg: z.number().nullable(),
  boneMassKg: z.number().nullable(),
  waterMassKg: z.number().nullable(),
  heartRate: z.int().positive().nullable(),
  heightMeters: z.number().positive().nullable(),
});

export type OutboxReading = z.infer<typeof OUTBOX_READING>;

export const HEALTH_OUTBOX = z.strictObject({
  readings: z.array(OUTBOX_READING),
  entries: z.array(OUTBOX_ENTRY),
});

const WRITTEN = z.array(z.strictObject({ id: ID, version: z.int().min(1) })).max(200);

export const ENTRY_FAILURE = z.strictObject({
  id: ID,
  version: z.int().min(1),
  reason: z.string().trim().min(1).max(500),
});

export const HEALTH_OUTBOX_ACK = z
  .strictObject({
    written: WRITTEN.default([]),
    entries: WRITTEN.default([]),
    failed: z.array(ENTRY_FAILURE).max(200).default([]),
    deletedInHealthConnect: z.array(CLIENT_RECORD_ID).max(500).default([]),
  })
  .refine(
    (ack) =>
      ack.written.length +
        ack.entries.length +
        ack.failed.length +
        ack.deletedInHealthConnect.length >
      0,
    { message: 'name at least one saved, failed or deleted reading or entry' },
  );

export type HealthOutboxAck = z.infer<typeof HEALTH_OUTBOX_ACK>;

export const BODY_READING_PUSH_DATA = z.strictObject({
  kind: z.literal('body_reading'),
  readingId: ID,
});

export type BodyReadingPushData = z.infer<typeof BODY_READING_PUSH_DATA>;

export interface BodyReadingPush {
  readonly title: string;
  readonly body: string;
  readonly data: BodyReadingPushData;
}

export function bodyReadingPush(
  reading: Pick<BodyReadingRow, 'id' | 'weight_kg'>,
): BodyReadingPush {
  const weight = reading.weight_kg === null ? 'A weigh-in' : `${reading.weight_kg.toFixed(1)} kg`;
  return {
    title: 'Who was this?',
    body: `${weight} on the scale. Tap to say who.`,
    data: { kind: 'body_reading', readingId: reading.id },
  };
}
