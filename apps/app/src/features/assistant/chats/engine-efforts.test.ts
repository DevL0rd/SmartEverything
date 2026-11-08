import { describe, expect, it } from 'vitest';
import type { AiRouteInfo } from '@smarteverything/domain';
import {
  chipLabel,
  cycleEffort,
  effortName,
  effortOverride,
  effortText,
  levelSteps,
  routeThinking,
  type EngineThinking,
} from './engine-efforts';

const EFFORTS = ['low', 'medium', 'high'];

const INFO: AiRouteInfo = {
  route_id: '6f1c2d3e-4b5a-4c6d-8e7f-901234567890',
  model: 'deepseek/deepseek-v4',
  name: 'DeepSeek V4',
  description: null,
  input_modalities: ['text', 'image'],
  context_window: 200_000,
  default_max_tokens: 32_000,
  reasoning: {
    efforts: [
      { id: 'low', name: 'Quick', description: 'Short thinking' },
      { id: 'high', name: 'Deep', description: 'Long thinking' },
      { id: 'ultra', name: 'Ultra deep', description: null },
    ],
    default_effort: 'high',
  },
  system_prompt_update: null,
  tool_update: null,
  permission_presets: null,
};

describe('cycling the thinking level', () => {
  it('steps through the levels, wrapping round', () => {
    expect(cycleEffort(EFFORTS, 'low', 1, true)).toBe('medium');
    expect(cycleEffort(EFFORTS, 'high', 1, true)).toBe('low');
    expect(cycleEffort(EFFORTS, 'low', -1, true)).toBe('high');
  });

  it('stops at the ends when told not to wrap', () => {
    expect(cycleEffort(EFFORTS, 'high', 1, false)).toBe('high');
    expect(cycleEffort(EFFORTS, 'low', -1, false)).toBe('low');
    expect(cycleEffort(EFFORTS, 'medium', -1, false)).toBe('low');
  });

  it('starts from an end when the current level is not offered', () => {
    expect(cycleEffort(EFFORTS, 'max', 1, true)).toBe('low');
    expect(cycleEffort(EFFORTS, 'max', -1, true)).toBe('high');
    expect(cycleEffort([], 'max', 1, true)).toBe('max');
  });
});

describe('thinking levels reported by the route', () => {
  it('keeps every reported level in the reported order with its name and description', () => {
    const thinking = routeThinking(INFO);
    expect(thinking.efforts.map((effort) => effort.id)).toEqual(['low', 'high', 'ultra']);
    expect(thinking.efforts[0]).toEqual({
      id: 'low',
      name: 'Quick',
      description: 'Short thinking',
    });
    expect(thinking.defaultEffort).toBe('high');
  });

  it('offers no levels when the route has no selectable reasoning or has not loaded', () => {
    expect(routeThinking({ ...INFO, reasoning: null })).toEqual({
      efforts: [],
      defaultEffort: null,
    });
    expect(routeThinking(undefined)).toEqual({ efforts: [], defaultEffort: null });
  });

  it('follows route default changes after choosing the default level', () => {
    const thinking = routeThinking(INFO);
    const nextThinking = { ...thinking, defaultEffort: 'ultra' };
    expect(effortText(nextThinking, effortOverride(thinking, 'high'))).toBe('Ultra deep');
    expect(effortText(nextThinking, effortOverride(thinking, 'low'))).toBe('Quick');
  });

  it('keeps a selected level explicit when the runtime did not report a default', () => {
    const thinking = { ...routeThinking(INFO), defaultEffort: null };
    expect(effortOverride(thinking, 'high')).toBe('high');
  });
});

describe('naming the chosen level', () => {
  const thinking: EngineThinking = routeThinking(INFO);

  it('uses the route name for a reported level', () => {
    expect(effortName(thinking, 'ultra')).toBe('Ultra deep');
    expect(effortText(thinking, 'low')).toBe('Quick');
  });

  it('names a level the route does not report in plain words', () => {
    expect(effortName(thinking, 'xhigh')).toBe('Extra high');
    expect(effortName(thinking, null)).toBeNull();
  });

  it('names the level that applies when none was chosen', () => {
    expect(effortText(thinking, null)).toBe('Deep');
    expect(effortText(routeThinking(undefined), null)).toBeNull();
  });
});

describe('the model chip label', () => {
  it('adds the model facts between the choice and the action', () => {
    expect(chipLabel('DeepSeek V4', 'Deep', ['200K context', 'reads images'])).toBe(
      'Model and thinking: DeepSeek V4, Deep. 200K context, reads images. Opens the model menu',
    );
  });

  it('keeps the plain label when nothing is known about the model', () => {
    expect(chipLabel('GPT-5', 'High', [])).toBe(
      'Model and thinking: GPT-5, High. Opens the model menu',
    );
    expect(chipLabel('GPT-5', null, [])).toBe('Model and thinking: GPT-5. Opens the model menu');
  });
});

describe('the chip step indicator', () => {
  it('follows the level id, whatever the route names it', () => {
    const thinking = routeThinking(INFO);
    expect(effortName(thinking, 'low')).toBe('Quick');
    expect(levelSteps('low')).toBe(1);
    expect(levelSteps('medium')).toBe(2);
    expect(levelSteps('high')).toBe(3);
    expect(levelSteps('max')).toBe(3);
  });

  it('shows no steps for no level or a level without a known strength', () => {
    expect(levelSteps(null)).toBeNull();
    expect(levelSteps('ultra')).toBeNull();
  });
});
