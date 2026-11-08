import {
  DRIVE_ALBUM_SURFACES,
  DRIVE_ITEM_KINDS,
  DRIVE_READ_VIEWS,
  DRIVE_RECENT_FILTERS,
  DRIVE_SORT_FIELDS,
  PHOTO_TIMELINE_FILTERS,
  type EndpointName,
} from '@smarteverything/domain';
import { z } from 'zod';
import { operate } from './acting';
import { PERSON, READS } from './registry';
import { selection, type SelectedToolDefinition, type Selection } from './selected-tool';

const DAY = z.iso.date();

export const DRIVE_FIELDS = {
  rootId: z.uuid(),
  folderId: z.uuid(),
  itemId: z.uuid(),
  albumId: z.uuid(),
  stackId: z.uuid(),
  cursor: z.string().min(1),
  text: z.string().trim().min(1),
  kinds: z.array(z.enum(DRIVE_ITEM_KINDS)).min(1),
  sortField: z.enum(DRIVE_SORT_FIELDS),
  sortDirection: z.enum(['asc', 'desc']),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  timelineFilter: z.enum(PHOTO_TIMELINE_FILTERS),
  recentFilter: z.enum(DRIVE_RECENT_FILTERS),
  surface: z.enum(DRIVE_ALBUM_SURFACES),
  memoryId: z.string().min(1),
  placeId: z.int().positive(),
} as const;

export const DRIVE_READ_INPUT = z.strictObject({
  view: z.enum(DRIVE_READ_VIEWS).describe('What to read'),
  personId: PERSON,
  rootId: DRIVE_FIELDS.rootId.optional().describe('A library folder id from view roots'),
  folderId: DRIVE_FIELDS.folderId.optional().describe('A folder id from view folder or search'),
  itemId: DRIVE_FIELDS.itemId.optional().describe('A file or folder id, for item and versions'),
  albumId: DRIVE_FIELDS.albumId.optional().describe('An album id from view albums'),
  stackId: DRIVE_FIELDS.stackId.optional().describe('A stack id from view stacks'),
  memoryId: DRIVE_FIELDS.memoryId.optional().describe('A memory id from view memories'),
  placeId: DRIVE_FIELDS.placeId.optional().describe('A place id from view places'),
  cursor: DRIVE_FIELDS.cursor.optional().describe('The next value of the previous page'),
  text: DRIVE_FIELDS.text.optional().describe('Words in the name, for view search'),
  kinds: DRIVE_FIELDS.kinds.optional().describe('Kinds to keep, for view search'),
  starred: z.boolean().optional().describe('Only starred files when true, for view search'),
  from: DAY.optional().describe('First day taken, for view search (YYYY-MM-DD)'),
  to: DAY.optional().describe('Last day taken, for view search (YYYY-MM-DD)'),
  sortField: DRIVE_FIELDS.sortField.optional().describe('Sort field for view folder and search'),
  sortDirection: DRIVE_FIELDS.sortDirection.optional().describe('asc or desc, with sortField'),
  month: DRIVE_FIELDS.month.optional().describe('A month as YYYY-MM, for view timeline'),
  filter: z
    .enum([...PHOTO_TIMELINE_FILTERS, ...DRIVE_RECENT_FILTERS])
    .optional()
    .describe(
      'For view timeline: all, favourites, videos or screenshots; for recent: everything, opened, added or changed',
    ),
  surface: DRIVE_FIELDS.surface.optional().describe('photos or drive albums, for view albums'),
});

function plain(name: EndpointName): Selection {
  return selection({
    input: z.strictObject({}),
    run: (context, _input, as) => operate(context, name, {}, as),
  });
}

function paged(name: EndpointName, shape: z.ZodRawShape = {}): Selection {
  return selection({
    input: z.strictObject({ ...shape, cursor: DRIVE_FIELDS.cursor.optional() }),
    run: (context, input, as) => operate(context, name, { query: input }, as),
  });
}

function item(): Selection {
  return selection({
    input: z.strictObject({ itemId: DRIVE_FIELDS.itemId }),
    run: (context, input, as) =>
      operate(context, 'readItem', { params: { itemId: input.itemId } }, as),
  });
}

function album(): Selection {
  return selection({
    input: z.strictObject({
      albumId: DRIVE_FIELDS.albumId,
      cursor: DRIVE_FIELDS.cursor.optional(),
    }),
    run: (context, { albumId, ...query }, as) =>
      operate(context, 'listAlbumItems', { params: { albumId }, query }, as),
  });
}

function versions(): Selection {
  return selection({
    input: z.strictObject({
      itemId: DRIVE_FIELDS.itemId,
      cursor: DRIVE_FIELDS.cursor.optional(),
    }),
    run: (context, { itemId, ...query }, as) =>
      operate(context, 'listVersions', { params: { itemId }, query }, as),
  });
}

const SEARCH_FIELDS = {
  text: DRIVE_FIELDS.text.optional(),
  rootId: DRIVE_FIELDS.rootId.optional(),
  folderId: DRIVE_FIELDS.folderId.optional(),
  kinds: DRIVE_FIELDS.kinds.optional(),
  starred: z.boolean().optional(),
  from: DAY.optional(),
  to: DAY.optional(),
  sortField: DRIVE_FIELDS.sortField.optional(),
  sortDirection: DRIVE_FIELDS.sortDirection.optional(),
  cursor: DRIVE_FIELDS.cursor.optional(),
};

const SEARCH = z.strictObject(SEARCH_FIELDS);

function orNull<T>(value: T | undefined): T | null {
  return value ?? null;
}

function searchBody(input: z.output<typeof SEARCH>): Record<string, unknown> {
  return {
    text: orNull(input.text),
    rootId: orNull(input.rootId),
    folderId: orNull(input.folderId),
    kinds: orNull(input.kinds),
    starred: orNull(input.starred),
    duration: null,
    taken:
      input.from === undefined && input.to === undefined
        ? null
        : { from: orNull(input.from), to: orNull(input.to) },
    sort: {
      field: input.sortField ?? 'modifiedAt',
      direction: input.sortDirection ?? 'desc',
    },
    cursor: orNull(input.cursor),
  };
}

function search(): Selection {
  return selection({
    input: SEARCH,
    run: (context, input, as) => operate(context, 'searchDrive', { body: searchBody(input) }, as),
  });
}

function timeline(): Selection {
  return selection({
    input: z.strictObject({
      filter: DRIVE_FIELDS.timelineFilter.default('all'),
      placeId: DRIVE_FIELDS.placeId.optional(),
      month: DRIVE_FIELDS.month.optional(),
      cursor: DRIVE_FIELDS.cursor.optional(),
    }),
    run: (context, { month, ...query }, as) =>
      month === undefined
        ? operate(context, 'readTimelineBuckets', { query }, as)
        : operate(context, 'readTimelinePage', { params: { month }, query }, as),
  });
}

function places(): Selection {
  return selection({
    input: z.strictObject({ placeId: DRIVE_FIELDS.placeId.optional() }),
    run: (context, input, as) =>
      input.placeId === undefined
        ? operate(context, 'listPlaces', {}, as)
        : operate(context, 'readPlace', { params: { placeId: String(input.placeId) } }, as),
  });
}

function memories(): Selection {
  return selection({
    input: z.strictObject({
      memoryId: DRIVE_FIELDS.memoryId.optional(),
      cursor: DRIVE_FIELDS.cursor.optional(),
    }),
    run: (context, { memoryId, ...query }, as) =>
      memoryId === undefined
        ? operate(context, 'listMemories', {}, as)
        : operate(context, 'listMemoryItems', { params: { memoryId }, query }, as),
  });
}

function stacks(): Selection {
  return selection({
    input: z.strictObject({
      stackId: DRIVE_FIELDS.stackId.optional(),
      cursor: DRIVE_FIELDS.cursor.optional(),
    }),
    run: (context, { stackId, ...query }, as) =>
      stackId === undefined
        ? operate(context, 'listStacks', { query }, as)
        : operate(context, 'readStack', { params: { stackId } }, as),
  });
}

function folder(): Selection {
  return selection({
    input: z
      .strictObject({
        rootId: DRIVE_FIELDS.rootId,
        folderId: DRIVE_FIELDS.folderId.optional(),
        sortField: DRIVE_FIELDS.sortField.optional(),
        sortDirection: DRIVE_FIELDS.sortDirection.optional(),
        cursor: DRIVE_FIELDS.cursor.optional(),
      })
      .refine((query) => (query.sortField === undefined) === (query.sortDirection === undefined), {
        message: 'name both sortField and sortDirection, or neither',
        path: ['sortDirection'],
      }),
    run: (context, input, as) => operate(context, 'browseFolder', { query: input }, as),
  });
}

function albums(): Selection {
  return selection({
    input: z.strictObject({ surface: DRIVE_FIELDS.surface.default('photos') }),
    run: (context, input, as) => operate(context, 'listAlbums', { query: input }, as),
  });
}

function rootPaged(name: EndpointName): Selection {
  return paged(name, { rootId: DRIVE_FIELDS.rootId.optional() });
}

function recent(): Selection {
  return selection({
    input: z.strictObject({
      filter: DRIVE_FIELDS.recentFilter.default('everything'),
      cursor: DRIVE_FIELDS.cursor.optional(),
    }),
    run: (context, input, as) => operate(context, 'readRecent', { query: input }, as),
  });
}

function shares(): Selection {
  return paged('listShares', { itemId: DRIVE_FIELDS.itemId.optional() });
}

export const DRIVE_READ: SelectedToolDefinition = {
  name: 'drive_read',
  selector: 'view',
  input: DRIVE_READ_INPUT,
  annotations: READS,
  action: false,
  selections: {
    roots: plain('listRoots'),
    folder: folder(),
    timeline: timeline(),
    item: item(),
    search: search(),
    albums: albums(),
    album: album(),
    trash: rootPaged('listTrash'),
    stats: plain('readDriveStats'),
    duplicates: rootPaged('listDuplicates'),
    memories: memories(),
    places: places(),
    stacks: stacks(),
    backup: plain('readBackupState'),
    recent: recent(),
    versions: versions(),
    shares: shares(),
    usage: plain('readUsage'),
    health: plain('readHealth'),
    sync: plain('listSyncClients'),
    conflicts: rootPaged('listConflicts'),
  },
};
