import { LIBRARY_FILTERS, PHOTO_GROUP_KINDS, PHOTO_LABEL } from '@smarteverything/domain';
import { z } from 'zod';
import { operate } from './acting';
import { FOLDER_KEY } from './photo-folder-tools';
import { selection, type Selection } from './selected-tool';

const ID = z.uuid();
const CURSOR = z.string().min(1);
const DAY = z.iso.date();
const TEXT = z.string().trim().min(1);
const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const PHOTO_READ_FIELDS = {
  groupId: ID.optional().describe('A person or pet id from view people, for view person'),
  groupKind: z
    .enum(PHOTO_GROUP_KINDS)
    .optional()
    .describe('person or pet, to list only those, for view people'),
  groupIds: z
    .array(ID)
    .min(1)
    .optional()
    .describe(
      'Only photos that show every one of these people or pets, for views library and archive',
    ),
  labels: z
    .array(PHOTO_LABEL)
    .min(1)
    .optional()
    .describe('Only photos tagged with every one of these things, for views library and archive'),
  photoText: TEXT.optional().describe(
    'Only photos with these words written in them, for views library and archive',
  ),
  meaning: TEXT.optional().describe(
    'Describe what the photo shows in plain words; finds it by meaning when Smart search is on, for views library and archive',
  ),
} as const;

const SCOPE_SHAPE = {
  libraryFilter: z.enum(LIBRARY_FILTERS).default('all'),
  text: TEXT.optional(),
  from: DAY.optional(),
  to: DAY.optional(),
  placeId: z.int().positive().optional(),
  countryCode: z.string().length(2).optional(),
  camera: TEXT.optional(),
  albumId: ID.optional(),
  folderKey: FOLDER_KEY.optional(),
  allFolders: z.boolean().optional(),
  groupIds: PHOTO_READ_FIELDS.groupIds,
  labels: PHOTO_READ_FIELDS.labels,
  photoText: PHOTO_READ_FIELDS.photoText,
  meaning: PHOTO_READ_FIELDS.meaning,
  cursor: CURSOR.optional(),
} as const;

const SCOPED = z.strictObject({ ...SCOPE_SHAPE, month: MONTH.optional() });

type Scoped = z.output<typeof SCOPED>;

function scopeOf(input: Scoped): Record<string, unknown> {
  const {
    month: _month,
    libraryFilter,
    cursor: _cursor,
    folderKey,
    allFolders,
    groupIds,
    labels,
    ...rest
  } = input;
  return {
    filter: libraryFilter,
    ...rest,
    ...(folderKey === undefined ? {} : { folder: folderKey }),
    ...(allFolders === true ? { folders: 'all' } : {}),
    ...(groupIds === undefined ? {} : { groupIds: groupIds.join(',') }),
    ...(labels === undefined ? {} : { labels: labels.join(',') }),
  };
}

function pageQuery(input: Scoped): Record<string, unknown> {
  return { ...scopeOf(input), ...(input.cursor === undefined ? {} : { cursor: input.cursor }) };
}

function scoped(
  buckets: 'readLibraryBuckets' | 'readArchiveBuckets',
  page: 'readLibraryPage' | 'readArchivePage',
): Selection {
  return selection({
    input: SCOPED,
    run: (context, input, as) =>
      input.month === undefined
        ? operate(context, buckets, { query: scopeOf(input) }, as)
        : operate(context, page, { params: { month: input.month }, query: pageQuery(input) }, as),
  });
}

export function library(): Selection {
  return scoped('readLibraryBuckets', 'readLibraryPage');
}

function archive(): Selection {
  return scoped('readArchiveBuckets', 'readArchivePage');
}

function people(): Selection {
  return selection({
    input: z.strictObject({ groupKind: z.enum(PHOTO_GROUP_KINDS).optional() }),
    run: (context, input, as) =>
      operate(
        context,
        'listPhotoGroups',
        { query: input.groupKind === undefined ? {} : { kind: input.groupKind } },
        as,
      ),
  });
}

function person(): Selection {
  return selection({
    input: z.strictObject({
      groupId: ID,
      month: MONTH.optional(),
      libraryFilter: z.enum(LIBRARY_FILTERS).default('all'),
      cursor: CURSOR.optional(),
    }),
    run: async (context, input, as) => {
      const scope = { filter: input.libraryFilter, groupIds: input.groupId };
      if (input.month !== undefined) {
        return operate(
          context,
          'readLibraryPage',
          {
            params: { month: input.month },
            query: { ...scope, ...(input.cursor === undefined ? {} : { cursor: input.cursor }) },
          },
          as,
        );
      }
      const group = await operate(
        context,
        'readPhotoGroup',
        { params: { groupId: input.groupId } },
        as,
      );
      const months = await operate(context, 'readLibraryBuckets', { query: scope }, as);
      return { group, months };
    },
  });
}

function itemFaces(): Selection {
  return selection({
    input: z.strictObject({ itemId: ID }),
    run: async (context, input, as) => {
      const params = { itemId: input.itemId };
      const faces = await operate(context, 'readPhotoFaces', { params }, as);
      const analysis = await operate(context, 'readPhotoAnalysis', { params }, as);
      return { faces, analysis };
    },
  });
}

function plain(name: 'readPhotoSharing' | 'readPhotoAiStatus' | 'listPhotoAiModels'): Selection {
  return selection({
    input: z.strictObject({}),
    run: (context, _input, as) => operate(context, name, {}, as),
  });
}

function photoEditState(): Selection {
  return selection({
    input: z.strictObject({ itemId: ID }),
    run: (context, input, as) =>
      operate(context, 'readPhotoEdit', { params: { itemId: input.itemId } }, as),
  });
}

function photoEditJob(): Selection {
  return selection({
    input: z.strictObject({ jobId: ID }),
    run: (context, input, as) =>
      operate(context, 'readPhotoEditJob', { params: { jobId: input.jobId } }, as),
  });
}

function albumActivity(): Selection {
  return selection({
    input: z.strictObject({ albumId: ID, cursor: CURSOR.optional() }),
    run: (context, { albumId, ...query }, as) =>
      operate(context, 'listPhotoAlbumActivity', { params: { albumId }, query }, as),
  });
}

export const PHOTO_READS: Readonly<Record<string, Selection>> = {
  people: people(),
  person: person(),
  item_faces: itemFaces(),
  sharing: plain('readPhotoSharing'),
  album_activity: albumActivity(),
  archive: archive(),
  smart_status: plain('readPhotoAiStatus'),
  smart_models: plain('listPhotoAiModels'),
  photo_edit_state: photoEditState(),
  photo_edit_job: photoEditJob(),
};
