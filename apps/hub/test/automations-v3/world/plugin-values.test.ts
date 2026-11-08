import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PLUGIN_MANIFEST, type JsonValue, type PluginManifest } from '@smarteverything/domain';
import {
  createKindCatalog,
  syncContribution,
  type PluginKindCatalog,
} from '../../../src/automations/plugin-kinds/catalog';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import { readPointer } from '../../../src/automations/world-v3/plugin-values';
import { createWorldReads } from '../../../src/automations/world-v3/world-reads';
import { SCOPE, furnish, type Home } from './support';

const PLUGIN = 'chat-hub';
const AT = '2026-10-25T09:00:00.000Z';
const LATER = '2026-10-25T09:05:00.000Z';

const CHANNEL = { t: 'entity', of: 'chat-hub.channel' } as const;
const NUMBER = { t: 'number' } as const;

const MEMBERS = {
  id: 'members_online',
  version: 1,
  title: 'Members online',
  description: 'Members online now.',
  icon: 'users',
  summary: 'Members online',
  from: { stream: 'members' },
  outputs: [
    { name: 'count', type: NUMBER, from: '/count' },
    { name: 'first', type: { t: 'text' }, from: '/names/0' },
  ],
};

const CHANNEL_ONLINE = {
  id: 'channel_online',
  version: 1,
  title: 'People in a channel',
  description: 'People in one channel.',
  icon: 'users',
  summary: 'People in {channel}',
  inputs: [
    { name: 'channel', title: 'Channel', type: CHANNEL, required: true, description: 'Which.' },
  ],
  from: { stream: 'channels', select: { list: '/channels', key: '/id', port: 'channel' } },
  outputs: [{ name: 'people', type: NUMBER, from: '/people' }],
};

const LIVE = {
  id: 'typing',
  version: 1,
  title: 'People typing',
  description: 'People typing now.',
  icon: 'users',
  summary: 'People typing',
  from: { stream: 'typing' },
  outputs: [{ name: 'count', type: NUMBER, from: '/count' }],
};

const BROKEN = {
  id: 'ghost',
  version: 1,
  title: 'Ghost',
  description: 'Reads a field that is never sent.',
  icon: 'users',
  summary: 'Ghost',
  from: { stream: 'members' },
  outputs: [{ name: 'missing', type: NUMBER, from: '/nothing/here' }],
};

const STREAM = { title: 'Stream', schema: { type: 'object' } };

function manifestOf(): PluginManifest {
  return PLUGIN_MANIFEST.parse({
    id: PLUGIN,
    name: 'Chat hub',
    version: '1.0.0',
    description: 'A chat service.',
    publisher: 'Tests',
    contributes: {
      data: [
        { stream: 'members', ...STREAM },
        { stream: 'channels', ...STREAM },
        { stream: 'typing', live: true, ...STREAM },
      ],
      automation: {
        entities: [{ id: 'channel', title: 'Channel', plural: 'Channels', options: 'channels' }],
        values: [MEMBERS, CHANNEL_ONLINE, LIVE, BROKEN],
      },
    },
  });
}

let home: Home;
let catalog: PluginKindCatalog;
let read: (kind: string, inputs?: Record<string, JsonValue>) => JsonValue;

beforeEach(async () => {
  home = await furnish();
  const manifest = manifestOf();
  home.test.store.plugins.create({
    manifest,
    source: 'builtin',
    location: 'builtin',
    trusted: true,
  });
  home.test.store.plugins.update(PLUGIN, { enabled: true });
  catalog = createKindCatalog();
  expect(syncContribution(catalog, pluginContribution(manifest)).rejections).toEqual([]);
  const world = createWorldReads({ ...home.deps, kinds: catalog });
  read = (kind, inputs = {}): JsonValue => world.read(kind, inputs, SCOPE).outputs;
});

afterEach(async () => {
  await home.test.close();
});

function publish(stream: string, value: JsonValue, at = AT): void {
  home.test.store.pluginData.publish(PLUGIN, { stream, value, at }, 10);
}

describe('plugin Values', () => {
  it('answer straight from the stored stream point, without a tool call', () => {
    publish('members', { count: 7, names: ['Ann', 'Bo'] });
    expect(read('plugin.chat_hub.members_online')).toEqual({ count: 7, first: 'Ann' });
  });

  it('follow the newest point', () => {
    publish('members', { count: 7, names: ['Ann'] });
    publish('members', { count: 9, names: ['Bo'] }, LATER);
    expect(read('plugin.chat_hub.members_online')).toEqual({ count: 9, first: 'Bo' });
  });

  it('read a live stream point that has not been saved yet', () => {
    home.test.store.pluginData.publishLive(PLUGIN, {
      stream: 'typing',
      value: { count: 2 },
      at: AT,
    });
    expect(read('plugin.chat_hub.typing')).toEqual({ count: 2 });
  });

  it('pick the chosen entity out of a list in the point', () => {
    publish('channels', {
      channels: [
        { id: 'general', people: 4 },
        { id: 'random', people: 1 },
      ],
    });
    expect(read('plugin.chat_hub.channel_online', { channel: 'random' })).toEqual({ people: 1 });
    expect(read('plugin.chat_hub.channel_online', { channel: 'general' })).toEqual({ people: 4 });
  });

  it('fail clearly for an entity that is not in the list or not chosen', () => {
    publish('channels', { channels: [{ id: 'general', people: 4 }] });
    expect(() => read('plugin.chat_hub.channel_online', { channel: 'gone' })).toThrow(
      /no entry for the chosen channel/,
    );
    expect(() => read('plugin.chat_hub.channel_online')).toThrow(/needs channel to be chosen/);
  });

  it('fail when the stream has no point yet', () => {
    expect(() => read('plugin.chat_hub.members_online')).toThrow(/no members reading/);
  });

  it('fail when the plugin is switched off', () => {
    publish('members', { count: 7, names: ['Ann'] });
    home.test.store.plugins.update(PLUGIN, { enabled: false });
    expect(() => read('plugin.chat_hub.members_online')).toThrow(/switched off/);
  });

  it('fail when a declared output is not in the point', () => {
    publish('members', { count: 7 });
    expect(() => read('plugin.chat_hub.ghost')).toThrow(/no \/nothing\/here to read/);
  });

  it('leave a kind nobody declared as something the home cannot be asked', () => {
    expect(() => read('plugin.chat_hub.unknown')).toThrow(/is not something the home can be asked/);
    catalog.remove('plugin:chat-hub');
    expect(() => read('plugin.chat_hub.members_online')).toThrow(
      /is not something the home can be asked/,
    );
  });
});

describe('readPointer', () => {
  const ROOT: JsonValue = { a: [{ 'b/c': 1, 'd~e': null }], '': 'empty' };

  it('walks objects and arrays and decodes escapes', () => {
    expect(readPointer(ROOT, '')).toBe(ROOT);
    expect(readPointer(ROOT, '/a/0/b~1c')).toBe(1);
    expect(readPointer(ROOT, '/a/0/d~0e')).toBeNull();
    expect(readPointer(ROOT, '/')).toBe('empty');
  });

  it('is undefined for anything that is not there', () => {
    expect(readPointer(ROOT, '/a/1')).toBeUndefined();
    expect(readPointer(ROOT, '/a/x')).toBeUndefined();
    expect(readPointer(ROOT, '/a/0/d~0e/deeper')).toBeUndefined();
    expect(readPointer(ROOT, '/toString')).toBeUndefined();
  });
});
