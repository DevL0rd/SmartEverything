import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const DRIVE_COMMENT_BODY = z.string().trim().min(1);

export const DRIVE_COMMENT = z
  .strictObject({
    id: ID,
    itemId: ID,
    authorProfileId: ID,
    parentId: ID.nullable(),
    body: DRIVE_COMMENT_BODY.nullable(),
    mentions: z.array(ID).readonly(),
    createdAt: MOMENT,
    editedAt: MOMENT.nullable(),
    resolvedAt: MOMENT.nullable(),
    resolvedBy: ID.nullable(),
    deleted: z.boolean(),
  })
  .superRefine((comment, context) => {
    if (comment.deleted !== (comment.body === null)) {
      context.addIssue({
        code: 'custom',
        message: 'a deleted comment has no body and every other comment has one',
        path: ['body'],
      });
    }
    if ((comment.resolvedAt === null) !== (comment.resolvedBy === null)) {
      context.addIssue({
        code: 'custom',
        message: 'a resolved thread names when and by whom',
        path: ['resolvedBy'],
      });
    }
    if (comment.parentId !== null && comment.resolvedAt !== null) {
      context.addIssue({
        code: 'custom',
        message: 'only the first comment of a thread is resolved',
        path: ['resolvedAt'],
      });
    }
  })
  .readonly();

export type DriveComment = z.infer<typeof DRIVE_COMMENT>;

export const DRIVE_COMMENT_THREAD = z
  .strictObject({
    root: DRIVE_COMMENT,
    replies: z.array(DRIVE_COMMENT).readonly(),
  })
  .superRefine((thread, context) => {
    if (thread.root.parentId !== null) {
      context.addIssue({
        code: 'custom',
        message: 'a thread starts with a comment that is not a reply',
        path: ['root', 'parentId'],
      });
    }
    thread.replies.forEach((reply, index) => {
      if (reply.parentId !== thread.root.id || reply.itemId !== thread.root.itemId) {
        context.addIssue({
          code: 'custom',
          message: 'a reply belongs to the thread it sits in',
          path: ['replies', index, 'parentId'],
        });
      }
    });
  })
  .readonly();

export type DriveCommentThread = z.infer<typeof DRIVE_COMMENT_THREAD>;

export const DRIVE_COMMENT_ADD = z
  .strictObject({
    body: DRIVE_COMMENT_BODY,
    parentId: ID.nullable(),
    mentions: z.array(ID).readonly(),
  })
  .readonly();

export type DriveCommentAdd = z.infer<typeof DRIVE_COMMENT_ADD>;

export const DRIVE_COMMENT_EDIT = z
  .strictObject({ body: DRIVE_COMMENT_BODY, mentions: z.array(ID).readonly() })
  .readonly();

export type DriveCommentEdit = z.infer<typeof DRIVE_COMMENT_EDIT>;

export const DRIVE_COMMENT_RESOLVE = z.strictObject({ resolved: z.boolean() }).readonly();

export type DriveCommentResolve = z.infer<typeof DRIVE_COMMENT_RESOLVE>;
