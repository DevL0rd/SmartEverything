import type { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  DRIVE_COMMENT_THREAD,
  type DriveComment,
  type DriveCommentAdd,
  type DriveCommentEdit,
  type DriveCommentThread,
} from '@smarteverything/domain';
import { randomUUID } from 'expo-crypto';
import { addDriveComment, editDriveComment } from '../../../api/drive';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';
import {
  showTargets,
  shownTarget,
  writeShownQueries,
  type ShownTarget,
} from '../../../queries/shown-query';

const THREAD_PAGES = z
  .strictObject({
    pages: z.array(
      z.strictObject({
        items: z.array(DRIVE_COMMENT_THREAD).readonly(),
        next: z.string().nullable(),
      }),
    ),
    pageParams: z.array(z.unknown()),
  })
  .readonly();

type ThreadPages = z.infer<typeof THREAD_PAGES>;

type CommentChange = (comment: DriveComment) => DriveComment;

function commentsKey(itemId: string): readonly unknown[] {
  return driveKey('comments', DRIVE_EVERYWHERE, itemId);
}

function threadWith(
  thread: DriveCommentThread,
  id: string,
  change: CommentChange,
): DriveCommentThread {
  if (thread.root.id === id) return { ...thread, root: change(thread.root) };
  if (!thread.replies.some((reply) => reply.id === id)) return thread;
  return {
    ...thread,
    replies: thread.replies.map((reply) => (reply.id === id ? change(reply) : reply)),
  };
}

export function pagesWithComment(
  pages: ThreadPages,
  id: string,
  change: CommentChange,
): ThreadPages {
  return {
    ...pages,
    pages: pages.pages.map((page) => ({
      ...page,
      items: page.items.map((thread) => threadWith(thread, id, change)),
    })),
  };
}

export function pagesWithAdded(pages: ThreadPages, comment: DriveComment): ThreadPages {
  if (comment.parentId !== null) {
    const parentId = comment.parentId;
    return {
      ...pages,
      pages: pages.pages.map((page) => ({
        ...page,
        items: page.items.map((thread) =>
          thread.root.id === parentId
            ? { ...thread, replies: [...thread.replies, comment] }
            : thread,
        ),
      })),
    };
  }
  const last = pages.pages.at(-1);
  if (last?.next !== null) return pages;
  return {
    ...pages,
    pages: [
      ...pages.pages.slice(0, -1),
      { ...last, items: [...last.items, { root: comment, replies: [] }] },
    ],
  };
}

function commentTarget(itemId: string, id: string, change: CommentChange): ShownTarget {
  return shownTarget(commentsKey(itemId), THREAD_PAGES, (pages) =>
    pagesWithComment(pages, id, change),
  );
}

export function resolvedComment(
  comment: DriveComment,
  resolved: boolean,
  viewerId: string,
  now: string,
): DriveComment {
  return resolved
    ? { ...comment, resolvedAt: now, resolvedBy: viewerId }
    : { ...comment, resolvedAt: null, resolvedBy: null };
}

export function deletedComment(comment: DriveComment): DriveComment {
  return { ...comment, body: null, mentions: [], deleted: true };
}

export async function addComment(
  client: QueryClient,
  viewerId: string | null,
  itemId: string,
  body: DriveCommentAdd,
): Promise<DriveComment> {
  const id = randomUUID();
  const shown: DriveComment | null =
    viewerId === null
      ? null
      : {
          id,
          itemId,
          authorProfileId: viewerId,
          parentId: body.parentId,
          body: body.body,
          mentions: body.mentions,
          createdAt: new Date().toISOString(),
          editedAt: null,
          resolvedAt: null,
          resolvedBy: null,
          deleted: false,
        };
  const saved = await writeShownQueries(client, {
    event: 'drive.comment.add',
    targets:
      shown === null
        ? []
        : [shownTarget(commentsKey(itemId), THREAD_PAGES, (pages) => pagesWithAdded(pages, shown))],
    send: () => addDriveComment(itemId, { ...body, id }),
  });
  if (shown !== null) showTargets(client, [commentTarget(itemId, id, () => saved)]);
  return saved;
}

export function editComment(
  client: QueryClient,
  comment: DriveComment,
  body: DriveCommentEdit,
): Promise<unknown> {
  const now = new Date().toISOString();
  return writeShownQueries(client, {
    event: 'drive.comment.edit',
    targets: [
      commentTarget(comment.itemId, comment.id, (current) => ({
        ...current,
        body: body.body,
        mentions: body.mentions,
        editedAt: now,
      })),
    ],
    send: () => editDriveComment(comment.id, body),
  });
}

export function resolveTargets(
  root: DriveComment,
  resolved: boolean,
  viewerId: string | null,
): readonly ShownTarget[] {
  if (viewerId === null) return [];
  const now = new Date().toISOString();
  return [
    commentTarget(root.itemId, root.id, (current) =>
      resolvedComment(current, resolved, viewerId, now),
    ),
  ];
}

export function removeTargets(comment: DriveComment): readonly ShownTarget[] {
  return [commentTarget(comment.itemId, comment.id, deletedComment)];
}
