import { z } from 'zod';
import { resolveItem, visibleCollections } from '../../../planner/sharing/visibility';
import { operate, profileFor } from './acting';
import { READ_FIELDS } from './planner-reads-fields';
import { selection, type Selection } from './selected-tool';

export function search(): Selection {
  return selection({
    input: z.strictObject({
      text: READ_FIELDS.text,
      when: READ_FIELDS.when.optional(),
      collections: READ_FIELDS.collections.optional(),
      kinds: READ_FIELDS.kinds.optional(),
      cursor: READ_FIELDS.cursor.optional(),
    }),
    run: (context, input, as) =>
      operate(
        context,
        'readPlannerSearch',
        {
          query: {
            text: input.text,
            ...(input.when === undefined ? {} : { when: input.when }),
            ...(input.collections === undefined ? {} : { collections: input.collections }),
            ...(input.kinds === undefined ? {} : { kinds: input.kinds }),
            ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
          },
        },
        as,
      ),
  });
}

export function sharing(): Selection {
  return selection({
    input: z.strictObject({}),
    run: (context, _input, as) => {
      const profileId = profileFor(context, as);
      const { store } = context;
      const owned = store.plannerCollections.list(profileId);
      return {
        shared_by_me: owned.flatMap((collection) => {
          const shares = store.plannerShares.forCollection(collection.id);
          return shares.length === 0 ? [] : [{ collection, shares }];
        }),
        shared_with_me: store.plannerShares.forProfile(profileId).flatMap((share) => {
          const collection = store.plannerCollections.findAny(share.collection_id);
          return collection === undefined ? [] : [{ collection, share }];
        }),
        family: store.plannerCollections.household(),
      };
    },
  });
}

export function guests(): Selection {
  return selection({
    input: z.strictObject({ itemId: READ_FIELDS.itemId }),
    run: (context, input, as) => {
      const { item, role } = resolveItem(
        context.store,
        profileFor(context, as),
        input.itemId,
        'read',
      );
      return {
        item_id: item.id,
        role,
        guests: context.store.plannerGuests.forItem(item.series_id ?? item.id),
      };
    },
  });
}

export function feeds(): Selection {
  return selection({
    input: z.strictObject({}),
    run: async (context, _input, as) => {
      const profileId = profileFor(context, as);
      const collections = visibleCollections(context.store, profileId);
      const owned = collections.filter((collection) => collection.profile_id === profileId);
      const links = await Promise.all(
        owned.map((collection) =>
          operate(
            context,
            'readPlannerExportLink',
            { params: { collectionId: collection.id } },
            as,
          ),
        ),
      );
      return {
        subscriptions: collections.filter((collection) => collection.feed !== null),
        published: links.filter((link) => link !== null),
      };
    },
  });
}

export function bookingPages(): Selection {
  return selection({
    input: z.strictObject({}),
    run: (context, _input, as) => ({
      rows: context.store.plannerBookingPages.list(profileFor(context, as)),
    }),
  });
}
