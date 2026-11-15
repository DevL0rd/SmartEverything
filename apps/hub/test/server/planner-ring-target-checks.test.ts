import { ApiError } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requireTargets } from '../../src/server/handlers/planner-alarm-checks';
import { testStore, type TestStore } from '../support/store';

let test: TestStore;

beforeEach(async () => {
  test = await testStore();
});

afterEach(async () => {
  await test.close();
});

describe('requireTargets', () => {
  it('refuses the hub built-in client as a ring place and accepts a paired client', () => {
    const hub = test.store.clients.create(
      { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'hub' },
      true,
    );
    const phone = test.store.clients.create({
      name: 'Pixel',
      platform: 'android',
      role: 'owner',
      tokenHash: 'phone',
    });
    expect(() => {
      requireTargets(test.store, [{ kind: 'client', clientId: hub.id }]);
    }).toThrow(ApiError);
    expect(() => {
      requireTargets(test.store, [{ kind: 'client', clientId: phone.id }]);
    }).not.toThrow();
  });
});
