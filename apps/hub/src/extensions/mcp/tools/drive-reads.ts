import {
  DRIVE_ALBUM_SURFACES,
  DRIVE_ITEM_KINDS,
  DRIVE_READ_VIEWS,
  DRIVE_RECENT_FILTERS,
  DRIVE_SORT_FIELDS,
  LIBRARY_FILTERS,
  type EndpointName,
} from '@smarteverything/domain';
import { z } from 'zod';
import { operate, profileFor } from './acting';
import { PERSON as ANY_PERSON, READS, ToolError } from './registry';
import { selection, type SelectedToolDefinition, type Selection } from './selected-tool';

const DAY = z.iso.date();

export const PERSON = ANY_PERSON.describe(
  'You: the person asking. A drive is never read or changed for another person, the owner included.',
);

export function ownDrive(
  selections: Readonly<Record<string, Selection>>,
): Record<string, Selection> {
  return Object.fromEntries(
    Object.entries(selections).map(([key, chosen]) => [
      key,
      {
        issues: chosen.issues,
        run: (context, fields, as): unknown => {
          if (as.personId !== undefined && as.personId !== profileFor(context, {})) {
            throw new ToolError(
              'A drive is read and changed only for the person asking; nobody, the owner included, reaches another person’s drive. The owner sees per-person space totals in view usage.',
              'forbidden',
            );
          }
          return chosen.run(context, fields, as);
        },
      },
    ]),
  );
}

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
  recentFilter: z.enum(DRIVE_RECENT_FILTERS),
  surface: z.enum(DRIVE_ALBUM_SURFACES),
  placeId: z.int().positive(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  countryCode: z.string().length(2),
  camera: z.string().trim().min(1),
} as const;

export const DRIVE_READ_INPUT = z.strictObject({
  view: z.enum(DRIVE_READ_VIEWS).describe('What to read'),
  personId: PERSON,
  rootId: DRIVE_FIELDS.rootId.optional().describe('A drive id from view drives'),
  folderId: DRIVE_FIELDS.folderId.optional().describe('A folder id from view folder or search'),
  itemId: DRIVE_FIELDS.itemId.optional().describe('A file or folder id, for item and versions'),
  albumId: DRIVE_FIELDS.albumId.optional().describe('An album id from view albums'),
  stackId: DRIVE_FIELDS.stackId.optional().describe('A stack id from view stacks'),
  placeId: DRIVE_FIELDS.placeId.optional().describe('A place id from view places'),
  cursor: DRIVE_FIELDS.cursor.optional().describe('The next value of the previous page'),
  text: DRIVE_FIELDS.text.optional().describe('Words in the name, for view search'),
  kinds: DRIVE_FIELDS.kinds.optional().describe('Kinds to keep, for view search'),
  starred: z.boolean().optional().describe('Only starred files when true, for view search'),
  from: DAY.optional().describe('First day taken, for view search (YYYY-MM-DD)'),
  to: DAY.optional().describe('Last day taken, for view search (YYYY-MM-DD)'),
  sortField: DRIVE_FIELDS.sortField.optional().describe('Sort field for view folder and search'),
  sortDirection: DRIVE_FIELDS.sortDirection.optional().describe('asc or desc, with sortField'),
  filter: DRIVE_FIELDS.recentFilter
    .optional()
    .describe('For view recent: everything, opened, added or changed'),
  surface: DRIVE_FIELDS.surface.optional().describe('photos or drive albums, for view albums'),
  month: DRIVE_FIELDS.month
    .optional()
    .describe('One month of the Photos Library, for view library'),
  libraryFilter: z
    .enum(LIBRARY_FILTERS)
    .optional()
    .describe('For view library: all, favourites, videos or screenshots (default all)'),
  countryCode: DRIVE_FIELDS.countryCode
    .optional()
    .describe('Two-letter country code, for view library'),
  camera: DRIVE_FIELDS.camera.optional().describe('Camera make and model text, for view library'),
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

function places(): Selection {
  return selection({
    input: z.strictObject({ placeId: DRIVE_FIELDS.placeId.optional() }),
    run: (context, input, as) =>
      input.placeId === undefined
        ? operate(context, 'listPlaces', {}, as)
        : operate(context, 'readPlace', { params: { placeId: String(input.placeId) } }, as),
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

const LIBRARY = z.strictObject({
  month: DRIVE_FIELDS.month.optional(),
  libraryFilter: z.enum(LIBRARY_FILTERS).default('all'),
  text: DRIVE_FIELDS.text.optional(),
  from: DAY.optional(),
  to: DAY.optional(),
  placeId: DRIVE_FIELDS.placeId.optional(),
  countryCode: DRIVE_FIELDS.countryCode.optional(),
  camera: DRIVE_FIELDS.camera.optional(),
  albumId: DRIVE_FIELDS.albumId.optional(),
  cursor: DRIVE_FIELDS.cursor.optional(),
});

function libraryScope(input: z.output<typeof LIBRARY>): Record<string, unknown> {
  const { month: _month, libraryFilter, cursor: _cursor, ...rest } = input;
  return { filter: libraryFilter, ...rest };
}

function library(): Selection {
  return selection({
    input: LIBRARY,
    run: (context, input, as) =>
      input.month === undefined
        ? operate(context, 'readLibraryBuckets', { query: libraryScope(input) }, as)
        : operate(
            context,
            'readLibraryPage',
            {
              params: { month: input.month },
              query: {
                ...libraryScope(input),
                ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
              },
            },
            as,
          ),
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
  selections: ownDrive({
    drives: plain('listRoots'),
    shared_with_me: paged('listSharedWithMe'),
    shared_by_me: paged('listSharedByMe'),
    folder: folder(),
    item: item(),
    search: search(),
    library: library(),
    albums: albums(),
    album: album(),
    trash: rootPaged('listTrash'),
    stats: plain('readDriveStats'),
    duplicates: rootPaged('listDuplicates'),
    places: places(),
    stacks: stacks(),
    backup: plain('readBackupState'),
    recent: recent(),
    versions: versions(),
    shares: shares(),
    usage: plain('readUsage'),
    health: plain('readHealth'),
    placements: plain('listPlacements'),
    conflicts: rootPaged('listConflicts'),
  }),
};
