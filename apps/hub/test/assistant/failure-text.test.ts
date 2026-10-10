import { describe, expect, it } from 'vitest';
import { withoutAbsentFields } from '../../src/ai-tools/arguments';
import type { HubTool } from '../../src/ai-tools/hub-tool';
import { toolLine } from '../../src/ai-tools/tool-lines';
import { reasonWithActions } from '../../src/assistant/failure-reason';
import { networkFailure } from '../../src/openrouter/errors';

const EDIT: HubTool = {
  name: 'edit_automation',
  title: 'Edit an automation',
  description: 'Adds, changes or removes an automation',
  inputSchema: {},
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  origin: { kind: 'se' },
  humanOnly: false,
};

describe('what a network failure says', () => {
  it('names the socket error behind "fetch failed"', () => {
    const socket = Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' });
    const failure = new TypeError('fetch failed', { cause: socket });
    expect(networkFailure(failure)).toBe('fetch failed: other side closed [UND_ERR_SOCKET]');
  });

  it('keeps a plain failure as it is', () => {
    expect(networkFailure(new Error('timed out'))).toBe('timed out');
    expect(networkFailure('refused')).toBe('refused');
  });
});

describe('an action line', () => {
  it('names the tool when nothing more specific applies', () => {
    expect(toolLine({ tool: EDIT, args: {}, deviceName: () => null })).toBe('Edit an automation');
  });
});

describe('a failed turn that already acted', () => {
  it('lists what was done before it stopped', () => {
    expect(reasonWithActions('The model is unavailable.', ['Edit an automation'])).toBe(
      'The model is unavailable. Already done before it stopped: Edit an automation.',
    );
  });

  it('names only the last three actions', () => {
    expect(reasonWithActions('Stopped.', ['a', 'b', 'c', 'd'])).toBe(
      'Stopped. Already done before it stopped: b; c; d.',
    );
  });

  it('stays the plain reason when nothing was done', () => {
    expect(reasonWithActions('Stopped.', [])).toBe('Stopped.');
  });
});

describe('arguments a model sends for fields it leaves out', () => {
  const schema = {
    properties: {
      view: { type: 'string' },
      sessionId: { type: 'string' },
      icon: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    },
  };

  it('drops null for a field that cannot be null', () => {
    expect(withoutAbsentFields(schema, { view: 'sessions', sessionId: null })).toEqual({
      view: 'sessions',
    });
  });

  it('keeps null where the field accepts it, and every real value', () => {
    expect(withoutAbsentFields(schema, { view: 'session', sessionId: 'abc', icon: null })).toEqual({
      view: 'session',
      sessionId: 'abc',
      icon: null,
    });
  });
});
