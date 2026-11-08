import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { failure, type HubToolResult } from '../../../src/ai-tools/hub-tool';
import { atPointer, bindArgs } from '../../../src/automations/plugin-kinds/args';
import { captureLogs, type CapturedLogs } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';
import { POST_NODE, manifestWith } from './fixtures';
import { answered, rig, type Rig } from './rig';

const POST = 'plugin.chat_hub.post_message';
const LOOKUP = 'plugin.chat_hub.find_member';

const FIND_NODE = {
  ...POST_NODE,
  id: 'find_member',
  title: 'Find a member',
  kind: 'query',
  outputs: [
    {
      name: 'member',
      title: 'Member',
      type: { t: 'text' },
      description: 'Who.',
      from: '/m/0/a~1b',
    },
    {
      name: 'nick',
      title: 'Nick',
      type: { t: 'text' },
      optional: true,
      description: 'Nick.',
      from: '/nick',
    },
  ],
  run: { tool: 'find', args: { channelId: { port: 'channel' } } },
  errors: { muted: 'Refused' },
} as const;

let opened: TestStore;
let logs: CapturedLogs;

beforeEach(async () => {
  logs = captureLogs();
  opened = await testStore();
  opened.store.plugins.create({
    manifest: manifestWith('chat-hub', { nodes: [POST_NODE, FIND_NODE] }),
    source: 'builtin',
    location: 'builtin',
    trusted: true,
  });
});

afterEach(async () => {
  vi.useRealTimers();
  await opened.close();
});

function rigged(): Rig {
  return rig(opened.store);
}

describe('plugin node arguments', () => {
  it('binds ports, literals and nested records and leaves unset ports out', () => {
    expect(
      bindArgs(
        {
          to: { port: 'channel' },
          mode: { lit: 'loud' },
          meta: { record: { body: { port: 'text' }, gone: { port: 'missing' } } },
        },
        { channel: 'c1', text: 'hi' },
      ),
    ).toEqual({ to: 'c1', mode: 'loud', meta: { body: 'hi' } });
  });

  it('reads JSON pointers with escapes and list indexes', () => {
    const value = { m: [{ 'a/b': 'x', '~k': 2 }] };
    expect(atPointer(value, '/m/0/a~1b')).toBe('x');
    expect(atPointer(value, '/m/0/~0k')).toBe(2);
    expect(atPointer(value, '/m/01')).toBeUndefined();
    expect(atPointer(value, '')).toEqual(value);
  });
});

describe('plugin node performer', () => {
  it('waits for a query and maps its outputs by JSON pointer through the tool hub', async () => {
    const test = rigged();
    test.answer(answered({ m: [{ 'a/b': 'Ida' }] }));
    await expect(test.perform(LOOKUP, { channel: 'c1' })).resolves.toEqual({
      ok: true,
      value: { member: 'Ida' },
    });
    expect(test.calls.map((call) => [call.tool, call.args])).toEqual([
      ['chat-hub__find', { channelId: 'c1' }],
    ]);
    expect(test.calls[0]?.caller).toMatchObject({ via: 'automation', role: 'owner', chatId: null });
  });

  it('sends at once and records a later failure without failing the run', async () => {
    const test = rigged();
    let fail: (result: HubToolResult) => void = () => undefined;
    test.answer(new Promise((resolve) => (fail = resolve)));
    await expect(test.perform(POST, { channel: 'c1', text: 'hi' })).resolves.toEqual({
      ok: true,
      value: { sent: true },
    });
    expect(test.calls.map((call) => call.args)).toEqual([{ channelId: 'c1', body: 'hi' }]);
    fail(failure('The channel is gone'));
    await vi.waitFor(() => {
      expect(test.events).toHaveLength(1);
    });
    expect(test.events[0]?.details).toMatchObject({
      message: 'Post a message failed after it was sent: The channel is gone',
    });
    expect(logs.events()).toContain('plugin_node.late_failure');
  });

  it('leaves the deadline to the run policy and keeps waiting past the declared default', async () => {
    vi.useFakeTimers();
    const test = rigged();
    let settle: (result: HubToolResult) => void = () => undefined;
    test.answer(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const result = test.perform(POST, { channel: 'c1' }, 'wait_for_result');
    await vi.advanceTimersByTimeAsync(60_000);
    settle({ response: { id: 'm1' }, line: '', pictures: [] });
    await expect(result).resolves.toMatchObject({ ok: true, value: { messageId: 'm1' } });
  });

  it('answers NotFound through the performer for a kind outside the plugin prefix', async () => {
    await expect(rigged().perform('pluginx.chat_hub.post_message', {})).resolves.toMatchObject({
      ok: false,
      class: 'NotFound',
    });
  });

  it.each([
    {
      name: 'a switched off tool',
      code: null,
      params: { channel: 'c1' },
      errorClass: 'Unreachable',
      expected: 'unavailable',
    },
    {
      name: 'bad arguments',
      code: null,
      params: { channel: 3 },
      errorClass: 'Invalid',
      expected: 'invalid_arguments',
    },
    {
      name: 'a mapped plugin reason',
      code: 'muted',
      params: { channel: 'c1' },
      errorClass: 'Refused',
      expected: 'muted',
    },
    {
      name: 'a refusal by authority',
      code: 'forbidden',
      params: { channel: 'c1' },
      errorClass: 'Forbidden',
      expected: 'forbidden',
    },
    {
      name: 'any other failure',
      code: 'boom',
      params: { channel: 'c1' },
      errorClass: 'Failed',
      expected: 'boom',
    },
  ] as const)('classes $name', async ({ code, params, errorClass, expected }) => {
    const test = rigged();
    if (errorClass === 'Unreachable') test.offered.splice(1, 1);
    if (code !== null) test.answer(Promise.resolve(failure('No', { code })));
    await expect(test.perform(LOOKUP, params)).resolves.toMatchObject({
      ok: false,
      class: errorClass,
      code: expected,
    });
  });

  it('fails a wait when the answer lacks a required output and on an unknown kind', async () => {
    const test = rigged();
    test.answer(answered({ nick: 'x' }));
    await expect(test.perform(LOOKUP, { channel: 'c1' })).resolves.toMatchObject({
      ok: false,
      class: 'Failed',
      code: 'missing_output',
    });
    await expect(test.perform('plugin.chat_hub.nothing', {})).resolves.toMatchObject({
      ok: false,
      class: 'Unreachable',
    });
  });
});
