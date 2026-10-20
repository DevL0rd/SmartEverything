import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveAutomation } from '../support/automation-fixture';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

describe('the Values of the home next to the variables of an automation', () => {
  it('lists and finds only the home Values', () => {
    const { store } = opened;
    const automation = saveAutomation(store);
    const owned = store.automationOwnedValues.create(automation.id, {
      kind: 'text',
      name: 'Last seen',
      value: 'door',
    });
    const home = store.automationValues.create({
      kind: 'number',
      name: 'Count',
      value: 1,
      bounds: { overflow: 'reject' },
    });
    expect(store.automationValues.list().map((row) => row.id)).toStrictEqual([home.id]);
    expect(() => store.automationValues.byId(owned.id)).toThrow('automation Value');
    expect(store.automationOwnedValues.list(automation.id).map((row) => row.id)).toStrictEqual([
      owned.id,
    ]);
  });
});
