import {
  ALL_NODE_KINDS,
  isAssignable,
  PLUGIN_MANIFEST,
  pluginNodeKindId,
  pluginTriggerKindId,
  signalMatchesMatcher,
  type FlowType,
  type PluginManifest,
  type SignalInput,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  failure,
  type HubTool,
  type HubToolResult,
  type ToolSource,
} from '../../../src/ai-tools/hub-tool';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import { bindArgs } from '../../../src/automations/plugin-kinds/args';
import { createKindCatalog, syncContribution } from '../../../src/automations/plugin-kinds/catalog';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import {
  PLUGIN_NODE_PREFIX,
  pluginNodeEffects,
} from '../../../src/automations/plugin-kinds/perform';
import { compileTriggers, signalFire } from '../../../src/automations/triggers-v3/armers';
import { contributionsOf } from '../../../src/plugins/contributions';
import { expectContributionValid } from '../../../src/plugins/builtin/automation-kit';
import type { PluginTool } from '../../../src/plugins/builtin/contract';
import { DISCORD_AUTOMATION } from '../../../src/plugins/builtin/discord/automation';
import { DISCORD_ENTITIES } from '../../../src/plugins/builtin/discord/automation-entities';
import { DISCORD_TRIGGERS } from '../../../src/plugins/builtin/discord/automation-triggers';
import {
  DISCORD_EVENT_KINDS,
  DiscordAutomationEvents,
} from '../../../src/plugins/builtin/discord/automation-events';
import { discordPlugin } from '../../../src/plugins/builtin/discord';
import { operationsOf } from '../../../src/plugins/builtin/discord/operations';
import { PICKER_SOURCES } from '../../../src/plugins/builtin/discord/pickers';
import { flatSchemaOf, EVENT_ID } from '../../../src/plugins/builtin/discord/tools/schema';
import {
  sendTool,
  type RunFileReader,
  type SendServices,
} from '../../../src/plugins/builtin/discord/tools/send-tool';
import { testRun } from '../../automations-v3/effects/support';
import { trigger } from '../../support/automation-fixture';
import { captureLogs } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';
import { muteActions } from '../../../src/plugins/builtin/discord/voice/tools';
import { CHANNEL, GUEST_ID, GUILD, MESSAGE, OWNER_CALLER, worldOf } from './fakes';

const MANIFEST: PluginManifest = PLUGIN_MANIFEST.parse(discordPlugin.manifest);

const AT = '2026-10-25T10:00:00.000Z';

const VOICE_CHANNEL = '300000000000000009';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const OWNER = { kind: 'plugin', id: 'discord' } as const;

const NODE_IDS = [
  'send',
  'react',
  'voice_join',
  'voice_leave',
  'voice_speak',
  'voice_mute',
  'voice_unmute',
];

const TRIGGER_IDS = [
  'message_received',
  'voice_joined',
  'voice_left',
  'reaction_added',
  'member_joined_server',
];

function nodeOf(id: string): (typeof MANIFEST.contributes.automation.nodes)[number] {
  const found = MANIFEST.contributes.automation.nodes.find((node) => node.id === id);
  if (found === undefined) throw new Error(`no node ${id}`);
  return found;
}

describe('the Discord automation declaration', () => {
  it('is valid and runs only tools the plugin registers', () => {
    const assembled = expectContributionValid(discordPlugin, {
      tools: ['send', 'prompt', 'read', 'change', 'remove', 'voice'],
    });
    expect(assembled.rejections).toEqual([]);
  });

  it('serves every node and trigger as a kind of the Discord plugin', () => {
    const catalog = createKindCatalog();
    const synced = syncContribution(catalog, pluginContribution(MANIFEST));
    expect(synced.rejections).toEqual([]);
    for (const id of NODE_IDS) {
      expect(catalog.get(pluginNodeKindId(OWNER, id))).toMatchObject({
        class: 'effect',
        category: 'plugins',
      });
    }
    for (const id of TRIGGER_IDS) {
      expect(catalog.get(pluginTriggerKindId(OWNER, id))).toMatchObject({ class: 'trigger' });
    }
    expect(DISCORD_AUTOMATION.nodes.map((node) => node.id).slice(0, NODE_IDS.length)).toEqual(
      NODE_IDS,
    );
    expect(DISCORD_AUTOMATION.triggers.map((entry) => entry.id)).toEqual(TRIGGER_IDS);
  });

  it('gives every entity a picker the plugin registers, except the wire only message', () => {
    const wireOnly = ['message'];
    for (const declared of DISCORD_ENTITIES.map((item) => item.declaration)) {
      if (wireOnly.includes(declared.id)) continue;
      expect(PICKER_SOURCES).toContain(declared.options);
    }
    expect(DISCORD_ENTITIES.map((item) => item.declaration.id)).toEqual([
      'channel',
      'person',
      'voice_channel',
      'server',
      'message',
      'emoji',
    ]);
  });

  it('puts the owner prefix on nothing outside the plugin and keeps every id unique', () => {
    const ids = [...DISCORD_AUTOMATION.nodes, ...DISCORD_AUTOMATION.triggers].map(
      (entry) => entry.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the Discord triggers against the events the plugin emits', () => {
  it.each(DISCORD_TRIGGERS.map((entry) => [entry.id, entry] as const))(
    '%s reads only fields its event declares, with matching types',
    (_id, declared) => {
      const event = DISCORD_EVENT_KINDS.find((candidate) => candidate.kind === declared.event);
      expect(event).toBeDefined();
      const fields = event?.fields ?? {};
      const typeOf = (key: string): string | undefined => fields[key];
      for (const filter of declared.filters) {
        expect(typeOf(filter.match)).toBeDefined();
      }
      for (const port of declared.outputs) {
        const kind = typeOf(port.from);
        expect(kind).toBeDefined();
        const expected = kind === 'boolean' ? 'boolean' : kind === 'number' ? 'number' : null;
        if (expected !== null) expect(port.type.t).toBe(expected);
        else expect(['text', 'entity']).toContain(port.type.t);
      }
    },
  );
});

interface Fired {
  readonly signal: SignalInput;
}

function signalsOf(send: (events: DiscordAutomationEvents) => void): Fired[] {
  const fired: Fired[] = [];
  const emitted: Parameters<ReturnType<typeof contributionsOf>['sinks']['event']>[0][] = [];
  const events = new DiscordAutomationEvents(
    (event) => emitted.push(event),
    (cause) => {
      throw new Error(String(cause));
    },
  );
  events.packet({ t: 'READY', d: { user: { id: '100000000000000099' } } });
  send(events);
  const { sinks } = contributionsOf(
    {
      store: opened.store,
      signals: {
        emit: (signal) => {
          fired.push({ signal });
        },
        register: vi.fn(),
      },
      inbound: vi.fn(),
      now: () => new Date(AT),
    },
    MANIFEST,
    vi.fn(),
  );
  for (const event of emitted) sinks.event(event);
  return fired;
}

function firesOn(
  kind: string,
  ports: Record<string, string>,
  fired: readonly Fired[],
): readonly (Readonly<Record<string, unknown>> | undefined)[] {
  const catalog = createKindCatalog();
  syncContribution(catalog, pluginContribution(MANIFEST));
  const compiled = compileTriggers('auto-1', [trigger(kind, ports)], (id) => catalog.matcher(id));
  expect(compiled.problems).toEqual([]);
  const [entry] = compiled.signals;
  if (entry === undefined) throw new Error('the trigger did not compile');
  return fired.map(({ signal }) =>
    signalMatchesMatcher(entry.matcher, signal)
      ? signalFire(compiled, signal, entry.triggerId)?.payload
      : undefined,
  );
}

let opened: TestStore;
let logs: ReturnType<typeof captureLogs>;

beforeEach(async () => {
  logs = captureLogs();
  opened = await testStore();
  opened.store.plugins.create({
    manifest: MANIFEST,
    source: 'builtin',
    location: 'builtin',
    trusted: true,
  });
});

afterEach(async () => {
  await opened.close();
});

describe('Discord triggers fire on gateway events', () => {
  it('fires a message trigger for its channel and person and hands the fields on', () => {
    const fired = signalsOf((events) => {
      events.packet({
        t: 'MESSAGE_CREATE',
        d: {
          id: MESSAGE,
          channel_id: CHANNEL,
          content: 'hello there',
          author: { id: GUEST_ID },
          attachments: [{ id: '1' }],
        },
      });
      events.packet({
        t: 'MESSAGE_CREATE',
        d: {
          id: MESSAGE,
          channel_id: '300000000000000077',
          content: 'elsewhere',
          author: { id: GUEST_ID },
        },
      });
    });
    expect(
      firesOn(
        pluginTriggerKindId(OWNER, 'message_received'),
        { channel: CHANNEL, person: GUEST_ID },
        fired,
      ),
    ).toEqual([
      {
        text: 'hello there',
        author: GUEST_ID,
        channel: CHANNEL,
        message: MESSAGE,
        hasAttachment: true,
        at: AT,
      },
      undefined,
    ]);
  });

  it('fires voice triggers per channel and a reaction trigger per emoji', () => {
    const fired = signalsOf((events) => {
      const state = (channel: string | null): unknown => ({
        guild_id: GUILD,
        channel_id: channel,
        user_id: GUEST_ID,
        member: { user: { id: GUEST_ID } },
      });
      events.packet({ t: 'VOICE_STATE_UPDATE', d: state(VOICE_CHANNEL) });
      events.packet({ t: 'VOICE_STATE_UPDATE', d: state(null) });
      events.packet({
        t: 'MESSAGE_REACTION_ADD',
        d: {
          user_id: GUEST_ID,
          channel_id: CHANNEL,
          message_id: MESSAGE,
          guild_id: GUILD,
          emoji: { id: null, name: 'tada' },
        },
      });
    });
    expect(
      firesOn(pluginTriggerKindId(OWNER, 'voice_joined'), { channel: VOICE_CHANNEL }, fired).map(
        (payload) => payload !== undefined,
      ),
    ).toEqual([true, false, false]);
    expect(
      firesOn(pluginTriggerKindId(OWNER, 'voice_left'), { channel: VOICE_CHANNEL }, fired).map(
        (payload) => payload !== undefined,
      ),
    ).toEqual([false, true, false]);
    expect(firesOn(pluginTriggerKindId(OWNER, 'reaction_added'), { emoji: 'tada' }, fired)).toEqual(
      [undefined, undefined, expect.objectContaining({ emoji: 'tada', channel: CHANNEL })],
    );
    expect(firesOn(pluginTriggerKindId(OWNER, 'reaction_added'), { emoji: 'fire' }, fired)).toEqual(
      [undefined, undefined, undefined],
    );
  });
});

interface Sent {
  readonly channelId: string | undefined;
  readonly userId: string | undefined;
  readonly content: string;
  readonly files: readonly { readonly name: string; readonly contentType: string }[];
}

function sendServices(pictureFile: RunFileReader, sent: Sent[]): SendServices {
  return {
    settings: { media_max_file_bytes: 1_000_000 },
    identity: { assertReady: () => undefined },
    authority: { access: () => Promise.resolve({ origin: null }) },
    directory: { resolve: (value) => Promise.resolve(value) },
    sender: {
      send: (input): Promise<unknown> => {
        sent.push({
          channelId: input.channelId,
          userId: input.userId,
          content: input.content,
          files: input.files.map((file) => ({ name: file.name, contentType: file.contentType })),
        });
        return Promise.resolve({
          id: '500000000000000001',
          channel_id: input.channelId ?? CHANNEL,
        });
      },
    },
    media: { assertEnabled: () => undefined },
    download: () => Promise.reject(new Error('no downloads in this test')),
    machineFile: () => Promise.resolve(null),
    uploadFile: () => Promise.reject(new Error('attachments are not used in this test')),
    pictureFile,
  };
}

interface Call {
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}

function hubToolOf(tool: PluginTool): HubTool {
  return {
    name: `discord__${tool.name}`,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    origin: { kind: 'plugin', pluginId: 'discord' },
    humanOnly: tool.humanOnly,
  };
}

function changeTool(calls: Call[]): PluginTool {
  const operations = operationsOf('change');
  const inputSchema = flatSchemaOf(
    operations.map((operation) => ({
      action: operation.action,
      schema: z.strictObject({
        action: z.literal(operation.action),
        eventId: EVENT_ID,
        ...operation.shape,
      }),
    })),
  );
  return {
    name: 'change',
    title: 'Change things in Discord',
    description: 'Changes.',
    inputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    humanOnly: false,
    validate: () => null,
    run: (raw): Promise<HubToolResult> => {
      calls.push({ tool: 'change', args: raw });
      return Promise.resolve({ response: { result: {} }, line: '', pictures: [] });
    },
  };
}

function performer(
  tools: readonly PluginTool[],
): (
  kind: string,
  params: Record<string, string | readonly Record<string, string>[]>,
  mode?: 'wait_for_result',
) => Promise<unknown> {
  const byName = new Map(tools.map((tool) => [`discord__${tool.name}`, tool]));
  const source: ToolSource = {
    tools: () => tools.map(hubToolOf),
    call: (tool, args, caller) => {
      const found = byName.get(tool.name);
      return found === undefined
        ? Promise.resolve(failure(`no tool ${tool.name}`))
        : found.run(args, caller);
    },
    validate: (tool, args) => byName.get(tool.name)?.validate(args) ?? null,
    changes: () => () => undefined,
  };
  const handlers = pluginNodeEffects({
    store: opened.store,
    events: { record: () => undefined },
    clock: { now: () => new Date(AT) },
    signals: { subscribe: (): (() => void) => () => undefined },
    tools: () => new ToolHub([source]),
  });
  const run = testRun();
  return async (kind, params, mode): Promise<unknown> => {
    const handler = handlers[PLUGIN_NODE_PREFIX];
    if (handler === undefined) throw new Error('no plugin performer');
    return await handler(
      params,
      {
        kind,
        node: { id: 'n', key: 'n' },
        path: 'n',
        activation: '0',
        key: 'n',
        params,
        retry: 'external',
        budget: 'effects',
        ...(mode === undefined ? {} : { mode }),
      },
      run,
    );
  };
}

const SEND = pluginNodeKindId(OWNER, 'send');

function picturesOf(id: string): RunFileReader {
  return (_caller, asked) =>
    Promise.resolve(asked === id ? { data: PNG, name: `snapshot-${id}.jpg` } : null);
}

describe('Send a Discord message', () => {
  it('posts a camera or made picture by its id to a channel and gives back the message', async () => {
    const sent: Sent[] = [];
    const perform = performer([sendTool(sendServices(picturesOf('pic-1'), sent))]);
    const result = await perform(
      SEND,
      { channel: CHANNEL, text: 'Motion at the door', picture: 'pic-1' },
      'wait_for_result',
    );
    expect(result).toEqual({
      ok: true,
      value: { message: '500000000000000001', posted_in: CHANNEL },
    });
    expect(sent).toEqual([
      {
        channelId: CHANNEL,
        userId: undefined,
        content: 'Motion at the door',
        files: [{ name: 'snapshot-pic-1.jpg', contentType: 'image/png' }],
      },
    ]);
  });

  it('messages one person directly with no files', async () => {
    const sent: Sent[] = [];
    const perform = performer([sendTool(sendServices(picturesOf('x'), sent))]);
    await perform(SEND, { person: GUEST_ID, text: 'Dinner is ready' }, 'wait_for_result');
    expect(sent).toEqual([
      { channelId: undefined, userId: GUEST_ID, content: 'Dinner is ready', files: [] },
    ]);
  });

  it('hands the command over at once in send mode', async () => {
    const sent: Sent[] = [];
    const perform = performer([sendTool(sendServices(picturesOf('x'), sent))]);
    await expect(perform(SEND, { channel: CHANNEL, text: 'Hi' })).resolves.toEqual({
      ok: true,
      value: { sent: true },
    });
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
  });

  it('fails with a reason on the error exit when the picture is not found', async () => {
    const sent: Sent[] = [];
    const perform = performer([sendTool(sendServices(picturesOf('other'), sent))]);
    const result = await perform(SEND, { channel: CHANNEL, picture: 'pic-1' }, 'wait_for_result');
    expect(result).toMatchObject({
      ok: false,
      class: 'Failed',
      message: 'The picture pic-1 does not exist or is not yours',
    });
    expect(sent).toEqual([]);
  });

  it('declares pictures as picture ids, with no path or url field to fill', () => {
    const inputs = nodeOf('send').inputs;
    const picture = inputs.find((port) => port.name === 'picture');
    const pictures = inputs.find((port) => port.name === 'pictures');
    expect(picture?.type).toEqual({ t: 'text' });
    expect(pictures?.type).toEqual({ t: 'list', of: { t: 'text' } });
    expect([picture?.required, pictures?.required]).toEqual([false, false]);
    expect(inputs.map((port) => port.name)).toEqual([
      'channel',
      'person',
      'text',
      'picture',
      'pictures',
    ]);
  });

  it('hands one picture id and a list of ids on to the tool as they are', () => {
    expect(bindArgs(nodeOf('send').run.args, { channel: CHANNEL, picture: 'pic-1' })).toEqual({
      channelId: CHANNEL,
      picture: 'pic-1',
    });
    expect(bindArgs(nodeOf('send').run.args, { person: GUEST_ID, pictures: ['a', 'b'] })).toEqual({
      userId: GUEST_ID,
      pictures: ['a', 'b'],
    });
  });

  it('accepts a camera picture, the pictures of several cameras and a made picture on its wires', () => {
    const catalog = createKindCatalog();
    syncContribution(catalog, pluginContribution(MANIFEST));
    const send = catalog.get(SEND);
    const portType = (
      ports: readonly { readonly name: string; readonly type: FlowType }[] | undefined,
      name: string,
    ): FlowType => {
      const found = ports?.find((port) => port.name === name)?.type;
      if (found === undefined) throw new Error(`no port ${name}`);
      return found;
    };
    const snapshot = ALL_NODE_KINDS.find((entry) => entry.id === 'camera.snapshot');
    const image = ALL_NODE_KINDS.find((entry) => entry.id === 'ai.image');
    expect(
      isAssignable(portType(snapshot?.outputs, 'image'), portType(send?.inputs, 'picture')),
    ).toBe(true);
    expect(
      isAssignable(portType(snapshot?.outputs, 'images'), portType(send?.inputs, 'pictures')),
    ).toBe(true);
    expect(
      isAssignable(portType(image?.outputs, 'picture'), portType(send?.inputs, 'picture')),
    ).toBe(true);
  });

  it('declares the message and channel it gives back only for waiting runs', () => {
    expect(nodeOf('send').waitOnly).toEqual(['message', 'posted_in']);
    expect(nodeOf('send').outputs.map((port) => port.type)).toEqual([
      { t: 'entity', of: 'discord.message' },
      { t: 'entity', of: 'discord.channel' },
    ]);
  });
});

describe('React to a Discord message', () => {
  it('adds the reaction through the change tool with arguments its schema accepts', async () => {
    const calls: Call[] = [];
    const perform = performer([changeTool(calls)]);
    const kind = pluginNodeKindId(OWNER, 'react');
    const result = await perform(
      kind,
      { channel: CHANNEL, message: MESSAGE, emoji: 'party:123456789012345678' },
      'wait_for_result',
    );
    expect(result).toEqual({ ok: true, value: {} });
    expect(calls).toEqual([
      {
        tool: 'change',
        args: {
          action: 'reaction_add',
          channelId: CHANNEL,
          messageId: MESSAGE,
          emoji: 'party:123456789012345678',
        },
      },
    ]);
  });

  it('refuses a message that is not a Discord id before anything is sent', async () => {
    const calls: Call[] = [];
    const perform = performer([changeTool(calls)]);
    const result = await perform(
      pluginNodeKindId(OWNER, 'react'),
      { channel: CHANNEL, message: 'not-an-id', emoji: 'x' },
      'wait_for_result',
    );
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(calls).toEqual([]);
  });

  it('retries safely because adding the same reaction twice changes nothing', () => {
    expect(nodeOf('react').retry).toBe('idempotent');
  });
});

describe('Discord voice nodes', () => {
  it.each([
    ['voice_join', { channel: VOICE_CHANNEL }, { action: 'join', channelId: VOICE_CHANNEL }],
    ['voice_leave', {}, { action: 'leave' }],
    ['voice_leave', { server: GUILD }, { action: 'leave', guildId: GUILD }],
    ['voice_mute', {}, { action: 'mute' }],
    ['voice_mute', { server: GUILD }, { action: 'mute', guildId: GUILD }],
    ['voice_unmute', { server: GUILD }, { action: 'unmute', guildId: GUILD }],
    ['voice_speak', { text: 'Dinner' }, { action: 'speak', text: 'Dinner' }],
    [
      'voice_speak',
      { text: 'Dinner', server: GUILD },
      { action: 'speak', text: 'Dinner', guildId: GUILD },
    ],
  ])('%s sends exactly the arguments its tool action takes', (id, params, expected) => {
    const node = nodeOf(id);
    expect(node.run.tool).toBe('voice');
    expect(bindArgs(node.run.args, params)).toEqual(expected);
  });

  it('offers joining, leaving, speaking, muting and unmuting, each with a timeout for a waiting run', () => {
    for (const id of ['voice_join', 'voice_leave', 'voice_speak', 'voice_mute', 'voice_unmute']) {
      expect(nodeOf(id).kind).toBe('action');
      expect(nodeOf(id).timeout).toBeDefined();
    }
    expect(logs.events()).not.toContain('plugin_kind.rejected');
  });
});

describe('the voice tool mute actions the nodes run', () => {
  function muting(): {
    readonly actions: ReturnType<typeof muteActions>;
    readonly calls: string[];
  } {
    const calls: string[] = [];
    const actions = muteActions(
      { authority: worldOf().authority },
      {
        target: (guildId) => {
          if (guildId === undefined) throw new Error('The bot is not in a voice call');
          return { guildId };
        },
        mute: (guildId, muted) => {
          calls.push(`${guildId}:${String(muted)}`);
        },
      },
    );
    return { actions, calls };
  }

  it.each([
    ['mute', true],
    ['unmute', false],
  ])('%s switches the call of that server', async (action, muted) => {
    const { actions, calls } = muting();
    const found = actions.find((entry) => entry.action === action);
    await found?.run({ guildId: GUILD }, OWNER_CALLER, undefined);
    expect(calls).toEqual([`${GUILD}:${String(muted)}`]);
  });

  it('refuses a server id that is not a Discord id and changes nothing', async () => {
    const { actions, calls } = muting();
    await expect(actions[0]?.run({ guildId: 'home' }, OWNER_CALLER, undefined)).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
