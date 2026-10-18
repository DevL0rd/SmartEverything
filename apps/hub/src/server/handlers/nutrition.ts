import {
  API_ENDPOINTS as E,
  ApiError,
  type HealthEntryInput,
  type HealthOutboxAck,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { profileIdOf } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';

function noteFoodUse(store: Store, profileId: string, input: HealthEntryInput): void {
  const foodId = input.food?.foodId ?? null;
  if (foodId !== null) {
    store.foods.used(foodId, profileId);
  }
}

const entryRoutes = ({ store }: ServerContext) =>
  ({
    readHealthEntries: bound(E.readHealthEntries, ({ query, caller }) =>
      store.healthEntries.window(profileIdOf(store, caller), query),
    ),
    readHealthEntry: bound(E.readHealthEntry, ({ params, caller }) =>
      store.healthEntries.byId(params.entryId, profileIdOf(store, caller)),
    ),
    createHealthEntry: bound(E.createHealthEntry, ({ body, caller }) =>
      store.write(() => {
        const profileId = profileIdOf(store, caller);
        noteFoodUse(store, profileId, body);
        return store.healthEntries.create(profileId, body);
      }),
    ),
    updateHealthEntry: bound(E.updateHealthEntry, ({ params, body, caller }) =>
      store.write(() => {
        const profileId = profileIdOf(store, caller);
        noteFoodUse(store, profileId, body);
        return store.healthEntries.update(params.entryId, profileId, body);
      }),
    ),
    retryHealthEntry: bound(E.retryHealthEntry, ({ params, caller }) =>
      store.healthEntries.retry(params.entryId, profileIdOf(store, caller)),
    ),
    deleteHealthEntry: bound(E.deleteHealthEntry, ({ params, caller }) => {
      store.healthEntries.remove(params.entryId, profileIdOf(store, caller));
      return DONE_REPLY;
    }),
  }) as const;

const foodRoutes = ({ store, foodLookup }: ServerContext) =>
  ({
    listFoods: bound(E.listFoods, ({ caller }) => store.foods.list(profileIdOf(store, caller))),
    createFood: bound(E.createFood, ({ body, caller }) =>
      store.foods.save(profileIdOf(store, caller), body),
    ),
    updateFood: bound(E.updateFood, ({ params, body, caller }) =>
      store.foods.update(params.foodId, profileIdOf(store, caller), body),
    ),
    deleteFood: bound(E.deleteFood, ({ params, caller }) => {
      store.foods.remove(params.foodId, profileIdOf(store, caller));
      return DONE_REPLY;
    }),
    lookupFood: bound(E.lookupFood, ({ query }) => foodLookup.byBarcode(query.barcode)),
    searchFoods: bound(E.searchFoods, async ({ query }) => ({
      products: await foodLookup.search(query.q),
    })),
  }) as const;

export const nutritionRoutes = (context: ServerContext) =>
  ({ ...entryRoutes(context), ...foodRoutes(context) }) as const;

export interface EntryAcker {
  readonly sourceId: string;
  readonly profileId: string;
}

function owned(store: Store, profileId: string, id: string): void {
  if (!store.healthEntries.isOwnedBy(id, profileId)) {
    throw new ApiError('conflict', `Entry ${id} is not this phone’s to save.`);
  }
}

export function ackEntries(store: Store, phone: EntryAcker, ack: HealthOutboxAck): void {
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
