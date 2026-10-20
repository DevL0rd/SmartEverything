import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveAutomation, trigger } from '../support/automation-fixture';
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

describe('removing a Value that an automation uses', () => {
  it('refuses while a published program references it and allows it afterwards', () => {
    const { store } = opened;
    const value = store.automationValues.create({
      kind: 'number',
      name: 'Count',
      value: 1,
      bounds: { overflow: 'reject' },
    });
    const user = saveAutomation(store, {
      name: 'Counter',
      triggers: [trigger('trigger.value', { value: value.id })],
    });
    expect(() => {
      store.automationValues.remove(value.id);
    }).toThrow('referenced by automation Counter');
    store.automations.remove(user.id);
    store.automationValues.remove(value.id);
    expect(store.automationValues.list()).toEqual([]);
  });

  it('removes a Value nothing references', () => {
    const { store } = opened;
    const value = store.automationValues.create({
      kind: 'number',
      name: 'Unused',
      value: 1,
      bounds: { overflow: 'reject' },
    });
    saveAutomation(store, { triggers: [trigger('trigger.time', { at: '23:00' })] });
    store.automationValues.remove(value.id);
    expect(store.automationValues.list()).toEqual([]);
  });
});
