import { TEMPLATE_SCOPES } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessService } from '../../src/server/access';
import { accessServiceFor } from '../support/access-service';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const START = '2026-10-18T10:00:00.000Z';
const UNTIL = '2026-10-18T12:00:00.000Z';

let opened: TestStore;
let access: AccessService;

beforeEach(async () => {
  captureLogs();
  vi.useFakeTimers();
  vi.setSystemTime(START);
  opened = await testStore((): Date => new Date(Date.now()));
  access = accessServiceFor(opened, (): Date => new Date(Date.now()));
});

afterEach(async () => {
  access.lifecycle.stop();
  vi.useRealTimers();
  await opened.close();
});

describe('a timed grant', () => {
  it('is armed by the decision and taken back by the lifecycle timer', () => {
    const kid = opened.store.profiles.create({ name: 'Kid' });
    opened.store.personAccess.change(kid.id, {
      role: 'member',
      template: 'child',
      scopes: TEMPLATE_SCOPES.child,
    });
    const owner = opened.store.profiles.create({ name: 'Boss' });
    opened.store.personAccess.change(owner.id, { role: 'owner', template: 'owner' });
    const phone = opened.store.clients.create({
      name: 'Boss phone',
      platform: 'android',
      role: 'owner',
      tokenHash: 'hash-boss',
      profileId: owner.id,
    });
    const row = access.requests.create(kid.id, { kind: 'area', target: 'settings', note: '' });
    access.requests.decide(row.id, phone.id, { approve: true, until: UNTIL, target: null });
    expect(opened.store.personAccess.byProfile(kid.id).scopes.areas).toContain('settings');
    vi.advanceTimersByTime(60 * 60_000);
    expect(opened.store.personAccess.byProfile(kid.id).scopes.areas).toContain('settings');
    vi.advanceTimersByTime(60 * 60_000);
    expect(opened.store.personAccess.byProfile(kid.id).scopes.areas).not.toContain('settings');
    expect(opened.store.accessRequests.byId(row.id).lapsed_at).not.toBeNull();
  });
});
