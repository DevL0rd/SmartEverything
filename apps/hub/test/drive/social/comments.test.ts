import type { DriveComment, DriveNotification } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveComments } from '../../../src/drive/social/comments';
import { SHARED_FILE, TRIP, TRIP_FILE, openSocial, share, type Social } from './social-fixture';

let social: Social;
let comments: DriveComments;

beforeEach(async () => {
  social = await openSocial();
  comments = new DriveComments({ store: social.opened.store, read: social.read });
  share(social, TRIP, social.robin, 'view');
  share(social, TRIP, social.kim, 'edit');
});

afterEach(async () => {
  await social.opened.close();
});

function started(body = 'Looks good', mentions: string[] = []): DriveComment {
  return comments.add(social.robin, TRIP_FILE, { body, parentId: null, mentions });
}

function inbox(profileId: string): readonly DriveNotification[] {
  return social.opened.store.driveNotifications.list(profileId, null, 50).notifications;
}

describe('comments', () => {
  it('lets a view grantee comment and lists threads with replies oldest first', () => {
    const root = started();
    const reply = comments.add(social.sam, TRIP_FILE, {
      body: 'Thanks',
      parentId: root.id,
      mentions: [],
    });
    const page = comments.list(social.kim, TRIP_FILE, undefined);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.root.id).toBe(root.id);
    expect(page.items[0]?.replies.map((comment) => comment.id)).toEqual([reply.id]);
  });

  it('hides the item and its comments from someone with no access', () => {
    const root = started();
    const stranger = { profileId: social.opened.store.profiles.create({ name: 'Zed' }).id };
    expect(() => comments.list(stranger, TRIP_FILE, undefined)).toThrow(/no such/);
    expect(() =>
      comments.add(stranger, TRIP_FILE, { body: 'hi', parentId: null, mentions: [] }),
    ).toThrow();
    expect(() => comments.resolve(stranger, root.id, true)).toThrow(/no such comment/);
  });

  it('lets only the author edit and only the author or the owner delete', () => {
    const root = started();
    expect(() => comments.edit(social.sam, root.id, { body: 'x', mentions: [] })).toThrow(
      /Only the author/,
    );
    expect(() => {
      comments.remove(social.kim, root.id);
    }).toThrow(/Only the author or the owner/);
    expect(comments.edit(social.robin, root.id, { body: 'Better', mentions: [] }).body).toBe(
      'Better',
    );
    comments.remove(social.sam, root.id);
    expect(comments.list(social.sam, TRIP_FILE, undefined).items).toHaveLength(0);
  });

  it('keeps a deleted first comment in a thread that has replies', () => {
    const root = started();
    comments.add(social.sam, TRIP_FILE, { body: 'Reply', parentId: root.id, mentions: [] });
    comments.remove(social.robin, root.id);
    const thread = comments.list(social.sam, TRIP_FILE, undefined).items[0];
    expect(thread?.root).toMatchObject({ deleted: true, body: null });
    expect(thread?.replies).toHaveLength(1);
    expect(() => comments.edit(social.robin, root.id, { body: 'x', mentions: [] })).toThrow();
  });

  it('resolves and reopens a thread for its owner and its starter but not for others', () => {
    const root = started();
    expect(() => comments.resolve(social.kim, root.id, true)).toThrow(/Only the owner/);
    expect(comments.resolve(social.robin, root.id, true).resolvedBy).toBe(social.robin.profileId);
    expect(comments.resolve(social.sam, root.id, false).resolvedAt).toBeNull();
    const reply = comments.add(social.sam, TRIP_FILE, {
      body: 'r',
      parentId: root.id,
      mentions: [],
    });
    expect(() => comments.resolve(social.sam, reply.id, true)).toThrow(/first comment/);
  });

  it('refuses a reply to a comment that is not the start of a thread on the item', () => {
    const root = started();
    const reply = comments.add(social.sam, TRIP_FILE, {
      body: 'r',
      parentId: root.id,
      mentions: [],
    });
    expect(() =>
      comments.add(social.sam, TRIP_FILE, { body: 'rr', parentId: reply.id, mentions: [] }),
    ).toThrow(/first comment of a thread/);
  });

  it('refuses to mention a person who cannot open the item and unknown people', () => {
    const outsider = social.opened.store.profiles.create({ name: 'Zed' }).id;
    expect(() => started('hi', [outsider])).toThrow(/Zed cannot open a.txt/);
    expect(() => started('hi', ['0e000000-0000-4000-8000-0000000000aa'])).toThrow(/no such person/);
    expect(social.opened.store.driveComments.threads(TRIP_FILE, null, 10).threads).toHaveLength(0);
  });

  it('counts a mention once even when repeated', () => {
    const root = started('hi', [social.kim.profileId, social.kim.profileId]);
    expect(root.mentions).toEqual([social.kim.profileId]);
  });

  it('works for any home member in the Shared Drive', () => {
    const root = comments.add(social.kim, SHARED_FILE, {
      body: 'hi',
      parentId: null,
      mentions: [],
    });
    expect(comments.resolve(social.robin, root.id, true).resolvedAt).not.toBeNull();
    comments.remove(social.sam, root.id);
  });
});

describe('comment notifications', () => {
  it('tells the owner and edit grantees about a new thread but not the author or view grantees', () => {
    comments.add(social.kim, TRIP_FILE, { body: 'hello', parentId: null, mentions: [] });
    expect(inbox(social.sam.profileId).map((row) => row.kind)).toEqual(['commented']);
    expect(inbox(social.kim.profileId)).toHaveLength(0);
    expect(inbox(social.robin.profileId)).toHaveLength(0);
  });

  it('tells a mentioned person once, as mentioned, even when they would also be told as owner', () => {
    comments.add(social.kim, TRIP_FILE, {
      body: 'hey @Sam',
      parentId: null,
      mentions: [social.sam.profileId, social.robin.profileId],
    });
    expect(inbox(social.sam.profileId).map((row) => row.kind)).toEqual(['mentioned']);
    expect(inbox(social.robin.profileId).map((row) => row.kind)).toEqual(['mentioned']);
  });

  it('tells the thread participants about a reply but never its author', () => {
    const root = comments.add(social.kim, TRIP_FILE, { body: 'q', parentId: null, mentions: [] });
    comments.add(social.sam, TRIP_FILE, { body: 'a', parentId: root.id, mentions: [] });
    comments.add(social.robin, TRIP_FILE, { body: 'b', parentId: root.id, mentions: [] });
    expect(inbox(social.kim.profileId).map((row) => row.kind)).toEqual(['replied', 'replied']);
    comments.add(social.sam, TRIP_FILE, { body: 'c', parentId: root.id, mentions: [] });
    const fromSam = inbox(social.kim.profileId).find(
      (row) => row.actorProfileId === social.sam.profileId,
    );
    expect(fromSam?.count).toBe(2);
    expect(
      inbox(social.sam.profileId)
        .map((row) => row.kind)
        .sort(),
    ).toEqual(['commented', 'replied']);
    expect(inbox(social.robin.profileId).map((row) => row.kind)).toEqual(['replied']);
  });

  it('mentions only people newly added by an edit', () => {
    const root = started('hi', [social.kim.profileId]);
    const before = inbox(social.kim.profileId)[0];
    comments.edit(social.robin, root.id, {
      body: 'hi again',
      mentions: [social.kim.profileId, social.sam.profileId],
    });
    expect(inbox(social.kim.profileId)[0]?.count).toBe(before?.count);
    expect(inbox(social.sam.profileId).some((row) => row.kind === 'mentioned')).toBe(true);
  });

  it('does not tell anyone about a thread in the Shared Drive unless mentioned', () => {
    comments.add(social.kim, SHARED_FILE, { body: 'hi', parentId: null, mentions: [] });
    comments.add(social.kim, SHARED_FILE, {
      body: 'hi Sam',
      parentId: null,
      mentions: [social.sam.profileId],
    });
    expect(inbox(social.robin.profileId)).toHaveLength(0);
    expect(inbox(social.sam.profileId).map((row) => row.kind)).toEqual(['mentioned']);
  });
});
