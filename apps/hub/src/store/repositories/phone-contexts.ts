import {
  PHONE_CONTEXT_STATE,
  PHONE_PLACE_NAME,
  type PhoneContextState,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';

export interface PhoneContextEntry {
  readonly deviceId: string;
  readonly profileId: string;
  readonly clientId: string;
  readonly state: PhoneContextState;
  readonly since: string | null;
  readonly confidence: number | null;
  readonly place: string | null;
  readonly phoneInUse: boolean | null;
  readonly reportedAt: string;
}

const STORED_ENTRY = z
  .object({
    device_id: z.string().min(1),
    profile_id: z.string().min(1),
    client_id: z.string().min(1),
    state: PHONE_CONTEXT_STATE,
    since: z.string().nullable(),
    confidence: z.int().min(0).max(100).nullable(),
    place: PHONE_PLACE_NAME.nullable(),
    phone_in_use: z.union([z.literal(0), z.literal(1)]).nullable(),
    reported_at: z.string(),
  })
  .transform((row): PhoneContextEntry => ({
    deviceId: row.device_id,
    profileId: row.profile_id,
    clientId: row.client_id,
    state: row.state,
    since: row.since,
    confidence: row.confidence,
    place: row.place,
    phoneInUse: row.phone_in_use === null ? null : row.phone_in_use === 1,
    reportedAt: row.reported_at,
  }));

const COLUMNS =
  'device_id, profile_id, client_id, state, since, confidence, place, phone_in_use, reported_at';

export class PhoneContextsRepository {
  constructor(private readonly context: StoreContext) {}

  latestOf(profileId: string): PhoneContextEntry | undefined {
    return this.context.sql.get(
      STORED_ENTRY,
      `select ${COLUMNS} from phone_contexts where profile_id = $profileId
       order by reported_at desc limit 1`,
      { profileId },
    );
  }

  byDevice(deviceId: string): PhoneContextEntry | undefined {
    return this.context.sql.get(
      STORED_ENTRY,
      `select ${COLUMNS} from phone_contexts where device_id = $deviceId`,
      { deviceId },
    );
  }

  save(entry: PhoneContextEntry): void {
    this.context.sql.run(
      'save the phone context',
      `insert into phone_contexts (${COLUMNS})
       values ($deviceId, $profileId, $clientId, $state, $since, $confidence, $place, $phoneInUse, $reportedAt)
       on conflict (device_id) do update set profile_id = excluded.profile_id,
         client_id = excluded.client_id, state = excluded.state, since = excluded.since,
         confidence = excluded.confidence, place = excluded.place,
         phone_in_use = excluded.phone_in_use, reported_at = excluded.reported_at`,
      {
        deviceId: entry.deviceId,
        profileId: entry.profileId,
        clientId: entry.clientId,
        state: entry.state,
        since: entry.since,
        confidence: entry.confidence,
        place: entry.place,
        phoneInUse: entry.phoneInUse === null ? null : Number(entry.phoneInUse),
        reportedAt: entry.reportedAt,
      },
    );
  }
}
