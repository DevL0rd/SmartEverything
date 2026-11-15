import { describe, expect, it } from 'vitest';
import { DRIVE_NOTIFICATION_KINDS, type DriveNotificationKind } from '@smarteverything/domain';
import {
  ITEM_ID,
  MEMBER_ID,
  OTHER_ROW_ID,
  OWNER_ID,
  REQUESTER_ID,
  ROW_ID,
  accessRequestRow,
  fileRequestRow,
  notificationRow,
  transferRow,
} from '../data/fixtures';
import {
  KIND_LABEL,
  KIND_LOOK,
  actorOf,
  contextOf,
  dayGroupsOf,
  inboxKeyOf,
  inboxSectionsOf,
  itemIdsOf,
  pushKindsAfter,
  rowActionOf,
  sentenceOf,
  sentencePartsOf,
  subtitleOf,
  unreadIdsOf,
  type NotificationContext,
} from './notification-model';

const PROFILES = [
  { id: OWNER_ID, name: 'Alex' },
  { id: MEMBER_ID, name: 'Sam' },
];

const ANSWERED = { answeredBy: OWNER_ID, answeredAt: '2026-11-07T11:00:00.000Z' };

function context(patch: Partial<NotificationContext> = {}): NotificationContext {
  return {
    actor: 'Alex',
    item: 'Plan.pdf',
    itemPending: false,
    request: null,
    transfer: null,
    fileRequest: null,
    ...patch,
  };
}

function sentence(
  kind: DriveNotificationKind,
  count = 1,
  patch: Partial<NotificationContext> = {},
): string {
  const row =
    kind === 'file_request_upload'
      ? notificationRow({ kind, count, actorProfileId: null, actorName: 'Aunt Maria' })
      : notificationRow({ kind, count });
  return sentenceOf(row, context(patch));
}

describe('notification wording per kind', () => {
  it('words sharing, edits, comments, mentions and replies, counting coalesced rows', () => {
    expect(sentence('shared')).toBe('Alex shared Plan.pdf with you');
    expect(sentence('edited')).toBe('Alex edited Plan.pdf');
    expect(sentence('edited', 4)).toBe('Alex edited Plan.pdf 4 times');
    expect(sentence('commented')).toBe('Alex commented on Plan.pdf');
    expect(sentence('commented', 3)).toBe('Alex left 3 comments on Plan.pdf');
    expect(sentence('mentioned')).toBe('Alex mentioned you on Plan.pdf');
    expect(sentence('replied', 2)).toBe('Alex replied 2 times to your comment on Plan.pdf');
  });

  it('words access requests and their answers from the request row', () => {
    expect(sentence('access_requested', 1, { request: accessRequestRow({ role: 'edit' }) })).toBe(
      'Alex asks to edit Plan.pdf',
    );
    const approved = accessRequestRow({ state: 'approved', ...ANSWERED });
    const declined = accessRequestRow({ state: 'declined', ...ANSWERED });
    expect(sentence('access_answered', 1, { request: approved })).toBe(
      'Alex gave you access to Plan.pdf',
    );
    expect(sentence('access_answered', 1, { request: declined, item: null })).toBe(
      'Alex declined your request for Plan.pdf',
    );
    expect(
      sentence('access_answered', 1, {
        request: accessRequestRow({ itemName: null, state: 'declined', ...ANSWERED }),
        item: null,
      }),
    ).toBe('Alex declined your request for a file');
  });

  it('words uploads by the uploader’s typed name and the request title', () => {
    expect(
      sentence('file_request_upload', 5, {
        actor: 'Aunt Maria',
        fileRequest: fileRequestRow({ title: 'Receipts' }),
      }),
    ).toBe('Aunt Maria sent 5 files to Receipts');
  });

  it('words ownership offers and their answers from the transfer row', () => {
    expect(
      sentence('transfer_offered', 1, {
        item: null,
        transfer: transferRow({ itemName: 'CV.pdf' }),
      }),
    ).toBe('Alex offers you ownership of CV.pdf');
    const accepted = transferRow({ state: 'accepted', answeredAt: ANSWERED.answeredAt });
    expect(sentence('transfer_answered', 1, { transfer: accepted })).toBe(
      'Alex accepted ownership of Plan.pdf',
    );
  });

  it('has a look and a push label for every kind', () => {
    for (const kind of DRIVE_NOTIFICATION_KINDS) {
      expect(KIND_LOOK[kind].icon.length).toBeGreaterThan(0);
      expect(KIND_LABEL[kind].length).toBeGreaterThan(0);
    }
  });
});

describe('notification sentence parts', () => {
  it('splits the item name out of the sentence, and marks it pending while it loads', () => {
    const row = notificationRow({ kind: 'edited', count: 4 });
    expect(sentencePartsOf(row, context())).toEqual({
      before: 'Alex edited ',
      item: { kind: 'name', name: 'Plan.pdf' },
      after: ' 4 times',
    });
    expect(sentencePartsOf(row, context({ item: null, itemPending: true })).item).toEqual({
      kind: 'pending',
    });
    expect(sentencePartsOf(row, context({ item: null })).item).toEqual({
      kind: 'name',
      name: 'a file',
    });
    const upload = notificationRow({
      kind: 'file_request_upload',
      count: 2,
      actorProfileId: null,
      actorName: 'Aunt Maria',
    });
    expect(
      sentencePartsOf(upload, context({ fileRequest: fileRequestRow({ title: 'Photos' }) })),
    ).toEqual({ before: 'Alex sent 2 files to Photos', item: { kind: 'none' }, after: '' });
  });
});

describe('notification context', () => {
  it('names the actor, or the uploader, or a former member', () => {
    expect(actorOf(notificationRow(), PROFILES)).toBe('Alex');
    expect(
      actorOf(
        notificationRow({ kind: 'file_request_upload', actorProfileId: null, actorName: 'Peter' }),
        PROFILES,
      ),
    ).toBe('Peter');
    expect(actorOf(notificationRow({ actorProfileId: REQUESTER_ID }), PROFILES)).toBe(
      'A former member',
    );
  });

  it('links the request, transfer or file request the row points at', () => {
    const request = accessRequestRow();
    const row = notificationRow({ kind: 'access_requested', refId: request.id });
    const found = contextOf(row, {
      profiles: PROFILES,
      items: new Map([[ITEM_ID, { name: 'Plan.pdf' }]]),
      pending: new Set(),
      requests: [request],
      transfers: [transferRow()],
      fileRequests: [],
    });
    expect(found).toEqual({
      actor: 'Alex',
      item: 'Plan.pdf',
      itemPending: false,
      request,
      transfer: null,
      fileRequest: null,
    });
  });

  it('offers Approve on a pending request for the viewer and Accept on an open offer to them', () => {
    const request = accessRequestRow();
    const asked = notificationRow({
      kind: 'access_requested',
      profileId: OWNER_ID,
      actorProfileId: REQUESTER_ID,
    });
    expect(rowActionOf(asked, { request, transfer: null }, OWNER_ID)).toEqual({
      kind: 'answer-request',
      request,
    });
    expect(
      rowActionOf(
        asked,
        { request: { ...request, state: 'approved', ...ANSWERED }, transfer: null },
        OWNER_ID,
      ).kind,
    ).toBe('none');
    const transfer = transferRow();
    const offered = notificationRow({ kind: 'transfer_offered' });
    expect(rowActionOf(offered, { request: null, transfer }, MEMBER_ID)).toEqual({
      kind: 'answer-transfer',
      transfer,
    });
    expect(rowActionOf(offered, { request: null, transfer }, OWNER_ID).kind).toBe('none');
    expect(rowActionOf(notificationRow(), { request: null, transfer: null }, MEMBER_ID).kind).toBe(
      'none',
    );
  });
});

describe('the inbox list', () => {
  it('groups by day, newest first, with a section per day', () => {
    const today = notificationRow({ updatedAt: '2026-11-07T09:00:00.000Z' });
    const later = notificationRow({ id: OTHER_ROW_ID, updatedAt: '2026-11-07T11:00:00.000Z' });
    const earlier = notificationRow({
      id: 'a1b2c3d4-0000-4000-8000-000000000999',
      updatedAt: '2026-11-04T09:00:00.000Z',
      readAt: '2026-11-04T10:00:00.000Z',
    });
    const groups = dayGroupsOf(
      [today, earlier, later],
      Date.parse('2026-11-07T12:00:00.000Z'),
      'UTC',
    );
    expect(groups.map((group) => [group.label, group.rows.map((row) => row.id)])).toEqual([
      ['Today', [OTHER_ROW_ID, ROW_ID]],
      [groups[1]?.label, [earlier.id]],
    ]);
    const sections = inboxSectionsOf(groups);
    expect(
      sections.map((section) => [section.title, section.data.map((note) => note.edge)]),
    ).toEqual([
      ['Today', ['first', 'last']],
      [groups[1]?.label, ['only']],
    ]);
    const notes = sections.flatMap((section) => section.data);
    expect(new Set(notes.map(inboxKeyOf)).size).toBe(notes.length);
    expect(unreadIdsOf([today, earlier, later])).toEqual([ROW_ID, OTHER_ROW_ID]);
    expect(subtitleOf([today, earlier, later])).toBe('2 unread');
    expect(subtitleOf([earlier])).toBe('All read');
    expect(subtitleOf([])).toBe('Nothing new');
    expect(itemIdsOf([today, later])).toEqual([ITEM_ID]);
  });

  it('turns push kinds on and off in the fixed order', () => {
    expect(pushKindsAfter(['edited', 'shared'], 'mentioned', true)).toEqual([
      'shared',
      'edited',
      'mentioned',
    ]);
    expect(pushKindsAfter(['shared', 'edited'], 'shared', false)).toEqual(['edited']);
  });
});
