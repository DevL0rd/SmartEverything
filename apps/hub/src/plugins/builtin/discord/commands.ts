import type { PluginAssistant, PluginUsageSpan } from '../contract';
import { DiscordInputError } from './errors';
import type { ActivityVisibility } from './services';

type CommandTone = 'info' | 'good' | 'warn';

export interface CommandReply {
  readonly title: string;
  readonly lines: readonly string[];
  readonly tone: CommandTone;
}

interface Asked {
  readonly key: string;
  readonly actor: string;
}

type CommandOptions = Readonly<Record<string, string | undefined>>;

interface CommandRun {
  readonly name: string;
  readonly options: CommandOptions;
  readonly conversation: string;
  readonly guildId: string | null;
  readonly actorId: string;
}

function askedBy(call: CommandRun): Asked {
  return { key: call.conversation, actor: call.actorId };
}

export interface CommandSet {
  readonly name: string;
  readonly definition: Readonly<Record<string, unknown>>;
  readonly run: (call: CommandRun) => Promise<CommandReply>;
}

const EVERYWHERE = { contexts: [0, 1], integration_types: [0] } as const;

const STRING_OPTION = 3;

const MICROS = 1_000_000;
const COST_DIGITS = 4;

const dollars = (micros: number): string => `$${(micros / MICROS).toFixed(COST_DIGITS)}`;

const span = (label: string, usage: PluginUsageSpan): string =>
  `**${label}** ${dollars(usage.costMicros)} · ${String(usage.calls)} ${usage.calls === 1 ? 'call' : 'calls'}`;

function define(
  name: string,
  description: string,
  options: readonly Readonly<Record<string, unknown>>[] = [],
): CommandSet['definition'] {
  return {
    name,
    description,
    ...(options.length > 0 ? { options } : {}),
    ...EVERYWHERE,
  };
}

function option(
  name: string,
  description: string,
  choices?: readonly { readonly name: string; readonly value: string }[],
): Readonly<Record<string, unknown>> {
  return {
    type: STRING_OPTION,
    name,
    description,
    required: true,
    ...(choices === undefined ? {} : { choices }),
  };
}

function status(
  assistant: PluginAssistant,
  visibility: ActivityVisibility,
  asked: Asked,
): CommandReply {
  const settings = assistant.settings();
  const chat = assistant.conversation(asked.key, asked.actor);
  const lines =
    chat === null
      ? ['**State** ready · no conversation here yet']
      : [
          `**State** ${chat.state === 'unavailable' ? `unavailable · ${chat.reason ?? 'no reason given'}` : chat.state}`,
          `**Conversation** ${chat.title}`,
          `**Model** ${chat.model ?? 'default'}`,
          `**Spent here** ${dollars(chat.costMicros)}`,
        ];
  return {
    title: settings.name ?? 'Assistant',
    tone: chat?.state === 'unavailable' ? 'warn' : 'good',
    lines: [
      ...lines,
      `**Activity updates** ${visibility.progress() ? 'on' : 'off'}`,
      `**Context** compacts by itself at ${String(settings.compactAtPercent)}% of the model’s window`,
    ],
  };
}

function usage(assistant: PluginAssistant, actor: string): CommandReply {
  const view = assistant.usage(actor);
  return {
    title: 'AI spending',
    tone: 'info',
    lines: [
      span('Last 24 hours', view.today),
      span('Last 7 days', view.week),
      span('Last 30 days', view.month),
    ],
  };
}

async function compact(assistant: PluginAssistant, asked: Asked): Promise<CommandReply> {
  return (await assistant.compact(asked.key, asked.actor))
    ? {
        title: 'Compacting',
        tone: 'good',
        lines: ['The conversation was compacted to free up context.'],
      }
    : { title: 'Nothing to compact', tone: 'info', lines: ['The conversation is still short.'] };
}

async function startOver(assistant: PluginAssistant, asked: Asked): Promise<CommandReply> {
  const had = await assistant.startOver(asked.key, asked.actor);
  return {
    title: 'Fresh start',
    tone: 'good',
    lines: [
      had
        ? 'The next message starts a new conversation, with recent channel history.'
        : 'There was no conversation here; the next message starts one.',
    ],
  };
}

async function stop(assistant: PluginAssistant, asked: Asked): Promise<CommandReply> {
  return (await assistant.stop(asked.key, asked.actor))
    ? { title: 'Stopped', tone: 'good', lines: ['The current work was interrupted.'] }
    : {
        title: 'Nothing to stop',
        tone: 'info',
        lines: ['The assistant is not working on anything.'],
      };
}

async function activity(
  assistant: PluginAssistant,
  visibility: ActivityVisibility,
  mode: string | undefined,
): Promise<CommandReply> {
  if (mode !== 'on' && mode !== 'off') {
    throw new DiscordInputError('Choose on or off');
  }
  await visibility.set(mode === 'on');
  return {
    title: 'Activity updates',
    tone: 'good',
    lines: [
      `Step-by-step updates are ${mode} in Discord. This applies to every conversation here.`,
      ...(assistant.settings().activitySteps
        ? []
        : ['They stay hidden while the assistant’s own activity setting in the app is off.']),
    ],
  };
}

async function model(
  assistant: PluginAssistant,
  asked: Asked,
  name: string | undefined,
): Promise<CommandReply> {
  if (name === undefined || name.trim() === '') {
    throw new DiscordInputError('Give a model id, or default');
  }
  const wanted = name.trim().toLowerCase() === 'default' ? null : name.trim();
  const label = await assistant.setModel(asked.key, wanted, asked.actor);
  return {
    title: 'Model',
    tone: 'good',
    lines: [`This conversation now uses ${label ?? 'the default model'}.`],
  };
}

export function builtInCommands(
  assistant: PluginAssistant,
  visibility: ActivityVisibility,
): readonly CommandSet[] {
  return [
    {
      name: 'status',
      definition: define('status', 'Show the assistant’s state, model and spending here'),
      run: (call) => Promise.resolve(status(assistant, visibility, askedBy(call))),
    },
    {
      name: 'usage',
      definition: define('usage', 'Show what the AI cost recently'),
      run: ({ actorId }) => Promise.resolve().then(() => usage(assistant, actorId)),
    },
    {
      name: 'compact',
      definition: define('compact', 'Compact the current conversation to free up context'),
      run: (call) => compact(assistant, askedBy(call)),
    },
    {
      name: 'new',
      definition: define('new', 'Start a fresh conversation'),
      run: (call) => startOver(assistant, askedBy(call)),
    },
    {
      name: 'stop',
      definition: define('stop', 'Stop what the assistant is working on'),
      run: (call) => stop(assistant, askedBy(call)),
    },
    {
      name: 'activity',
      definition: define('activity', 'Show or hide step-by-step activity updates', [
        option('mode', 'On or off', [
          { name: 'on', value: 'on' },
          { name: 'off', value: 'off' },
        ]),
      ]),
      run: ({ options }) => activity(assistant, visibility, options['mode']),
    },
    {
      name: 'model',
      definition: define('model', 'Change the model of this conversation', [
        option('name', 'Model id, or default'),
      ]),
      run: (call) => model(assistant, askedBy(call), call.options['name']),
    },
  ];
}

const COLORS: Readonly<Record<CommandTone, number>> = {
  info: 0x5865f2,
  good: 0x3ba55d,
  warn: 0xf0b232,
};

const DESCRIPTION_LIMIT = 4096;

export function replyEmbed(reply: CommandReply): Readonly<Record<string, unknown>> {
  const description = reply.lines.join('\n');
  return {
    title: reply.title,
    description:
      description.length > DESCRIPTION_LIMIT
        ? `${description.slice(0, DESCRIPTION_LIMIT - 1)}…`
        : description,
    color: COLORS[reply.tone],
  };
}
