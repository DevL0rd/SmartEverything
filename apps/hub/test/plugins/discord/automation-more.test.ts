import {
  PLUGIN_MANIFEST,
  pluginNodeKindId,
  pluginNodeModes,
  pluginSignalSource,
  pluginSignalSpec,
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
import { expectedOf, resolveUntil, watchUntil } from '../../../src/automations/plugin-kinds/until';
import { discordPlugin } from '../../../src/plugins/builtin/discord';
import { DISCORD_AUTOMATION } from '../../../src/plugins/builtin/discord/automation';
import {
  DISCORD_EVENT_KINDS,
  POLL_ENDED,
  PROMPT_ANSWERED,
} from '../../../src/plugins/builtin/discord/automation-events';
import {
  ASK_TOOL,
  KICK_BAN_TOOL,
  TIMEOUT_MAX_SECONDS,
} from '../../../src/plugins/builtin/discord/automation-more-tools';
import { operationsOf } from '../../../src/plugins/builtin/discord/operations';
import type { OperationContext } from '../../../src/plugins/builtin/discord/operations/kit';
import { PICKER_SOURCES } from '../../../src/plugins/builtin/discord/pickers';
import { EVENT_ID, flatSchemaOf } from '../../../src/plugins/builtin/discord/tools/schema';
import type { PluginTool } from '../../../src/plugins/builtin/contract';
import { expectContributionValid } from '../../../src/plugins/builtin/automation-kit';
import { SignalBus } from '../../../src/signals/bus';
import { testRun } from '../../automations-v3/effects/support';
import { captureLogs, testLogger } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';
import { CHANNEL, GUEST_ID, GUILD, MESSAGE, worldOf, type World } from './fakes';

const MANIFEST: PluginManifest = PLUGIN_MANIFEST.parse(discordPlugin.manifest);

const OWNER = { kind: 'plugin', id: 'discord' } as const;

const AT = '2026-10-25T10:00:00.000Z';

const BOT_ID = '100000000000000099';

const ROLE_ID = '600000000000000001';

const MORE_NODE_IDS = [
  'ask',
  'latest_messages',
  'poll',
  'event',
  'role_add',
  'role_remove',
  'timeout',
  'kick_ban',
  'delete_message',
  'pin',
];

const OWNER_NODE_IDS = ['role_add', 'role_remove', 'timeout', 'kick_ban', 'delete_message'];

function nodeOf(id: string): (typeof MANIFEST.contributes.automation.nodes)[number] {
  const found = MANIFEST.contributes.automation.nodes.find((node) => node.id === id);
  if (found === undefined) throw new Error(`no node ${id}`);
  return found;
}

let opened: TestStore;
let world: World;

beforeEach(async () => {
  captureLogs();
  world = worldOf();
  opened = await testStore();
  opened.store.plugins.create({
    manifest: MANIFEST,
    source: 'builtin',
    location: 'builtin',
    trusted: true,
  });
});

afterEach(async () => {
  vi.useRealTimers();
  await opened.close();
});

describe('the Discord question, read, poll, event and moderation declarations', () => {
  it('are valid, run only tools the plugin registers and add nothing but their own kinds', () => {
    const assembled = expectContributionValid(discordPlugin, {
      tools: ['send', 'prompt', 'read', 'change', 'remove', 'voice'],
    });
    expect(assembled.rejections).toEqual([]);
    const ids = DISCORD_AUTOMATION.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of MORE_NODE_IDS) expect(ids).toContain(id);
  });

  it('serves each node as a kind of the Discord plugin with the role picker from its own list', () => {
    const catalog = createKindCatalog();
    expect(syncContribution(catalog, pluginContribution(MANIFEST)).rejections).toEqual([]);
    for (const id of MORE_NODE_IDS) {
      expect(catalog.get(pluginNodeKindId(OWNER, id))).toMatchObject({
        class: 'effect',
        category: 'plugins',
      });
    }
    const role = DISCORD_AUTOMATION.entities.find((entity) => entity.id === 'role');
    expect(role).toMatchObject({ options: 'roles' });
    expect(PICKER_SOURCES).toContain(role?.options);
  });

  it('marks the nodes that change who is in a server or remove things as owner only', () => {
    const catalog = createKindCatalog();
    syncContribution(catalog, pluginContribution(MANIFEST));
    for (const id of OWNER_NODE_IDS) {
      expect(nodeOf(id).access).toBe('owner');
      expect(catalog.get(pluginNodeKindId(OWNER, id))?.access).toBe('owner');
    }
  });

  it('sends commands by default, always waits for a question or a read, and gives each a timeout', () => {
    expect(pluginNodeModes(nodeOf('ask'))).toEqual({
      default: 'wait_for_result',
      allowed: ['wait_for_result'],
    });
    expect(pluginNodeModes(nodeOf('latest_messages')).default).toBe('wait_for_result');
    for (const id of ['poll', 'event', 'role_add', 'role_remove', 'timeout', 'kick_ban', 'pin']) {
      expect(pluginNodeModes(nodeOf(id)).default).toBe('fire_and_forget');
    }
    for (const id of MORE_NODE_IDS) expect(nodeOf(id).timeout).toBeDefined();
  });

  it('offers the poll message and the event id only to a step that waited', () => {
    expect(nodeOf('poll').waitOnly).toEqual(['message', 'results']);
    expect(nodeOf('event').waitOnly).toEqual(['event']);
  });
});

const FUTURE_START = new Date(Date.now() + 3_600_000).toISOString();

const FUTURE_END = new Date(Date.now() + 7_200_000).toISOString();

interface Operated {
  readonly mode: 'read' | 'change' | 'remove';
  readonly id: string;
  readonly params: Record<string, string | number | boolean | readonly string[]>;
  readonly args: Readonly<Record<string, unknown>>;
}

const OPERATED: readonly Operated[] = [
  {
    mode: 'change',
    id: 'role_add',
    params: { server: GUILD, person: GUEST_ID, role: ROLE_ID },
    args: { action: 'member_role_add', guildId: GUILD, userId: GUEST_ID, roleId: ROLE_ID },
  },
  {
    mode: 'remove',
    id: 'role_remove',
    params: { server: GUILD, person: GUEST_ID, role: ROLE_ID },
    args: { action: 'member_role_remove', guildId: GUILD, userId: GUEST_ID, roleId: ROLE_ID },
  },
  {
    mode: 'remove',
    id: 'timeout',
    params: { server: GUILD, person: GUEST_ID, seconds: 600, reason: 'Spam' },
    args: {
      action: 'member_timeout',
      guildId: GUILD,
      userId: GUEST_ID,
      durationSeconds: 600,
      reason: 'Spam',
    },
  },
  {
    mode: 'remove',
    id: 'kick_ban',
    params: { what: 'member_kick', server: GUILD, person: GUEST_ID, reason: 'Rules' },
    args: { action: 'member_kick', guildId: GUILD, userId: GUEST_ID, reason: 'Rules' },
  },
  {
    mode: 'remove',
    id: 'kick_ban',
    params: { what: 'member_ban', server: GUILD, person: GUEST_ID, reason: 'Rules' },
    args: { action: 'member_ban', guildId: GUILD, userId: GUEST_ID, reason: 'Rules' },
  },
  {
    mode: 'remove',
    id: 'delete_message',
    params: { channel: CHANNEL, message: MESSAGE },
    args: { action: 'message_delete', channelId: CHANNEL, messageId: MESSAGE },
  },
  {
    mode: 'change',
    id: 'pin',
    params: { channel: CHANNEL, message: MESSAGE },
    args: { action: 'message_pin', channelId: CHANNEL, messageId: MESSAGE },
  },
  {
    mode: 'change',
    id: 'poll',
    params: {
      channel: CHANNEL,
      question: 'Pizza or pasta?',
      answers: ['Pizza', 'Pasta'],
      hours: 6,
      multiple: true,
    },
    args: {
      action: 'poll_create',
      channelId: CHANNEL,
      poll: {
        question: 'Pizza or pasta?',
        answers: ['Pizza', 'Pasta'],
        durationHours: 6,
        multiselect: true,
      },
    },
  },
  {
    mode: 'change',
    id: 'event',
    params: {
      server: GUILD,
      name: 'Film night',
      start: FUTURE_START,
      end: FUTURE_END,
      location: 'Living room',
    },
    args: {
      action: 'scheduled_event_create',
      guildId: GUILD,
      name: 'Film night',
      start: FUTURE_START,
      end: FUTURE_END,
      location: 'Living room',
    },
  },
  {
    mode: 'read',
    id: 'latest_messages',
    params: { channel: CHANNEL, limit: 5 },
    args: { action: 'messages_list', channelId: CHANNEL, limit: 5 },
  },
];

describe('the arguments each node sends', () => {
  it.each(
    OPERATED.map((row) => [`${row.id} ${z.string().parse(row.args['action'])}`, row] as const),
  )('%s binds exactly the arguments its Discord action accepts', (_label, row) => {
    const bound = bindArgs(nodeOf(row.id).run.args, row.params);
    expect(bound).toEqual(row.args);
    const operation = operationsOf(row.mode).find((item) => item.action === row.args['action']);
    expect(operation).toBeDefined();
    const accepted = z
      .strictObject({ action: z.string(), eventId: EVENT_ID, ...operation?.shape })
      .safeParse(bound);
    expect(accepted.success).toBe(true);
  });

  it('leaves the optional poll length, answer mode and event description out when not given', () => {
    expect(
      bindArgs(nodeOf('poll').run.args, { channel: CHANNEL, question: 'A?', answers: ['x', 'y'] }),
    ).toEqual({
      action: 'poll_create',
      channelId: CHANNEL,
      poll: { question: 'A?', answers: ['x', 'y'] },
    });
    expect(bindArgs(nodeOf('latest_messages').run.args, { channel: CHANNEL })).toEqual({
      action: 'messages_list',
      channelId: CHANNEL,
    });
  });

  it('takes the timeout in seconds up to what Discord allows and the kick or ban from a choice', () => {
    const seconds = nodeOf('timeout').inputs.find((port) => port.name === 'seconds');
    expect(seconds?.ui).toMatchObject({ min: 0, max: TIMEOUT_MAX_SECONDS, unit: 'seconds' });
    expect(TIMEOUT_MAX_SECONDS).toBe(28 * 24 * 3600);
    const what = nodeOf('kick_ban').inputs.find((port) => port.name === 'what');
    expect(what?.type).toEqual({
      t: 'choice',
      options: [
        { id: 'member_kick', label: 'Kick out of the server' },
        { id: 'member_ban', label: 'Ban from the server' },
      ],
    });
    expect(
      KICK_BAN_TOOL.input.safeParse({
        action: 'member_kick',
        guildId: GUILD,
        userId: GUEST_ID,
        reason: 'x',
      }).success,
    ).toBe(true);
  });
});

interface Call {
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}

function contextOf(): OperationContext {
  return {
    rest: world.rest,
    policy: world.policy,
    channels: world.channels,
    botId: BOT_ID,
    applicationId: BOT_ID,
    origin: null,
  };
}

function operationTool(mode: Operated['mode'], calls: Call[]): PluginTool {
  const entries = operationsOf(mode).map((operation) => ({
    operation,
    schema: z.strictObject({
      action: z.literal(operation.action),
      eventId: EVENT_ID,
      ...operation.shape,
    }),
  }));
  const entryOf = (raw: Readonly<Record<string, unknown>>): (typeof entries)[number] | undefined =>
    entries.find((entry) => entry.operation.action === raw['action']);
  return {
    name: mode,
    title: mode,
    description: mode,
    inputSchema: flatSchemaOf(
      entries.map((entry) => ({ action: entry.operation.action, schema: entry.schema })),
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    humanOnly: false,
    validate: (raw): string | null => {
      const entry = entryOf(raw);
      if (entry === undefined) return 'No such action';
      const parsed = entry.schema.safeParse(raw);
      return parsed.success ? null : z.prettifyError(parsed.error);
    },
    run: async (raw): Promise<HubToolResult> => {
      calls.push({ tool: mode, args: raw });
      const entry = entryOf(raw);
      if (entry === undefined) return failure('No such action');
      const parsed = entry.schema.safeParse(raw);
      if (!parsed.success) return failure(z.prettifyError(parsed.error));
      const {
        action: _action,
        eventId: _eventId,
        ...args
      } = z.record(z.string(), z.unknown()).parse(parsed.data);
      try {
        const result = await entry.operation.run(args, contextOf());
        return { response: { result }, line: '', pictures: [] };
      } catch (cause) {
        return failure(cause instanceof Error ? cause.message : String(cause));
      }
    },
  };
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

type Performed = (
  id: string,
  params: Operated['params'],
  mode?: 'wait_for_result',
) => Promise<unknown>;

function promptTool(calls: Call[]): PluginTool {
  return {
    name: 'prompt',
    title: 'prompt',
    description: 'prompt',
    inputSchema: z.toJSONSchema(ASK_TOOL.input),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    humanOnly: false,
    validate: (raw): string | null => {
      const parsed = ASK_TOOL.input.safeParse(raw);
      return parsed.success ? null : z.prettifyError(parsed.error);
    },
    run: (raw): Promise<HubToolResult> => {
      calls.push({ tool: 'prompt', args: raw });
      return Promise.resolve({
        response: { id: '900000000000000001', flowId: 'flow-1', expiresAt: null },
        line: '',
        pictures: [],
      });
    },
  };
}

function performer(calls: Call[], bus?: SignalBus): Performed {
  const tools = [
    operationTool('read', calls),
    operationTool('change', calls),
    operationTool('remove', calls),
    promptTool(calls),
  ];
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
    signals: bus ?? { subscribe: (): (() => void) => () => undefined },
    tools: () => new ToolHub([source]),
  });
  const run = testRun();
  return async (id, params, mode) => {
    const handler = handlers[PLUGIN_NODE_PREFIX];
    if (handler === undefined) throw new Error('no plugin performer');
    const kind = pluginNodeKindId(OWNER, id);
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

const MEMBER = `/guilds/${GUILD}/members/${GUEST_ID}`;

const ROLE_ROUTE = `${MEMBER}/roles/${ROLE_ID}`;

const OWN_MESSAGE = {
  id: MESSAGE,
  channel_id: CHANNEL,
  content: 'hello',
  timestamp: AT,
  author: { id: BOT_ID },
};

describe('the moderation and message nodes against the real Discord actions on a fake service', () => {
  it('gives and takes a role with one request each', async () => {
    const perform = performer([]);
    world.rest.answer('PUT', ROLE_ROUTE, {});
    world.rest.answer('DELETE', ROLE_ROUTE, {});
    const params = { server: GUILD, person: GUEST_ID, role: ROLE_ID };
    await expect(perform('role_add', params, 'wait_for_result')).resolves.toMatchObject({
      ok: true,
    });
    await expect(perform('role_remove', params, 'wait_for_result')).resolves.toMatchObject({
      ok: true,
    });
    expect(world.rest.calls.map((call) => `${call.method} ${call.route}`)).toEqual([
      `PUT ${ROLE_ROUTE}`,
      `DELETE ${ROLE_ROUTE}`,
    ]);
  });

  it('times a member out until a moment after now and ends the timeout with zero seconds', async () => {
    const perform = performer([]);
    world.rest.answer('PATCH', MEMBER, {});
    const params = { server: GUILD, person: GUEST_ID, reason: 'Spam' };
    await perform('timeout', { ...params, seconds: 3600 }, 'wait_for_result');
    await perform('timeout', { ...params, seconds: 0 }, 'wait_for_result');
    const [started, ended] = world.rest.calls;
    const until = z
      .object({ communication_disabled_until: z.string() })
      .parse(started?.body).communication_disabled_until;
    expect(Date.parse(until)).toBeGreaterThan(Date.now() + 3_000_000);
    expect(ended?.body).toEqual({ communication_disabled_until: null });
  });

  it('refuses a timeout longer than Discord allows before anything is sent', async () => {
    const perform = performer([]);
    const result = await perform(
      'timeout',
      {
        server: GUILD,
        person: GUEST_ID,
        seconds: TIMEOUT_MAX_SECONDS + 1,
        reason: 'Spam',
      },
      'wait_for_result',
    );
    expect(result).toMatchObject({ ok: false });
    expect(z.object({ message: z.string() }).parse(result).message).toContain('durationSeconds');
    expect(world.rest.calls).toEqual([]);
  });

  it('kicks with a delete of the membership and bans with a put on the ban list', async () => {
    const perform = performer([]);
    world.rest.answer('DELETE', MEMBER, {});
    world.rest.answer('PUT', `/guilds/${GUILD}/bans/${GUEST_ID}`, {});
    const common = { server: GUILD, person: GUEST_ID, reason: 'Rules' };
    await perform('kick_ban', { ...common, what: 'member_kick' }, 'wait_for_result');
    await perform('kick_ban', { ...common, what: 'member_ban' }, 'wait_for_result');
    expect(world.rest.calls.map((call) => `${call.method} ${call.route}`)).toEqual([
      `DELETE ${MEMBER}`,
      `PUT /guilds/${GUILD}/bans/${GUEST_ID}`,
    ]);
  });

  it('deletes a message and pins a message of its own', async () => {
    const perform = performer([]);
    const message = `/channels/${CHANNEL}/messages/${MESSAGE}`;
    world.rest.answer('DELETE', message, {});
    world.rest.answer('GET', message, OWN_MESSAGE);
    world.rest.answer('PUT', `/channels/${CHANNEL}/messages/pins/${MESSAGE}`, {});
    const params = { channel: CHANNEL, message: MESSAGE };
    await expect(perform('delete_message', params, 'wait_for_result')).resolves.toMatchObject({
      ok: true,
    });
    await expect(perform('pin', params, 'wait_for_result')).resolves.toMatchObject({ ok: true });
    expect(world.rest.calls.map((call) => `${call.method} ${call.route}`)).toEqual([
      `DELETE ${message}`,
      `GET ${message}`,
      `PUT /channels/${CHANNEL}/messages/pins/${MESSAGE}`,
    ]);
  });

  it('starts a poll and, when it waited, gives back the message and the votes once the poll ended', async () => {
    const bus = discordBus();
    const perform = performer([], bus);
    const waiting = perform(
      'poll',
      {
        channel: CHANNEL,
        question: 'Pizza or pasta?',
        answers: ['Pizza', 'Pasta'],
        hours: 6,
        timeout: 7 * 3_600_000,
      },
      'wait_for_result',
    );
    bus.emit(pollEndedSignal('500000000000000009', []));
    expect(await settledOf(waiting)).toBe(false);
    bus.emit(
      pollEndedSignal('500000000000000001', [
        { answer: 'Pizza', votes: 3 },
        { answer: 'Pasta', votes: 1 },
      ]),
    );
    await expect(waiting).resolves.toEqual({
      ok: true,
      value: {
        message: '500000000000000001',
        results: [
          { answer: 'Pizza', votes: 3 },
          { answer: 'Pasta', votes: 1 },
        ],
      },
    });
    const [posted] = world.rest.sentTo(`/channels/${CHANNEL}/messages`);
    expect(posted?.body).toMatchObject({
      poll: {
        question: { text: 'Pizza or pasta?' },
        answers: [{ poll_media: { text: 'Pizza' } }, { poll_media: { text: 'Pasta' } }],
        duration: 6,
        allow_multiselect: false,
      },
    });
  });

  it('creates a scheduled event and gives back its id', async () => {
    const perform = performer([]);
    world.rest.answer('POST', `/guilds/${GUILD}/scheduled-events`, { id: '700000000000000001' });
    const result = await perform(
      'event',
      {
        server: GUILD,
        name: 'Film night',
        start: FUTURE_START,
        end: FUTURE_END,
        location: 'Living room',
      },
      'wait_for_result',
    );
    expect(result).toEqual({ ok: true, value: { event: '700000000000000001' } });
    expect(world.rest.sentTo(`/guilds/${GUILD}/scheduled-events`)[0]?.body).toMatchObject({
      name: 'Film night',
      scheduled_start_time: FUTURE_START,
      scheduled_end_time: FUTURE_END,
      entity_metadata: { location: 'Living room' },
    });
  });

  it('puts an event that starts in the past on the error exit with the reason', async () => {
    const perform = performer([]);
    const result = await perform(
      'event',
      {
        server: GUILD,
        name: 'Film night',
        start: '2020-01-01T10:00:00.000Z',
        end: '2020-01-01T12:00:00.000Z',
        location: 'Living room',
      },
      'wait_for_result',
    );
    expect(result).toMatchObject({
      ok: false,
      class: 'Failed',
      message: 'Event times must be ordered and in the future',
    });
    expect(world.rest.calls).toEqual([]);
  });

  it('reads the newest messages of a channel as a list', async () => {
    const perform = performer([]);
    world.rest.answer('GET', `/channels/${CHANNEL}/messages`, [OWN_MESSAGE]);
    const result = await perform(
      'latest_messages',
      { channel: CHANNEL, limit: 1 },
      'wait_for_result',
    );
    expect(result).toEqual({ ok: true, value: { messages: [OWN_MESSAGE] } });
    expect(world.rest.calls[0]?.query?.get('limit')).toBe('1');
  });

  it('hands a command over at once in send mode and sends nothing else', async () => {
    const perform = performer([]);
    world.rest.answer('PUT', ROLE_ROUTE, {});
    await expect(
      perform('role_add', { server: GUILD, person: GUEST_ID, role: ROLE_ID }),
    ).resolves.toEqual({ ok: true, value: { sent: true } });
    await vi.waitFor(() => {
      expect(world.rest.calls).toHaveLength(1);
    });
  });

  it('reports what Discord refused on the error exit in its own words', async () => {
    const perform = performer([]);
    const result = await perform('pin', { channel: CHANNEL, message: MESSAGE }, 'wait_for_result');
    expect(result).toMatchObject({
      ok: false,
      class: 'Failed',
      message: `The fake Discord has no answer for GET /channels/${CHANNEL}/messages/${MESSAGE}`,
    });
  });
});

function discordBus(): SignalBus {
  const bus = new SignalBus({ log: testLogger('signals') });
  bus.register(pluginSignalSpec(MANIFEST));
  return bus;
}

function pollEndedSignal(
  message: string,
  results: readonly { readonly answer: string; readonly votes: number }[],
): SignalInput {
  return {
    source: pluginSignalSource('discord'),
    kind: 'poll_ended',
    subject: null,
    field: null,
    value: true,
    previous: null,
    at: AT,
    profileId: null,
    data: { channel: CHANNEL, message, results },
  };
}

function answeredSignal(promptId: string): SignalInput {
  return {
    source: pluginSignalSource('discord'),
    kind: 'prompt_answered',
    subject: null,
    field: null,
    value: true,
    previous: null,
    at: AT,
    profileId: null,
    data: { prompt_id: promptId, answer: 'Yes', user: GUEST_ID },
  };
}

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

function resolvedOf(
  until: NonNullable<ReturnType<typeof nodeOf>['until']>,
): Parameters<typeof watchUntil>[2] {
  const resolved = resolveUntil(until, { timeout: 60_000 });
  if (!resolved.ok) throw new Error(resolved.message);
  return resolved.until;
}

describe('Ask in Discord', () => {
  const ask = nodeOf('ask');
  const until = ask.until;

  it('waits on the prompt_answered event the plugin declares, matched by the question id', () => {
    expect(until).toEqual({
      event: 'prompt_answered',
      match: { prompt_id: { output: 'prompt' } },
      timeout: { port: 'timeout' },
    });
    const wait = ask.inputs.find((port) => port.name === 'timeout');
    expect(wait).toMatchObject({ type: { t: 'duration' }, required: false });
    const declared = DISCORD_EVENT_KINDS.find((event) => event.kind === PROMPT_ANSWERED.kind);
    expect(declared?.fields).toEqual(PROMPT_ANSWERED.fields);
  });

  it('asks a channel or a person with answer buttons and sends the arguments its tool takes', () => {
    const bound = bindArgs(ask.run.args, {
      person: GUEST_ID,
      question: 'Open the door?',
      answers: ['Yes', 'No'],
    });
    expect(bound).toEqual({
      userId: GUEST_ID,
      content: 'Open the door?',
      mode: 'buttons',
      answers: ['Yes', 'No'],
    });
    expect(ASK_TOOL.input.safeParse(bound).success).toBe(true);
    expect(ask.outputs.map((port) => port.name)).toEqual(['prompt', 'answer', 'by']);
  });

  it('continues only on the answer to its own question, also when it came first', async () => {
    const bus = discordBus();
    if (until === undefined) throw new Error('ask declares no wait');
    const expected = expectedOf(until, {}, { prompt: 'flow-1' });
    if (!expected.ok) throw new Error(expected.message);
    bus.emit(answeredSignal('flow-1'));
    const early = watchUntil(bus, 'discord', resolvedOf(until), testRun());
    bus.emit(answeredSignal('flow-1'));
    await expect(early.arrive(expected.expected)).resolves.toMatchObject({ ok: true });

    const watch = watchUntil(bus, 'discord', resolvedOf(until), testRun());
    const waiting = watch.arrive(expected.expected);
    bus.emit(answeredSignal('flow-2'));
    expect(await settledOf(waiting)).toBe(false);
    bus.emit(answeredSignal('flow-1'));
    await expect(waiting).resolves.toMatchObject({ ok: true });
  });

  it('fails with Timeout after the time the step was given when nobody answers', async () => {
    vi.useFakeTimers();
    const bus = discordBus();
    if (until === undefined) throw new Error('ask declares no wait');
    const resolved = resolveUntil(until, { timeout: 90_000 });
    if (!resolved.ok) throw new Error(resolved.message);
    expect(resolved.until.timeout).toBe(90_000);
    const watch = watchUntil(bus, 'discord', resolved.until, testRun());
    const waiting = watch.arrive({ prompt_id: 'flow-1' });
    let settled = false;
    void waiting.then(() => {
      settled = true;
    });
    bus.emit(answeredSignal('flow-9'));
    await vi.advanceTimersByTimeAsync(89_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(waiting).resolves.toMatchObject({ ok: false, class: 'Timeout' });
  });

  it('refuses a time no timer can wait and a missing time instead of waiting forever', () => {
    if (until === undefined) throw new Error('ask declares no wait');
    for (const timeout of [0, -5, 1.5, 2 ** 31, 'soon', undefined]) {
      expect(resolveUntil(until, timeout === undefined ? {} : { timeout })).toMatchObject({
        ok: false,
        class: 'Invalid',
        code: 'invalid_arguments',
      });
    }
    expect(resolveUntil(until, { timeout: 2 ** 31 - 1 }).ok).toBe(true);
  });

  it('gives back the question id, the answer and who gave it, and Timeout when nobody did', async () => {
    const bus = discordBus();
    const calls: Call[] = [];
    const perform = performer(calls, bus);
    const params = { person: GUEST_ID, question: 'Open?', answers: ['Yes', 'No'], timeout: 5000 };
    const waiting = perform('ask', params, 'wait_for_result');
    bus.emit(answeredSignal('flow-1'));
    await expect(waiting).resolves.toEqual({
      ok: true,
      value: { prompt: 'flow-1', answer: 'Yes', by: GUEST_ID },
    });
    expect(calls).toEqual([
      {
        tool: 'prompt',
        args: { userId: GUEST_ID, content: 'Open?', mode: 'buttons', answers: ['Yes', 'No'] },
      },
    ]);
    vi.useFakeTimers();
    const silent = perform('ask', params, 'wait_for_result');
    await vi.advanceTimersByTimeAsync(5000);
    await expect(silent).resolves.toMatchObject({ ok: false, class: 'Timeout' });
  });

  it('declares the poll_ended event the poll waits on', () => {
    const declared = DISCORD_EVENT_KINDS.find((event) => event.kind === POLL_ENDED.kind);
    expect(declared?.fields).toEqual(POLL_ENDED.fields);
    expect(nodeOf('poll').until).toEqual({
      event: 'poll_ended',
      match: { message: { output: 'message' } },
      timeout: { port: 'timeout' },
    });
  });
});
