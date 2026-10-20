import { describe, expect, it } from 'vitest';
import {
  PLUGIN_MANIFEST,
  WIDGET_SPEC,
  pluginChatKey,
  pluginIdOfChat,
  pluginSignalSource,
  pluginSignalSpec,
  pluginStreamKey,
  pluginToolName,
} from '../src/plugins';

const MANIFEST = PLUGIN_MANIFEST.parse({
  id: 'door-bell',
  name: 'Door bell',
  version: '1.0.0',
  description: 'Rings',
  publisher: 'Home',
  contributes: {
    events: [
      { kind: 'pressed', title: 'Pressed', fields: { floor: 'number', side: 'string' } },
      { kind: 'idle', title: 'Idle' },
    ],
  },
});

describe('plugin names', () => {
  it('joins plugin and tool with the separator', () => {
    expect(pluginToolName('door-bell', 'ring')).toBe('door-bell__ring');
  });

  it('keys a stream by plugin and stream', () => {
    expect(pluginStreamKey('door-bell', 'level')).toBe('door-bell/level');
  });

  it('turns dashes into underscores for the signal source', () => {
    expect(pluginSignalSource('door-bell')).toBe('plugin_door_bell');
  });
});

describe('pluginSignalSpec', () => {
  it('offers each declared event as a pulse with its fields as match keys', () => {
    expect(pluginSignalSpec(MANIFEST)).toStrictEqual({
      source: 'plugin_door_bell',
      label: 'Door bell',
      kinds: [
        {
          kind: 'pressed',
          label: 'Pressed',
          subject: 'none',
          fields: [],
          match: [
            { key: 'floor', label: 'floor', values: null },
            { key: 'side', label: 'side', values: null },
          ],
          pulse: true,
          feed: true,
        },
        {
          kind: 'idle',
          label: 'Idle',
          subject: 'none',
          fields: [],
          match: [],
          pulse: true,
          feed: true,
        },
      ],
    });
  });
});

describe('plugin events in the activity feed', () => {
  it('defaults to the feed and lets a manifest keep one event out', () => {
    const manifest = PLUGIN_MANIFEST.parse({
      ...MANIFEST,
      contributes: {
        events: [
          { kind: 'seen', title: 'Seen' },
          { kind: 'quiet', title: 'Quiet', feed: false },
        ],
      },
    });
    expect(pluginSignalSpec(manifest).kinds.map((kind) => [kind.kind, kind.feed])).toStrictEqual([
      ['seen', true],
      ['quiet', false],
    ]);
  });
});

describe('plugin chats', () => {
  it('recovers the plugin id from the chat key it built', () => {
    const source_key = pluginChatKey('door-bell', 'room:1');
    expect(source_key).toBe('plugin:door-bell:room:1');
    expect(pluginIdOfChat({ kind: 'plugin', source_key })).toBe('door-bell');
  });

  it.each([
    { kind: 'direct', source_key: 'plugin:door-bell:a' },
    { kind: 'plugin', source_key: null },
    { kind: 'plugin', source_key: 'other:door-bell:a' },
    { kind: 'plugin', source_key: 'plugin:door-bell' },
    { kind: 'plugin', source_key: 'plugin::a' },
    { kind: 'plugin', source_key: 'plugin:Bad_Id:a' },
  ])('finds no plugin in %j', (chat) => {
    expect(pluginIdOfChat(chat)).toBeNull();
  });
});

describe('WIDGET_SPEC', () => {
  it('drops repeated sizes and maps a retired size to its replacement', () => {
    const spec = WIDGET_SPEC.parse({
      id: 'level',
      title: 'Level',
      icon: 'gauge',
      sizes: ['M', 'S', 'W', 'W'],
      body: { type: 'figure', value: { stream: 'where' }, caption: null },
    });
    expect(spec.sizes).toStrictEqual(['M', 'W']);
  });
});
