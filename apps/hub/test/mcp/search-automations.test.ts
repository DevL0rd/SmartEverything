import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { automationHits } from '../../src/extensions/mcp/tools/search';
import { node, saveAutomation, trigger } from '../support/automation-fixture';
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

function hits(query: string): ReturnType<typeof automationHits> {
  return automationHits(opened.store, { query, limit: 10 });
}

describe('searching automations from the assistant', () => {
  it('finds an automation by name and gives the target that opens its page', () => {
    const saved = saveAutomation(opened.store, { name: 'Night check' });
    expect(hits('night')).toEqual([
      {
        id: saved.id,
        name: 'Night check',
        enabled: true,
        target: { kind: 'automation', automationId: saved.id, focus: null },
      },
    ]);
    expect(hits('morning')).toEqual([]);
  });

  it('finds an automation by the words of its trigger', () => {
    const saved = saveAutomation(opened.store, {
      name: 'Kitchen',
      triggers: [trigger('trigger.button', { press: 'single_press' })],
    });
    expect(hits('button').map((hit) => hit['id'])).toEqual([saved.id]);
  });

  it('finds a step by its title and gives the target that opens the editor at that node', () => {
    const step = node('flow.wait', { duration: 1000 });
    const saved = saveAutomation(opened.store, { name: 'Plain', body: [step] });
    const [hit] = hits('wait');
    expect(hit).toMatchObject({
      id: saved.id,
      target: { kind: 'automation', automationId: saved.id, focus: null },
    });
    expect(hit?.['nodes']).toMatchObject([
      {
        id: step.id,
        target: { kind: 'automation', automationId: saved.id, focus: `node:${step.id}` },
      },
    ]);
  });
});
