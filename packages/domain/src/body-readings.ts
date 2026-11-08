import { z } from 'zod';
import { BODY_COMPOSITION } from './body-composition';
import { acceptedWeights, isOutlier, type WeighIn } from './body-outliers';
import { CLIENT_RECORD_ID, OUTBOX_ENTRY } from './health-entries';
import { BLUETOOTH_MAC } from './mac-address';
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

export const BODY_READING_ROW = z.object({
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

export interface AttributionCandidate {
  readonly profileId: string;
  readonly scaleUser: number | null;
  readonly weighIns: readonly WeighIn[];
}

export interface AttributionInput {
  readonly scaleUser: number | null;
  readonly weightKg: number;
}

export interface AttributionResult {
  readonly profileId: string | null;
  readonly attribution: Attribution;
}

const PENDING: AttributionResult = { profileId: null, attribution: 'pending' };

function fits(input: AttributionInput, candidate: AttributionCandidate): boolean {
  return !isOutlier(input.weightKg, acceptedWeights(candidate.weighIns));
}

function bySlot(
  input: AttributionInput,
  candidates: readonly AttributionCandidate[],
): AttributionCandidate | null {
  const owners = candidates.filter(
    (candidate) => input.scaleUser !== null && candidate.scaleUser === input.scaleUser,
  );
  const [owner] = owners;
  return owners.length === 1 && owner !== undefined && fits(input, owner) ? owner : null;
}

function byWeight(
  input: AttributionInput,
  candidates: readonly AttributionCandidate[],
): AttributionCandidate | null {
  const matches = candidates.filter(
    (candidate) => candidate.weighIns.length > 0 && fits(input, candidate),
  );
  const [match] = matches;
  return matches.length === 1 && match !== undefined ? match : null;
}

function unlinkedOnly(
  input: AttributionInput,
  candidates: readonly AttributionCandidate[],
): AttributionCandidate | null {
  const [only] = candidates;
  const unlinked = only?.scaleUser === null || input.scaleUser === null;
  return candidates.length === 1 && only !== undefined && unlinked && fits(input, only)
    ? only
    : null;
}

export function attributeReading(
  input: AttributionInput,
  candidates: readonly AttributionCandidate[],
): AttributionResult {
  const alone = candidates.length === 1;
  const owner = bySlot(input, candidates) ?? unlinkedOnly(input, candidates);
  if (owner !== null) {
    return { profileId: owner.profileId, attribution: alone ? 'only_profile' : 'scale' };
  }
  const match = byWeight(input, candidates);
  return match === null ? PENDING : { profileId: match.profileId, attribution: 'weight' };
}

export const BLE_ADVERT = z.object({
  address: BLUETOOTH_MAC,
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

export const BLE_ADVERT_BATCH = z.object({
  adverts: z.array(BLE_ADVERT).min(1),
});

export const BLE_RELAY_RESULT = z.object({
  accepted: z.int().min(0),
  ignored: z.int().min(0),
  readings: z.array(ID),
});

const HEX_BYTES = z.string().regex(/^([0-9a-f]{2})*$/);

export const BLE_CONTENT_FILTER = z.object({
  serviceUuid: z.string().min(1).optional(),
  companyId: z.int().min(0).max(0xffff).optional(),
  dataPrefix: HEX_BYTES.optional(),
  dataMask: HEX_BYTES.optional(),
});

export type BleContentFilter = z.infer<typeof BLE_CONTENT_FILTER>;

export const BLE_WATCH = z.object({
  contentFilters: z.array(BLE_CONTENT_FILTER).optional(),
  devices: z.array(
    z.object({
      address: BLE_ADVERT.shape.address,
      serviceUuid: BLE_ADVERT.shape.serviceUuid,
      dataPrefix: z.string().regex(/^([0-9a-f]{2})*$/),
      dataMask: z.string().regex(/^([0-9a-f]{2})*$/),
    }),
  ),
});

export type BleWatch = z.infer<typeof BLE_WATCH>;

export const OUTBOX_READING = z.object({
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

export const HEALTH_OUTBOX = z.object({
  readings: z.array(OUTBOX_READING),
  entries: z.array(OUTBOX_ENTRY),
});

const WRITTEN = z.array(z.object({ id: ID, version: z.int().min(1) }));

export const ENTRY_FAILURE = z.object({
  id: ID,
  version: z.int().min(1),
  reason: z.string().trim().min(1),
});

export const HEALTH_OUTBOX_ACK = z
  .object({
    written: WRITTEN.default([]),
    entries: WRITTEN.default([]),
    failed: z.array(ENTRY_FAILURE).default([]),
    deletedInHealthConnect: z.array(CLIENT_RECORD_ID).default([]),
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

export const BODY_READING_PUSH_DATA = z.object({
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
