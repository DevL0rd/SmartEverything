import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMORY_MODEL_DEFAULT } from '@smarteverything/domain';
import type { MemoryEmbedder } from '../../src/memory/embedder';
import { MemoryManager } from '../../src/memory/manager';
import {
  ManagerFailedError,
  ManagerModel,
  MEMORY_MANAGER_SESSION,
} from '../../src/memory/manager-model';
import type { ManagerCompletion } from '../../src/memory/manager-model';
import { SCORE_ANCHORS } from '../../src/memory/manager-anchors';
import { MANAGER_SYSTEM, REVIEW_SYSTEM } from '../../src/memory/manager-prompts';
import type { MemoryPrincipal } from '../../src/memory/principal';
import { MemoryService } from '../../src/memory/service';
import { TEST_ENGINE } from '../support/engine';
import { captureLogs } from '../support/logs';
import { everyone, remember } from '../support/memory-service';
import { testStore, type TestStore } from '../support/store';

const VECTORS: Record<string, readonly number[]> = {
  'Ida takes the bus to work': [1, 0, 0],
  'Ida rides the bus to her job': [0.97, 0.243, 0],
  'Ida commutes by bus on weekdays': [0.88, 0.475, 0],
  'Rex is the dog': [0, 1, 0],
  'The bus again today': [1, 0, 0],
};

const SLOTS = new Map<string, number>();

function vectorOf(text: string): Float32Array {
  const vector = new Float32Array(96);
  const known = VECTORS[text] ?? (text.includes('bus') ? [1, 0, 0] : undefined);
  if (known !== undefined) vector.set(known);
  else {
    if (!SLOTS.has(text)) SLOTS.set(text, SLOTS.size);
    vector[3 + (SLOTS.get(text) ?? 0)] = 1;
  }
  return vector;
}

class ScriptedEmbedder implements MemoryEmbedder {
  readonly model = 'scripted';
  failing = false;

  embed(texts: readonly string[]): Promise<Float32Array[]> {
    if (this.failing) return Promise.reject(new Error('no embeddings'));
    return Promise.resolve(texts.map((text) => vectorOf(text)));
  }
}

let opened: TestStore;
let embedder: ScriptedEmbedder;
let service: MemoryService;
let manager: MemoryManager;
let model: ManagerModel;
let owner: MemoryPrincipal;
let ida: MemoryPrincipal;
let selected: string;
let zone = 'UTC';
let clock = new Date('2026-10-08T10:00:00.000Z');
let answers: (string | Error)[];
let asked: ManagerCompletion[];
let slept: number[];
let events: () => string[];

function ask(complete: string | Error): void {
  answers.push(complete);
}

beforeEach(async () => {
  events = captureLogs().events;
  zone = 'UTC';
  clock = new Date('2026-10-08T10:00:00.000Z');
  opened = await testStore(() => clock);
  embedder = new ScriptedEmbedder();
  selected = MEMORY_MODEL_DEFAULT;
  answers = [];
  asked = [];
  slept = [];
  model = new ManagerModel({
    selected: (): string => selected,
    complete: (request): Promise<string> => {
      asked.push(request);
      const next = answers.shift();
      return next instanceof Error
        ? Promise.reject(next)
        : Promise.resolve(next ?? '{"operations":[]}');
    },
    nameOf: (profileId): string => opened.store.profiles.byId(profileId).name,
    now: (): Date => new Date('2026-11-05T10:00:00.000Z'),
    sleep: (ms): Promise<void> => {
      slept.push(ms);
      return Promise.resolve();
    },
  });
  service = new MemoryService(opened.store.aiMemories, opened.store.aiChats, embedder, {
    judge: model,
    zone: (): string => zone,
    now: (): Date => new Date(),
  });
  manager = new MemoryManager(model, service.writer, service);
  const first = opened.store.profiles.first().id;
  owner = { profileId: first, role: 'owner', chatId: chatOf(first), messageId: null };
  const member = opened.store.profiles.create({ name: 'Ida' }).id;
  ida = { profileId: member, role: 'member', chatId: chatOf(member), messageId: null };
});

afterEach(async () => {
  vi.useRealTimers();
  await opened.close();
});

function chatOf(profileId: string): string {
  return opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Chat',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
    titleAuto: false,
  }).id;
}

function texts(who: MemoryPrincipal): string[] {
  return service.list(who).memories.map((memory) => memory.text);
}

describe('the one write path', () => {
  it('treats the same words in another case or spacing as unchanged', async () => {
    await remember(service, ida, { scope: 'person', text: 'Ida takes the bus to work' });

    const again = await service.add(ida, {
      scope: 'person',
      text: '  ida takes  the BUS to work ',
    });

    expect(again.outcome).toBe('unchanged');
    expect(texts(ida)).toHaveLength(1);
    expect(asked).toHaveLength(0);
  });

  it('treats a close paraphrase as unchanged and keeps the higher importance', async () => {
    await remember(service, ida, { scope: 'person', text: 'Ida takes the bus to work' });

    const again = await service.add(ida, {
      scope: 'person',
      text: 'Ida rides the bus to her job',
      importance: 75,
    });

    expect(again.outcome).toBe('unchanged');
    expect(again.memory.importance).toBe(75);
    expect(texts(ida)).toStrictEqual(['Ida takes the bus to work']);
    expect(asked).toHaveLength(0);
  });

  it('asks the manager about a near note and merges when it updates the old one', async () => {
    const old = await remember(service, ida, {
      scope: 'person',
      text: 'Ida takes the bus to work',
    });
    ask(
      `{"operations":[{"op":"update","id":"${old.id}","text":"Ida takes the bus to work on weekdays","kind":"fact","significance":50,"happened_on":null,"valid_until":null}]}`,
    );

    const result = await service.add(ida, {
      scope: 'person',
      text: 'Ida commutes by bus on weekdays',
    });

    expect(result.outcome).toBe('merged');
    expect(texts(ida)).toStrictEqual(['Ida takes the bus to work on weekdays']);
    expect(asked[0]?.input).toContain(old.id);
    expect(asked[0]?.input).toContain(
      'New note the AI wants to keep:\nIda commutes by bus on weekdays',
    );
  });

  it('adds nothing when the manager answers with no operations in the band', async () => {
    await remember(service, ida, { scope: 'person', text: 'Ida takes the bus to work' });
    ask('{"operations":[]}');

    const result = await service.add(ida, {
      scope: 'person',
      text: 'Ida commutes by bus on weekdays',
    });

    expect(result.outcome).toBe('unchanged');
    expect(texts(ida)).toStrictEqual(['Ida takes the bus to work']);
  });

  it('adds the note when the manager answer is unreadable', async () => {
    await remember(service, ida, { scope: 'person', text: 'Ida takes the bus to work' });
    ask('not json');
    const first = await service.add(ida, {
      scope: 'person',
      text: 'Ida commutes by bus on weekdays',
    });

    expect(first.outcome).toBe('added');
    expect(events()).toContain('memory.judge_unreadable');
  });

  it('falls back to exact matching and an add when embeddings fail', async () => {
    embedder.failing = true;
    await remember(service, ida, { scope: 'person', text: 'Ida takes the bus to work' });

    const again = await service.add(ida, { scope: 'person', text: 'Ida takes the bus to work' });
    const other = await service.add(ida, { scope: 'person', text: 'Ida rides the bus to her job' });

    expect(again.outcome).toBe('unchanged');
    expect(other.outcome).toBe('added');
    expect(events()).toContain('memory.dedupe_unavailable');
  });

  it('stores the note while embeddings are refused and embeds it once they work again', async () => {
    embedder.failing = true;
    const added = await service.add(ida, { scope: 'person', text: 'Ida takes the bus to work' });
    expect(added.outcome).toBe('added');
    expect(opened.store.aiMemories.unembedded(ida.profileId, embedder.model)).toHaveLength(1);

    embedder.failing = false;
    await service.writer.fill(ida.profileId);

    expect(opened.store.aiMemories.unembedded(ida.profileId, embedder.model)).toHaveLength(0);
  });

  it('keeps people apart: the same words for another person are a new note', async () => {
    await remember(service, ida, { scope: 'person', text: 'Ida takes the bus to work' });

    const result = await service.add(owner, { scope: 'person', text: 'Ida takes the bus to work' });

    expect(result.outcome).toBe('added');
  });
});

describe('the memory manager', () => {
  it('stores what it adds, with the source chat, and a member home add becomes a person note', async () => {
    ask(
      '```json\n{"operations":[{"op":"add","scope":"home","kind":"vocabulary","significance":75,"text":"\\"girl juice\\" means estrogen HRT. Example: time for my girl juice","happened_on":null,"valid_until":null}]}\n```',
    );

    const result = await manager.exchange(ida, ida.chatId ?? '', 'time for my girl juice', 'ok');

    expect(result.applied).toHaveLength(1);
    const [stored] = service.list(ida).memories;
    expect(stored?.scope).toBe('person');
    expect(stored?.kind).toBe('vocabulary');
    expect(stored?.source_chat_id).toBe(ida.chatId);
    expect(texts(owner)).toStrictEqual([]);
  });

  it('hands the model the similar notes with ids and applies updates and deletes of those only', async () => {
    const bus = await remember(service, ida, {
      scope: 'person',
      text: 'Ida takes the bus to work',
    });
    const dog = await remember(service, ida, { scope: 'person', text: 'Rex is the dog' });
    const stranger = await remember(service, owner, { scope: 'person', text: 'Owner secret' });
    ask(
      `{"operations":[{"op":"delete","id":"${bus.id}"},{"op":"delete","id":"${stranger.id}"},{"op":"update","id":"00000000-0000-4000-8000-000000000000","text":"x","kind":"fact","significance":50,"happened_on":null,"valid_until":null}]}`,
    );

    await manager.exchange(ida, ida.chatId ?? '', 'The bus again today', 'Sorry about the bus');

    expect(asked[0]?.input).toContain(bus.id);
    expect(asked[0]?.input).not.toContain(stranger.id);
    expect(texts(ida)).toStrictEqual([dog.text]);
    expect(texts(owner)).toStrictEqual(['Owner secret']);
  });

  it('changes nothing and fails after three unreadable answers, each retry carrying the error', async () => {
    await remember(service, ida, { scope: 'person', text: 'Rex is the dog' });
    ask('{"operations":[{"op":"explode"}]}');
    ask('{"operations":[{"op":"explode"}]}');
    ask('{"operations":[{"op":"explode"}]}');

    await expect(
      manager.exchange(ida, ida.chatId ?? '', 'hello there friend of mine', 'hi'),
    ).rejects.toBeInstanceOf(ManagerFailedError);

    expect(asked).toHaveLength(3);
    expect(asked[0]?.input).not.toContain('rejected');
    expect(asked[1]?.input).toContain('Your previous answer was rejected');
    expect(asked.map((request) => request.system)).toStrictEqual([
      MANAGER_SYSTEM,
      MANAGER_SYSTEM,
      MANAGER_SYSTEM,
    ]);
    expect(texts(ida)).toStrictEqual(['Rex is the dog']);
    expect(events().filter((event) => event === 'memory.manager_failed')).toHaveLength(1);
  });

  it('sends the same system prompt for every person and puts only variable text in the input', async () => {
    await manager.exchange(ida, ida.chatId ?? '', 'I like tea a lot', 'noted');
    await manager.exchange(owner, owner.chatId ?? '', 'I own a cat named Tom', 'nice');

    expect(asked[0]?.system).toBe(MANAGER_SYSTEM);
    expect(asked[1]?.system).toBe(asked[0]?.system);
    expect(asked[0]?.input).toContain('Person: Ida, role member');
    expect(asked[1]?.input).toContain('Person: ' + opened.store.profiles.first().name);
  });

  it('carries the rules the user gave in the prompt', () => {
    expect(MANAGER_SYSTEM).toContain('anything that only matters for this conversation');
    expect(MANAGER_SYSTEM).toContain('passing problems');
    expect(MANAGER_SYSTEM).toContain('the current state of the home');
    expect(MANAGER_SYSTEM).toContain('passwords, codes, keys, tokens');
    expect(MANAGER_SYSTEM).toContain('never delete a memory only because it is old');
    expect(MANAGER_SYSTEM).toContain('their own words');
  });

  it('keeps every memory one fact and never joins two', () => {
    expect(MANAGER_SYSTEM).toContain('Every memory is exactly one fact in one short sentence');
    expect(MANAGER_SYSTEM).toContain('never merge two memories into one');
    expect(MANAGER_SYSTEM).toContain('one add per fact');
    expect(MANAGER_SYSTEM).toContain('never fold a different fact into a listed memory');
    expect(REVIEW_SYSTEM).toContain('Split a memory that holds several facts');
    expect(REVIEW_SYSTEM).toContain('Never combine memories');
  });
});

describe('the significance guide', () => {
  it('has all 21 anchors from 0 to 100 in the prompt', () => {
    expect(SCORE_ANCHORS.map((anchor) => anchor.score)).toStrictEqual(
      Array.from({ length: 21 }, (_, index) => index * 5),
    );
    for (const anchor of SCORE_ANCHORS)
      expect(MANAGER_SYSTEM).toContain(`${String(anchor.score)} ${anchor.text}`);
    expect(MANAGER_SYSTEM).toContain('most exchanges produce nothing');
  });
});

describe('the retries of the memory manager', () => {
  const GOOD = '{"operations":[]}';

  it('does not retry an in-flight request after the profile turns memory off', async () => {
    const complete = vi.fn<(request: ManagerCompletion) => Promise<string>>(() => {
      opened.store.aiMemories.changeSettings(ida.profileId, { enabled: false });
      return Promise.reject(new Error('503'));
    });
    const interrupted = new ManagerModel({
      selected: (): string => selected,
      complete,
      nameOf: (): string => 'Ida',
      now: (): Date => clock,
      sleep: (): Promise<void> => Promise.resolve(),
    });
    const running = new MemoryManager(interrupted, service.writer, service);
    const result = await running.exchange(ida, ida.chatId ?? '', 'I really like tea', 'Noted.');
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.applied).toEqual([]);
  });

  it.each([
    ['a server error', new Error('503 upstream unavailable')],
    ['a rate limit', new Error('429 too many requests')],
    ['a timeout', new Error('timed out after 30000 ms')],
    ['an empty answer', ''],
    ['an answer that breaks the schema', '{"operations":[{"op":"add"}]}'],
  ])('retries after %s and succeeds on the next attempt', async (_kind, failure) => {
    ask(failure);
    ask(GOOD);

    const result = await manager.exchange(ida, ida.chatId ?? '', 'I like tea a lot', 'noted');

    expect(result.applied).toStrictEqual([]);
    expect(asked).toHaveLength(2);
  });

  it('waits 2 s and then 8 s between failed attempts and gives up after three', async () => {
    ask(new Error('503'));
    ask(new Error('503'));
    ask(new Error('503'));

    await expect(
      manager.exchange(ida, ida.chatId ?? '', 'I like tea a lot', 'noted'),
    ).rejects.toBeInstanceOf(ManagerFailedError);

    expect(asked).toHaveLength(3);
    expect(slept).toStrictEqual([2000, 8000]);
    expect(events().filter((event) => event === 'memory.manager_failed')).toHaveLength(1);
  });

  it('honours a Retry-After given by the failure', async () => {
    ask(Object.assign(new Error('429'), { retryAfterMs: 1500 }));
    ask(GOOD);

    await manager.exchange(ida, ida.chatId ?? '', 'I like tea a lot', 'noted');

    expect(slept).toStrictEqual([1500]);
  });

  it('uses one constant session key for every run and person', async () => {
    await manager.exchange(ida, ida.chatId ?? '', 'I like tea a lot', 'noted');
    await manager.exchange(owner, owner.chatId ?? '', 'I own a cat named Tom', 'nice');

    expect(asked.map((request) => request.sessionKey)).toStrictEqual([
      MEMORY_MANAGER_SESSION,
      MEMORY_MANAGER_SESSION,
    ]);
    expect(MEMORY_MANAGER_SESSION).toBe('memory-manager');
  });
});

describe('the memory model', () => {
  it('sends the chosen slug as written, without looking it up in the catalogue', async () => {
    await manager.exchange(ida, ida.chatId ?? '', 'I like tea a lot', 'noted');
    selected = 'deepseek/deepseek-v4-flash';
    await manager.exchange(ida, ida.chatId ?? '', 'I like tea a lot', 'noted');

    expect(asked.map((request) => request.model)).toStrictEqual([
      '~deepseek/deepseek-flash-latest',
      'deepseek/deepseek-v4-flash',
    ]);
  });
});

describe('the recall windows', () => {
  async function seeded(): Promise<Record<string, string>> {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T12:00:00.000Z'));
    clock = new Date('2026-10-01T00:00:00.000Z');
    const dates: Record<string, string> = {
      today: '2026-11-05',
      week: '2026-11-01',
      month: '2026-10-20',
      year: '2026-03-01',
    };
    const ids: Record<string, string> = {};
    for (const [name, happened_on] of Object.entries(dates)) {
      const note = await remember(service, ida, {
        scope: 'person',
        text: `Zelda evening ${name}`,
        kind: 'episode',
        importance: 60,
        happened_on,
      });
      ids[name] = note.id;
    }
    clock = new Date('2026-11-05T09:00:00.000Z');
    for (const filler of ['alpha', 'bravo', 'charlie', 'delta', 'echo'])
      await remember(service, ida, { scope: 'person', text: `Filler ${filler}`, importance: 60 });
    return ids;
  }

  it('puts each memory in its most specific window once, newest first as recent', async () => {
    const ids = await seeded();

    const recall = service.recall(ida);

    expect(recall.recent).toHaveLength(5);
    expect(recall.today.map((m) => m.id)).toStrictEqual([ids['today']]);
    expect(recall.week.map((m) => m.id)).toStrictEqual([ids['week']]);
    expect(recall.month.map((m) => m.id)).toStrictEqual([ids['month']]);
    expect(recall.year.map((m) => m.id)).toStrictEqual([ids['year']]);
    const every = everyone(recall).map((m) => m.id);
    expect(new Set(every).size).toBe(every.length);
    expect(every).toHaveLength(9);
  });

  it('counts today from local midnight in the home time zone', async () => {
    const ids = await seeded();
    zone = 'Pacific/Auckland';

    const recall = service.recall(ida);

    expect(recall.today.map((m) => m.id)).not.toContain(ids['today']);
    expect(recall.week.map((m) => m.id)).toContain(ids['today']);
  });
});

describe('the recall block and the per-turn prepare', () => {
  it.each(['recall', 'learning'] as const)(
    'stops automatic %s embeddings when memory is disabled during backlog embedding',
    async (path) => {
      const saved = 'Ida takes the bus to work';
      embedder.failing = true;
      await remember(service, ida, { scope: 'person', text: saved });
      embedder.failing = false;
      let release: () => void = () => undefined;
      const backlog = new Promise<Float32Array[]>((resolve) => {
        release = (): void => {
          resolve([vectorOf(saved)]);
        };
      });
      const embed = vi.spyOn(embedder, 'embed').mockReturnValueOnce(backlog);
      const current = 'The bus again today';
      const work =
        path === 'recall'
          ? service.prepare(ida, { id: 'm1', text: current })
          : manager.exchange(ida, ida.chatId ?? '', current, 'Good to know.');
      expect(embed.mock.calls).toStrictEqual([[[saved]]]);

      service.changeSettings(ida, { enabled: false });
      release();
      await work;

      expect(embed.mock.calls).toStrictEqual([[[saved]]]);
      expect(asked).toHaveLength(0);
      expect(opened.store.aiMemories.unembedded(ida.profileId, embedder.model)).toHaveLength(1);
    },
  );

  it('excludes expired memories from automatic recall using the home day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T16:00:00.000Z'));
    zone = 'Pacific/Auckland';
    const expired = await remember(service, ida, {
      scope: 'person',
      text: 'Holiday booking',
      importance: 95,
      valid_until: '2026-10-08',
    });
    const vocabulary = await remember(service, ida, {
      scope: 'person',
      text: 'My holiday shorthand',
      kind: 'vocabulary',
      valid_until: '2026-10-08',
    });
    const current = await remember(service, ida, {
      scope: 'person',
      text: 'Holiday itinerary',
      importance: 60,
      valid_until: '2026-10-09',
    });

    await service.prepare(ida, { id: 'm1', text: 'holiday' });

    expect(everyone(service.recall(ida)).map((m) => m.id)).toStrictEqual([current.id]);
    expect(opened.store.aiMemories.find(expired.id, ida.profileId)?.recall_count).toBe(0);
    expect(opened.store.aiMemories.find(vocabulary.id, ida.profileId)?.recall_count).toBe(0);
    expect((await service.search(ida, 'booking', undefined)).map((m) => m.id)).toContain(
      expired.id,
    );
  });

  it('keeps a recent matching core memory in the core section', async () => {
    const saved = await remember(service, ida, {
      scope: 'person',
      text: 'Important holiday preference',
      importance: 95,
    });
    await service.prepare(ida, { id: 'm1', text: 'holiday' });

    const recall = service.recall(ida);

    expect(recall.core.map((m) => m.id)).toStrictEqual([saved.id]);
    expect(recall.relevant).toStrictEqual([]);
    expect(recall.recent).toStrictEqual([]);
  });

  it('groups core, vocabulary, relevant, recent and a faded count, and recalls once per message', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T10:00:00.000Z'));
    clock = new Date('2025-01-01T10:00:00.000Z');
    await remember(service, ida, { scope: 'person', text: 'Ida is vegetarian', importance: 95 });
    clock = new Date('2026-10-08T10:00:00.000Z');
    await remember(service, ida, {
      scope: 'person',
      text: '"girl juice" means estrogen HRT. Example: time for my girl juice',
      kind: 'vocabulary',
      importance: 5,
    });
    await remember(service, ida, {
      scope: 'person',
      text: 'Ida takes the bus to work',
      importance: 5,
    });
    await remember(service, ida, { scope: 'person', text: 'Rex is the dog', importance: 10 });
    for (const filler of ['alpha', 'bravo', 'charlie', 'delta', 'echo'])
      await remember(service, ida, { scope: 'person', text: `Filler ${filler}`, importance: 60 });
    clock = new Date('2026-09-01T10:00:00.000Z');
    await remember(service, ida, { scope: 'person', text: 'Ida likes jazz', importance: 50 });
    vi.setSystemTime(new Date('2026-12-08T10:00:00.000Z'));

    await service.prepare(ida, { id: 'm1', text: 'The bus again today' });
    const recall = service.recall(ida);

    expect(recall.core.map((m) => m.text)).toStrictEqual(['Ida is vegetarian']);
    expect(recall.vocabulary).toHaveLength(1);
    expect(recall.relevant.map((m) => m.text)).toStrictEqual(['Ida takes the bus to work']);
    expect(recall.recent).toHaveLength(5);
    expect(recall.year.map((m) => m.text)).toStrictEqual(['Ida likes jazz']);
    expect(recall.faded).toBe(1);
    const counted = (): number | undefined =>
      opened.store.aiMemories.visible(ida.profileId).find((m) => m.text.includes('bus'))
        ?.recall_count;
    expect(counted()).toBe(1);
    await service.prepare(ida, { id: 'm1', text: 'The bus again today' });
    expect(counted()).toBe(1);
    await service.prepare(ida, { id: 'm2', text: 'The bus again today' });
    expect(counted()).toBe(2);
  });

  it('ranks by keyword alone when the embedding fails and logs it', async () => {
    await remember(service, ida, { scope: 'person', text: 'Rex is the dog' });
    embedder.failing = true;

    await service.prepare(ida, { id: 'm1', text: 'dog' });

    expect(everyone(service.recall(ida)).map((m) => m.text)).toStrictEqual(['Rex is the dog']);
    expect(service.recall(ida).relevant.map((m) => m.text)).toStrictEqual(['Rex is the dog']);
    expect(events()).toContain('memory.relevance_failed');
  });
});
