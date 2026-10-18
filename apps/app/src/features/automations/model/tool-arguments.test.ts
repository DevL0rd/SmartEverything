import { describe, expect, it } from 'vitest';
import { toolProblems } from './tool-arguments';

const SCHEMA = {
  type: 'object',
  properties: { sceneId: { type: 'string' }, times: { type: 'integer' } },
  required: ['sceneId'],
  additionalProperties: false,
} as const;

describe('checking a tool step’s arguments against the tool’s schema', () => {
  it('accepts the arguments the schema describes', () => {
    expect(toolProblems(SCHEMA, { sceneId: 'abc', times: 2 })).toStrictEqual([]);
  });

  it('names a missing required argument', () => {
    const problems = toolProblems(SCHEMA, {});
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('sceneId');
  });

  it('names an argument of the wrong type', () => {
    const problems = toolProblems(SCHEMA, { sceneId: 'abc', times: 'twice' });
    expect(problems[0]).toMatch(/^times: /);
  });
});
