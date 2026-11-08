import {
  pluginNodeKindId,
  pluginTriggerKindId,
  type PluginManifestInput,
} from '@smarteverything/domain';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  actionNode,
  automation,
  entity,
  eventTrigger,
  expectContributionValid,
  input,
  optionalInput,
  output,
  ports,
  queryNode,
  streamValue,
  type ActionSpec,
  type ArgFor,
  type EventDecl,
  type PortKind,
} from '../../src/plugins/builtin/automation-kit';

const POST_INPUT = z.strictObject({
  channelId: z.string(),
  body: z.strictObject({ text: z.string(), silent: z.boolean().optional() }),
  mentions: z.array(z.string()).optional(),
});

type PostInput = z.output<typeof POST_INPUT>;

const POST = { name: 'post', input: POST_INPUT };

const LIST_INPUT = z.strictObject({ serverId: z.string() });

const ANY: PortKind<string> = { type: { t: 'any' } };

const LIST = { name: 'list', input: LIST_INPUT };

const MESSAGE = {
  kind: 'message',
  title: 'Message',
  fields: { channel_id: 'string', author: 'string' },
  feed: false,
} as const;

const ANSWERED = {
  kind: 'answered',
  title: 'Answered',
  fields: { prompt_id: 'string', answer: 'string' },
  feed: false,
} as const;

const CHANNEL = entity('demo', {
  id: 'channel',
  title: 'Channel',
  plural: 'Channels',
  options: 'demo.channels',
});

const POST_INPUTS = {
  channel: input(CHANNEL.kind, { title: 'Channel', description: 'Where.' }),
  text: input(ports.text(), { title: 'Text', description: 'What.' }),
  count: input(ports.number({ integer: true, min: 1 }), {
    title: 'Count',
    description: 'How many.',
  }),
  mention: optionalInput(ports.list(ports.text()), { title: 'Mentions', description: 'Who.' }),
};

const POST_NODE = actionNode({
  id: 'post_message',
  version: 1,
  title: 'Post a message',
  description: 'Posts a message to a channel.',
  icon: 'message',
  summary: 'Post {text} to {channel}',
  tool: POST,
  inputs: POST_INPUTS,
  outputs: {
    messageId: output(ports.text(), {
      title: 'Message',
      description: 'The posted message.',
      from: '/id',
    }),
  },
  args: {
    channelId: { port: 'channel' },
    body: { record: { text: { port: 'text' }, silent: { lit: true } } },
    mentions: { port: 'mention' },
  },
  timeout: { default: 10_000, max: 120_000 },
  waitOnly: ['messageId'],
});

const LIST_NODE = queryNode({
  id: 'list_channels',
  version: 1,
  title: 'List channels',
  description: 'Lists the channels of a server.',
  icon: 'list',
  summary: 'Channels of {server}',
  tool: LIST,
  inputs: { server: input(ports.text(), { title: 'Server', description: 'Which.' }) },
  outputs: {
    names: output(ports.list(ports.text()), {
      title: 'Names',
      description: 'Channel names.',
      from: '/names',
    }),
  },
  args: { serverId: { port: 'server' } },
  timeout: { default: 5000, max: 30_000 },
});

const MESSAGE_TRIGGER = eventTrigger({
  id: 'message_posted',
  version: 1,
  title: 'A message is posted',
  description: 'Fires on a new message.',
  icon: 'message',
  summary: 'A message in {channel}',
  event: MESSAGE,
  filters: {
    channel: {
      kind: CHANNEL.kind,
      title: 'Channel',
      description: 'Where.',
      match: 'channel_id',
    },
  },
  outputs: { author: { kind: ports.text(), title: 'Author', from: 'author' } },
});

const MEMBERS_VALUE = streamValue({
  id: 'members_online',
  version: 1,
  title: 'Members online',
  description: 'Members online in a server.',
  icon: 'users',
  summary: 'Members online in {server}',
  inputs: { server: input(CHANNEL.kind, { title: 'Server', description: 'Which.' }) },
  stream: 'members',
  select: { list: '/servers', key: '/id', port: 'server' },
  outputs: { online: { kind: ports.number(), from: '/online' } },
});

function manifestOf(
  automationOf: ReturnType<typeof automation>,
  extra: Partial<PluginManifestInput['contributes']> = {},
): PluginManifestInput {
  return {
    id: 'demo',
    name: 'Demo',
    version: '1.0.0',
    description: 'A demo plugin.',
    publisher: 'Tests',
    contributes: {
      events: [MESSAGE, ANSWERED],
      data: [{ stream: 'members', title: 'Members', schema: {} }],
      automation: automationOf,
      ...extra,
    },
  };
}

const FULL = automation({
  nodes: [POST_NODE, LIST_NODE],
  triggers: [MESSAGE_TRIGGER],
  values: [MEMBERS_VALUE],
  entities: [CHANNEL],
});

describe('automation kit declarations', () => {
  it('builds an action node from the tool and the typed inputs with the schema defaults', () => {
    expect(POST_NODE).toMatchObject({
      id: 'post_message',
      kind: 'action',
      retry: 'external',
      budget: 'effects',
      keywords: [],
      run: {
        tool: 'post',
        args: {
          channelId: { port: 'channel' },
          body: { record: { text: { port: 'text' }, silent: { lit: true } } },
          mentions: { port: 'mention' },
        },
      },
      waitOnly: ['messageId'],
    });
    expect(POST_NODE.inputs.map((port) => [port.name, port.type, port.required])).toStrictEqual([
      ['channel', { t: 'entity', of: 'demo.channel' }, true],
      ['text', { t: 'text' }, true],
      ['count', { t: 'number', integer: true, min: 1 }, true],
      ['mention', { t: 'list', of: { t: 'text' } }, false],
    ]);
  });

  it('builds a query node that only waits for the result', () => {
    expect(LIST_NODE.kind).toBe('query');
    expect(LIST_NODE.outputs.map((port) => port.from)).toStrictEqual(['/names']);
  });

  it('builds a trigger whose filter and output name fields of the event', () => {
    expect(MESSAGE_TRIGGER).toMatchObject({
      event: 'message',
      filters: [
        { name: 'channel', match: 'channel_id', type: { t: 'entity', of: 'demo.channel' } },
      ],
      outputs: [{ name: 'author', from: 'author', type: { t: 'text' } }],
    });
  });

  it('builds a device-event trigger for a local driver', () => {
    const trigger = eventTrigger({
      id: 'cycle_done',
      version: 1,
      title: 'The cycle is done',
      description: 'Fires when the cycle ends.',
      icon: 'check',
      summary: 'The cycle is done',
      event: { deviceEvent: 'activity', activity: 'cycle_done' },
    });
    expect(trigger.event).toStrictEqual({
      deviceEvent: 'activity',
      match: { activity: 'cycle_done' },
    });
  });

  it('builds a stream value with the selector port', () => {
    expect(MEMBERS_VALUE).toMatchObject({
      from: { stream: 'members', select: { list: '/servers', key: '/id', port: 'server' } },
      outputs: [{ name: 'online', type: { t: 'number' }, from: '/online' }],
    });
  });

  it('refuses a declaration the plugin schema refuses and names the node', () => {
    expect(() =>
      actionNode({
        id: 'broken',
        version: 1,
        title: 'Broken',
        description: 'Has a summary placeholder without a port.',
        icon: 'message',
        summary: 'Post {nothing}',
        tool: POST,
        inputs: { text: input(ports.text(), { title: 'Text', description: 'What.' }) },
        args: {
          channelId: { lit: 'x' },
          body: { record: { text: { port: 'text' } } },
        },
        timeout: { default: 1000, max: 2000 },
      }),
    ).toThrow(/plugin node broken is not a valid automation declaration/);
  });

  it('refuses a declaration with the any type on an input', () => {
    expect(() =>
      actionNode({
        id: 'loose',
        version: 1,
        title: 'Loose',
        description: 'Takes anything.',
        icon: 'message',
        summary: 'Do {value}',
        tool: LIST,
        inputs: { value: input(ANY, { title: 'Value', description: 'What.' }) },
        args: { serverId: { port: 'value' } },
        timeout: { default: 1000, max: 2000 },
      }),
    ).toThrow(/needs a real type/);
  });
});

describe('automation kit compile-time checks', () => {
  interface Values {
    text: string;
    count: number;
    maybe: string | undefined;
  }
  type Args = ActionSpec<PostInput, typeof POST_INPUTS, Record<never, never>, EventDecl>['args'];

  it('accepts a port of the argument type, a literal and a nested record', () => {
    expectTypeOf<{ readonly port: 'text' }>().toExtend<ArgFor<string, Values>>();
    expectTypeOf<{ readonly lit: 'x' }>().toExtend<ArgFor<string, Values>>();
    expectTypeOf<{ readonly port: 'maybe' }>().toExtend<ArgFor<string | undefined, Values>>();
    expectTypeOf<{ readonly record: { readonly a: { readonly port: 'text' } } }>().toExtend<
      ArgFor<{ a: string }, Values>
    >();
  });

  it('rejects a port of another type, an optional port for a required argument and a wrong literal', () => {
    expectTypeOf<{ readonly port: 'count' }>().not.toExtend<ArgFor<string, Values>>();
    expectTypeOf<{ readonly port: 'maybe' }>().not.toExtend<ArgFor<string, Values>>();
    expectTypeOf<{ readonly port: 'missing' }>().not.toExtend<ArgFor<string, Values>>();
    expectTypeOf<{ readonly lit: 3 }>().not.toExtend<ArgFor<string, Values>>();
  });

  it('checks the whole args object against the tool input', () => {
    expectTypeOf<{
      readonly channelId: { readonly port: 'channel' };
      readonly body: { readonly record: { readonly text: { readonly port: 'text' } } };
    }>().toExtend<Args>();
    expectTypeOf<{
      readonly channelId: { readonly port: 'count' };
      readonly body: { readonly record: { readonly text: { readonly port: 'text' } } };
    }>().not.toExtend<Args>();
    expectTypeOf<{
      readonly body: { readonly record: { readonly text: { readonly port: 'text' } } };
    }>().not.toExtend<Args>();
  });
});

describe('expectContributionValid', () => {
  it('assembles every kind of a built-in plugin with no problem', () => {
    const assembled = expectContributionValid(
      { manifest: manifestOf(FULL) },
      { tools: ['post', 'list'] },
    );
    expect(assembled.kinds.map((kind) => kind.id).sort()).toStrictEqual(
      [
        pluginNodeKindId({ kind: 'plugin', id: 'demo' }, 'post_message'),
        pluginNodeKindId({ kind: 'plugin', id: 'demo' }, 'list_channels'),
        pluginNodeKindId({ kind: 'plugin', id: 'demo' }, 'members_online'),
        pluginTriggerKindId({ kind: 'plugin', id: 'demo' }, 'message_posted'),
        pluginTriggerKindId({ kind: 'plugin', id: 'demo' }, 'answered'),
      ].sort(),
    );
    expect(assembled.rejections).toStrictEqual([]);
  });

  it('assembles a node that waits on an event of the plugin', () => {
    const waiting = actionNode({
      id: 'ask',
      version: 1,
      title: 'Ask',
      description: 'Asks and waits for the answer.',
      icon: 'message',
      summary: 'Ask {text}',
      tool: POST,
      inputs: { text: input(ports.text(), { title: 'Text', description: 'What.' }) },
      outputs: {
        answer: output(ports.text(), { title: 'Answer', description: 'The answer.', from: '' }),
      },
      args: { channelId: { lit: 'c' }, body: { record: { text: { port: 'text' } } } },
      mode: { default: 'wait_for_result', allowed: ['wait_for_result'] },
      timeout: { default: 60_000, max: 600_000 },
      until: {
        event: ANSWERED,
        match: { prompt_id: { port: 'text' }, answer: { output: 'answer' } },
        timeout: 60_000,
      },
    });
    expect(waiting.until).toStrictEqual({
      event: 'answered',
      match: { prompt_id: { port: 'text' }, answer: { output: 'answer' } },
      timeout: 60_000,
    });
    expect(() =>
      expectContributionValid({ manifest: manifestOf(automation({ nodes: [waiting] })) }),
    ).not.toThrow();
  });

  it('reports a kind that uses an entity the plugin does not declare', () => {
    const foreign = entity('other', {
      id: 'thing',
      title: 'Thing',
      plural: 'Things',
      options: 'other.things',
    });
    const node = actionNode({
      id: 'use_thing',
      version: 1,
      title: 'Use a thing',
      description: 'Uses a thing.',
      icon: 'message',
      summary: 'Use {thing}',
      tool: LIST,
      inputs: { thing: input(foreign.kind, { title: 'Thing', description: 'Which.' }) },
      args: { serverId: { port: 'thing' } },
      timeout: { default: 1000, max: 2000 },
    });
    expect(() =>
      expectContributionValid({ manifest: manifestOf(automation({ nodes: [node] })) }),
    ).toThrow(/plugin\.demo\.use_thing.*other\.thing is not declared by this plugin/);
  });

  it('reports a trigger that listens to an event the manifest does not declare', () => {
    expect(() => expectContributionValid({ manifest: manifestOf(FULL, { events: [] }) })).toThrow(
      /trigger\.plugin\.demo\.message_posted.*message is not declared/,
    );
  });

  it('reports a node that runs a tool the plugin does not register', () => {
    expect(() =>
      expectContributionValid({ manifest: manifestOf(FULL) }, { tools: ['post'] }),
    ).toThrow(/does not register: list/);
  });

  it('assembles the declarations of a local driver', () => {
    const wait = actionNode({
      id: 'start',
      version: 1,
      title: 'Start',
      description: 'Starts the cycle.',
      icon: 'play',
      summary: 'Start {text}',
      tool: POST,
      inputs: { text: input(ports.text(), { title: 'Text', description: 'What.' }) },
      args: { channelId: { lit: 'c' }, body: { record: { text: { port: 'text' } } } },
      timeout: { default: 1000, max: 2000 },
    });
    const cycle = eventTrigger({
      id: 'cycle_done',
      version: 1,
      title: 'The cycle is done',
      description: 'Fires when the cycle ends.',
      icon: 'check',
      summary: 'The cycle is done',
      event: { deviceEvent: 'activity', activity: 'cycle_done' },
    });
    const assembled = expectContributionValid({
      driver: {
        id: 'kingsmith',
        name: 'Kingsmith',
        icon: 'treadmill',
        version: '1',
        automation: automation({ nodes: [wait], triggers: [cycle] }),
      },
    });
    expect(assembled.owner).toBe('driver:kingsmith');
    expect(assembled.kinds.map((kind) => kind.id).sort()).toStrictEqual([
      'plugin.driver_kingsmith.start',
      'trigger.plugin.driver_kingsmith.cycle_done',
    ]);
  });
});
