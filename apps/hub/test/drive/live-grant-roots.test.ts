import type { LiveChange, LiveTable } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { projected, type Hearing } from '../../src/server/live-visibility';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import type { TestStore } from '../support/store';
import { personalDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore } from './spaces-fixture';

const NOW = '2026-11-07T10:00:00.000Z';
const ANN_ROOT = '0d000000-0000-4000-8000-000000000003';
const TAXES = '0f000000-0000-4000-8000-000000000003';
const TABLES: readonly LiveTable[] = ['drive_roots', 'drive_grants', 'drive_access_requests'];

let test: TestStore;
let ann: TestPerson;
let bob: TestPerson;
let cy: TestPerson;
let changes: LiveChange[];
let stop: () => void;

function hearing(person: TestPerson): Hearing {
  return { client: person.client, tables: new Set(TABLES) };
}

function heardBy(person: TestPerson): LiveChange[] {
  return changes.flatMap((change) => {
    const shown = projected(hearing(person), change, test.store);
    return shown === null ? [] : [shown];
  });
}

beforeEach(async () => {
  test = await driveTestStore();
  addPerson(test, 'Robin', 'owner');
  ann = addPerson(test, 'Ann', 'member');
  bob = addPerson(test, 'Bob', 'member');
  cy = addPerson(test, 'Cy', 'member');
  test.store.driveRoots.insert(personalDriveRoot(ANN_ROOT, ann.profileId));
  test.store.driveItems.write({
    item: {
      id: TAXES,
      rootId: ANN_ROOT,
      parentId: null,
      relPath: 'Taxes',
      name: 'Taxes',
      modifiedAt: NOW,
      addedAt: NOW,
      starred: false,
      shared: false,
      outside: false,
      addedByProfileId: null,
      remoteId: null,
      remoteRev: null,
      kind: 'folder',
      childCount: 0,
      bytes: 0,
    },
    identity: { dev: '1', ino: 'taxes' },
  });
  test.store.feed.settleTotals();
  changes = [];
  stop = test.store.feed.subscribe((change) => {
    changes.push(change);
  });
});

afterEach(async () => {
  stop();
  await test.close();
});

describe('a new grant reaches a connected grantee with the drive it lives in', () => {
  it('sends the sharer’s drive row to the grantee after the grant, and nothing to others', () => {
    test.store.driveGrants.set(
      { itemId: TAXES, profileId: bob.profileId, role: 'view', expiresAt: null },
      ann.profileId,
    );
    const seen = heardBy(bob);
    expect(seen.map((change) => [change.table, change.operation])).toEqual([
      ['drive_grants', 'INSERT'],
      ['drive_roots', 'UPDATE'],
    ]);
    const [grant, root] = seen;
    expect(root?.table === 'drive_roots' ? root.record?.id : null).toBe(ANN_ROOT);
    expect((root?.seq ?? 0) > (grant?.seq ?? 0)).toBe(true);
    expect(heardBy(cy)).toEqual([]);
  });

  it('sends the drive row only once, not when the same grant changes role', () => {
    const grant = { itemId: TAXES, profileId: bob.profileId, expiresAt: null };
    test.store.driveGrants.set({ ...grant, role: 'view' }, ann.profileId);
    changes = [];
    test.store.driveGrants.set({ ...grant, role: 'edit' }, ann.profileId);
    expect(heardBy(bob).map((change) => change.table)).toEqual(['drive_grants']);
  });
});

describe('access request rows on the live feed', () => {
  function names(person: TestPerson): (string | null)[] {
    return heardBy(person).flatMap((change) =>
      change.table === 'drive_access_requests' ? [change.record?.itemName ?? null] : [],
    );
  }

  it('names the item for the owner and keeps it from the person asking until approved', () => {
    const made = test.store.driveAccessRequests.create({
      itemId: TAXES,
      requesterProfileId: bob.profileId,
      role: 'view',
      message: null,
    });
    expect(made.itemName).toBeNull();
    expect(names(ann)).toEqual(['Taxes']);
    expect(names(bob)).toEqual([null]);
    expect(names(cy)).toEqual([]);
    changes = [];
    const declined = test.store.driveAccessRequests.answer(made.id, ann.profileId, {
      decision: 'decline',
    });
    expect(declined.itemName).toBe('Taxes');
    expect(names(ann)).toEqual(['Taxes']);
    expect(names(bob)).toEqual([null]);
  });
});
