import {
  actionNode,
  input,
  optionalInput,
  output,
  ports,
  queryNode,
  type PortKind,
} from '../automation-kit';
import { CHANNEL, MESSAGE, PERSON, SERVER } from './automation-entities';
import { POLL_ENDED, PROMPT_ANSWERED } from './automation-events';
import { MODERATION_NODES, ROLE } from './automation-moderation';
import {
  ASK_TOOL,
  EVENT_TOOL,
  LATEST_TOOL,
  MESSAGES_MAX,
  POLL_HOURS_MAX,
  POLL_TOOL,
} from './automation-more-tools';

const COMMAND_TIMEOUT = { default: 30_000, max: 120_000 } as const;

const LONGEST_TIMER_MS = 2_147_483_647;

const WAIT_TIMEOUT = { default: LONGEST_TIMER_MS, max: LONGEST_TIMER_MS } as const;

const LATEST_DEFAULT = 25;

const POLL_HOURS_DEFAULT = 24;

const HOUR_MS = 3_600_000;

const ASK_WAIT_DEFAULT_MS = HOUR_MS;

const POLL_WAIT_DEFAULT_MS = (POLL_HOURS_DEFAULT + 1) * HOUR_MS;

interface MessageRow {
  readonly id: string;
  readonly content: string;
  readonly timestamp: string;
  readonly author: { readonly id: string; readonly username: string | undefined };
}

const MESSAGE_ROW: PortKind<MessageRow> = {
  type: {
    t: 'record',
    fields: {
      id: MESSAGE.kind.type,
      content: { t: 'text' },
      timestamp: { t: 'instant' },
      author: {
        t: 'record',
        fields: {
          id: PERSON.kind.type,
          username: { t: 'optional', of: { t: 'text' } },
        },
      },
    },
  },
};

interface PollResult {
  readonly answer: string;
  readonly votes: number;
}

const POLL_RESULT: PortKind<PollResult> = {
  type: {
    t: 'record',
    fields: { answer: { t: 'text' }, votes: { t: 'number', integer: true, min: 0 } },
  },
};

const INSTANT: PortKind<string> = { type: { t: 'instant' } };

export const ASK_NODE = actionNode({
  id: 'ask',
  version: 1,
  title: 'Ask in Discord',
  description:
    'Asks a question with answer buttons in a Discord channel or to one person, and waits for the answer. When nobody answers in time, the step takes its If it fails exit with the reason Timeout.',
  icon: 'messageCircle',
  keywords: ['discord', 'ask', 'question', 'answer', 'buttons', 'choice', 'confirm', 'approve'],
  summary: 'Ask {question} in {channel} {person}',
  tool: ASK_TOOL,
  inputs: {
    channel: optionalInput(CHANNEL.kind, {
      title: 'Channel',
      description: 'The channel to ask in. Choose a channel or a person, not both.',
    }),
    person: optionalInput(PERSON.kind, {
      title: 'Person',
      description: 'The person to ask in a direct message. Choose a channel or a person, not both.',
    }),
    question: input(ports.text(), { title: 'Question', description: 'What to ask.' }),
    answers: input(ports.list(ports.text()), {
      title: 'Answers',
      description: 'The answer buttons, one per answer. Discord shows up to five.',
    }),
    timeout: optionalInput(ports.duration(), {
      title: 'Wait for the answer',
      description:
        'How long to wait for an answer before the step takes its If it fails exit with the reason Timeout.',
      default: ASK_WAIT_DEFAULT_MS,
      ui: { min: 1, max: LONGEST_TIMER_MS },
    }),
  },
  outputs: {
    prompt: output(ports.text(), {
      title: 'Question id',
      description: 'The id of the question that was posted.',
      from: '/flowId',
    }),
    answer: output(ports.text(), {
      title: 'Answer',
      description: 'The text of the button that was pressed.',
      from: '/event/answer',
    }),
    by: output(PERSON.kind, {
      title: 'Answered by',
      description: 'The person who pressed the button.',
      from: '/event/user',
    }),
  },
  args: {
    channelId: { port: 'channel' },
    userId: { port: 'person' },
    content: { port: 'question' },
    mode: { lit: 'buttons' },
    answers: { port: 'answers' },
  },
  mode: { default: 'wait_for_result', allowed: ['wait_for_result'] },
  until: {
    event: PROMPT_ANSWERED,
    match: { prompt_id: { output: 'prompt' } },
    timeout: { port: 'timeout' },
  },
  timeout: WAIT_TIMEOUT,
});

export const LATEST_MESSAGES_NODE = queryNode({
  id: 'latest_messages',
  version: 1,
  title: 'Latest messages in a Discord channel',
  description:
    'Reads the newest messages of a Discord channel from Discord itself, newest first, with who wrote each and when.',
  icon: 'messageCircle',
  keywords: ['discord', 'messages', 'history', 'read', 'latest', 'recent', 'channel'],
  summary: 'Read the latest {limit} messages in {channel}',
  tool: LATEST_TOOL,
  inputs: {
    channel: input(CHANNEL.kind, { title: 'Channel', description: 'The channel to read.' }),
    limit: optionalInput(ports.number({ integer: true, min: 1, max: MESSAGES_MAX }), {
      title: 'How many',
      description: 'How many messages to read.',
      default: LATEST_DEFAULT,
      ui: { min: 1, max: MESSAGES_MAX, step: 1 },
    }),
  },
  outputs: {
    messages: output(ports.list(MESSAGE_ROW), {
      title: 'Messages',
      description: 'The messages, newest first.',
      from: '/result',
    }),
  },
  args: {
    action: { lit: 'messages_list' },
    channelId: { port: 'channel' },
    limit: { port: 'limit' },
  },
  retry: 'idempotent',
  budget: 'none',
  timeout: COMMAND_TIMEOUT,
});

export const POLL_NODE = actionNode({
  id: 'poll',
  version: 1,
  title: 'Start a Discord poll',
  description:
    'Posts a poll in a Discord channel with two to ten answers. Waiting continues when the poll ends and gives back the poll message and the votes each answer got. When the poll does not end in time, the step takes its If it fails exit with the reason Timeout.',
  icon: 'list',
  keywords: ['discord', 'poll', 'vote', 'question', 'survey'],
  summary: 'Poll {question} in {channel}',
  tool: POLL_TOOL,
  inputs: {
    channel: input(CHANNEL.kind, { title: 'Channel', description: 'The channel to post in.' }),
    question: input(ports.text(), { title: 'Question', description: 'What the poll asks.' }),
    answers: input(ports.list(ports.text()), {
      title: 'Answers',
      description: 'The choices people vote on, two to ten.',
    }),
    hours: optionalInput(ports.number({ integer: true, min: 1, max: POLL_HOURS_MAX }), {
      title: 'Open for',
      description: 'How many hours the poll stays open. Discord allows up to 32 days.',
      default: POLL_HOURS_DEFAULT,
      ui: { min: 1, max: POLL_HOURS_MAX, step: 1, unit: 'hours' },
    }),
    multiple: optionalInput(ports.boolean(), {
      title: 'Several answers',
      description: 'Let people pick more than one answer.',
      default: false,
    }),
    timeout: optionalInput(ports.duration(), {
      title: 'Wait for the end',
      description:
        'How long to wait for the poll to end when this step waits. Set it longer than the poll stays open.',
      default: POLL_WAIT_DEFAULT_MS,
      ui: { min: 1, max: LONGEST_TIMER_MS },
    }),
  },
  outputs: {
    message: output(MESSAGE.kind, {
      title: 'Poll message',
      description: 'The message that holds the poll.',
      from: '/result/id',
    }),
    results: output(ports.list(POLL_RESULT), {
      title: 'Results',
      description: 'Each answer with the votes it got, in the order of the answers.',
      from: '/event/results',
    }),
  },
  args: {
    action: { lit: 'poll_create' },
    channelId: { port: 'channel' },
    poll: {
      record: {
        question: { port: 'question' },
        answers: { port: 'answers' },
        durationHours: { port: 'hours' },
        multiselect: { port: 'multiple' },
      },
    },
  },
  until: {
    event: POLL_ENDED,
    match: { message: { output: 'message' } },
    timeout: { port: 'timeout' },
  },
  timeout: WAIT_TIMEOUT,
  waitOnly: ['message', 'results'],
});

export const EVENT_NODE = actionNode({
  id: 'event',
  version: 1,
  title: 'Create a Discord event',
  description:
    'Adds a scheduled event with a place, a start and an end to a Discord server. Both times must be in the future and the end after the start.',
  icon: 'calendar',
  keywords: ['discord', 'event', 'schedule', 'calendar', 'meetup', 'server'],
  summary: 'Create the event {name} in {server}',
  tool: EVENT_TOOL,
  inputs: {
    server: input(SERVER.kind, { title: 'Server', description: 'The server to add it to.' }),
    name: input(ports.text(), { title: 'Name', description: 'The name of the event.' }),
    description: optionalInput(ports.text(), {
      title: 'Description',
      description: 'What the event is about.',
    }),
    start: input(INSTANT, { title: 'Starts', description: 'When the event starts.' }),
    end: input(INSTANT, { title: 'Ends', description: 'When the event ends.' }),
    location: input(ports.text(), {
      title: 'Place',
      description: 'Where it happens, as people should read it.',
    }),
  },
  outputs: {
    event: output(ports.text(), {
      title: 'Event id',
      description: 'The id of the event Discord created.',
      from: '/result/id',
    }),
  },
  args: {
    action: { lit: 'scheduled_event_create' },
    guildId: { port: 'server' },
    name: { port: 'name' },
    description: { port: 'description' },
    start: { port: 'start' },
    end: { port: 'end' },
    location: { port: 'location' },
  },
  timeout: COMMAND_TIMEOUT,
  waitOnly: ['event'],
});

export const DISCORD_MORE_NODES = [
  ASK_NODE,
  LATEST_MESSAGES_NODE,
  POLL_NODE,
  EVENT_NODE,
  ...MODERATION_NODES,
] as const;

export const DISCORD_MORE_ENTITIES = [ROLE] as const;
