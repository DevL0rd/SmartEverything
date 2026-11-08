import { remember } from '../support/memory-service';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cosine, rank } from '../../src/memory/search';
import { MemoryService } from '../../src/memory/service';
import type { MemoryPrincipal } from '../../src/memory/principal';
import { AI_MEMORY_EMBEDDINGS_MIGRATION } from '../../src/store/migrations/ai-memory-embeddings';
import { FakeMemoryEmbedder, vectorOf } from '../support/memory-embedder';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let embedder: FakeMemoryEmbedder;
let service: MemoryService;
let owner: MemoryPrincipal;
let ida: MemoryPrincipal;
let kid: MemoryPrincipal;

function person(profileId: string, role: MemoryPrincipal['role']): MemoryPrincipal {
  return { profileId, role, chatId: null, messageId: null };
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  embedder = new FakeMemoryEmbedder();
  service = new MemoryService(opened.store.aiMemories, opened.store.aiChats, embedder);
  owner = person(opened.store.profiles.first().id, 'owner');
  ida = person(opened.store.profiles.create({ name: 'Ida' }).id, 'member');
  kid = person(opened.store.profiles.create({ name: 'Kid' }).id, 'member');
});

afterEach(async () => {
  await opened.close();
});

describe('cosine ranking', () => {
  it('is 1 for the same direction, 0 for orthogonal and for empty vectors', () => {
    expect(cosine(Float32Array.of(1, 0), Float32Array.of(2, 0))).toBeCloseTo(1);
    expect(cosine(Float32Array.of(1, 0), Float32Array.of(0, 1))).toBe(0);
    expect(cosine(Float32Array.of(0, 0), Float32Array.of(1, 1))).toBe(0);
  });

  it('puts exact words first, then the closest meaning, and drops unrelated notes', () => {
    const items = [
      { id: 'a', text: 'Rex the dog' },
      { id: 'b', text: 'Takes the train to work' },
      { id: 'c', text: 'Likes tea and the bus' },
    ];
    const vectors = new Map(items.map((item) => [item.id, vectorOf(item.text)]));

    const ranked = rank(items, 'bus', vectorOf('commute by bus'), vectors);

    expect(ranked.map((item) => item.id)).toStrictEqual(['c', 'b']);
  });

  it('still finds exact words when there is no query vector', () => {
    const items = [{ id: 'a', text: 'Rex the dog' }];
    expect(rank(items, 'REX', null, new Map())).toHaveLength(1);
    expect(rank(items, 'cat', null, new Map())).toHaveLength(0);
  });
});

describe('searching memories', () => {
  it('finds a note by meaning without sharing a word', async () => {
    await remember(service, ida, { scope: 'person', text: 'Takes the train at 7:40' });
    await remember(service, ida, { scope: 'person', text: 'Rex is the dog' });

    const found = await service.search(ida, 'how does she commute', undefined);

    expect(found.map((line) => line.text)).toStrictEqual(['Takes the train at 7:40']);
  });

  it('embeds on add and re-embeds on edit', async () => {
    const added = await remember(service, ida, { scope: 'person', text: 'Likes tea' });
    await service.search(ida, 'drink', undefined);
    expect(opened.store.aiMemories.embeddings(ida.profileId, embedder.model).has(added.id)).toBe(
      true,
    );

    service.change(ida, added.id, { text: 'Has a dog' });
    const found = await service.search(ida, 'pet', undefined);
    expect(found.map((line) => line.text)).toStrictEqual(['Has a dog']);
  });

  it('keeps person and home scopes apart and honours the scope filter', async () => {
    await remember(service, ida, { scope: 'person', text: 'Ida takes the bus' });
    await remember(service, kid, { scope: 'person', text: 'Kid takes the bus' });
    await remember(service, owner, { scope: 'home', text: 'Bus stop is at the corner' });

    const all = await service.search(ida, 'bus', undefined);
    const home = await service.search(ida, 'bus', 'home');

    expect(all.map((line) => line.text).sort()).toStrictEqual([
      'Bus stop is at the corner',
      'Ida takes the bus',
    ]);
    expect(home.map((line) => line.text)).toStrictEqual(['Bus stop is at the corner']);
  });

  it('falls back to exact words when the embeddings cannot be reached', async () => {
    await remember(service, ida, { scope: 'person', text: 'Likes green tea' });
    embedder.failing = true;

    const found = await service.search(ida, 'tea', undefined);

    expect(found.map((line) => line.text)).toStrictEqual(['Likes green tea']);
  });
});

describe('the embeddings migration', () => {
  it('is version 160 and adds the vector columns', () => {
    expect(AI_MEMORY_EMBEDDINGS_MIGRATION.version).toBe(160);
    expect(AI_MEMORY_EMBEDDINGS_MIGRATION.statements.join(' ')).toContain('embedding blob');
  });
});
