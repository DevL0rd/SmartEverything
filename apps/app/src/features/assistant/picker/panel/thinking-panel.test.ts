import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_HARNESS_PERMISSION, type Engine } from '@smarteverything/domain';
import { effortText, type EngineThinking } from '../../chats/engine-efforts';

const { currentLabel, fitsSegments, levelsOf, selectedLevel } = await import('./thinking-panel');

const DSH: Engine = {
  kind: 'dsh',
  execution_target: { kind: 'server' },
  session_id: null,
  model_route_id: '6f1c2d3e-4b5a-4c6d-8e7f-901234567890',
  model: 'deepseek/deepseek-v4',
  effort: null,
  permission: DEFAULT_AI_HARNESS_PERMISSION,
};

const CODEX: Engine = {
  kind: 'codex',
  device_id: '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b',
  model: 'gpt-5',
  effort: null,
  settings: {},
};

const ROUTE: EngineThinking = {
  efforts: [
    { id: 'low', name: 'Quick', description: 'Answers fast with little reasoning' },
    { id: 'high', name: 'Deep', description: null },
  ],
  defaultEffort: 'high',
};

describe('the thinking levels list', () => {
  it('lists only the levels the route reports, with their descriptions', () => {
    expect(levelsOf(ROUTE)).toEqual([
      { value: 'low', label: 'Quick', description: 'Answers fast with little reasoning' },
      { value: 'high', label: 'Deep' },
    ]);
  });

  it('selects the level that applies when the chat has none stored', () => {
    expect(selectedLevel(DSH, ROUTE)).toBe('high');
    expect(currentLabel(DSH, ROUTE)).toBe('Deep');
    expect(currentLabel(DSH, ROUTE)).toBe(effortText(ROUTE, null));
    expect(selectedLevel({ ...DSH, effort: 'low' }, ROUTE)).toBe('low');
    expect(currentLabel({ ...DSH, effort: 'low' }, ROUTE)).toBe('Quick');
  });

  it('selects nothing when the runtime does not say which level applies', () => {
    const native: EngineThinking = {
      efforts: [{ id: 'high', name: 'High', description: null }],
      defaultEffort: null,
    };
    expect(levelsOf(native)).toEqual([{ value: 'high', label: 'High' }]);
    expect(selectedLevel(CODEX, native)).toBeNull();
    expect(currentLabel(CODEX, native)).toBeNull();
    expect(currentLabel({ ...CODEX, effort: 'high' }, native)).toBe('High');
  });

  it('opens the levels as a list when they carry more than a segment can show', () => {
    expect(fitsSegments(ROUTE)).toBe(false);
    const plain: EngineThinking = {
      efforts: [
        { id: 'low', name: 'Low', description: null },
        { id: 'high', name: 'High', description: null },
      ],
      defaultEffort: null,
    };
    expect(fitsSegments(plain)).toBe(true);
    expect(fitsSegments({ ...plain, defaultEffort: 'high' })).toBe(true);
  });
});
