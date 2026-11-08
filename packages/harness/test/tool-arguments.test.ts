import { describe, expect, it } from 'vitest';
import type { ToolSchema } from '@deepseek-ai/dsh-llm';
import { normalizeToolArguments } from '../src/plugins/tool-arguments';

const SCHEMA: ToolSchema = {
  name: 'subagent',
  description: 'test',
  parameters: {
    type: 'object',
    required: ['description', 'prompt'],
    properties: {
      description: { type: 'string' },
      prompt: { type: 'string' },
      cwd: { type: 'string' },
      model: { type: 'string' },
      tags: { type: 'array' },
      extra: { type: 'object' },
    },
  },
};

function normalized(tool: string, schema: ToolSchema | undefined, args: unknown): unknown {
  return JSON.parse(normalizeToolArguments(tool, schema, JSON.stringify(args)));
}

describe('the model tool argument normalizer', () => {
  it('drops optional fields the model left empty and keeps required ones even when empty', () => {
    expect(
      normalized('subagent', SCHEMA, {
        description: '',
        prompt: 'Do it',
        cwd: '  ',
        model: null,
        tags: [],
        extra: {},
      }),
    ).toStrictEqual({ description: '', prompt: 'Do it' });
  });

  it('keeps fields it does not know so the tool still rejects them', () => {
    expect(normalized('subagent', SCHEMA, { prompt: 'x', profile_id: 'p' })).toStrictEqual({
      prompt: 'x',
      profile_id: 'p',
    });
  });

  it('drops goal fields that the chosen action does not use', () => {
    expect(
      normalized('update_goal', undefined, {
        goal_id: 'g',
        revision: 2,
        action: 'complete',
        objective: '',
        max_goal_rounds: 3,
      }),
    ).toStrictEqual({ goal_id: 'g', revision: 2, action: 'complete' });
    expect(
      normalized('update_goal', undefined, {
        goal_id: 'g',
        revision: 2,
        action: 'edit',
        max_goal_rounds: 3,
        blocked_reason: 'x',
      }),
    ).toStrictEqual({ goal_id: 'g', revision: 2, action: 'edit', max_goal_rounds: 3 });
  });

  it('leaves text that is not a JSON object untouched', () => {
    expect(normalizeToolArguments('subagent', SCHEMA, '{oops')).toBe('{oops');
    expect(normalizeToolArguments('subagent', SCHEMA, '')).toBe('');
    expect(normalizeToolArguments('subagent', SCHEMA, '[1]')).toBe('[1]');
  });
});
