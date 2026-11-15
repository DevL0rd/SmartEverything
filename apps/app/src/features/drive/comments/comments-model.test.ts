import { describe, expect, it } from 'vitest';
import {
  DRIVE_COMMENT,
  DRIVE_COMMENT_THREAD,
  type DriveComment,
  type DriveCommentThread,
} from '@smarteverything/domain';
import {
  bodyPartsOf,
  canPost,
  commentRightsOf,
  mayComment,
  mayResolve,
  mentionQueryOf,
  mentionsIn,
  moderatesComments,
  openLabelOf,
  repliesLabelOf,
  resolvedByLineOf,
  resolvedLabelOf,
  suggestionsOf,
  threadGroupsOf,
  seesOf,
  unsharedMentionsOf,
  withMention,
} from './comments-model';

const ITEM = 'c0000000-0000-4000-8000-000000000001';
const ME = 'c0000000-0000-4000-8000-000000000010';
const SAM = 'c0000000-0000-4000-8000-000000000011';
const ROBIN = 'c0000000-0000-4000-8000-000000000012';
const AT = '2026-11-14T09:00:00.000+01:00';

const PEOPLE = [
  { id: ME, name: 'Alex' },
  { id: SAM, name: 'Sam Lee' },
  { id: ROBIN, name: 'Robin' },
];

function comment(n: number, author: string, patch: Partial<DriveComment> = {}): DriveComment {
  return DRIVE_COMMENT.parse({
    id: `c0000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
    itemId: ITEM,
    authorProfileId: author,
    parentId: null,
    body: 'Looks good',
    mentions: [],
    createdAt: AT,
    editedAt: null,
    resolvedAt: null,
    resolvedBy: null,
    deleted: false,
    ...patch,
  });
}

function thread(root: DriveComment, replies: readonly DriveComment[] = []): DriveCommentThread {
  return DRIVE_COMMENT_THREAD.parse({ root, replies });
}

describe('threads', () => {
  const open = thread(comment(1, SAM), [comment(2, ME, { parentId: comment(1, SAM).id })]);
  const resolved = thread(comment(3, ROBIN, { resolvedAt: AT, resolvedBy: ME }));

  it('splits open threads from resolved ones and keeps their order', () => {
    expect(threadGroupsOf([resolved, open])).toEqual({ open: [open], resolved: [resolved] });
  });

  it('counts replies and threads in words', () => {
    expect(repliesLabelOf(open)).toBe('1 reply');
    expect(repliesLabelOf(resolved)).toBeNull();
    expect(resolvedLabelOf(1)).toBe('1 resolved thread');
    expect(resolvedLabelOf(1200)).toBe('1,200 resolved threads');
    expect(openLabelOf(0)).toBe('No open comments');
    expect(openLabelOf(3)).toBe('3 open threads');
  });

  it('says who resolved a thread', () => {
    const nameOf = (id: string): string | null => PEOPLE.find((p) => p.id === id)?.name ?? null;
    expect(resolvedByLineOf(resolved, nameOf, Date.parse(AT))).toMatch(/^Resolved by Alex /);
    expect(resolvedByLineOf(open, nameOf, Date.parse(AT))).toBeNull();
  });
});

describe('rights', () => {
  it('lets authors edit and remove their own comments', () => {
    expect(commentRightsOf(comment(1, ME), ME, false)).toEqual({ edit: true, remove: true });
    expect(commentRightsOf(comment(1, SAM), ME, false)).toEqual({ edit: false, remove: false });
  });

  it('lets the drive owner and the Shared Drive remove any comment but not edit it', () => {
    expect(moderatesComments('own')).toBe(true);
    expect(moderatesComments('shared')).toBe(true);
    expect(moderatesComments('edit')).toBe(false);
    expect(commentRightsOf(comment(1, SAM), ME, true)).toEqual({ edit: false, remove: true });
  });

  it('offers nothing on a deleted comment', () => {
    const gone = comment(1, ME, { body: null, deleted: true });
    expect(commentRightsOf(gone, ME, true)).toEqual({ edit: false, remove: false });
  });

  it('lets the thread starter or a moderator resolve', () => {
    const mine = thread(comment(1, ME));
    const theirs = thread(comment(2, SAM));
    expect(mayResolve(mine, ME, false)).toBe(true);
    expect(mayResolve(theirs, ME, false)).toBe(false);
    expect(mayResolve(theirs, ME, true)).toBe(true);
  });

  it('lets anyone who can open the item comment while online', () => {
    expect(mayComment('view', true)).toBe(true);
    expect(mayComment('view', false)).toBe(false);
    expect(mayComment('none', true)).toBe(false);
    expect(canPost('  ', false)).toBe(false);
    expect(canPost('Hi', true)).toBe(false);
    expect(canPost('Hi', false)).toBe(true);
  });
});

describe('mentions', () => {
  it('opens the picker after an @ at a word start', () => {
    expect(mentionQueryOf('Hi @')).toBe('');
    expect(mentionQueryOf('@Sa')).toBe('Sa');
    expect(mentionQueryOf('mail me@home')).toBeNull();
    expect(mentionQueryOf('Hi @Sam ')).toBeNull();
    expect(mentionQueryOf('Hi there')).toBeNull();
  });

  it('suggests other people by any word of their name, ignoring accents', () => {
    expect(suggestionsOf('', PEOPLE, ME).map((p) => p.name)).toEqual(['Sam Lee', 'Robin']);
    expect(suggestionsOf('le', PEOPLE, ME).map((p) => p.name)).toEqual(['Sam Lee']);
    expect(suggestionsOf('RÓB', PEOPLE, ME).map((p) => p.name)).toEqual(['Robin']);
    expect(suggestionsOf('al', PEOPLE, ME)).toEqual([]);
  });

  it('puts the picked name in place of the typed query', () => {
    const sam = { id: SAM, name: 'Sam Lee' };
    expect(withMention('Thanks @sa', sam)).toBe('Thanks @Sam Lee ');
    expect(withMention('Thanks', sam)).toBe('Thanks @Sam Lee ');
    expect(withMention('', sam)).toBe('@Sam Lee ');
  });

  it('finds mentions still in the text, longest name first', () => {
    const people = [...PEOPLE, { id: 'c0000000-0000-4000-8000-000000000013', name: 'Sam' }];
    expect(mentionsIn('@Sam Lee and @Robin, also @Robin', people)).toEqual([SAM, ROBIN]);
    expect(mentionsIn('mail@Robin', people)).toEqual([]);
    expect(mentionsIn('@Robinson', people)).toEqual([]);
  });

  it('splits a body into plain text and mentions', () => {
    expect(bodyPartsOf('Ask @Robin today', PEOPLE)).toEqual([
      { text: 'Ask ', mention: null },
      { text: '@Robin', mention: { id: ROBIN, name: 'Robin' } },
      { text: ' today', mention: null },
    ]);
    expect(bodyPartsOf('No one', PEOPLE)).toEqual([{ text: 'No one', mention: null }]);
  });

  it('lists mentioned people who cannot open the item yet', () => {
    expect(unsharedMentionsOf([SAM, ROBIN], (id) => id === SAM)).toEqual([ROBIN]);
  });

  it('counts a grant on any folder above as access, not only the parent', () => {
    const sees = seesOf({
      ownerProfileId: 'owner',
      coveringIds: ['file', 'parent', 'grandparent'],
      grants: [
        { itemId: 'grandparent', profileId: SAM },
        { itemId: 'elsewhere', profileId: ROBIN },
      ],
    });
    expect(sees('owner')).toBe(true);
    expect(sees(SAM)).toBe(true);
    expect(unsharedMentionsOf([SAM, ROBIN], sees)).toEqual([ROBIN]);
  });
});
