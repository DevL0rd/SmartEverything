import { DRIVE_FOLDER_COLOURS, DRIVE_GRANT_ROLES } from '@smarteverything/domain';
import { z } from 'zod';
import { operate } from './acting';
import { selection, type Selection } from './selected-tool';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const TEXT = z.string().trim().min(1);
const ITEM_ID = ID;
const MENTIONS = z.array(ID).default([]);

export const SOCIAL_EDIT_FIELDS = {
  commentId: ID.optional().describe('A comment id from drive_read view comments'),
  body: TEXT.optional().describe('The comment text, for comment_add and comment_edit'),
  threadId: ID.optional().describe('The first comment of the thread to reply to, for comment_add'),
  mentions: z
    .array(ID)
    .optional()
    .describe('People ids with access to the item to mention, for comment_add and comment_edit'),
  resolved: z
    .boolean()
    .optional()
    .describe('false reopens a resolved thread, for comment_resolve; true when left out'),
  shortcutId: ID.optional().describe('A shortcut id from a folder listing'),
  requestId: ID.optional().describe(
    'An access request id from view access_requests, or a file request id from view file_requests',
  ),
  decision: z
    .enum(['approve', 'decline'])
    .optional()
    .describe('For access_answer; approve needs role'),
  message: TEXT.optional().describe('A note for the owner or for the people who get the link'),
  title: TEXT.optional().describe('The file request title, for file_request_create and update'),
  folderId: ID.optional().describe('The folder to collect files into, for file_request_create'),
  expiresAt: MOMENT.nullable()
    .optional()
    .describe(
      'When access or a file request ends; for share_people, access_answer, file_request_create and file_request_update',
    ),
  locked: z
    .boolean()
    .optional()
    .describe('true makes the item view only for people it is shared with, for lock_set'),
  colour: z
    .enum(DRIVE_FOLDER_COLOURS)
    .nullable()
    .optional()
    .describe('The folder colour only you see, null or left out clears it, for folder_colour'),
  transferId: ID.optional().describe('A transfer id from view transfers'),
  accept: z.boolean().optional().describe('For transfer_answer'),
  ids: z.array(ID).min(1).optional().describe('Notification ids from view notifications'),
  all: z.literal(true).optional().describe('Mark every notification read, for notifications_read'),
  clientId: ID.optional().describe('A phone id from the paired phones, for offline_set'),
  on: z
    .boolean()
    .optional()
    .describe('false stops keeping the item offline, for offline_set; true when left out'),
} as const;

function commentAdd(): Selection {
  return selection({
    input: z.strictObject({
      itemId: ITEM_ID,
      body: TEXT,
      threadId: ID.optional(),
      mentions: MENTIONS,
    }),
    run: (context, input, as) =>
      operate(
        context,
        'addComment',
        {
          params: { itemId: input.itemId },
          body: { body: input.body, parentId: input.threadId ?? null, mentions: input.mentions },
        },
        as,
      ),
  });
}

function commentEdit(): Selection {
  return selection({
    input: z.strictObject({ commentId: ID, body: TEXT, mentions: MENTIONS }),
    run: (context, input, as) =>
      operate(
        context,
        'editComment',
        {
          params: { commentId: input.commentId },
          body: { body: input.body, mentions: input.mentions },
        },
        as,
      ),
  });
}

function commentResolve(): Selection {
  return selection({
    input: z.strictObject({ commentId: ID, resolved: z.boolean().default(true) }),
    run: (context, input, as) =>
      operate(
        context,
        'resolveComment',
        { params: { commentId: input.commentId }, body: { resolved: input.resolved } },
        as,
      ),
  });
}

function commentRemove(): Selection {
  return selection({
    input: z.strictObject({ commentId: ID }),
    run: (context, input, as) =>
      operate(context, 'removeComment', { params: { commentId: input.commentId } }, as),
  });
}

interface Where {
  readonly parentId?: string | undefined;
  readonly rootId?: string | undefined;
}

function placeOf({ parentId, rootId }: Where): Record<string, string> | null {
  if (parentId !== undefined) return { kind: 'folder', folderId: parentId };
  if (rootId !== undefined) return { kind: 'drive', rootId };
  return null;
}

function atMostOnePlace(where: Where): boolean {
  return where.parentId === undefined || where.rootId === undefined;
}

function shortcutCreate(): Selection {
  return selection({
    input: z
      .strictObject({
        itemId: ITEM_ID,
        name: TEXT,
        parentId: ID.optional(),
        rootId: ID.optional(),
      })
      .refine((input) => placeOf(input) !== null && atMostOnePlace(input), {
        message: 'give parentId for a folder or rootId for the top of a drive, not both',
        path: ['parentId'],
      }),
    run: (context, input, as) =>
      operate(
        context,
        'createShortcut',
        { body: { targetItemId: input.itemId, name: input.name, place: placeOf(input) } },
        as,
      ),
  });
}

function shortcutUpdate(): Selection {
  return selection({
    input: z
      .strictObject({
        shortcutId: ID,
        name: TEXT.optional(),
        parentId: ID.optional(),
        rootId: ID.optional(),
      })
      .refine((input) => atMostOnePlace(input), {
        message: 'give parentId for a folder or rootId for the top of a drive, not both',
        path: ['parentId'],
      })
      .refine((input) => input.name !== undefined || placeOf(input) !== null, {
        message: 'name at least one thing to change',
        path: ['name'],
      }),
    run: (context, input, as) => {
      const place = placeOf(input);
      return operate(
        context,
        'updateShortcut',
        {
          params: { shortcutId: input.shortcutId },
          body: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(place === null ? {} : { place }),
          },
        },
        as,
      );
    },
  });
}

function shortcutRemove(): Selection {
  return selection({
    input: z.strictObject({ shortcutId: ID }),
    run: (context, input, as) =>
      operate(context, 'removeShortcut', { params: { shortcutId: input.shortcutId } }, as),
  });
}

function accessRequest(): Selection {
  return selection({
    input: z.strictObject({
      itemId: ITEM_ID,
      role: z.enum(DRIVE_GRANT_ROLES).default('view'),
      message: TEXT.optional(),
    }),
    run: (context, input, as) =>
      operate(
        context,
        'requestDriveAccess',
        { body: { itemId: input.itemId, role: input.role, message: input.message ?? null } },
        as,
      ),
  });
}

const ANSWER = z.discriminatedUnion('decision', [
  z.strictObject({
    requestId: ID,
    decision: z.literal('approve'),
    role: z.enum(DRIVE_GRANT_ROLES),
    expiresAt: MOMENT.nullable().default(null),
  }),
  z.strictObject({ requestId: ID, decision: z.literal('decline') }),
]);

function accessAnswer(): Selection {
  return selection({
    input: ANSWER,
    run: (context, input, as) => {
      const { requestId, ...answer } = input;
      return operate(
        context,
        'answerDriveAccessRequest',
        { params: { requestId }, body: answer },
        as,
      );
    },
  });
}

function fileRequestCreate(): Selection {
  return selection({
    input: z.strictObject({
      folderId: ID,
      title: TEXT,
      message: TEXT.optional(),
      expiresAt: MOMENT.nullable().default(null),
    }),
    run: (context, input, as) =>
      operate(
        context,
        'createFileRequest',
        {
          body: {
            folderItemId: input.folderId,
            title: input.title,
            message: input.message ?? null,
            expiresAt: input.expiresAt,
          },
        },
        as,
      ),
  });
}

function fileRequestUpdate(): Selection {
  return selection({
    input: z.strictObject({
      requestId: ID,
      title: TEXT.optional(),
      message: TEXT.nullable().optional(),
      expiresAt: MOMENT.nullable().optional(),
    }),
    run: (context, { requestId, ...change }, as) =>
      operate(
        context,
        'updateFileRequest',
        { params: { fileRequestId: requestId }, body: change },
        as,
      ),
  });
}

function fileRequestClose(): Selection {
  return selection({
    input: z.strictObject({ requestId: ID }),
    run: (context, input, as) =>
      operate(context, 'closeFileRequest', { params: { fileRequestId: input.requestId } }, as),
  });
}

function lockSet(): Selection {
  return selection({
    input: z.strictObject({ itemId: ITEM_ID, locked: z.boolean() }),
    run: (context, input, as) => operate(context, 'setItemLock', { body: input }, as),
  });
}

function folderColour(): Selection {
  return selection({
    input: z.strictObject({
      itemId: ITEM_ID,
      colour: z.enum(DRIVE_FOLDER_COLOURS).nullable().default(null),
    }),
    run: (context, input, as) => operate(context, 'setFolderColour', { body: input }, as),
  });
}

function transferOffer(): Selection {
  return selection({
    input: z.strictObject({ itemId: ITEM_ID, recipientId: ID }),
    run: (context, input, as) =>
      operate(
        context,
        'offerTransfer',
        { body: { itemId: input.itemId, toProfileId: input.recipientId } },
        as,
      ),
  });
}

function transferAnswer(): Selection {
  return selection({
    input: z.strictObject({ transferId: ID, accept: z.boolean() }),
    run: (context, input, as) =>
      operate(
        context,
        'answerTransfer',
        { params: { transferId: input.transferId }, body: { accept: input.accept } },
        as,
      ),
  });
}

function transferCancel(): Selection {
  return selection({
    input: z.strictObject({ transferId: ID }),
    run: (context, input, as) =>
      operate(context, 'cancelTransfer', { params: { transferId: input.transferId } }, as),
  });
}

function notificationsRead(): Selection {
  return selection({
    input: z.union([
      z.strictObject({ ids: z.array(ID).min(1) }),
      z.strictObject({ all: z.literal(true) }),
    ]),
    run: (context, input, as) => operate(context, 'markNotificationsRead', { body: input }, as),
  });
}

function offlineSet(): Selection {
  return selection({
    input: z.strictObject({ clientId: ID, itemId: ITEM_ID, on: z.boolean().default(true) }),
    run: (context, input, as) => operate(context, 'setOffline', { body: input }, as),
  });
}

export const SOCIAL_EDITS: Readonly<Record<string, Selection>> = {
  comment_add: commentAdd(),
  comment_edit: commentEdit(),
  comment_resolve: commentResolve(),
  comment_remove: commentRemove(),
  shortcut_create: shortcutCreate(),
  shortcut_update: shortcutUpdate(),
  shortcut_remove: shortcutRemove(),
  access_request: accessRequest(),
  access_answer: accessAnswer(),
  file_request_create: fileRequestCreate(),
  file_request_update: fileRequestUpdate(),
  file_request_close: fileRequestClose(),
  lock_set: lockSet(),
  folder_colour: folderColour(),
  transfer_offer: transferOffer(),
  transfer_answer: transferAnswer(),
  transfer_cancel: transferCancel(),
  notifications_read: notificationsRead(),
  offline_set: offlineSet(),
};
