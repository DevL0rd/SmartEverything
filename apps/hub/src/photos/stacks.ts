import { ApiError, type Stack, type StackKind } from '@smarteverything/domain';
import { z } from 'zod';
import type { DriveActor } from '../drive/access';
import { DRIVE_PAGE_SIZE } from '../drive/service-read';
import type { StoreContext } from '../store/context';
import { DriveMediaRepository } from '../store/repositories/drive-media';
import { DriveStacksRepository, type DriveStackKind } from '../store/repositories/drive-stacks';
import { jsonText } from '../store/sql';
import { PHOTO_VISIBLE, photoVisible } from './membership';

export const BURST_GAP_MS = 1000;

const DISPLAYABLE = ['image/jpeg', 'image/heic', 'image/heif', 'image/png', 'image/webp'];

const KIND: Readonly<Record<DriveStackKind, StackKind>> = { burst: 'burst', stem: 'raw_jpeg' };

const NEIGHBOUR = z.strictObject({ id: z.string(), taken_at: z.string() });

const STACK_ID = z.strictObject({ id: z.string() });

const MEMBER = z.strictObject({ id: z.string(), mime: z.string().nullable() });

const SUBJECT = z.strictObject({
  root_id: z.string(),
  parent_id: z.string().nullable(),
  taken_at: z.string().nullable(),
  kind: z.string(),
});

const ELIGIBLE = `i.kind = 'image' and i.taken_at is not null
  and i.root_id = $root and i.parent_id is $parent
  and (m.stack_id is null or s.kind = 'burst')
  and (m.stem_key is null or (select count(*) from drive_media x where x.stem_key = m.stem_key) < 2)`;

const NEIGHBOUR_FROM = `drive_items i join drive_media m on m.item_id = i.id
  left join drive_stacks s on s.id = m.stack_id`;

export interface Formation {
  readonly stackId: string;
  readonly kind: DriveStackKind;
  readonly itemIds: readonly string[];
}

interface Subject {
  readonly rootId: string;
  readonly parentId: string | null;
  readonly takenAt: string;
}

function missing(): ApiError {
  return new ApiError('not_found', 'There is no such stack for this person.');
}

export class StacksService {
  private readonly media: DriveMediaRepository;
  private readonly stacks: DriveStacksRepository;

  constructor(private readonly context: StoreContext) {
    this.media = new DriveMediaRepository(context);
    this.stacks = new DriveStacksRepository(context);
  }

  form(itemId: string): Formation | null {
    const media = this.media.find(itemId);
    if (media === undefined) return null;
    const stem = media.stem_key === null ? [] : this.media.withStemKey(media.stem_key);
    if (stem.length >= 2) {
      return this.join(
        'stem',
        stem.map((row) => row.item_id),
      );
    }
    const subject = this.subject(itemId);
    const chain = subject === null ? [] : this.chain(itemId, subject);
    if (chain.length >= 2) return this.join('burst', chain);
    this.leave(itemId);
    return null;
  }

  leave(itemId: string): void {
    const stackId = this.media.find(itemId)?.stack_id ?? null;
    if (stackId === null) return;
    this.media.assignStack([itemId], null);
    this.dissolveIfSmall(stackId);
  }

  list(actor: DriveActor, cursor: string | undefined): { items: Stack[]; next: string | null } {
    const ids = this.context.sql.all(
      STACK_ID,
      `select s.id from drive_stacks s
         join drive_media m on m.stack_id = s.id
         join drive_items i on i.id = m.item_id
         join drive_roots r on r.id = i.root_id
       where ${PHOTO_VISIBLE} and ($after is null or s.id > $after)
       group by s.id having count(*) >= 2 order by s.id limit $limit`,
      { ...photoVisible(actor).parameters, after: cursor ?? null, limit: DRIVE_PAGE_SIZE },
    );
    const last = ids.at(-1);
    return {
      items: ids.map((row) => this.read(actor, row.id)),
      next: ids.length === DRIVE_PAGE_SIZE && last !== undefined ? last.id : null,
    };
  }

  read(actor: DriveActor, stackId: string): Stack {
    const stack = this.stacks.find(stackId);
    const members = stack === undefined ? [] : this.visibleMembers(actor, stackId);
    if (stack === undefined || members.length < 2) throw missing();
    const ids = members.map((member) => member.id);
    const [first] = ids;
    if (first === undefined) throw missing();
    const cover =
      stack.cover_item_id !== null && ids.includes(stack.cover_item_id)
        ? stack.cover_item_id
        : first;
    return { id: stack.id, kind: KIND[stack.kind], coverItemId: cover, itemIds: ids };
  }

  makeCover(actor: DriveActor, stackId: string, itemId: string): Stack {
    const stack = this.read(actor, stackId);
    if (!stack.itemIds.includes(itemId)) {
      throw new ApiError('invalid_request', 'The cover has to be a photo of the stack.');
    }
    this.stacks.setCover(stackId, itemId);
    return this.read(actor, stackId);
  }

  private join(kind: DriveStackKind, ids: readonly string[]): Formation {
    const known = [
      ...new Set(this.media.list(ids).flatMap((member) => member.stack_id ?? [])),
    ].sort();
    const strays: string[] = [];
    const stackId = this.context.write(() => {
      const target =
        known.find((id) => this.stacks.find(id)?.kind === kind) ??
        this.stacks.create(kind, this.coverOf(kind, ids)).id;
      strays.push(
        ...this.media
          .inStack(target)
          .map((row) => row.item_id)
          .filter((id) => !ids.includes(id)),
      );
      this.media.assignStack(strays, null);
      this.media.assignStack(ids, target);
      for (const id of known.filter((one) => one !== target)) this.dissolveIfSmall(id);
      const cover = this.stacks.byId(target).cover_item_id;
      if (cover === null || !ids.includes(cover)) {
        this.stacks.setCover(target, this.coverOf(kind, ids));
      }
      return target;
    });
    for (const stray of strays) this.form(stray);
    return { stackId, kind, itemIds: ids };
  }

  private coverOf(kind: DriveStackKind, ids: readonly string[]): string {
    const first = ids[0] ?? '';
    if (kind === 'burst') return first;
    const rows = this.context.sql.all(
      MEMBER,
      'select id, mime from drive_items where id in (select value from json_each($ids)) order by id',
      { ids: jsonText(ids) },
    );
    return (
      rows.find((row) => row.mime !== null && DISPLAYABLE.includes(row.mime))?.id ??
      rows[0]?.id ??
      first
    );
  }

  private dissolveIfSmall(stackId: string): void {
    const left = this.media.inStack(stackId);
    if (left.length >= 2) return;
    this.media.assignStack(
      left.map((row) => row.item_id),
      null,
    );
    this.stacks.remove(stackId);
  }

  private subject(itemId: string): Subject | null {
    const row = this.context.sql.get(
      SUBJECT,
      'select root_id, parent_id, taken_at, kind from drive_items where id = $itemId',
      { itemId },
    );
    if (row?.kind !== 'image' || row.taken_at === null) return null;
    return { rootId: row.root_id, parentId: row.parent_id, takenAt: row.taken_at };
  }

  private chain(itemId: string, subject: Subject): string[] {
    const before = this.walk(itemId, subject, 'before');
    const after = this.walk(itemId, subject, 'after');
    return [...before.reverse(), itemId, ...after];
  }

  private walk(itemId: string, subject: Subject, side: 'before' | 'after'): string[] {
    const found: string[] = [];
    let at = { id: itemId, taken_at: subject.takenAt };
    for (;;) {
      const next = this.neighbour(subject, at, side);
      if (next === undefined) return found;
      const gap = Math.abs(Date.parse(next.taken_at) - Date.parse(at.taken_at));
      if (gap > BURST_GAP_MS) return found;
      found.push(next.id);
      at = next;
    }
  }

  private neighbour(
    subject: Subject,
    at: z.output<typeof NEIGHBOUR>,
    side: 'before' | 'after',
  ): z.output<typeof NEIGHBOUR> | undefined {
    const before = side === 'before';
    return this.context.sql.get(
      NEIGHBOUR,
      `select i.id, i.taken_at from ${NEIGHBOUR_FROM}
       where ${ELIGIBLE} and (i.taken_at, i.id) ${before ? '<' : '>'} ($at, $id)
       order by i.taken_at ${before ? 'desc' : 'asc'}, i.id ${before ? 'desc' : 'asc'} limit 1`,
      { root: subject.rootId, parent: subject.parentId, at: at.taken_at, id: at.id },
    );
  }

  private visibleMembers(actor: DriveActor, stackId: string): { id: string }[] {
    return this.context.sql.all(
      STACK_ID,
      `select i.id from drive_media m
         join drive_items i on i.id = m.item_id
         join drive_roots r on r.id = i.root_id
       where m.stack_id = $stackId and ${PHOTO_VISIBLE}
       order by i.taken_at is null, i.taken_at, i.id`,
      { ...photoVisible(actor).parameters, stackId },
    );
  }
}
