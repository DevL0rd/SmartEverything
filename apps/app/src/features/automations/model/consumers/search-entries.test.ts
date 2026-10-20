import { NODE_REGISTRY } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { FLOWCHART_KEYWORDS, focusTargetsOf, routineEntryOf } from './search-entries';
import { KITCHEN, buttonTrigger, program, row, setPower } from './consumer-fixtures';

const kinds = NODE_REGISTRY.get;

describe('search entries', () => {
  const definition = program(
    [buttonTrigger(KITCHEN, 'single_press')],
    [setPower(1, KITCHEN, true)],
    [{ name: 'level', type: { t: 'number' }, required: true }],
  );

  it('gives the automation name and its trigger keywords', () => {
    const entry = routineEntryOf(row('a', 'Press lights', definition, false), kinds);
    expect(entry).toMatchObject({ id: 'a', name: 'Press lights', enabled: false, path: '' });
    expect(entry.triggerKeywords).toEqual(expect.arrayContaining(['button', 'press', 'event']));
  });

  it('gives a focus target for every input, trigger and step', () => {
    const targets = focusTargetsOf(definition, kinds);
    expect(targets.map((target) => target.key)).toEqual([
      'input:level',
      expect.stringMatching(/^node:/),
      expect.stringMatching(/^node:/),
    ]);
    expect(targets[0]).toMatchObject({ title: 'level', keywords: ['input', 'argument', 'number'] });
    expect(targets[2]?.keywords).toEqual(expect.arrayContaining(['step', 'action', 'turn']));
    expect(targets.every((target) => target.focus === target.key)).toBe(true);
  });

  it('has a flowchart keyword list', () => {
    expect(FLOWCHART_KEYWORDS).toContain('flowchart');
  });
});
