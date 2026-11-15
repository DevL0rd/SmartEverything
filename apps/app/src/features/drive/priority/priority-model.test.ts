import { describe, expect, it } from 'vitest';
import type {
  DriveAccessRequest,
  DriveNotification,
  DriveSuggestion,
  DriveTransfer,
} from '@smarteverything/domain';
import { MEMBER_ID, OTHER_ROOT_ID, OWNER_ID, documentFixture } from '../data/fixtures';
import {
  bandOf,
  prioritySubtitleOf,
  reasonLineOf,
  reasonOf,
  suggestionGroupsOf,
  suggestionsInDrive,
  waitingTilesOf,
} from './priority-model';

const NOW = Date.parse('2026-11-14T12:00:00.000Z');
const ZONE = 'Europe/Berlin';
const SAM = '00000000-0000-4000-8000-0000000000a1';

function item(n: number, rootId?: string): DriveSuggestion['item'] {
  return documentFixture({
    id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
    name: `File ${String(n)}`,
    ...(rootId === undefined ? {} : { rootId }),
  });
}

const nameOf = (profileId: string): string | null => (profileId === SAM ? 'Sam' : null);

describe('suggestion bands', () => {
  it('puts today, the last seven days and anything older in their own band', () => {
    expect(bandOf('2026-11-14T06:00:00.000Z', NOW, ZONE)).toBe('today');
    expect(bandOf('2026-11-13T22:00:00.000Z', NOW, ZONE)).toBe('week');
    expect(bandOf('2026-11-08T12:00:00.000Z', NOW, ZONE)).toBe('week');
    expect(bandOf('2026-11-07T12:00:00.000Z', NOW, ZONE)).toBe('earlier');
  });

  it('groups newest first, keeps one entry per file and drops empty bands', () => {
    const groups = suggestionGroupsOf(
      [
        { item: item(1), reason: 'opened', at: '2026-11-01T10:00:00.000Z' },
        { item: item(2), reason: 'edited', at: '2026-11-14T08:00:00.000Z' },
        { item: item(1), reason: 'edited', at: '2026-11-14T09:00:00.000Z' },
        { item: item(3), reason: 'shared', at: '2026-10-01T10:00:00.000Z', actorProfileId: SAM },
      ],
      NOW,
      ZONE,
    );
    expect(groups.map((group) => group.label)).toEqual(['Today', 'Earlier']);
    expect(groups[0]?.suggestions.map((entry) => entry.item.name)).toEqual(['File 1', 'File 2']);
    expect(groups[1]?.suggestions.map((entry) => entry.item.name)).toEqual(['File 3']);
  });

  it('keeps the Shared Drive row to its own files', () => {
    const mine = { item: item(1), reason: 'opened', at: '2026-11-14T08:00:00.000Z' } as const;
    const home = {
      item: item(2, OTHER_ROOT_ID),
      reason: 'opened',
      at: '2026-11-14T08:00:00.000Z',
    } as const;
    expect(suggestionsInDrive([mine, home], OTHER_ROOT_ID)).toEqual([home]);
    expect(suggestionsInDrive([mine, home], null)).toEqual([mine, home]);
  });
});

describe('suggestion reasons', () => {
  it('says why each file is here and when', () => {
    const at = '2026-11-14T09:00:00.000Z';
    expect(reasonOf({ item: item(1), reason: 'opened', at }, nameOf)).toBe('You opened it');
    expect(reasonOf({ item: item(1), reason: 'edited', at }, nameOf)).toBe('You edited it');
    expect(reasonOf({ item: item(1), reason: 'edited_by', at, actorProfileId: SAM }, nameOf)).toBe(
      'Sam edited it',
    );
    expect(reasonOf({ item: item(1), reason: 'shared', at, actorProfileId: SAM }, nameOf)).toBe(
      'Sam shared it with you',
    );
    expect(
      reasonOf({ item: item(1), reason: 'mentioned', at, actorProfileId: OWNER_ID }, nameOf),
    ).toBe('Someone mentioned you');
    expect(
      reasonLineOf({ item: item(1), reason: 'commented', at, actorProfileId: SAM }, nameOf, NOW),
    ).toBe('Sam commented · 3 h ago');
  });
});

describe('waiting for you', () => {
  const AT = '2026-11-14T08:00:00.000Z';
  const request = (patch: Partial<DriveAccessRequest>): DriveAccessRequest => ({
    id: '00000000-0000-4000-8000-000000000301',
    itemId: item(1).id,
    itemName: 'File 1',
    requesterProfileId: SAM,
    ownerProfileId: MEMBER_ID,
    role: 'view',
    message: null,
    state: 'pending',
    answeredBy: null,
    answeredAt: null,
    expiresAt: null,
    createdAt: AT,
    ...patch,
  });
  const transfer = (patch: Partial<DriveTransfer>): DriveTransfer => ({
    id: '00000000-0000-4000-8000-000000000401',
    itemId: item(2).id,
    itemName: 'File 2',
    itemKind: 'document',
    bytes: 10,
    fromProfileId: SAM,
    toProfileId: MEMBER_ID,
    state: 'offered',
    createdAt: AT,
    answeredAt: null,
    ...patch,
  });
  const mention = (patch: Partial<DriveNotification>): DriveNotification => ({
    id: '00000000-0000-4000-8000-000000000501',
    profileId: MEMBER_ID,
    kind: 'mentioned',
    itemId: item(3).id,
    actorProfileId: SAM,
    actorName: null,
    refId: null,
    count: 1,
    createdAt: AT,
    updatedAt: AT,
    readAt: null,
    ...patch,
  });

  it('counts requests to answer, offers to you and unread mentions', () => {
    const tiles = waitingTilesOf({
      viewerId: MEMBER_ID,
      requests: [
        request({}),
        request({ ownerProfileId: SAM }),
        request({ state: 'declined', answeredBy: MEMBER_ID, answeredAt: AT }),
      ],
      transfers: [transfer({}), transfer({ toProfileId: SAM, fromProfileId: MEMBER_ID })],
      notifications: [mention({}), mention({ readAt: AT }), mention({ kind: 'commented' })],
    });
    expect(tiles.map((tile) => [tile.kind, tile.count, tile.label])).toEqual([
      ['access', 1, 'Access request'],
      ['transfer', 1, 'File offered to you'],
      ['mention', 1, 'Unread mention'],
    ]);
    expect(prioritySubtitleOf(12, false, tiles)).toBe('12 files · 3 waiting for you');
  });

  it('shows nothing while nothing waits or nobody is signed in', () => {
    const none = { requests: [], transfers: [], notifications: [] };
    expect(waitingTilesOf({ viewerId: MEMBER_ID, ...none })).toEqual([]);
    expect(waitingTilesOf({ viewerId: null, ...none, notifications: [mention({})] })).toEqual([]);
    expect(prioritySubtitleOf(1, false, [])).toBe('1 file');
    expect(prioritySubtitleOf(40, true, [])).toBe('40+ files');
  });
});
