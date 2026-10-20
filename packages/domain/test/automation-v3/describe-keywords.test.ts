import { describe, expect, it } from 'vitest';
import { programKeywords, searchTitles, triggerKeywords } from '../../src/automation-v3/keywords';
import type { AutomationV3 } from '../../src/automation-v3/program';
import { CTX, functionProgram, ids, node, pressTrigger, program } from './describe-fixture';

describe('keywords', () => {
  it('lists the kind words and the signal words of each trigger once', () => {
    const words = triggerKeywords([pressTrigger, pressTrigger], CTX.kinds);
    expect(words).toContain('Button pressed');
    expect(words).toContain('button');
    expect(words).toContain('event');
    expect(words).toContain('single_press');
    expect(new Set(words).size).toBe(words.length);
  });

  it('adds the field of a device trigger and tolerates unknown or timed triggers', () => {
    const device = {
      id: ids.node,
      key: 'lamp',
      kind: 'trigger.device',
      ports: { device: { lit: ids.lamp }, control: { lit: 'power' } },
    };
    expect(triggerKeywords([device], CTX.kinds)).toContain('power');
    const time = { id: ids.node, key: 't', kind: 'trigger.time', ports: { at: { lit: '07:00' } } };
    expect(triggerKeywords([time], CTX.kinds)).toContain('Time of day');
    const mystery = { id: ids.node, key: 'm', kind: 'trigger.mystery', ports: {} };
    expect(triggerKeywords([mystery], CTX.kinds)).toEqual([]);
  });

  it('gives each trigger and node a searchable title with its keywords', () => {
    const titles = searchTitles(program, CTX.kinds);
    expect(titles.map((entry) => [entry.key, entry.title])).toEqual([
      ['press', 'Button pressed'],
      ['cycle', 'Cycle level'],
      ['setLights', 'Change device'],
    ]);
    expect(titles[1]?.keywords).toContain('cycle');
    expect(titles[1]?.nodeId).toBe(ids.cycle);
    const lone: AutomationV3 = { ...program, body: { nodes: [node(1, 'm', 'plugin.mystery')] } };
    expect(searchTitles(lone, CTX.kinds).at(-1)).toMatchObject({ title: 'Mystery', keywords: [] });
    expect(searchTitles(functionProgram, CTX.kinds).map((entry) => entry.key)).toEqual(['send']);
  });

  it('collects every word of a program once', () => {
    const words = programKeywords(program, CTX.kinds);
    expect(words).toContain('button');
    expect(words).toContain('cycle');
    expect(new Set(words).size).toBe(words.length);
    expect(programKeywords(functionProgram, CTX.kinds)).not.toContain('button');
    const lone: AutomationV3 = { ...program, body: { nodes: [node(1, 'm', 'plugin.mystery')] } };
    expect(programKeywords(lone, CTX.kinds)).not.toContain('cycle');
  });
});
