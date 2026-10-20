import type { LiveChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hiddenByAccess } from '../../../src/server/live-access';
import { deviceHidden, reachableRows, scopesOf } from '../../../src/server/person-scope';
import { captureLogs } from '../../support/logs';
import { bottleRig, type BottleRig, type Person } from '../../support/bottle-rig';

let rig: BottleRig;

beforeEach(async () => {
  captureLogs();
  rig = await bottleRig();
});

afterEach(async () => {
  await rig.close();
});

function hiddenFromMember(): boolean {
  return deviceHidden(scopesOf(rig.test.store, rig.member.profile.id).devices, rig.device);
}

describe('a bottle in the generic device layer', () => {
  it('is hidden from a member while it belongs to the owner or to nobody', async () => {
    expect(hiddenFromMember()).toBe(true);
    await rig.act(rig.owner, { action: 'bind_person', personId: null });
    expect(hiddenFromMember()).toBe(true);
  });

  it('is shown to the member it is bound to and hidden again when it moves on', async () => {
    await rig.act(rig.owner, { action: 'bind_person', personId: rig.member.profile.id });
    expect(hiddenFromMember()).toBe(false);
    await rig.act(rig.owner, { action: 'bind_person', personId: rig.owner.profile.id });
    expect(hiddenFromMember()).toBe(true);
  });

  it('is left out of the rows a member lists and kept for the owner', () => {
    const rows = [{ deviceId: rig.device.id }];
    const memberScope = scopesOf(rig.test.store, rig.member.profile.id).devices;
    expect(reachableRows(rig.test.store, memberScope, rows, (row) => row.deviceId)).toHaveLength(0);
    expect(reachableRows(rig.test.store, null, rows, (row) => row.deviceId)).toHaveLength(1);
  });

  it('keeps its live changes from the app of a member it is not bound to', () => {
    const now = rig.clock.now().toISOString();
    const change: LiveChange = {
      type: 'change',
      seq: 1,
      table: 'commands',
      operation: 'INSERT',
      record: {
        id: '11111111-1111-4111-8111-111111111111',
        device_id: rig.device.id,
        capability: 'bottle_reminder',
        value: true,
        status: 'pending',
        source: 'app',
        result: null,
        error: null,
        requested_by: null,
        created_at: now,
        started_at: null,
        finished_at: null,
        expires_at: now,
      },
      oldRecord: null,
    };
    const heard = (person: Person): boolean =>
      !hiddenByAccess(
        { client: rig.test.store.clients.byId(person.client.id), tables: new Set(['commands']) },
        change,
        rig.test.store,
      );
    expect(heard(rig.member)).toBe(false);
    expect(heard(rig.owner)).toBe(true);
  });
});
