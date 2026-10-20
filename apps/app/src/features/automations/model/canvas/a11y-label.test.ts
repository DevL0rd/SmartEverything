import { describe, expect, it } from 'vitest';
import type { LabelSpec } from './a11y-label';
import { a11yLabel, canvasLabel, runPhrase } from './a11y-label';

const base: LabelSpec = {
  role: 'step',
  title: 'Set light',
  subtitle: 'Set brightness of Reading lamp to 75',
  category: 'Devices',
  ordinal: 5,
  total: 10,
  path: ['For each light', 'Each light', 'Try'],
  lanes: [],
  inputs: ['light from Each light › light', 'warmth 2700 K'],
  problem: { severity: 'critical', message: 'Brightness can be 0 here.', port: null },
  consumer: null,
  run: null,
};

describe('a11yLabel', () => {
  it('names a step with its place, inputs and problem', () => {
    expect(a11yLabel(base)).toBe(
      'Step 5 of 10, Set light, Devices, in For each light, Each light, Try. Inputs: light from Each light › light; warmth 2700 K. Problem: Brightness can be 0 here.',
    );
  });

  it('names a block with its branches', () => {
    const label = a11yLabel({
      ...base,
      role: 'container',
      title: 'If it is dark',
      path: [],
      lanes: ['Dark', 'Otherwise'],
      inputs: [],
      problem: null,
      ordinal: 1,
    });
    expect(label).toBe(
      'Step 1 of 10, If it is dark, Devices. Block with 2 branches: Dark, Otherwise',
    );
  });

  it('names a value card by its consumer', () => {
    expect(
      a11yLabel({ ...base, role: 'value', consumer: 'Set light', inputs: [], problem: null }),
    ).toBe('Value used by Set light, Set light, Set brightness of Reading lamp to 75');
    expect(a11yLabel({ ...base, role: 'value', inputs: [], problem: null })).toContain(
      'Value, Set light',
    );
  });

  it('names a trigger', () => {
    expect(
      a11yLabel({
        ...base,
        role: 'trigger',
        title: 'Sunset',
        subtitle: '15 minutes before',
        ordinal: 1,
        total: 2,
      }),
    ).toBe('Trigger 1 of 2, Sunset, 15 minutes before');
  });

  it('appends the run state', () => {
    expect(runPhrase({ state: 'done', text: '62 %' })).toBe('. Done, result 62 %');
    expect(runPhrase({ state: 'failed', text: 'Unreachable' })).toBe('. Failed: Unreachable');
    expect(runPhrase({ state: 'waiting', text: 'wakes at 17:57' })).toBe(
      '. Waiting, wakes at 17:57',
    );
    expect(runPhrase({ state: 'running' })).toBe('. Running');
    expect(runPhrase({ state: 'skipped' })).toBe('. Skipped');
    expect(runPhrase(null)).toBe('');
  });

  it('describes the canvas', () => {
    expect(canvasLabel(10)).toBe('Automation canvas, 10 steps. Tab moves between steps.');
    expect(canvasLabel(1)).toContain('1 step.');
  });
});
