import { describe, expect, it } from 'vitest';
import { pluginAdds, pluginPowers } from '../src/plugin-powers';
import { PLUGIN_MANIFEST } from '../src/plugins';

function manifest(
  extra: Readonly<Record<string, unknown>>,
): ReturnType<typeof PLUGIN_MANIFEST.parse> {
  return PLUGIN_MANIFEST.parse({
    id: 'sample',
    name: 'Sample',
    version: '1.0.0',
    description: 'A sample',
    publisher: 'Home',
    ...extra,
  });
}

describe('pluginPowers', () => {
  it('lists nothing for a plugin that asks for nothing', () => {
    expect(pluginPowers(manifest({}))).toStrictEqual([]);
  });

  it('lists each power the plugin asks for in words', () => {
    const powers = pluginPowers(
      manifest({
        permissions: {
          inbound: true,
          voice: true,
          seAreas: ['home'],
          listen: [
            { protocol: 'tcp', port: 8080, purpose: 'Web' },
            { protocol: 'udp', port: 5353, purpose: 'Discovery' },
          ],
        },
      }),
    );
    expect(powers).toStrictEqual([
      'Post messages into your AI chats',
      'Start voice conversations with your AI',
      'Listen on your home network: TCP 8080, UDP 5353',
      expect.stringMatching(/^Use SmartEverything tools: .+/),
    ]);
  });
});

describe('pluginAdds', () => {
  it('lists nothing for a plugin that contributes nothing', () => {
    expect(pluginAdds(manifest({}))).toStrictEqual([]);
  });

  it('counts what the plugin adds with the right singular or plural', () => {
    const adds = pluginAdds(
      manifest({
        contributes: {
          widgets: [
            {
              id: 'one',
              title: 'One',
              icon: 'gauge',
              sizes: ['W'],
              body: { type: 'figure', value: { stream: 'where' }, caption: null },
            },
          ],
          events: [
            { kind: 'a', title: 'A' },
            { kind: 'b', title: 'B' },
          ],
          deviceFamilies: ['lamp'],
          search: 'push',
        },
      }),
    );
    expect(adds).toStrictEqual([
      '1 widget',
      '2 automation triggers',
      '1 kind of device',
      'Search results',
    ]);
  });
});
