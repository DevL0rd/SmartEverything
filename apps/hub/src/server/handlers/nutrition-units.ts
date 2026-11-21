import type { API_ENDPOINTS as E } from '@smarteverything/domain';
import { ApiError, type HealthEntryInput, type HealthOutboxAck } from '@smarteverything/domain';
import type { z } from 'zod';
import { outboxReadingOf } from '../../local/reading-records';
import { storeUnit } from '../../store/host/unit';
import type { Store } from '../../store/store';

function noteFoodUse(store: Store, profileId: string, input: HealthEntryInput): void {
  const foodId = input.food?.foodId ?? null;
  if (foodId !== null) {
    store.foods.used(foodId, profileId);
  }
}

export interface EntryAcker {
  readonly sourceId: string;
  readonly profileId: string;
}

function owned(store: Store, profileId: string, id: string): void {
  if (!store.healthEntries.isOwnedBy(id, profileId)) {
    throw new ApiError('conflict', `Entry ${id} is not this phone’s to save.`);
  }
}

function ackEntries(store: Store, phone: EntryAcker, ack: HealthOutboxAck): void {
  for (const entry of ack.entries) {
    owned(store, phone.profileId, entry.id);
    store.healthEntries.written(phone.sourceId, entry.id, entry.version);
  }
  for (const failure of ack.failed) {
    owned(store, phone.profileId, failure.id);
    store.healthEntries.failed(phone.sourceId, failure.id, failure.version, failure.reason);
  }
  for (const clientRecordId of ack.deletedInHealthConnect) {
    store.healthEntries.removedInHealthConnect(phone.profileId, phone.sourceId, clientRecordId);
  }
}

export interface EntryCreate {
  readonly profileId: string;
  readonly body: z.output<typeof E.createHealthEntry.body>;
}

export interface EntryUpdate {
  readonly profileId: string;
  readonly entryId: string;
  readonly expectedVersion: z.output<typeof E.updateHealthEntry.query>['expectedVersion'];
  readonly body: z.output<typeof E.updateHealthEntry.body>;
}

type OutboxAck = z.output<typeof E.ackHealthOutbox.body>;

export const NUTRITION_READ_UNITS = {
  healthOutbox: storeUnit((store, phone: EntryAcker) => ({
    readings: store.bodyReadings
      .outbox(phone.profileId, phone.sourceId)
      .flatMap(
        (reading) => outboxReadingOf(reading, store.profiles.byId(phone.profileId).height_cm) ?? [],
      ),
    entries: store.healthEntries.outbox(phone.profileId, phone.sourceId),
  })),
} as const;

export const NUTRITION_WRITE_UNITS = {
  createHealthEntry: storeUnit((store, { profileId, body }: EntryCreate) => {
    noteFoodUse(store, profileId, body);
    return store.healthEntries.create(profileId, body);
  }),
  updateHealthEntry: storeUnit(
    (store, { profileId, entryId, expectedVersion, body }: EntryUpdate) => {
      noteFoodUse(store, profileId, body);
      return store.healthEntries.update(entryId, profileId, body, expectedVersion);
    },
  ),
  ackHealthOutbox: storeUnit(
    (store, { phone, ack }: { readonly phone: EntryAcker; readonly ack: OutboxAck }): void => {
      for (const written of ack.written) {
        const reading = store.bodyReadings.byId(written.id);
        if (reading.profile_id !== phone.profileId || written.version > reading.version) {
          throw new ApiError('conflict', `Reading ${written.id} is not this phone’s to save.`);
        }
        store.bodyReadings.written(phone.sourceId, written.id, written.version);
      }
      ackEntries(store, phone, ack);
    },
  ),
} as const;
