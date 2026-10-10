import { describe, expect, it } from 'vitest';
import { distinctModels } from '../src/assistant/providers';

interface ClaudeRow {
  readonly value: string;
  readonly displayName: string;
  readonly description: string;
  readonly supportedEffortLevels: string[];
}

function row(value: string, displayName: string, description: string): ClaudeRow {
  return { value, displayName, description, supportedEffortLevels: ['low', 'high'] };
}

describe('Claude Code models', () => {
  it('names models by their display name, not their description', () => {
    expect(distinctModels([row('opus', 'Opus 5.5', 'Best for everyday, complex tasks')])).toEqual([
      { id: 'opus', name: 'Opus 5.5', efforts: ['low', 'high'] },
    ]);
  });

  it('drops repeats of the same id or the same name', () => {
    const models = distinctModels([
      row('haiku', 'Haiku 4.5', 'Fastest for quick answers'),
      row('claude-haiku-4-5-20251001', 'Haiku 4.5', 'Fastest for quick answers'),
      row('haiku', 'Haiku 4.5', 'Fastest for quick answers'),
      row('claude-opus-4-8', 'Opus 4.8', 'Best for everyday, complex tasks'),
    ]);
    expect(models.map((model) => model.id)).toEqual(['haiku', 'claude-opus-4-8']);
  });
});
