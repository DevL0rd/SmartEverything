import type { AutomationFunctionExtractReply } from '@smarteverything/domain';
import { EMPTY_LAYOUT } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { FunctionExtractBody } from '../../data/api';
import { automation, step } from '../../model/editor/editor-fixtures';
import { commitExtraction, type CommitDeps } from './commit';

const BODY: FunctionExtractBody = {
  automationId: '11111111-1111-4111-8111-aaaaaaaaaaaa',
  expectedRevision: 4,
  keys: ['second'],
  name: 'Dim lights',
};

const BEFORE = { program: automation([step('first', {})]), layout: EMPTY_LAYOUT };

function reply(change: Partial<AutomationFunctionExtractReply>): AutomationFunctionExtractReply {
  return {
    ok: true,
    summary: 'Made it.',
    id: 'function-1',
    revision: 1,
    compat: 'compatible',
    changes: [],
    affected: [],
    problems: [],
    automationId: BODY.automationId,
    callerRevision: 5,
    instanceKey: 'dimLights',
    suggestion: [],
    ...change,
  };
}

interface Fakes {
  readonly fakes: CommitDeps;
  readonly update: ReturnType<typeof vi.fn<() => Promise<void>>>;
  readonly remove: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

function deps(extract: CommitDeps['functions']['extract']): Fakes {
  const update = vi.fn(() => Promise.resolve());
  const remove = vi.fn(() => Promise.resolve());
  const fakes: CommitDeps = {
    functions: { extract, remove },
    automations: { update },
  };
  return { fakes, update, remove };
}

describe('commitExtraction', () => {
  it('saves in one call and undo restores the caller then deletes the unused node', async () => {
    const { fakes, update, remove } = deps(() => Promise.resolve(reply({})));
    const result = await commitExtraction(fakes, BODY, BEFORE);
    if (!result.ok) throw new Error('expected success');
    expect(result.instanceKey).toBe('dimLights');
    await result.undo();
    expect(update).toHaveBeenCalledWith(BODY.automationId, {
      definition: BEFORE.program,
      layout: BEFORE.layout,
      expectedRevision: 5,
    });
    expect(remove).toHaveBeenCalledWith('function-1');
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(
      remove.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('reports a refusal from the server and changes nothing else', async () => {
    const refusal = reply({
      ok: false,
      id: null,
      callerRevision: null,
      problems: [{ severity: 'error', code: 'scattered', message: 'Steps are apart.' }],
    });
    const { fakes, update, remove } = deps(() => Promise.resolve(refusal));
    const result = await commitExtraction(fakes, BODY, BEFORE);
    expect(result).toEqual({ ok: false, message: 'Steps are apart.' });
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('reports a failed request with its message', async () => {
    const { fakes } = deps(() => Promise.reject(new Error('The automation changed.')));
    expect(await commitExtraction(fakes, BODY, BEFORE)).toEqual({
      ok: false,
      message: 'The automation changed.',
    });
  });
});
