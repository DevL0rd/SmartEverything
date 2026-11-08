import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pluginSignalSource, pluginSignalSpec, type SignalInput } from '@smarteverything/domain';
import { AutomationRunCancelledError } from '../../../src/automations/effects/run-abort';
import { expectedOf, type PluginUntil } from '../../../src/automations/plugin-kinds/until';
import { captureLogs } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';
import { AT, answered, rig, type Rig } from './rig';
import { POST_NODE, manifestWith } from './fixtures';

const BY_PORT = 'plugin.chat_hub.post_until_seen';
const BY_OUTPUT = 'plugin.chat_hub.post_until_id';

const SEEN_NODE = {
  ...POST_NODE,
  id: 'post_until_seen',
  until: { event: 'message', match: { channel_id: { port: 'channel' } }, timeout: 5000 },
} as const;

const ID_NODE = {
  ...POST_NODE,
  id: 'post_until_id',
  until: { event: 'message', match: { channel_id: { output: 'messageId' } }, timeout: 5000 },
} as const;

const MANIFEST = manifestWith('chat-hub', { nodes: [SEEN_NODE, ID_NODE] });

function message(channel: string, kind = 'message'): SignalInput {
  return {
    source: pluginSignalSource('chat-hub'),
    kind,
    subject: null,
    field: null,
    value: true,
    previous: null,
    at: AT,
    profileId: null,
    data: { channel_id: channel },
  };
}

let opened: TestStore;
let test: Rig;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  opened.store.plugins.create({
    manifest: MANIFEST,
    source: 'builtin',
    location: 'builtin',
    trusted: true,
  });
  test = rig(opened.store);
  test.bus.register(pluginSignalSpec(MANIFEST));
});

afterEach(async () => {
  vi.useRealTimers();
  await opened.close();
});

async function settledOf(work: Promise<unknown>): Promise<boolean> {
  let done = false;
  void work.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  return done;
}

describe('plugin node until', () => {
  it('keeps waiting after the tool returns for the event whose fields match', async () => {
    test.answer(answered({ id: 'm1' }));
    const result = test.perform(BY_PORT, { channel: 'c1' }, 'wait_for_result');
    expect(await settledOf(result)).toBe(false);
    test.bus.emit(message('c2'));
    expect(await settledOf(result)).toBe(false);
    test.bus.emit(message('c1'));
    await expect(result).resolves.toEqual({ ok: true, value: { messageId: 'm1' } });
    expect(test.listening()).toEqual({ open: 0, total: 1 });
  });

  it('counts an event that arrives before the tool returns', async () => {
    let release: (value: Awaited<ReturnType<typeof answered>>) => void = () => undefined;
    test.answer(new Promise((resolve) => (release = resolve)));
    const result = test.perform(BY_PORT, { channel: 'c1' }, 'wait_for_result');
    await settledOf(result);
    test.bus.emit(message('c1'));
    expect(await settledOf(result)).toBe(false);
    release({ response: { id: 'm1' }, line: '', pictures: [] });
    await expect(result).resolves.toEqual({ ok: true, value: { messageId: 'm1' } });
  });

  it('matches an event field against an output of the tool answer', async () => {
    test.answer(answered({ id: 'chan-9' }));
    const result = test.perform(BY_OUTPUT, { channel: 'c1' }, 'wait_for_result');
    await settledOf(result);
    test.bus.emit(message('c1'));
    expect(await settledOf(result)).toBe(false);
    test.bus.emit(message('chan-9', 'other'));
    expect(await settledOf(result)).toBe(false);
    test.bus.emit(message('chan-9'));
    await expect(result).resolves.toEqual({ ok: true, value: { messageId: 'chan-9' } });
  });

  it('fails with Timeout when the event does not arrive in its own timeout', async () => {
    vi.useFakeTimers();
    test.answer(answered({ id: 'm1' }));
    const result = test.perform(BY_PORT, { channel: 'c1' }, 'wait_for_result');
    await vi.advanceTimersByTimeAsync(4999);
    test.bus.emit(message('c2'));
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toMatchObject({ ok: false, class: 'Timeout', code: 'timeout' });
    expect(test.listening()).toEqual({ open: 0, total: 1 });
  });

  it('does not wait for the event when the tool itself fails', async () => {
    test.answer(answered({ error: 'No', code: 'boom' }));
    await expect(
      test.perform(BY_PORT, { channel: 'c1' }, 'wait_for_result'),
    ).resolves.toMatchObject({ ok: false, class: 'Failed', code: 'boom' });
    expect(test.listening()).toEqual({ open: 0, total: 1 });
  });

  it('stops listening when the run is cancelled', async () => {
    test.answer(answered({ id: 'm1' }));
    const result = test.perform(BY_PORT, { channel: 'c1' }, 'wait_for_result');
    await settledOf(result);
    test.run.controller.abort();
    await expect(result).rejects.toBeInstanceOf(AutomationRunCancelledError);
    expect(test.listening()).toEqual({ open: 0, total: 1 });
  });

  it('never waits in send mode', async () => {
    test.answer(answered({ id: 'm1' }));
    await expect(test.perform(BY_PORT, { channel: 'c1' }, 'fire_and_forget')).resolves.toEqual({
      ok: true,
      value: { sent: true },
    });
    expect(test.listening()).toEqual({ open: 0, total: 0 });
  });
});

describe('until matching', () => {
  const UNTIL: PluginUntil = {
    event: 'message',
    match: { channel_id: { port: 'channel' }, job: { output: 'jobKey' } },
    timeout: 1000,
  };

  it('reads each field from the node ports or the tool outputs', () => {
    expect(expectedOf(UNTIL, { channel: 'c1' }, { jobKey: 'j7' })).toEqual({
      ok: true,
      expected: { channel_id: 'c1', job: 'j7' },
    });
  });

  it('fails with the names that have no value', () => {
    expect(expectedOf(UNTIL, {}, {})).toMatchObject({
      ok: false,
      class: 'Failed',
      code: 'missing_output',
      message: 'The message event cannot be matched: channel, jobKey has no value.',
    });
  });
});
