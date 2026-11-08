import { describe, expect, it } from 'vitest';
import {
  FLOW_TYPE,
  NODE_KIND_ID,
  PLUGIN_AUTOMATION,
  PLUGIN_CONTRIBUTIONS,
  TEXT_TO_ENTITY_ADVICE,
  TRIGGER_KIND_ID,
  assignmentAdvice,
  categoryName,
  implicitCoercionOf,
  isAssignable,
  pluginAutomationProblems,
  pluginNodeKindId,
  pluginNodeModes,
  pluginTriggerKindId,
  typeDisplayName,
  type FlowType,
} from '../src';

const CHANNEL: FlowType = { t: 'entity', of: 'discord.channel' };
const ROLE: FlowType = { t: 'entity', of: 'discord.role' };
const TEXT: FlowType = { t: 'text' };

const NODE = {
  id: 'post_message',
  version: 1,
  title: 'Post a message',
  description: 'Posts a message to a channel.',
  icon: 'message',
  summary: 'Post {text} to {channel}',
  kind: 'action',
  inputs: [
    { name: 'channel', title: 'Channel', type: CHANNEL, required: true, description: 'Where.' },
    { name: 'text', title: 'Text', type: TEXT, required: true, description: 'What.' },
  ],
  outputs: [
    {
      name: 'messageId',
      title: 'Message',
      type: TEXT,
      description: 'The posted message.',
      from: '/id',
    },
  ],
  run: {
    tool: 'post',
    args: { channelId: { port: 'channel' }, body: { record: { text: { port: 'text' } } } },
  },
  timeout: { default: 10_000, max: 120_000 },
  waitOnly: ['messageId'],
};

const TRIGGER = {
  id: 'message_posted',
  version: 1,
  title: 'A message is posted',
  description: 'Fires on a new message.',
  icon: 'message',
  summary: 'A message in {channel}',
  event: 'message',
  filters: [
    {
      name: 'channel',
      title: 'Channel',
      type: CHANNEL,
      match: 'channel_id',
      description: 'Where.',
    },
  ],
  outputs: [{ name: 'author', title: 'Author', type: TEXT, from: 'author' }],
};

const VALUE = {
  id: 'members_online',
  version: 1,
  title: 'Members online',
  description: 'Members online in a server.',
  icon: 'users',
  summary: 'Members online in {server}',
  inputs: [
    {
      name: 'server',
      title: 'Server',
      type: { t: 'entity', of: 'discord.server' },
      required: true,
      description: 'Which server.',
    },
  ],
  from: { stream: 'presence', select: { list: '/servers', key: '/id', port: 'server' } },
  outputs: [{ name: 'online', type: { t: 'number' }, from: '/online' }],
};

const ENTITIES = [
  { id: 'channel', title: 'Discord channel', plural: 'Discord channels', options: 'channels' },
  { id: 'server', title: 'Discord server', plural: 'Discord servers', options: 'servers' },
];

function automation(change: Record<string, unknown> = {}): unknown {
  return { nodes: [NODE], triggers: [TRIGGER], values: [VALUE], entities: ENTITIES, ...change };
}

function nodeWith(change: Record<string, unknown>): unknown {
  return automation({ nodes: [{ ...NODE, ...change }] });
}

function messages(input: unknown): readonly string[] {
  const result = PLUGIN_AUTOMATION.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('the automation contribution', () => {
  it('defaults to nothing on an old manifest', () => {
    expect(PLUGIN_CONTRIBUTIONS.parse({}).automation).toEqual({
      nodes: [],
      triggers: [],
      values: [],
      entities: [],
      autoTriggers: true,
    });
  });

  it('accepts a full declaration and fills the run defaults', () => {
    const parsed = PLUGIN_AUTOMATION.parse(automation());
    expect(parsed.nodes[0]).toMatchObject({ retry: 'external', budget: 'effects', keywords: [] });
    expect(parsed.triggers[0]?.filters[0]?.match).toBe('channel_id');
  });

  it('rejects unknown fields', () => {
    expect(messages(automation({ extra: true }))).not.toEqual([]);
    expect(messages(nodeWith({ script: 'x' }))).not.toEqual([]);
  });

  it('has no entry-count caps', () => {
    const nodes = Array.from({ length: 300 }, (_, index) => ({
      ...NODE,
      id: `node_${String(index)}`,
    }));
    expect(PLUGIN_AUTOMATION.parse(automation({ nodes })).nodes).toHaveLength(300);
  });

  it('rejects any in an input port at any depth but allows it in outputs', () => {
    const anyInput = (type: FlowType): unknown =>
      nodeWith({
        inputs: [{ name: 'channel', title: 'C', type, required: true, description: 'd' }],
        summary: 'Post to {channel}',
        run: { tool: 'post', args: {} },
      });
    expect(messages(anyInput({ t: 'any' }))).toContain(
      'a plugin input port needs a real type, not any',
    );
    expect(messages(anyInput({ t: 'list', of: { t: 'any' } }))).not.toEqual([]);
    expect(messages(anyInput({ t: 'record', fields: { a: { t: 'any' } } }))).not.toEqual([]);
    const anyOutput = { ...NODE.outputs[0], type: { t: 'any' } };
    expect(messages(nodeWith({ outputs: [anyOutput] }))).toEqual([]);
  });

  it('rejects param and error types and families on non-device references', () => {
    const output = (type: FlowType): unknown =>
      nodeWith({ outputs: [{ ...NODE.outputs[0], type }], waitOnly: [] });
    expect(messages(output({ t: 'error' }))).not.toEqual([]);
    expect(messages(output({ t: 'param', name: 'x' }))).not.toEqual([]);
    expect(messages(output({ t: 'ref', of: 'room', families: ['printer'] }))).toContain(
      'only device references take families',
    );
    expect(messages(output({ t: 'ref', of: 'device', families: ['printer'] }))).toEqual([]);
  });

  it('rejects bindings to unknown ports, outputs and arguments', () => {
    expect(messages(nodeWith({ run: { tool: 'post', args: { a: { port: 'nope' } } } }))).toContain(
      'run binds the unknown port nope',
    );
    const nested = { tool: 'post', args: { a: { record: { b: { port: 'ghost' } } } } };
    expect(messages(nodeWith({ run: nested }))).toContain('run binds the unknown port ghost');
    expect(messages(nodeWith({ waitOnly: ['missing'] }))).toContain(
      'waitOnly names the unknown output missing',
    );
    const until = { event: 'printed', match: { job: { output: 'jobId' } }, timeout: 1000 };
    expect(messages(nodeWith({ until }))).toContain('until matches the unknown output jobId');
    const byPort = { event: 'printed', match: {}, timeout: { port: 'wait' } };
    expect(messages(nodeWith({ until: byPort }))).toContain(
      'until times out on the unknown port wait',
    );
    expect(messages(nodeWith({ batch: { arg: 'nope' } }))).toContain(
      'batch names the unknown argument nope',
    );
  });

  it('checks the summary against the input names', () => {
    expect(messages(nodeWith({ summary: 'Post {body}' }))).toContain(
      'placeholder {body} names no input port',
    );
  });

  it('keeps queries in wait mode and asks for a timeout when a node can wait', () => {
    expect(pluginNodeModes({ kind: 'query' })).toEqual({
      default: 'wait_for_result',
      allowed: ['wait_for_result'],
    });
    expect(pluginNodeModes({ kind: 'action' }).default).toBe('fire_and_forget');
    expect(
      messages(nodeWith({ kind: 'query', mode: pluginNodeModes({ kind: 'action' }) })),
    ).toContain('a query only runs in wait mode');
    expect(messages(nodeWith({ timeout: undefined }))).toContain(
      'a node that can wait needs a timeout',
    );
    const sendOnly = { default: 'fire_and_forget', allowed: ['fire_and_forget'] };
    expect(messages(nodeWith({ mode: sendOnly }))).toContain('waitOnly outputs need wait mode');
    expect(messages(nodeWith({ timeout: { default: 5000, max: 1000 } }))).toContain(
      'the default timeout is longer than the longest',
    );
  });

  it('rejects duplicate ids and value inputs that are not selectors', () => {
    expect(messages(automation({ values: [{ ...VALUE, id: NODE.id }] }))).toContain(
      'the node or value post_message is declared twice',
    );
    const typed = { ...VALUE.inputs[0], type: TEXT };
    expect(messages(automation({ values: [{ ...VALUE, inputs: [typed] }] }))).toContain(
      'the value input server must be an entity or a choice',
    );
  });

  it('reports undeclared entities, events and streams per kind', () => {
    const declared = PLUGIN_AUTOMATION.parse(automation());
    const context = { pluginId: 'discord', automation: declared, events: [], data: [] };
    expect(pluginAutomationProblems(context)).toEqual([
      {
        kindId: 'trigger.plugin.discord.message_posted',
        problems: ['the event message is not declared in contributes.events'],
      },
      {
        kindId: 'plugin.discord.members_online',
        problems: ['the stream presence is not declared in contributes.data'],
      },
    ]);
    const roles = PLUGIN_AUTOMATION.parse(
      nodeWith({ inputs: [{ ...NODE.inputs[0], type: ROLE }, NODE.inputs[1]] }),
    );
    const full = {
      pluginId: 'discord',
      automation: roles,
      events: [{ kind: 'message' }],
      data: [{ stream: 'presence' }],
    };
    expect(pluginAutomationProblems(full)).toEqual([
      {
        kindId: 'plugin.discord.post_message',
        problems: ['the entity type discord.role is not declared by this plugin'],
      },
    ]);
  });
});

describe('plugin kind ids', () => {
  it('prefix the owner with dashes as underscores', () => {
    const plugin = { kind: 'plugin', id: 'shelly-presence' } as const;
    const driver = { kind: 'driver', id: 'treadmill' } as const;
    expect(pluginNodeKindId(plugin, 'zone_count')).toBe('plugin.shelly_presence.zone_count');
    expect(pluginTriggerKindId(plugin, 'zone_enter')).toBe(
      'trigger.plugin.shelly_presence.zone_enter',
    );
    expect(pluginNodeKindId(driver, 'start')).toBe('plugin.driver_treadmill.start');
    expect(NODE_KIND_ID.safeParse(pluginNodeKindId(plugin, 'zone_count')).success).toBe(true);
    expect(TRIGGER_KIND_ID.safeParse(pluginTriggerKindId(driver, 'walk_done')).success).toBe(true);
  });

  it('has a plugins category', () => {
    expect(categoryName('plugins')).toBe('Plugins and device apps');
  });
});

describe('entity types', () => {
  it('parse as a flow type with a plugin and entity id', () => {
    expect(FLOW_TYPE.safeParse(CHANNEL).success).toBe(true);
    expect(FLOW_TYPE.safeParse({ t: 'entity', of: 'channel' }).success).toBe(false);
  });

  it('assign only to the same entity, widen to text and accept text with advice', () => {
    expect(isAssignable(CHANNEL, CHANNEL)).toBe(true);
    expect(isAssignable(CHANNEL, ROLE)).toBe(false);
    expect(isAssignable(CHANNEL, TEXT)).toBe(true);
    expect(implicitCoercionOf(CHANNEL, TEXT)).toBe('entityToText');
    expect(isAssignable(TEXT, CHANNEL)).toBe(true);
    expect(implicitCoercionOf(TEXT, CHANNEL)).toBe('textToEntity');
    expect(assignmentAdvice(TEXT, { t: 'optional', of: CHANNEL })).toBe(TEXT_TO_ENTITY_ADVICE);
    expect(assignmentAdvice(CHANNEL, CHANNEL)).toBeNull();
    expect(isAssignable({ t: 'number' }, CHANNEL)).toBe(false);
  });

  it('show the entity title from the catalog', () => {
    const titles = (of: string): string | undefined =>
      of === 'discord.channel' ? 'Discord channel' : undefined;
    expect(typeDisplayName({ t: 'list', of: CHANNEL }, titles)).toBe('List of Discord channel');
    expect(typeDisplayName(ROLE, titles)).toBe('Discord.role');
  });

  it('filter device references by family', () => {
    const printer: FlowType = { t: 'ref', of: 'device', families: ['printer'] };
    expect(isAssignable(printer, { t: 'ref', of: 'device' })).toBe(true);
    expect(isAssignable({ t: 'ref', of: 'device' }, printer)).toBe(false);
    expect(isAssignable({ t: 'ref', of: 'device', families: ['light'] }, printer)).toBe(false);
    expect(typeDisplayName(printer)).toBe('Device (printer)');
  });
});
