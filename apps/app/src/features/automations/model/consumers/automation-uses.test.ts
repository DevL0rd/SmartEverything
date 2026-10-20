import { NODE_REGISTRY, type AutomationV3, type ReferenceContext } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { automationsUsing } from './automation-uses';
import { GROUP, lit, program, row, step } from './consumer-fixtures';

const MISSING = '7e000000-0000-4000-8000-000000000003';
const OTHER = '7e000000-0000-4000-8000-000000000002';
const ctx: ReferenceContext = { kinds: NODE_REGISTRY.get, functions: () => undefined };

function onGroup(group: string): AutomationV3 {
  return program(
    [],
    [step(1, 'device.set', { target: lit({ group }), control: lit('power'), to: lit(true) })],
  );
}

describe('automationsUsing', () => {
  const rows = [
    row('a1', 'Evening', onGroup(GROUP)),
    row('a2', 'Other', onGroup(OTHER), false),
    row('a3', 'Plain', program([], [])),
  ];

  it('lists the automations that reference the group or room', () => {
    expect(automationsUsing(rows, GROUP, ctx)).toStrictEqual([
      { id: 'a1', name: 'Evening', enabled: true },
    ]);
  });

  it('keeps disabled ones in the list', () => {
    expect(automationsUsing(rows, OTHER, ctx)).toStrictEqual([
      { id: 'a2', name: 'Other', enabled: false },
    ]);
  });

  it('finds nothing for an unused id', () => {
    expect(automationsUsing(rows, MISSING, ctx)).toStrictEqual([]);
  });
});
