import { afterEach, describe, expect, it } from 'vitest';
import { Logger, type LogRecord } from '@smarteverything/logging';
import { AUTOMATION_V2, type TableRow } from '@smarteverything/domain';
import { makeTable } from '../store/state';
import { routinesOf } from './routines';

type Automation = TableRow<'automations'>;

const VALID_DEFINITION = {
  when: [{ on: 'signal', source: 'event', kind: 'doorbell' }],
  steps: [{ do: 'notify', message: 'Someone is at the door' }],
};

function automation(id: string, name: string, definition: Automation['definition']): Automation {
  return {
    id,
    name,
    enabled: true,
    revision: 1,
    definition,
    origin: null,
    author: null,
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_at: '2026-10-16T08:00:00.000Z',
    updated_at: '2026-10-16T08:00:00.000Z',
  };
}

function tablesOf(rows: readonly Automation[]): Parameters<typeof routinesOf>[0] {
  return {
    scenes: makeTable({}, [], 0),
    automations: makeTable(
      Object.fromEntries(rows.map((row) => [row.id, row])),
      rows.map((row) => row.id),
      1,
    ),
  };
}

describe('routinesOf', () => {
  afterEach(() => {
    Logger.reset();
  });

  it('fixture definition is valid for the current schema', () => {
    expect(AUTOMATION_V2.safeParse(VALID_DEFINITION).success).toBe(true);
  });

  it('indexes a valid automation with its trigger keywords', () => {
    const { automations } = routinesOf(tablesOf([automation('a', 'Door', VALID_DEFINITION)]));
    expect(automations).toHaveLength(1);
    expect(automations[0]?.triggerKeywords).toContain('doorbell');
  });

  it('still indexes every automation when one stored definition no longer parses', () => {
    const { automations } = routinesOf(
      tablesOf([
        automation('good-1', 'Door', VALID_DEFINITION),
        automation('bad', 'Old row', { triggers: 'nonsense' }),
        automation('good-2', 'Door again', VALID_DEFINITION),
      ]),
    );
    expect(automations.map((entry) => entry.name)).toEqual(['Door', 'Old row', 'Door again']);
    expect(automations[1]?.triggerKeywords).toEqual([]);
    expect(automations[2]?.triggerKeywords).toContain('doorbell');
  });

  it('logs one rejection per bad automation id however often the catalogue is rebuilt', () => {
    const records: LogRecord[] = [];
    Logger.configure({ sink: (record) => records.push(record), level: 'warn' });
    const tables = tablesOf([
      automation('bad-once', 'Old row', { triggers: 'nonsense' }),
      automation('bad-twice', 'Older row', { triggers: 7 }),
    ]);
    routinesOf(tables);
    routinesOf(tables);
    routinesOf(tables);
    const rejected = records.filter((record) => record.event === 'automation.definition_rejected');
    expect(rejected.map((record) => record.payload['automationId'])).toEqual([
      'bad-once',
      'bad-twice',
    ]);
  });
});
