import {
  PHOTO_ERASE_STROKE,
  PHOTO_RECIPE,
  PHOTO_SAVE_MODES,
  VIDEO_TRIM,
} from '@smarteverything/domain';
import { z } from 'zod';
import { operate } from './acting';
import { ID, ITEM_IDS, PHOTO_EDIT_FIELDS, TEXT } from './drive-photos-fields';
import { selection, type Selection } from './selected-tool';

function photoEdit(): Selection {
  return selection({
    input: z.strictObject({
      itemId: ID,
      recipe: PHOTO_RECIPE,
      saveMode: z.enum(PHOTO_SAVE_MODES),
    }),
    run: (context, { itemId, recipe, saveMode }, as) =>
      operate(
        context,
        'savePhotoEdit',
        { params: { itemId }, body: { recipe, mode: saveMode } },
        as,
      ),
  });
}

function photoRevert(): Selection {
  return selection({
    input: z.strictObject({ itemId: ID }),
    run: (context, input, as) =>
      operate(context, 'revertPhotoEdit', { params: { itemId: input.itemId } }, as),
  });
}

function photoErase(): Selection {
  return selection({
    input: z.strictObject({ itemId: ID, strokes: z.array(PHOTO_ERASE_STROKE).min(1) }),
    run: (context, { itemId, strokes }, as) =>
      operate(context, 'erasePhotoArea', { params: { itemId }, body: { strokes } }, as),
  });
}

function videoEdit(): Selection {
  return selection({
    input: z
      .strictObject({
        itemId: ID,
        trim: VIDEO_TRIM.nullable().default(null),
        stabilize: z.boolean().default(false),
        saveMode: z.enum(PHOTO_SAVE_MODES),
      })
      .refine((input) => input.trim !== null || input.stabilize, {
        message: 'give trim, stabilize true or both',
        path: ['trim'],
      }),
    run: (context, { itemId, trim, stabilize, saveMode }, as) =>
      operate(
        context,
        'editPhotoVideo',
        { params: { itemId }, body: { trim, stabilize, mode: saveMode } },
        as,
      ),
  });
}

const META = z
  .strictObject({
    itemIds: ITEM_IDS,
    takenAt: z.iso.datetime({ offset: true }).optional(),
    shiftMinutes: z
      .int()
      .refine((minutes) => minutes !== 0, { message: 'shift by at least one minute' })
      .optional(),
    latitude: PHOTO_EDIT_FIELDS.latitude,
    longitude: PHOTO_EDIT_FIELDS.longitude,
    locationLabel: TEXT.nullable().default(null),
    clearLocation: z.literal(true).optional(),
  })
  .refine((meta) => meta.takenAt === undefined || meta.shiftMinutes === undefined, {
    message: 'set the date or shift it, not both',
    path: ['shiftMinutes'],
  })
  .refine((meta) => (meta.latitude === undefined) === (meta.longitude === undefined), {
    message: 'give latitude and longitude together',
    path: ['longitude'],
  })
  .refine((meta) => meta.clearLocation === undefined || meta.latitude === undefined, {
    message: 'set the place or clear it, not both',
    path: ['clearLocation'],
  })
  .refine(
    (meta) =>
      meta.takenAt !== undefined ||
      meta.shiftMinutes !== undefined ||
      meta.latitude !== undefined ||
      meta.clearLocation !== undefined,
    { message: 'change the date, the place or both', path: ['takenAt'] },
  );

type Meta = z.output<typeof META>;

function metaDate(meta: Meta): Record<string, unknown> {
  if (meta.takenAt !== undefined) return { date: { kind: 'set', takenAt: meta.takenAt } };
  if (meta.shiftMinutes !== undefined) {
    return { date: { kind: 'shift', minutes: meta.shiftMinutes } };
  }
  return {};
}

function metaLocation(meta: Meta): Record<string, unknown> {
  if (meta.clearLocation === true) return { location: null };
  if (meta.latitude === undefined || meta.longitude === undefined) return {};
  return {
    location: { latitude: meta.latitude, longitude: meta.longitude, label: meta.locationLabel },
  };
}

function photoMeta(): Selection {
  return selection({
    input: META,
    run: (context, input, as) =>
      operate(
        context,
        'editPhotoMeta',
        { body: { itemIds: input.itemIds, ...metaDate(input), ...metaLocation(input) } },
        as,
      ),
  });
}

function photoDescription(): Selection {
  return selection({
    input: z.strictObject({ itemId: ID, text: TEXT.nullable() }),
    run: (context, input, as) =>
      operate(
        context,
        'setPhotoDescription',
        { params: { itemId: input.itemId }, body: { text: input.text } },
        as,
      ),
  });
}

function itemsOf(name: 'archivePhotos' | 'unarchivePhotos' | 'moveIntoLockedFolder'): Selection {
  return selection({
    input: z.strictObject({ itemIds: ITEM_IDS }),
    run: (context, input, as) => operate(context, name, { body: { itemIds: input.itemIds } }, as),
  });
}

export const PHOTO_MEDIA_EDITS: Readonly<Record<string, Selection>> = {
  photo_edit: photoEdit(),
  photo_revert: photoRevert(),
  photo_erase: photoErase(),
  video_edit: videoEdit(),
  photo_meta: photoMeta(),
  photo_description: photoDescription(),
  archive: itemsOf('archivePhotos'),
  unarchive: itemsOf('unarchivePhotos'),
  locked_move_in: itemsOf('moveIntoLockedFolder'),
};
