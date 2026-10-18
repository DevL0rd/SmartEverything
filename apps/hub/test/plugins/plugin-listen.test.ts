import { createSocket } from 'node:dgram';
import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { PLUGIN_MANIFEST, PLUGIN_ROW, type PluginRow } from '@smarteverything/domain';
import { wizPlugin } from '../../src/plugins/builtin/wiz';
import { networkOf, PluginBindError, portNeedsOf } from '../../src/plugins/plugin-listen';

interface Tracker {
  readonly stops: (() => void)[];
  readonly track: (stop: () => void) => () => void;
}

function tracker(): Tracker {
  const stops: (() => void)[] = [];
  return {
    stops,
    track: (stop): (() => void) => {
      stops.push(stop);
      return stop;
    },
  };
}

describe('plugin network', () => {
  it('opens a UDP port on any address and closes it when the plugin stops', async () => {
    const { stops, track } = tracker();
    const socket = await networkOf(track).listenUdp(0, '127.0.0.1');
    expect(socket.address().port).toBeGreaterThan(0);
    expect(stops).toHaveLength(1);
    stops[0]?.();
    expect(() => socket.address()).toThrow();
  });

  it('opens a TCP port and closes it when the plugin stops', async () => {
    const { stops, track } = tracker();
    const server = await networkOf(track).listenTcp(0, '127.0.0.1');
    expect(server.listening).toBe(true);
    stops[0]?.();
    await new Promise((resolve) => server.once('close', resolve));
    expect(server.listening).toBe(false);
  });

  it('explains a port another program already uses', async () => {
    const taken = createSocket('udp4');
    await new Promise<void>((resolve) => taken.bind(0, '127.0.0.1', resolve));
    const { track } = tracker();
    const failure = await networkOf(track)
      .listenUdp(taken.address().port, '127.0.0.1')
      .catch((cause: unknown) => cause);
    taken.close();
    expect(failure).toBeInstanceOf(PluginBindError);
    expect(failure instanceof Error ? failure.message : '').toContain(
      'already used by another program',
    );
  });

  it('explains an address the computer does not have', async () => {
    const { track } = tracker();
    const failure = await networkOf(track)
      .listenTcp(0, '203.0.113.9')
      .catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(PluginBindError);
    expect(failure instanceof Error ? failure.message : '').toContain(
      'is not an address of this computer',
    );
  });

  it('passes any other bind failure through unchanged', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { track } = tracker();
    const failure = await networkOf(track)
      .listenTcp(0, 'not an address')
      .catch((cause: unknown) => cause);
    server.close();
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(PluginBindError);
  });
});

describe('plugin port needs', () => {
  const row = (id: string, enabled: boolean): PluginRow =>
    PLUGIN_ROW.parse({
      id,
      manifest: PLUGIN_MANIFEST.parse({ ...wizPlugin.manifest, id }),
      source: 'builtin',
      location: null,
      enabled,
      trusted: true,
      status: 'running',
      status_detail: null,
      tool_switches: {},
      settings: {},
      secret_names: [],
      icon_url: null,
      installed_at: '2026-10-17T10:00:00.000Z',
      updated_at: '2026-10-17T10:00:00.000Z',
    });

  it('lists the ports of enabled plugins only', () => {
    expect(portNeedsOf([row('wiz', true), row('other', false)])).toEqual([
      { pluginId: 'wiz', protocol: 'udp', port: 38899 },
      { pluginId: 'wiz', protocol: 'udp', port: 38900 },
    ]);
  });
});
