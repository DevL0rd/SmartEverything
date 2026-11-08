import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ASSISTANT_SETTINGS } from '@smarteverything/domain';
import type { MemoryPart, StoredMemory } from '../../src/store/repositories/ai-memories';
import { faded, strength, type Fading } from '../../src/memory/search';
import { TEST_ENGINE } from '../support/engine';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-11-05T12:00:00.000Z');

function memory(over: Partial<Fading> = {}): Fading {
  return {
    kind: 'episode',
    importance: 50,
    updated_at: '2026-11-05T12:00:00.000Z',
    recalled_at: null,
    recall_count: 0,
    valid_until: null,
    ...over,
  };
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

describe('memory strength', () => {
  it('halves the score after the half-life of its anchor', () => {
    expect(strength(memory({ importance: 25, updated_at: daysAgo(45) }), NOW)).toBeCloseTo(12.5);
    expect(strength(memory({ importance: 50, updated_at: daysAgo(120) }), NOW)).toBeCloseTo(25);
    expect(strength(memory({ importance: 75, updated_at: daysAgo(365) }), NOW)).toBeCloseTo(37.5);
    expect(strength(memory({ importance: 0, updated_at: daysAgo(14) }), NOW)).toBe(0);
  });

  it('interpolates the half-life between anchors', () => {
    expect(strength(memory({ importance: 38, updated_at: daysAgo(0) }), NOW)).toBe(38);
    const between = strength(memory({ importance: 38, updated_at: daysAgo(84) }), NOW);
    expect(between).toBeGreaterThan(18.9);
    expect(between).toBeLessThan(19.1);
  });

  it('keeps the Zelda evening at 50 until about seven months and then fades it from the prompt', () => {
    expect(faded(memory({ updated_at: daysAgo(180) }), NOW, '2026-11-05')).toBe(false);
    expect(faded(memory({ updated_at: daysAgo(230) }), NOW, '2026-11-05')).toBe(true);
  });

  it('fades low scores at once and decays 89 but never fades 90, 100 or vocabulary', () => {
    expect(faded(memory({ importance: 0 }), NOW, '2026-11-05')).toBe(true);
    expect(faded(memory({ importance: 10 }), NOW, '2026-11-05')).toBe(true);
    expect(faded(memory({ importance: 89, updated_at: daysAgo(400) }), NOW, '2026-11-05')).toBe(
      false,
    );
    expect(strength(memory({ importance: 89, updated_at: daysAgo(400) }), NOW)).toBeLessThan(89);
    expect(faded(memory({ importance: 89, updated_at: daysAgo(5000) }), NOW, '2026-11-05')).toBe(
      true,
    );
    expect(faded(memory({ importance: 90, updated_at: daysAgo(5000) }), NOW, '2026-11-05')).toBe(
      false,
    );
    expect(faded(memory({ importance: 100, updated_at: daysAgo(5000) }), NOW, '2026-11-05')).toBe(
      false,
    );
    expect(
      faded(
        memory({ kind: 'vocabulary', importance: 5, updated_at: daysAgo(5000) }),
        NOW,
        '2026-11-05',
      ),
    ).toBe(false);
  });

  it('doubles the half-life with every recall and restarts the age at the recall', () => {
    const old = memory({ updated_at: daysAgo(230) });
    expect(faded(old, NOW, '2026-11-05')).toBe(true);
    expect(faded({ ...old, recall_count: 1 }, NOW, '2026-11-05')).toBe(false);
    expect(faded({ ...old, recalled_at: daysAgo(1), recall_count: 1 }, NOW, '2026-11-05')).toBe(
      false,
    );
  });

  it('fades a memory whose end date has passed and not one that ends today', () => {
    expect(faded(memory({ valid_until: '2026-11-04' }), NOW, '2026-11-05')).toBe(true);
    expect(faded(memory({ valid_until: '2026-11-05' }), NOW, '2026-11-05')).toBe(false);
    expect(faded(memory({ importance: 95, valid_until: '2026-11-04' }), NOW, '2026-11-05')).toBe(
      true,
    );
  });
});

describe('the memory repository strength data', () => {
  let opened: TestStore;

  beforeEach(async () => {
    captureLogs();
    opened = await testStore();
  });

  afterEach(async () => {
    await opened.close();
  });

  function added(text: string, extra: object = {}): StoredMemory {
    return opened.store.aiMemories.add(opened.store.profiles.first().id, {
      scope: 'person',
      text,
      sourceChatId: null,
      sourceMessageId: null,
      ...extra,
    });
  }

  it('stores kind, importance and dates and defaults to fact, 50', () => {
    expect(added('plain')).toMatchObject({ kind: 'fact', importance: 50, recall_count: 0 });
    expect(
      added('played Zelda', {
        kind: 'episode',
        importance: 75,
        happenedOn: '2026-10-01',
        validUntil: '2030-01-01',
      }),
    ).toMatchObject({ kind: 'episode', importance: 75, happened_on: '2026-10-01' });
  });

  it('changes only the named fields and re-embeds only when the text changes', () => {
    const profile = opened.store.profiles.first().id;
    const memory = added('likes tea');
    opened.store.aiMemories.setEmbedding(memory, 'm', Float32Array.of(1, 0));
    expect(opened.store.aiMemories.change(memory.id, profile, { importance: 95 })).toMatchObject({
      text: 'likes tea',
      importance: 95,
    });
    expect(opened.store.aiMemories.embeddings(profile, 'm').size).toBe(1);
    opened.store.aiMemories.change(memory.id, profile, {
      text: 'likes green tea',
      kind: 'preference',
    });
    expect(opened.store.aiMemories.embeddings(profile, 'm').size).toBe(0);
    expect(opened.store.aiMemories.find(memory.id, profile)?.kind).toBe('preference');
    expect(opened.store.aiMemories.change(crypto.randomUUID(), profile, { importance: 25 })).toBe(
      undefined,
    );
  });

  it('counts recalls without touching the update time', () => {
    const profile = opened.store.profiles.first().id;
    const memory = added('a');
    opened.store.aiMemories.recalled([memory.id], '2027-01-01T00:00:00.000Z');
    opened.store.aiMemories.recalled([memory.id], '2027-02-01T00:00:00.000Z');
    expect(opened.store.aiMemories.find(memory.id, profile)).toMatchObject({
      recall_count: 2,
      recalled_at: '2027-02-01T00:00:00.000Z',
      updated_at: memory.updated_at,
    });
  });

  it('keeps the embedding of the edited text when an older request finishes later', () => {
    const profile = opened.store.profiles.first().id;
    const original = added('likes tea');
    const changed = opened.store.aiMemories.change(original.id, profile, { text: 'likes coffee' });
    if (changed === undefined) throw new Error('The memory was not edited.');

    opened.store.aiMemories.setEmbedding(changed, 'm', Float32Array.of(0, 1));
    opened.store.aiMemories.setEmbedding(original, 'm', Float32Array.of(1, 0));

    expect(opened.store.aiMemories.embeddings(profile, 'm').get(original.id)).toStrictEqual(
      Float32Array.of(0, 1),
    );
  });

  it('lists expired memories by end date', () => {
    added('open');
    const gone = added('trip', { validUntil: '2026-03-01' });
    expect(opened.store.aiMemories.expired('2026-11-05').map((row) => row.id)).toStrictEqual([
      gone.id,
    ]);
    expect(opened.store.aiMemories.expired('2026-03-01')).toStrictEqual([]);
  });

  it('splits one memory into its parts in one write and refuses a missing one', () => {
    const profile = opened.store.profiles.first().id;
    const compound = added('a and b', {
      kind: 'episode',
      importance: 40,
      happenedOn: '2026-05-02',
    });
    const other = added('c');
    opened.store.aiMemories.recalled([compound.id], '2026-06-01T00:00:00.000Z');
    const part = (text: string, importance: number): MemoryPart => ({
      text,
      kind: 'episode',
      importance,
      happenedOn: '2026-05-02',
      validUntil: null,
    });
    expect(opened.store.aiMemories.split(crypto.randomUUID(), profile, [part('x', 1)])).toBe(
      undefined,
    );
    const parts = opened.store.aiMemories.split(compound.id, profile, [
      part('a', 30),
      part('b', 70),
    ]);
    expect(parts?.map((row) => [row.text, row.importance])).toStrictEqual([
      ['a', 30],
      ['b', 70],
    ]);
    expect(parts?.[0]).toMatchObject({
      kind: 'episode',
      happened_on: '2026-05-02',
      recall_count: 1,
      created_at: compound.created_at,
      profile_id: profile,
    });
    expect(
      opened.store.aiMemories
        .visible(profile)
        .map((row) => row.id)
        .toSorted(),
    ).toStrictEqual([...(parts ?? []).map((row) => row.id), other.id].toSorted());
  });

  it('remembers how far the memory manager learned in a chat', () => {
    const chat = opened.store.aiChats.create({
      profileId: opened.store.profiles.first().id,
      kind: 'chat',
      title: 'Home',
      icon: null,
      parentId: null,
      sourceKey: null,
      engine: TEST_ENGINE,
    });
    expect(opened.store.aiMemories.learnedThrough(chat.id)).toBe(undefined);
    opened.store.aiMemories.setLearnedThrough(chat.id, '2026-11-05T10:00:00.000Z');
    opened.store.aiMemories.setLearnedThrough(chat.id, '2026-11-05T11:00:00.000Z');
    expect(opened.store.aiMemories.learnedThrough(chat.id)).toBe('2026-11-05T11:00:00.000Z');
  });
});

describe('the memory model setting', () => {
  it('defaults to the chat model slug and accepts a model id', () => {
    expect(ASSISTANT_SETTINGS.parse({}).memory_model).toBe('~deepseek/deepseek-flash-latest');
    expect(ASSISTANT_SETTINGS.parse({ memory_model: 'google/gemini-3-flash' }).memory_model).toBe(
      'google/gemini-3-flash',
    );
  });
});
