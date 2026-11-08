import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsonValue } from '@smarteverything/domain';
import type { BoundArgs } from '../../../src/automations/plugin-kinds/args';
import {
  BATCH_RESULTS,
  PluginDispatcher,
  PluginDispatchers,
  splitReply,
  type Reply,
  type Submission,
} from '../../../src/automations/plugin-kinds/dispatch';
import { captureLogs } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';
import { POST_NODE, manifestWith } from './fixtures';
import { LIST_INPUT, answered, rig, type Rig } from './rig';

const BATCHED = 'plugin.chat_hub.post_many';

const BATCH_NODE = {
  ...POST_NODE,
  id: 'post_many',
  title: 'Post to many',
  batch: { arg: 'channelId' },
} as const;

interface Deferred {
  readonly args: BoundArgs;
  readonly resolve: (reply: Reply) => void;
}

function submission(
  args: BoundArgs,
  seen: Deferred[],
  overrides: Partial<Submission> = {},
): Submission {
  return {
    identity: 'owner',
    tool: 'chat-hub__post',
    args,
    batchArg: undefined,
    invoke: (sent) =>
      new Promise<Reply>((resolve) => {
        seen.push({ args: sent, resolve });
      }),
    ...overrides,
  };
}

function itemsFor(args: BoundArgs): Reply {
  const list = args['channelId'];
  return reply({ [BATCH_RESULTS]: Array.isArray(list) ? list.map(() => ({})) : [] });
}

function reply(response: Readonly<Record<string, unknown>>): Reply {
  return { ok: true, response };
}

describe('plugin dispatcher', () => {
  it('runs calls of one plugin concurrently with no limit', async () => {
    const seen: Deferred[] = [];
    const dispatcher = new PluginDispatcher();
    const first = dispatcher.submit(submission({ n: 1 }, seen));
    const second = dispatcher.submit(submission({ n: 2 }, seen));
    const third = dispatcher.submit(submission({ n: 3 }, seen));
    expect(seen.map((call) => call.args)).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    seen[2]?.resolve(reply({ at: 3 }));
    await expect(third).resolves.toEqual(reply({ at: 3 }));
    seen[0]?.resolve(reply({ at: 1 }));
    seen[1]?.resolve(reply({ at: 2 }));
    await expect(Promise.all([first, second])).resolves.toEqual([
      reply({ at: 1 }),
      reply({ at: 2 }),
    ]);
  });

  it('never makes one plugin wait for another', async () => {
    const dispatchers = new PluginDispatchers();
    const slow: Deferred[] = [];
    const quick: Deferred[] = [];
    void dispatchers.of('slow').submit(submission({ n: 1 }, slow));
    const other = dispatchers.of('quick').submit(submission({ n: 2 }, quick));
    expect(quick).toHaveLength(1);
    quick[0]?.resolve(reply({ at: 'quick' }));
    await expect(other).resolves.toEqual(reply({ at: 'quick' }));
    expect(dispatchers.of('slow')).toBe(dispatchers.of('slow'));
    expect(dispatchers.of('slow')).not.toBe(dispatchers.of('quick'));
  });

  it('merges same-tick calls to one tool into one call with a list and splits by index', async () => {
    const seen: Deferred[] = [];
    const dispatcher = new PluginDispatcher();
    const batched = (channel: string): Promise<Reply> =>
      dispatcher.submit(
        submission({ channelId: channel, body: 'hi' }, seen, { batchArg: 'channelId' }),
      );
    const results = [batched('a'), batched('b'), batched('c')];
    await Promise.resolve();
    expect(seen).toHaveLength(0);
    await new Promise((resolve) => setImmediate(resolve));
    expect(seen.map((call) => call.args)).toEqual([{ channelId: ['a', 'b', 'c'], body: 'hi' }]);
    seen[0]?.resolve(reply({ [BATCH_RESULTS]: [{ id: 'x' }, { id: 'y' }, { error: 'gone' }] }));
    await expect(Promise.all(results)).resolves.toEqual([
      reply({ id: 'x' }),
      reply({ id: 'y' }),
      reply({ error: 'gone' }),
    ]);
  });

  it('keeps calls apart that differ in other arguments, caller or tool, and across ticks', async () => {
    const seen: Deferred[] = [];
    const dispatcher = new PluginDispatcher();
    const batched = (args: BoundArgs, overrides: Partial<Submission> = {}): Promise<Reply> =>
      dispatcher.submit(submission(args, seen, { batchArg: 'channelId', ...overrides }));
    const together = [
      batched({ channelId: 'a', body: 'one' }),
      batched({ channelId: 'b', body: 'two' }),
      batched({ channelId: 'c', body: 'one' }),
      batched({ channelId: 'd', body: 'one' }, { identity: 'member' }),
      batched({ channelId: 'e', body: 'one' }, { tool: 'chat-hub__other' }),
    ];
    await new Promise((resolve) => setImmediate(resolve));
    expect(seen.map((call) => call.args)).toEqual([
      { channelId: ['a', 'c'], body: 'one' },
      { channelId: ['b'], body: 'two' },
      { channelId: ['d'], body: 'one' },
      { channelId: ['e'], body: 'one' },
    ]);
    for (const call of seen) call.resolve(itemsFor(call.args));
    await Promise.all(together);
    const later = batched({ channelId: 'z' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(seen.at(-1)?.args).toEqual({ channelId: ['z'] });
    seen.at(-1)?.resolve(reply({ [BATCH_RESULTS]: [{}] }));
    await later;
  });

  it('sends a call without its batch argument as it is', async () => {
    const seen: Deferred[] = [];
    const dispatcher = new PluginDispatcher();
    const call = dispatcher.submit(submission({ body: 'x' }, seen, { batchArg: 'channelId' }));
    expect(seen.map((entry) => entry.args)).toEqual([{ body: 'x' }]);
    seen[0]?.resolve(reply({ id: 'one' }));
    await expect(call).resolves.toEqual(reply({ id: 'one' }));
  });
});

describe('batched replies', () => {
  const ITEMS: readonly JsonValue[] = [{ id: 'x' }, { id: 'y' }];

  it('gives every member the same failure and a top level plugin error', () => {
    const refused: Reply = { ok: false, class: 'Unreachable', message: 'off', code: 'unavailable' };
    expect(splitReply(refused, 2)).toEqual([refused, refused]);
    const error = reply({ error: 'no', code: 'muted' });
    expect(splitReply(error, 2)).toEqual([error, error]);
  });

  it('fails every member when the answers do not match the calls one for one', () => {
    for (const answer of [
      reply({ [BATCH_RESULTS]: ITEMS }),
      reply({}),
      reply({ [BATCH_RESULTS]: [1, 2, 3] }),
    ]) {
      expect(splitReply(answer, 3)).toEqual(
        Array.from({ length: 3 }, (): unknown =>
          expect.objectContaining({ ok: false, code: 'batch_mismatch' }),
        ),
      );
    }
    expect(splitReply(reply({ [BATCH_RESULTS]: [{ id: 'x' }, 5] }), 2)).toEqual([
      reply({ id: 'x' }),
      expect.objectContaining({ ok: false, code: 'batch_mismatch' }),
    ]);
  });
});

describe('plugin node batching through the performer', () => {
  let opened: TestStore;
  let test: Rig;

  beforeEach(async () => {
    captureLogs();
    opened = await testStore();
    opened.store.plugins.create({
      manifest: manifestWith('chat-hub', { nodes: [BATCH_NODE] }),
      source: 'builtin',
      location: 'builtin',
      trusted: true,
    });
    test = rig(opened.store, { schema: LIST_INPUT });
  });

  afterEach(async () => {
    await opened.close();
  });

  it('turns parallel calls into one tool call and hands each run its own answer', async () => {
    test.answerWith((call) => {
      const channels = call.args['channelId'];
      const ids = Array.isArray(channels)
        ? channels.map((channel) => ({ id: `m-${String(channel)}` }))
        : [];
      return answered({ [BATCH_RESULTS]: ids });
    });
    const results = await Promise.all(
      ['a', 'b', 'c'].map((channel) =>
        test.perform(BATCHED, { channel, text: 'hi' }, 'wait_for_result'),
      ),
    );
    expect(test.calls.map((call) => call.args)).toEqual([
      { channelId: ['a', 'b', 'c'], body: 'hi' },
    ]);
    expect(results).toEqual([
      { ok: true, value: { messageId: 'm-a' } },
      { ok: true, value: { messageId: 'm-b' } },
      { ok: true, value: { messageId: 'm-c' } },
    ]);
  });

  it('fails only the call whose own arguments are invalid and still sends the rest together', async () => {
    test.answerWith(() => answered({ [BATCH_RESULTS]: [{ id: 'm-a' }, { id: 'm-c' }] }));
    const results = await Promise.all(
      ['a', 3, 'c'].map((channel) =>
        test.perform(BATCHED, { channel, text: 'hi' }, 'wait_for_result'),
      ),
    );
    expect(test.calls.map((call) => call.args)).toEqual([{ channelId: ['a', 'c'], body: 'hi' }]);
    expect(results).toMatchObject([
      { ok: true, value: { messageId: 'm-a' } },
      { ok: false, class: 'Invalid', code: 'invalid_arguments' },
      { ok: true, value: { messageId: 'm-c' } },
    ]);
  });

  it('records a late failure for every send mode call of a failed batch', async () => {
    test.answerWith(() => answered({ error: 'The channel is gone', code: 'gone' }));
    const sent = await Promise.all([
      test.perform(BATCHED, { channel: 'a' }),
      test.perform(BATCHED, { channel: 'b' }),
    ]);
    expect(sent).toEqual([
      { ok: true, value: { sent: true } },
      { ok: true, value: { sent: true } },
    ]);
    await vi.waitFor(() => {
      expect(test.events).toHaveLength(2);
    });
    expect(test.calls.map((call) => call.args)).toEqual([{ channelId: ['a', 'b'] }]);
  });
});
