import type { DriveComment, DriveCommentThread, DriveGrant } from '@smarteverything/domain';
import { count } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { moment } from '../../../format/time';
import type { DriveAccess } from '../model/drive-access';

export interface CommentPerson {
  readonly id: string;
  readonly name: string;
}

export interface ThreadGroups {
  readonly open: readonly DriveCommentThread[];
  readonly resolved: readonly DriveCommentThread[];
}

export function threadGroupsOf(threads: readonly DriveCommentThread[]): ThreadGroups {
  return {
    open: threads.filter((thread) => thread.root.resolvedAt === null),
    resolved: threads.filter((thread) => thread.root.resolvedAt !== null),
  };
}

export function moderatesComments(access: DriveAccess): boolean {
  return access === 'own' || access === 'shared';
}

export interface CommentRights {
  readonly edit: boolean;
  readonly remove: boolean;
}

export function commentRightsOf(
  comment: DriveComment,
  viewerId: string | null,
  moderator: boolean,
): CommentRights {
  if (comment.deleted) return { edit: false, remove: false };
  const author = viewerId !== null && comment.authorProfileId === viewerId;
  return { edit: author, remove: author || moderator };
}

export function mayResolve(
  thread: DriveCommentThread,
  viewerId: string | null,
  moderator: boolean,
): boolean {
  return moderator || (viewerId !== null && thread.root.authorProfileId === viewerId);
}

export interface SeesInput {
  readonly ownerProfileId: string | null;
  readonly coveringIds: readonly string[];
  readonly grants: readonly Pick<DriveGrant, 'itemId' | 'profileId'>[];
}

export function seesOf(input: SeesInput): (profileId: string) => boolean {
  const covering = new Set(input.coveringIds);
  return (profileId) =>
    profileId === input.ownerProfileId ||
    input.grants.some((grant) => grant.profileId === profileId && covering.has(grant.itemId));
}

export function mayComment(access: DriveAccess, online: boolean): boolean {
  return online && access !== 'none';
}

const MENTION_AT_END = /(^|\s)@([\p{L}\p{N}\p{M}'-]*)$/u;

export function mentionQueryOf(body: string): string | null {
  const found = MENTION_AT_END.exec(body);
  return found === null ? null : (found[2] ?? '');
}

function folded(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function suggestionsOf<Person extends CommentPerson>(
  query: string,
  people: readonly Person[],
  viewerId: string | null,
): readonly Person[] {
  const wanted = folded(query.trim());
  return people.filter((person) => {
    if (person.id === viewerId) return false;
    if (wanted === '') return true;
    const name = folded(person.name);
    return name.startsWith(wanted) || name.split(/\s+/).some((word) => word.startsWith(wanted));
  });
}

export function withMention(body: string, person: CommentPerson): string {
  const found = MENTION_AT_END.exec(body);
  const at = found === null ? body.length : found.index + (found[1] ?? '').length;
  const before = body.slice(0, at);
  const gap = before === '' || /\s$/.test(before) ? '' : ' ';
  return `${before}${gap}@${person.name} `;
}

function longestFirst(people: readonly CommentPerson[]): readonly CommentPerson[] {
  return [...people].sort((first, second) => second.name.length - first.name.length);
}

function mentionAt(
  body: string,
  at: number,
  people: readonly CommentPerson[],
): CommentPerson | null {
  if (body.charAt(at) !== '@') return null;
  const before = at === 0 ? '' : body.charAt(at - 1);
  if (before !== '' && !/\s|[([{"'“‘]/u.test(before)) return null;
  for (const person of people) {
    const end = at + 1 + person.name.length;
    if (body.slice(at + 1, end) !== person.name) continue;
    const after = body.charAt(end);
    if (after === '' || !/[\p{L}\p{N}]/u.test(after)) return person;
  }
  return null;
}

export interface BodyPart {
  readonly text: string;
  readonly mention: CommentPerson | null;
}

export function bodyPartsOf(body: string, people: readonly CommentPerson[]): readonly BodyPart[] {
  const ordered = longestFirst(people);
  const parts: BodyPart[] = [];
  let plain = '';
  let at = 0;
  while (at < body.length) {
    const person = mentionAt(body, at, ordered);
    if (person === null) {
      plain += body.charAt(at);
      at += 1;
    } else {
      if (plain !== '') parts.push({ text: plain, mention: null });
      plain = '';
      parts.push({ text: `@${person.name}`, mention: person });
      at += person.name.length + 1;
    }
  }
  if (plain !== '') parts.push({ text: plain, mention: null });
  return parts;
}

export function mentionsIn(body: string, people: readonly CommentPerson[]): readonly string[] {
  const ids = bodyPartsOf(body, people).flatMap((part) =>
    part.mention === null ? [] : [part.mention.id],
  );
  return [...new Set(ids)];
}

export function unsharedMentionsOf(
  mentions: readonly string[],
  sees: (profileId: string) => boolean,
): readonly string[] {
  return mentions.filter((profileId) => !sees(profileId));
}

export function stampOf(comment: DriveComment, now: number): string {
  return joinParts([moment(comment.createdAt, now), comment.editedAt === null ? null : 'edited']);
}

export const DELETED_COMMENT = 'Comment deleted';

export function repliesLabelOf(thread: DriveCommentThread): string | null {
  const replies = thread.replies.length;
  if (replies === 0) return null;
  return replies === 1 ? '1 reply' : `${count(replies)} replies`;
}

export function resolvedLabelOf(resolved: number): string {
  return resolved === 1 ? '1 resolved thread' : `${count(resolved)} resolved threads`;
}

export function openLabelOf(open: number): string {
  if (open === 0) return 'No open comments';
  return open === 1 ? '1 open thread' : `${count(open)} open threads`;
}

export function resolvedByLineOf(
  thread: DriveCommentThread,
  nameOf: (profileId: string) => string | null,
  now: number,
): string | null {
  const { resolvedAt, resolvedBy } = thread.root;
  if (resolvedAt === null || resolvedBy === null) return null;
  return `Resolved by ${nameOf(resolvedBy) ?? 'someone'} ${moment(resolvedAt, now)}`;
}

export function canPost(body: string, busy: boolean): boolean {
  return !busy && body.trim() !== '';
}
