import { DRIVE_MATCHES, type EndpointName } from '@smarteverything/domain';
import { z } from 'zod';
import { operate } from './acting';
import { selection, type Selection } from './selected-tool';

const ID = z.uuid();
const CURSOR = z.string().min(1);
const ITEM_ID = ID;

export const SOCIAL_READ_FIELDS = {
  match: z
    .enum(DRIVE_MATCHES)
    .optional()
    .describe('For view search: all looks in names and inside files, names only looks in names'),
  box: z
    .enum(['made', 'waiting'])
    .optional()
    .describe('For view access_requests: made by you, or waiting for you to answer'),
  requestId: ID.optional().describe(
    'A file request id from view file_requests, to read what it received',
  ),
  clientId: ID.optional().describe('A phone id, for view offline'),
} as const;

function paged(name: EndpointName, shape: z.ZodRawShape = {}): Selection {
  return selection({
    input: z.strictObject({ ...shape, cursor: CURSOR.optional() }),
    run: (context, input, as) => operate(context, name, { query: input }, as),
  });
}

function pagedOfItem(name: EndpointName): Selection {
  return selection({
    input: z.strictObject({ itemId: ITEM_ID, cursor: CURSOR.optional() }),
    run: (context, { itemId, ...query }, as) =>
      operate(context, name, { params: { itemId }, query }, as),
  });
}

function itemText(): Selection {
  return selection({
    input: z.strictObject({ itemId: ITEM_ID }),
    run: (context, input, as) =>
      operate(context, 'readItemText', { params: { itemId: input.itemId } }, as),
  });
}

function accessRequests(): Selection {
  return selection({
    input: z.strictObject({
      box: z.enum(['made', 'waiting']).default('waiting'),
      itemId: ITEM_ID.optional(),
      cursor: CURSOR.optional(),
    }),
    run: (context, { box, itemId, cursor }, as) =>
      itemId === undefined
        ? operate(
            context,
            'listDriveAccessRequests',
            { query: { box, ...(cursor === undefined ? {} : { cursor }) } },
            as,
          )
        : operate(context, 'openItem', { params: { itemId } }, as),
  });
}

function fileRequests(): Selection {
  return selection({
    input: z.strictObject({
      folderId: ID.optional(),
      requestId: ID.optional(),
      cursor: CURSOR.optional(),
    }),
    run: (context, { folderId, requestId, cursor }, as) => {
      const page = cursor === undefined ? {} : { cursor };
      return requestId === undefined
        ? operate(
            context,
            'listFileRequests',
            { query: { ...page, ...(folderId === undefined ? {} : { folderItemId: folderId }) } },
            as,
          )
        : operate(
            context,
            'listFileRequestUploads',
            { params: { fileRequestId: requestId }, query: page },
            as,
          );
    },
  });
}

export const SOCIAL_READS: Readonly<Record<string, Selection>> = {
  zip: pagedOfItem('listZipEntries'),
  text: itemText(),
  comments: pagedOfItem('listComments'),
  suggested: paged('listSuggested'),
  notifications: paged('listNotifications'),
  access_requests: accessRequests(),
  file_requests: fileRequests(),
  transfers: paged('listTransfers'),
  offline: paged('listOffline', { clientId: ID.optional() }),
};
