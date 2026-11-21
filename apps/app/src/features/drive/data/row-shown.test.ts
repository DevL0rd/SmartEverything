import { SNAPSHOT, type DriveGrant, type DriveNotification } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { replaceWith } from '../../../store/live-reducers';
import { liveRowEdit } from '../../../store/optimistic';
import { snapshotWire } from '../../../store/snapshot-fixture';
import { emptyState, rowsOf, type StoreState } from '../../../store/state';
import { placement, WORKSTATION } from '../computers/placement-fixture';

vi.mock('expo-crypto', () => ({ randomUUID: (): string => crypto.randomUUID() }));

const {
  grantRemoveShown,
  grantSetShown,
  mountShown,
  notificationsReadShown,
  placementSetShown,
  accessRequestShown,
  transferCancelShown,
  transferOfferShown,
} = await import('./row-shown');

const ME = 'c0000000-0000-4000-8000-000000000001';
const ITEM = 'd0000000-0000-4000-8000-000000000001';
const PERSON = 'c0000000-0000-4000-8000-000000000002';
const NOW = '2026-11-21T10:00:00.000Z';
const TRANSFER = 'e3000000-0000-4000-8000-000000000001';

function signedIn(): StoreState {
  const state = replaceWith(emptyState(), SNAPSHOT.parse(snapshotWire()));
  if (state.session === null) throw new Error('the fixture has no session');
  return {
    ...state,
    session: { ...state.session, client: { ...state.session.client, profile_id: ME } },
  };
}

const GRANT: DriveGrant = {
  id: 'e1000000-0000-4000-8000-000000000001',
  itemId: ITEM,
  profileId: PERSON,
  role: 'view',
  grantedBy: ME,
  createdAt: NOW,
  expiresAt: null,
};

function notice(id: string, readAt: string | null): DriveNotification {
  return {
    id,
    profileId: ME,
    kind: 'shared',
    itemId: ITEM,
    actorProfileId: PERSON,
    actorName: null,
    refId: null,
    count: 1,
    createdAt: NOW,
    updatedAt: NOW,
    readAt,
  };
}

function apply(
  state: StoreState,
  shown: { readonly edits: readonly { readonly apply: (s: StoreState) => StoreState }[] },
): StoreState {
  return shown.edits.reduce((current, edit) => edit.apply(current), state);
}

describe('drive rows shown at once', () => {
  it('changes an existing grant in place and removes it', () => {
    const state = liveRowEdit('drive_grants', GRANT.id, null, GRANT).apply(signedIn());
    const body = {
      id: 'e1000000-0000-4000-8000-000000000009',
      itemId: ITEM,
      profileId: PERSON,
      role: 'edit',
      expiresAt: null,
    } as const;
    const changed = apply(state, grantSetShown(state, body, NOW));
    expect(changed.tables.drive_grants.byId[GRANT.id]?.role).toBe('edit');
    expect(rowsOf(apply(state, grantRemoveShown(state, GRANT.id)).tables.drive_grants)).toEqual([]);
  });

  it('shows a new grant under the id it sends and keeps it when the Hub answers', () => {
    const state = signedIn();
    const body = {
      id: GRANT.id,
      itemId: ITEM,
      profileId: PERSON,
      role: 'view',
      expiresAt: null,
    } as const;
    const shown = grantSetShown(state, body, NOW);
    const added = apply(state, shown);
    expect(rowsOf(added.tables.drive_grants)).toEqual([GRANT]);
    if (shown.settle === null) throw new Error('a new grant settles');
    const settled = shown.settle(added, GRANT);
    expect(rowsOf(settled.tables.drive_grants)).toEqual([GRANT]);
  });

  it('drops the shown grant when the Hub answers with a share it already had', () => {
    const state = signedIn();
    const body = {
      id: 'e1000000-0000-4000-8000-000000000009',
      itemId: ITEM,
      profileId: PERSON,
      role: 'view',
      expiresAt: null,
    } as const;
    const shown = grantSetShown(state, body, NOW);
    if (shown.settle === null) throw new Error('a new grant settles');
    const settled = shown.settle(apply(state, shown), GRANT);
    expect(rowsOf(settled.tables.drive_grants)).toEqual([GRANT]);
  });

  it('shows an ownership offer under the id it sends', () => {
    const state = signedIn();
    const item = { id: ITEM, name: 'Trip', kind: 'folder', bytes: 0 } as const;
    const body = { id: TRANSFER, itemId: ITEM, toProfileId: PERSON };
    const added = apply(state, transferOfferShown(state, item, body, NOW));
    expect(rowsOf(added.tables.drive_transfers).map((row) => row.id)).toEqual([TRANSFER]);
  });

  it('shows a sent access request under the id it sends without knowing the owner', () => {
    const body = { id: TRANSFER, itemId: ITEM, role: 'view', message: null } as const;
    expect(accessRequestShown(body, NOW)).toEqual({
      id: TRANSFER,
      itemId: ITEM,
      role: 'view',
      message: null,
      ownerProfileId: null,
      createdAt: NOW,
    });
  });

  it('marks the chosen or all unread notifications read', () => {
    const state = [
      notice('e2000000-0000-4000-8000-000000000001', null),
      notice('e2000000-0000-4000-8000-000000000002', null),
    ].reduce(
      (current, row) => liveRowEdit('drive_notifications', row.id, null, row).apply(current),
      signedIn(),
    );
    const one = apply(
      state,
      notificationsReadShown(state, { ids: ['e2000000-0000-4000-8000-000000000001'] }, NOW),
    );
    expect(
      rowsOf(one.tables.drive_notifications).filter((row) => row.readAt === null),
    ).toHaveLength(1);
    const all = apply(state, notificationsReadShown(state, { all: true }, NOW));
    expect(rowsOf(all.tables.drive_notifications).every((row) => row.readAt === NOW)).toBe(true);
  });

  it('turns the mount and a synced folder at once', () => {
    const mount = placement({ enabled: true });
    const state = liveRowEdit('drive_placements', mount.id, null, mount).apply(signedIn());
    const edit = mountShown(state, WORKSTATION, false);
    expect(edit?.apply(state).tables.drive_placements.byId[mount.id]?.enabled).toBe(false);
    const body = {
      deviceId: WORKSTATION,
      rootId: mount.rootId,
      folderItemId: null,
      localPath: '/home/me/Drive',
      enabled: false,
      excluded: [],
      ignorePatterns: [],
      conflictCopies: true,
    };
    expect(placementSetShown(state, body)).toBeNull();
  });

  it('shows nothing for a transfer it does not know', () => {
    expect(
      transferCancelShown(signedIn(), 'e3000000-0000-4000-8000-000000000001', NOW).edits,
    ).toEqual([]);
  });
});
