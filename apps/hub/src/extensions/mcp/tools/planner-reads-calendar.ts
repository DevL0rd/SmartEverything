import { z } from 'zod';
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
    run: async (context, _input, as) =>
      context.store.host.read('mcpPlannerSharing', await profileFor(context, as)),
  });
}

export function guests(): Selection {
  return selection({
    input: z.strictObject({ itemId: READ_FIELDS.itemId }),
    run: async (context, input, as) =>
      context.store.host.read('mcpPlannerGuests', {
        profileId: await profileFor(context, as),
        itemId: input.itemId,
      }),
  });
}

export function feeds(): Selection {
  return selection({
    input: z.strictObject({}),
    run: async (context, _input, as) => {
      const profileId = await profileFor(context, as);
      const collections = await context.store.host.read('mcpPlannerVisible', profileId);
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
    run: async (context, _input, as) => ({
      rows: await context.store.host.call(
        'plannerBookingPages',
        'list',
        await profileFor(context, as),
      ),
    }),
  });
}
