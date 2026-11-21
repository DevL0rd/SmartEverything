import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { profileIdOf } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';

const entryRoutes = ({ store }: ServerContext) =>
  ({
    readHealthEntries: bound(E.readHealthEntries, ({ query, caller }) =>
      store.host.call('healthEntries', 'window', profileIdOf(caller), query),
    ),
    readHealthEntry: bound(E.readHealthEntry, ({ params, caller }) =>
      store.host.call('healthEntries', 'byId', params.entryId, profileIdOf(caller)),
    ),
    createHealthEntry: bound(E.createHealthEntry, ({ body, caller }) =>
      store.host.write('createHealthEntry', { profileId: profileIdOf(caller), body }),
    ),
    updateHealthEntry: bound(E.updateHealthEntry, ({ params, query, body, caller }) =>
      store.host.write('updateHealthEntry', {
        profileId: profileIdOf(caller),
        entryId: params.entryId,
        expectedVersion: query.expectedVersion,
        body,
      }),
    ),
    retryHealthEntry: bound(E.retryHealthEntry, ({ params, caller }) =>
      store.host.call('healthEntries', 'retry', params.entryId, profileIdOf(caller)),
    ),
    deleteHealthEntry: bound(E.deleteHealthEntry, async ({ params, caller }) => {
      await store.host.call('healthEntries', 'remove', params.entryId, profileIdOf(caller));
      return DONE_REPLY;
    }),
  }) as const;

const foodRoutes = ({ store, foodLookup }: ServerContext) =>
  ({
    listFoods: bound(E.listFoods, ({ caller }) =>
      store.host.call('foods', 'list', profileIdOf(caller)),
    ),
    createFood: bound(E.createFood, ({ body, caller }) =>
      store.host.call('foods', 'save', profileIdOf(caller), body),
    ),
    updateFood: bound(E.updateFood, ({ params, body, caller }) =>
      store.host.call('foods', 'update', params.foodId, profileIdOf(caller), body),
    ),
    deleteFood: bound(E.deleteFood, async ({ params, caller }) => {
      await store.host.call('foods', 'remove', params.foodId, profileIdOf(caller));
      return DONE_REPLY;
    }),
    lookupFood: bound(E.lookupFood, ({ query }) => foodLookup.byBarcode(query.barcode)),
    searchFoods: bound(E.searchFoods, async ({ query }) => ({
      products: await foodLookup.search(query.q),
    })),
  }) as const;

export const nutritionRoutes = (context: ServerContext) =>
  ({ ...entryRoutes(context), ...foodRoutes(context) }) as const;
