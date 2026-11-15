import { AUTOMATION_ROW, type StoredAutomationRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { byHandOf } from './by-hand';

const STAMP = '2026-11-14T09:00:00.000Z';

function automation(
  id: string,
  name: string,
  trigger: string,
  enabled = true,
): StoredAutomationRow {
  return AUTOMATION_ROW.parse({
    id,
    name,
    enabled,
    revision: 1,
    definition: {
      version: 4,
      kind: 'automation',
      triggers: [{ id: `${id.slice(0, -1)}9`, key: 'entry', kind: trigger, ports: {} }],
      inputs: [],
      outputs: [],
      variables: [],
      nodes: [{ id: `${id.slice(0, -1)}8`, key: 'start', kind: 'flow.start' }],
      policy: { mode: 'single' },
    },
    draft: null,
    layout: { nodes: {}, frames: [], comments: [] },
    origin: null,
    author: null,
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_at: STAMP,
    updated_at: STAMP,
  });
}

describe('automations run by hand', () => {
  it('lists the switched-on automations a person starts themselves, by name', () => {
    const rows = [
      automation('7e000000-0000-4000-8000-000000000001', 'Movie', 'trigger.called'),
      automation('7e000000-0000-4000-8000-000000000002', 'Bedtime', 'trigger.called'),
      automation('7e000000-0000-4000-8000-000000000003', 'Off', 'trigger.called', false),
      automation('7e000000-0000-4000-8000-000000000004', 'Sunset', 'trigger.sun'),
    ];
    expect(byHandOf(rows)).toEqual([
      { id: '7e000000-0000-4000-8000-000000000002', name: 'Bedtime' },
      { id: '7e000000-0000-4000-8000-000000000001', name: 'Movie' },
    ]);
  });
});
