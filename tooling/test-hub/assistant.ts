import { DEFAULT_AI_HARNESS_PERMISSION, type DshEngine } from '@smarteverything/domain';
import type { NewAssistantMessage } from '../../apps/hub/src/store/repositories/assistant-message-contract.ts';
import type { NewChat } from '../../apps/hub/src/store/repositories/ai-chat-input.ts';
import type { Store } from '../../apps/hub/src/store/store.ts';
import { daysAgo, type Anchor } from './clock.ts';
import type { Random } from './random.ts';

const ENGINE: DshEngine = {
  kind: 'dsh',
  execution_target: { kind: 'server' },
  session_id: null,
  model_route_id: '5b0f8f64-6a4b-5c53-8f0e-6f0b1f4a2c11',
  model: 'synthetic/test-model',
  effort: null,
  permission: DEFAULT_AI_HARNESS_PERMISSION,
};

const TOPICS: readonly (readonly [string, readonly (readonly [string, string])[]])[] = [
  [
    'Dinner ideas for the week',
    [
      [
        'What can I cook this week with chicken, rice and spinach?',
        'Here are four ideas: a chicken and spinach stir fry, a one-pan baked rice, a creamy spinach pasta and a rice bowl with a soft egg.',
      ],
      [
        'Make it vegetarian on Wednesday.',
        'Swap the chicken for chickpeas on Wednesday and keep the rest of the stir fry the same.',
      ],
    ],
  ],
  [
    'Living room too warm',
    [
      [
        'Why is the living room so warm in the afternoon?',
        'The blind is open during the sun peak and the air conditioner is off. Closing the blind at noon would cut the heat noticeably.',
      ],
      [
        'Draft an automation for that.',
        'A time automation at 12:00 that closes the living room blind, and another at 18:00 that opens it again.',
      ],
    ],
  ],
  [
    'Sleep review',
    [
      [
        'How did I sleep last week?',
        'You averaged 7.2 hours with the best nights mid-week. Your resting heart rate was lowest on Wednesday.',
      ],
      [
        'What should I change?',
        'Going to bed 20 minutes earlier on weekdays would close most of the gap to your 7.5 hour target.',
      ],
    ],
  ],
  [
    'Trip planning',
    [
      [
        'Plan a three day city break in spring.',
        'Day one for the old town and museums, day two for the market and a river walk, day three for a day trip and a long dinner.',
      ],
    ],
  ],
  [
    'Weekly budget',
    [
      [
        'Summarise what I spent on groceries.',
        'Groceries came to a steady weekly amount with one spike for the party shop. Dairy and produce are the largest shares.',
      ],
    ],
  ],
];

const MEMORIES_PERSON: readonly (readonly [
  string,
  'fact' | 'preference' | 'episode' | 'vocabulary',
])[] = [
  ['Prefers short answers in the morning.', 'preference'],
  ['Allergic to peanuts.', 'fact'],
  ['Runs on Tuesday and Thursday evenings.', 'fact'],
  ['Likes warm white light after sunset.', 'preference'],
  ['Calls the diffuser "the scent thing".', 'vocabulary'],
  ['Booked a trip to the coast last spring.', 'episode'],
];

const MEMORIES_HOME: readonly (readonly [string, 'fact' | 'preference'])[] = [
  ['The household has a cat named Miso.', 'fact'],
  ['Quiet hours start at 22:00.', 'preference'],
  ['The spare key is kept in the hallway drawer.', 'fact'],
  ['Bins go out on Monday night.', 'fact'],
];

export interface AssistantResult {
  readonly chats: number;
  readonly helpers: number;
  readonly messages: number;
  readonly memories: number;
}

interface Person {
  readonly id: string;
  readonly name: string;
}

interface Writer {
  readonly store: Store;
  readonly rng: Random;
}

interface Line {
  readonly role: 'person' | 'responder';
  readonly author: string;
  readonly text: string;
}

function textMessage(person: Person, chatId: string, line: Line): NewAssistantMessage {
  const { role, author, text } = line;
  return {
    profile_id: person.id,
    client_id: null,
    role,
    kind: 'text',
    author,
    text,
    attachments: [],
    state: null,
    reason: null,
    steps: [],
    step_states: [],
    reply_to: null,
    quote: null,
    chat_id: chatId,
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: role === 'responder' ? ENGINE.model : null,
  };
}

function newChat(person: Person, title: string, parentId: string | null): NewChat {
  return {
    profileId: person.id,
    kind: parentId === null ? 'chat' : 'subagent',
    title,
    icon: null,
    parentId,
    sourceKey: null,
    engine: ENGINE,
    titleAuto: false,
  };
}

interface Thread {
  readonly person: Person;
  readonly chatId: string;
  readonly turns: readonly (readonly [string, string])[];
  readonly startAt: number;
}

function writeTurns(writer: Writer, thread: Thread): { messages: number; at: number } {
  const { person, chatId, turns, startAt } = thread;
  let at = startAt;
  let messages = 0;
  for (const [ask, answer] of turns) {
    for (const [role, text, author] of [
      ['person', ask, person.name],
      ['responder', answer, 'Assistant'],
    ] as const) {
      const stamp = new Date(at).toISOString();
      writer.store.assistantChat.addMessage(textMessage(person, chatId, { role, author, text }), {
        createdAt: stamp,
        updatedAt: stamp,
      });
      messages += 1;
      at += 45_000 + writer.rng.int(0, 120_000);
    }
  }
  return { messages, at };
}

function writeHelpers(
  writer: Writer,
  person: Person,
  parentId: string,
  at: number,
): { helpers: number; messages: number } {
  const titles = ['Research helper', 'Shopping helper'];
  for (const title of titles) {
    const helper = writer.store.aiChats.create(newChat(person, title, parentId));
    const stamp = new Date(at + 60_000).toISOString();
    writer.store.assistantChat.addMessage(
      textMessage(person, helper.id, {
        role: 'responder',
        author: title,
        text: 'Finished the assigned lookup and reported back to the main chat.',
      }),
      { createdAt: stamp, updatedAt: stamp },
    );
  }
  return { helpers: titles.length, messages: titles.length };
}

function writeChats(
  writer: Writer,
  person: Person,
  personIndex: number,
  anchor: Anchor,
): { chats: number; helpers: number; messages: number } {
  const totals = { chats: 0, helpers: 0, messages: 0 };
  const topics = TOPICS.slice(personIndex % 2, (personIndex % 2) + 4);
  for (const [topicIndex, [title, turns]] of topics.entries()) {
    const chat = writer.store.aiChats.create(newChat(person, title, null));
    const startAt = daysAgo(
      anchor,
      writer.rng.int(1, 60 - topicIndex * 5),
      writer.rng.int(7, 21),
    ).getTime();
    const written = writeTurns(writer, { person, chatId: chat.id, turns, startAt });
    totals.chats += 1;
    totals.messages += written.messages;
    if (topicIndex !== 0) continue;
    const helpers = writeHelpers(writer, person, chat.id, written.at);
    totals.helpers += helpers.helpers;
    totals.messages += helpers.messages;
  }
  return totals;
}

function writeMemories(writer: Writer, people: readonly Person[]): number {
  let count = 0;
  for (const [personIndex, person] of people.entries()) {
    for (const [text, kind] of MEMORIES_PERSON.slice(personIndex, personIndex + 4)) {
      writer.store.aiMemories.add(person.id, {
        scope: 'person',
        text,
        sourceChatId: null,
        sourceMessageId: null,
        kind,
        importance: writer.rng.int(30, 80),
      });
      count += 1;
    }
  }
  const owner = people[0];
  if (owner === undefined) return count;
  for (const [text, kind] of MEMORIES_HOME) {
    writer.store.aiMemories.add(owner.id, {
      scope: 'home',
      text,
      sourceChatId: null,
      sourceMessageId: null,
      kind,
      importance: 60,
    });
    count += 1;
  }
  return count;
}

export function seedAssistant(
  store: Store,
  people: readonly Person[],
  anchor: Anchor,
  rng: Random,
): AssistantResult {
  const writer: Writer = { store, rng };
  const totals = { chats: 0, helpers: 0, messages: 0 };
  for (const [index, person] of people.entries()) {
    const written = writeChats(writer, person, index, anchor);
    totals.chats += written.chats;
    totals.helpers += written.helpers;
    totals.messages += written.messages;
  }
  return { ...totals, memories: writeMemories(writer, people) };
}
