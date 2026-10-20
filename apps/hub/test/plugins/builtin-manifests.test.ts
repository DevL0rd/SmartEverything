import { PLUGIN_MANIFEST } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PLUGINS } from '../../src/plugins/builtin';

describe('builtin plugin manifests', () => {
  it.each(BUILTIN_PLUGINS.map((plugin) => [plugin.manifest.id, plugin] as const))(
    '%s parses as a plugin manifest',
    (_id, plugin) => {
      const parsed = PLUGIN_MANIFEST.safeParse(plugin.manifest);
      expect(parsed.success ? null : parsed.error.issues).toBeNull();
    },
  );

  it('declare the board widgets the app can show in chat', () => {
    const declared = BUILTIN_PLUGINS.flatMap((plugin) =>
      PLUGIN_MANIFEST.parse(plugin.manifest).contributes.widgets.map((widget) => widget.id),
    );
    expect(declared.sort()).toEqual(
      [
        'adguard-blocking',
        'aibi-conversation',
        'aibi-moves',
        'aibi-status',
        'discord.call',
        'router-internet',
        'router-people',
        'syncthing-peers',
        'syncthing-sync',
      ].sort(),
    );
  });

  it('lets Syncthing add a page whose sections read fields of its own snapshot stream', () => {
    const syncthing = BUILTIN_PLUGINS.find((plugin) => plugin.manifest.id === 'syncthing');
    const contributes = PLUGIN_MANIFEST.parse(syncthing?.manifest).contributes;
    const streams = new Set(contributes.data.map((stream) => stream.stream));
    const bodies = [
      ...contributes.widgets.map((widget) => widget.body),
      ...contributes.pages.flatMap((page) => page.sections.map((section) => section.body)),
    ];
    expect(contributes.pages.map((page) => page.id)).toStrictEqual(['overview']);
    expect(
      contributes.widgets.find((widget) => widget.id === 'syncthing-peers')?.sizes,
    ).toStrictEqual(['W']);
    for (const body of bodies) {
      if (body.type === 'controls') continue;
      expect(streams.has(body.value.stream)).toBe(true);
    }
  });

  it('keep the router, Syncthing and AdGuard snapshot streams in memory instead of SQLite per frame', () => {
    const live = BUILTIN_PLUGINS.filter((plugin) =>
      ['router', 'syncthing', 'adguard'].includes(plugin.manifest.id),
    ).map((plugin) => {
      const streams = PLUGIN_MANIFEST.parse(plugin.manifest).contributes.data;
      return [
        plugin.manifest.id,
        streams.find((stream) => stream.stream.endsWith('.snapshot'))?.live,
      ];
    });
    expect(live.sort()).toEqual([
      ['adguard', true],
      ['router', true],
      ['syncthing', true],
    ]);
  });
});
