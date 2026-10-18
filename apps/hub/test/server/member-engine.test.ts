import { describe, expect, it } from 'vitest';
import { memberEngineProjection } from '../../src/server/member-engine';

describe('what a member may see of a computer engine', () => {
  it('hides the tool settings of a Claude or Codex engine and leaves every other engine alone', () => {
    expect(
      memberEngineProjection({ kind: 'claude', model: 'm', settings: { builtin_tools: ['bash'] } }),
    ).toStrictEqual({ kind: 'claude', model: 'm', settings: { builtin_tools: [] } });
    expect(memberEngineProjection({ kind: 'codex', settings: { sandbox: 'full' } })).toStrictEqual({
      kind: 'codex',
      settings: {},
    });
    const openrouter = { kind: 'openrouter', model: 'x', effort: null };
    expect(memberEngineProjection(openrouter)).toStrictEqual(openrouter);
  });

  it('projects engines nested inside rows and lists', () => {
    expect(
      memberEngineProjection([{ engine: { kind: 'claude', settings: { builtin_tools: ['x'] } } }]),
    ).toStrictEqual([{ engine: { kind: 'claude', settings: { builtin_tools: [] } } }]);
  });
});
