import {
  DRIVE_COMMENT,
  DRIVE_COMMENT_THREAD,
  type DriveComment,
  type DriveCommentThread,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';

export class DriveCommentParentError extends Error {
  override readonly name = 'DriveCommentParentError';

  constructor(
    readonly itemId: string,
    readonly parentId: string,
  ) {
    super(`The comment ${parentId} is not the first comment of a thread on the item ${itemId}.`);
  }
}

const COLUMNS = `id, item_id, author_profile_id, parent_id, body, mentions, created_at, edited_at,
  resolved_at, resolved_by, deleted_at`;

const COMMENT_COLUMNS = z.strictObject({
  id: z.string(),
  item_id: z.string(),
  author_profile_id: z.string(),
  parent_id: z.string().nullable(),
  body: z.string().nullable(),
  mentions: SQL_JSON.pipe(z.array(z.string())),
  created_at: z.string(),
  edited_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  resolved_by: z.string().nullable(),
  deleted_at: z.string().nullable(),
});

const STORED_COMMENT = storedRow(
  COMMENT_COLUMNS.transform((row): DriveComment =>
    DRIVE_COMMENT.parse({
      id: row.id,
      itemId: row.item_id,
      authorProfileId: row.author_profile_id,
      parentId: row.parent_id,
      body: row.body,
      mentions: row.mentions,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      deleted: row.deleted_at !== null,
    }),
  ),
  {},
);

const PARTICIPANT = z.strictObject({ author_profile_id: z.string() });

const COUNT = z.strictObject({ replies: z.number() });

export interface DriveCommentInput {
  readonly id?: string | undefined;
  readonly itemId: string;
  readonly authorProfileId: string;
  readonly parentId: string | null;
  readonly body: string;
  readonly mentions: readonly string[];
}

export interface DriveCommentWindow {
  readonly threads: readonly DriveCommentThread[];
  readonly next: string | null;
}

export class DriveCommentsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): DriveComment | undefined {
    return this.context.sql.get(
      STORED_COMMENT,
      `select ${COLUMNS} from drive_comments where id = $id`,
      { id },
    );
  }

  byId(id: string): DriveComment {
    return found(this.find(id), 'drive comment', id);
  }

  threads(itemId: string, after: string | null, limit: number): DriveCommentWindow {
    const roots = this.context.sql.all(
      STORED_COMMENT,
      `select ${COLUMNS} from drive_comments r
        where r.item_id = $itemId and r.parent_id is null
          ${after === null ? '' : 'and (r.created_at, r.id) > (select created_at, id from drive_comments where id = $after)'}
        order by r.created_at, r.id limit $limit`,
      after === null ? { itemId, limit } : { itemId, after, limit },
    );
    const threads = roots.map((root) =>
      DRIVE_COMMENT_THREAD.parse({
        root,
        replies: this.context.sql.all(
          STORED_COMMENT,
          `select ${COLUMNS} from drive_comments where parent_id = $rootId order by created_at, id`,
          { rootId: root.id },
        ),
      }),
    );
    const last = roots.at(-1);
    return {
      threads,
      next: roots.length === limit && last !== undefined ? last.id : null,
    };
  }

  participants(rootId: string): string[] {
    return this.context.sql
      .all(
        PARTICIPANT,
        `select author_profile_id from drive_comments
          where (id = $rootId or parent_id = $rootId) and deleted_at is null
          group by author_profile_id order by min(created_at), author_profile_id`,
        { rootId },
      )
      .map((row) => row.author_profile_id);
  }

  add(input: DriveCommentInput): DriveComment {
    return this.context.write(() => {
      if (input.parentId !== null) {
        const parent = this.find(input.parentId);
        if (parent?.itemId !== input.itemId || parent.parentId !== null) {
          throw new DriveCommentParentError(input.itemId, input.parentId);
        }
      }
      const id = input.id ?? this.context.newId();
      this.context.sql.run(
        'add the drive comment',
        `insert into drive_comments (id, item_id, author_profile_id, parent_id, body, mentions,
          created_at) values ($id, $itemId, $authorProfileId, $parentId, $body, $mentions, $now)`,
        {
          id,
          itemId: input.itemId,
          authorProfileId: input.authorProfileId,
          parentId: input.parentId,
          body: input.body,
          mentions: jsonText(input.mentions),
          now: this.context.now(),
        },
      );
      this.announce(input.itemId);
      return this.byId(id);
    });
  }

  edit(id: string, body: string, mentions: readonly string[]): DriveComment {
    return this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'edit the drive comment',
        `update drive_comments set body = $body, mentions = $mentions, edited_at = $now
          where id = $id and deleted_at is null`,
        { id, body, mentions: jsonText(mentions), now: this.context.now() },
      );
      this.announce(before.itemId);
      return this.byId(id);
    });
  }

  resolve(id: string, resolvedBy: string | null): DriveComment {
    return this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'resolve or reopen the drive comment thread',
        `update drive_comments set resolved_at = $at, resolved_by = $by
          where id = $id and parent_id is null`,
        {
          id,
          at: resolvedBy === null ? null : this.context.now(),
          by: resolvedBy,
        },
      );
      this.announce(before.itemId);
      return this.byId(id);
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      const comment = this.byId(id);
      const replies =
        this.context.sql.get(
          COUNT,
          'select count(*) as replies from drive_comments where parent_id = $id',
          { id },
        )?.replies ?? 0;
      if (comment.parentId === null && replies > 0) {
        this.context.sql.run(
          'clear the deleted drive comment',
          'update drive_comments set body = null, deleted_at = $now where id = $id',
          { id, now: this.context.now() },
        );
      } else {
        this.context.sql.run(
          'remove the drive comment',
          'delete from drive_comments where id = $id',
          {
            id,
          },
        );
        this.removeEmptiedRoot(comment.parentId);
      }
      this.announce(comment.itemId);
    });
  }

  private removeEmptiedRoot(rootId: string | null): void {
    if (rootId === null) return;
    this.context.sql.run(
      'remove the deleted drive comment that has no replies left',
      `delete from drive_comments where id = $rootId and deleted_at is not null
        and not exists (select 1 from drive_comments where parent_id = $rootId)`,
      { rootId },
    );
  }

  private announce(itemId: string): void {
    this.context.notice({ type: 'drive_comments_changed', itemId });
  }
}
