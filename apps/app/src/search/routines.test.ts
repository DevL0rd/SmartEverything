import { afterEach, describe, expect, it } from 'vitest';
import { Logger, type LogRecord } from '@smarteverything/logging';
import type { TableRow } from '@smarteverything/domain';
import { makeTable } from '../store/state';
import { buttonTrigger, setPower, storedAutomationRow } from '../test-support/automation-rows';
import { routinesOf } from './routines';

const DOOR = '00000000-0000-4000-8000-000000000e01';
const LIGHT = '00000000-0000-4000-8000-000000000e02';

type Automation = TableRow<'automations'>;

function stored(index: number, name: string): Automation {
  return storedAutomationRow({
    index,
    name,
    triggers: [buttonTrigger(DOOR, 'single_press')],
    nodes: [setPower(LIGHT, true)],
  });
}

function unreadable(index: number, name: string): Automation {
  return { ...stored(index, name), revision: 0 };
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

  it('indexes an automation with its trigger keywords', () => {
    const { automations } = routinesOf(tablesOf([stored(1, 'Door')]));
    expect(automations).toHaveLength(1);
    expect(automations[0]?.name).toBe('Door');
    expect(automations[0]?.triggerKeywords).toContain('button');
  });

  it('still indexes every automation when one stored program no longer parses', () => {
    const { automations } = routinesOf(
      tablesOf([stored(1, 'Door'), unreadable(2, 'Old row'), stored(3, 'Door again')]),
    );
    expect(automations.map((entry) => entry.name)).toEqual(['Door', 'Old row', 'Door again']);
    expect(automations[1]?.triggerKeywords).toEqual([]);
    expect(automations[2]?.triggerKeywords).toContain('button');
  });

  it('logs the rejected row once however often the catalogue is rebuilt from the same rows', () => {
    const records: LogRecord[] = [];
    Logger.configure({ sink: (record) => records.push(record), level: 'error' });
    const tables = tablesOf([unreadable(1, 'Old row')]);
    routinesOf(tables);
    routinesOf(tables);
    routinesOf(tables);
    expect(records.filter((record) => record.event === 'automations.row_rejected')).toHaveLength(1);
  });
});
