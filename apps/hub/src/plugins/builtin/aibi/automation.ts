import { ROBOT_PLUGIN_ID, ROBOT_STATUS_STREAM } from '@smarteverything/domain';
import {
  actionNode,
  automation,
  entity,
  input,
  optionalInput,
  output,
  ports,
  streamValue,
  type ChoiceOption,
  type PortKind,
} from '../automation-kit';
import { ACT_TOOL, FORGET_TOOL, REFUSED_CODE } from './automation-tools';
import { ACTIONS } from './catalogue';
import { ACTION_PICKER, labelOf } from './pickers';

const TIMEOUT = { default: 30_000, max: 120_000 } as const;

export const ACTION = entity(ROBOT_PLUGIN_ID, {
  id: 'action',
  title: 'AIBI action',
  plural: 'AIBI actions',
  options: ACTION_PICKER,
});

function choicesOf(actionId: string, param: string): readonly ChoiceOption[] {
  const rule = ACTIONS.find((action) => action.id === actionId)?.params[param];
  return Array.isArray(rule)
    ? rule.map((choice) => ({ id: String(choice), label: labelOf(String(choice)) }))
    : [];
}

export const VOLUMES = choicesOf('function_set_volume', 'volume');

export const MOODS = choicesOf('interact_mood', 'mood');

function maybe<V>(kind: PortKind<V>): PortKind<V | undefined> {
  return { type: { t: 'optional', of: kind.type } };
}

export const ACT_NODE = actionNode({
  id: 'act',
  version: 1,
  title: 'AIBI does something',
  description:
    'Makes AIBI dance, sing, take a photo, change its volume, show a mood and more. AIBI can only do it while it is in a conversation; otherwise the node fails with Refused.',
  icon: 'bot',
  keywords: ['aibi', 'robot', 'action', 'move', 'dance', 'sing', 'mood', 'volume', 'behaviour'],
  summary: 'AIBI {action} {volume} {mood}',
  tool: ACT_TOOL,
  inputs: {
    action: input(ACTION.kind, {
      title: 'Action',
      description: 'What AIBI does. Only the actions switched on in the AIBI plugin are listed.',
    }),
    volume: optionalInput(ports.choice(VOLUMES), {
      title: 'Volume',
      description: 'How loud AIBI is. Used by the Set volume action only.',
    }),
    mood: optionalInput(ports.choice(MOODS), {
      title: 'Mood',
      description: 'The mood AIBI shows. Used by the Express a mood action only.',
    }),
  },
  args: {
    action: { port: 'action' },
    volume: { port: 'volume' },
    mood: { port: 'mood' },
  },
  errors: { [REFUSED_CODE]: 'Refused' },
  timeout: TIMEOUT,
});

export const FORGET_NODE = actionNode({
  id: 'forget',
  version: 1,
  title: 'Make AIBI forget conversations',
  description:
    'Starts AIBI’s conversations over, so it is no longer reminded of anything said before. The conversations stay in the chat list as archived chats.',
  icon: 'bot',
  keywords: ['aibi', 'robot', 'forget', 'memory', 'conversation', 'reset'],
  summary: 'Make AIBI forget its conversations',
  tool: FORGET_TOOL,
  inputs: {},
  outputs: {
    forgotten: output(ports.number({ integer: true, min: 0 }), {
      title: 'Conversations started over',
      description: 'How many conversations were archived.',
      from: '/forgotten',
    }),
  },
  waitOnly: ['forgotten'],
  args: {},
  access: 'owner',
  retry: 'idempotent',
  timeout: TIMEOUT,
});

export const STATUS_VALUE = streamValue({
  id: 'status',
  version: 1,
  title: 'AIBI status',
  description:
    'Whether AIBI is in a conversation, how many requests wait for an answer and its firmware.',
  icon: 'bot',
  keywords: ['aibi', 'robot', 'status', 'conversation', 'firmware'],
  summary: 'AIBI status',
  stream: ROBOT_STATUS_STREAM,
  outputs: {
    inConversation: { kind: ports.boolean(), from: '/conversation' },
    waiting: { kind: ports.number({ integer: true, min: 0 }), from: '/waiting' },
    firmware: { kind: maybe(ports.text()), from: '/robot/firmware' },
  },
});

export const AIBI_AUTOMATION = automation({
  nodes: [ACT_NODE, FORGET_NODE],
  values: [STATUS_VALUE],
  entities: [ACTION],
});
