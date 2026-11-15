import {
  PLANNER_BOOKING_PAGE_CHANGES,
  PLANNER_BOOKING_PAGE_CREATE,
  PLANNER_FEED_CREATE,
  PLANNER_GUEST_ENTRY,
  PLANNER_RSVP_BODY,
  PLANNER_SHARE_ROLES,
} from '@smarteverything/domain';
import { z } from 'zod';
import { importIcs as importCalendarText } from '../../../planner/ical/import';
import { IcalParseError } from '../../../planner/ical/model';
import { resolveCollection } from '../../../planner/sharing/visibility';
import { operate, profileFor, type OperatingContext } from './acting';
import { ToolError, type ToolContext } from './registry';
import { selection, type Selection } from './selected-tool';

export const CALENDAR_EDIT_FIELDS = {
  collectionId: z.uuid(),
  withPersonId: z.uuid(),
  role: z.enum(PLANNER_SHARE_ROLES),
  guests: z.array(PLANNER_GUEST_ENTRY),
  rsvp: PLANNER_RSVP_BODY,
  feed: PLANNER_FEED_CREATE,
  ics: z.string().min(1),
  link: z.enum(['publish', 'stop']),
  page: PLANNER_BOOKING_PAGE_CREATE,
  pageId: z.uuid(),
  pageChanges: PLANNER_BOOKING_PAGE_CHANGES,
} as const;

const FIELDS = CALENDAR_EDIT_FIELDS;

const BOOKING_PAGE_SET = z.union([
  z.strictObject({ page: FIELDS.page }),
  z.strictObject({ pageId: FIELDS.pageId, pageChanges: FIELDS.pageChanges }),
]);

const COLLECTION = z.strictObject({ collectionId: FIELDS.collectionId });

export function share(): Selection {
  return selection({
    input: z.strictObject({
      collectionId: FIELDS.collectionId,
      withPersonId: FIELDS.withPersonId,
      role: FIELDS.role,
    }),
    run: (context, input, as) =>
      operate(
        context,
        'sharePlannerCollection',
        {
          params: { collectionId: input.collectionId, personId: input.withPersonId },
          body: { role: input.role },
        },
        as,
      ),
  });
}

export function unshare(): Selection {
  return selection({
    input: z.strictObject({
      collectionId: FIELDS.collectionId,
      withPersonId: FIELDS.withPersonId,
    }),
    run: async (context, input, as) => {
      await operate(
        context,
        'unsharePlannerCollection',
        { params: { collectionId: input.collectionId, personId: input.withPersonId } },
        as,
      );
      return { unshared: input.collectionId, person: input.withPersonId };
    },
  });
}

export function guestsSet(): Selection {
  return selection({
    input: z.strictObject({ itemId: z.uuid(), guests: FIELDS.guests }),
    run: (context, input, as) =>
      operate(
        context,
        'setPlannerGuests',
        { params: { itemId: input.itemId }, body: { guests: input.guests } },
        as,
      ),
  });
}

export function rsvp(): Selection {
  return selection({
    input: z.strictObject({ itemId: z.uuid(), rsvp: FIELDS.rsvp }),
    run: (context, input, as) =>
      operate(
        context,
        'respondPlannerInvite',
        { params: { itemId: input.itemId }, body: input.rsvp },
        as,
      ),
  });
}

export function feedAdd(): Selection {
  return selection({
    input: z.strictObject({ feed: FIELDS.feed }),
    run: (context, input, as) => operate(context, 'createPlannerFeed', { body: input.feed }, as),
  });
}

export function feedRefresh(): Selection {
  return selection({
    input: COLLECTION,
    run: (context, input, as) =>
      operate(context, 'refreshPlannerFeed', { params: { collectionId: input.collectionId } }, as),
  });
}

type TimedContext = OperatingContext & Pick<ToolContext, 'clock'>;

function timed(context: OperatingContext): context is TimedContext {
  return 'clock' in context;
}

export function importIcs(): Selection {
  return selection({
    input: z.strictObject({ collectionId: FIELDS.collectionId, ics: FIELDS.ics }),
    run: (context, input, as) => {
      if (!timed(context)) throw new ToolError('This tool has no clock to import with');
      const { store } = context;
      const profileId = profileFor(context, as);
      const collection = resolveCollection(store, profileId, input.collectionId, 'write');
      if (collection.source === 'feed') {
        throw new ToolError('A subscribed calendar cannot be imported into.');
      }
      try {
        return importCalendarText(store, () => context.clock.now(), {
          profileId,
          collectionId: collection.id,
          text: input.ics,
          defaultZone: store.settings.read().time_zone,
        });
      } catch (cause) {
        if (cause instanceof IcalParseError) throw new ToolError(cause.message);
        throw cause;
      }
    },
  });
}

export function exportLink(): Selection {
  return selection({
    input: z.strictObject({ collectionId: FIELDS.collectionId, link: FIELDS.link }),
    run: async (context, input, as) => {
      const params = { collectionId: input.collectionId };
      if (input.link === 'publish') {
        return operate(context, 'createPlannerExportLink', { params }, as);
      }
      await operate(context, 'deletePlannerExportLink', { params }, as);
      return { stopped: input.collectionId };
    },
  });
}

export function bookingPageSet(): Selection {
  return selection({
    input: BOOKING_PAGE_SET,
    run: (context, input, as) =>
      'page' in input
        ? operate(context, 'createPlannerBookingPage', { body: input.page }, as)
        : operate(
            context,
            'updatePlannerBookingPage',
            { params: { pageId: input.pageId }, body: input.pageChanges },
            as,
          ),
  });
}

export function bookingPageRemove(): Selection {
  return selection({
    input: z.strictObject({ pageId: FIELDS.pageId }),
    run: async (context, input, as) => {
      await operate(context, 'deletePlannerBookingPage', { params: { pageId: input.pageId } }, as);
      return { removed: input.pageId };
    },
  });
}
