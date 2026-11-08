import { describe, expect, it } from 'vitest';
import { AI_AGENT_LOOP_SETTINGS } from '@smarteverything/domain';

const { capacityProblem, withCapacity, SUBAGENT_SETTINGS } = await import('./subagent-settings');

const loops = AI_AGENT_LOOP_SETTINGS.parse({
  subagents: { max_depth: 2, max_active: 5 },
});

describe('helper capacity settings', () => {
  it('writes a typed value into only the chosen field and keeps every other loop setting', () => {
    const next = withCapacity(loops, 'max_active', '12');
    expect(next.subagents).toStrictEqual({ max_depth: 2, max_active: 12 });
    expect(next.goal).toStrictEqual(loops.goal);
    expect(AI_AGENT_LOOP_SETTINGS.parse(next)).toStrictEqual(next);
  });

  it('removes the field when the text is empty so the harness default applies', () => {
    const next = withCapacity(loops, 'max_depth', '');
    expect(next.subagents).toStrictEqual({ max_active: 5 });
    expect('max_depth' in next.subagents).toBe(false);
  });

  it('accepts 0 levels to turn helpers off but needs at least one helper at once', () => {
    expect(capacityProblem('max_depth', '0')).toBeNull();
    expect(capacityProblem('max_active', '0')).toBe('Use 1 or more');
    expect(capacityProblem('max_active', '1')).toBeNull();
  });

  it('rejects text that is not a whole number and numbers past the safe range', () => {
    expect(capacityProblem('max_active', '2.5')).toBe('Use a whole number');
    expect(capacityProblem('max_active', '-3')).toBe('Use a whole number');
    expect(capacityProblem('max_depth', '99999999999999999')).toBe('Use a smaller number');
  });

  it('places every row on the helpers page', () => {
    expect(SUBAGENT_SETTINGS.map((setting) => setting.id)).toStrictEqual([
      'assistant.helpers.max_active',
      'assistant.helpers.max_depth',
    ]);
    expect(new Set(SUBAGENT_SETTINGS.map((setting) => setting.page))).toStrictEqual(
      new Set(['assistant/helpers']),
    );
  });
});
