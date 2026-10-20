import {
  PLUGIN_MANIFEST,
  createClientToken,
  hashClientToken,
  liveProtocols,
  type HubStatus,
  type LiveChange,
  type PluginManifest,
  type PluginManifestInput,
} from '@smarteverything/domain';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import WebSocket from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boardTypes } from '../../src/chat-widgets/boards';
import { LiveHub } from '../../src/server/live';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { until } from '../support/wait';

let opened: TestStore;
let seen: LiveChange[];
let stop: () => void;

beforeEach(async () => {
  opened = await testStore();
  seen = [];
  stop = opened.store.feed.subscribe((change) => seen.push(change));
});

afterEach(async () => {
  stop();
  await opened.close();
});

const FIGURE = { type: 'figure', value: { stream: 'level' }, caption: null } as const;

function manifestOf(
  id: string,
  extra: NonNullable<PluginManifestInput['contributes']> = {},
): PluginManifest {
  return PLUGIN_MANIFEST.parse({
    id,
    name: `Plugin ${id}`,
    version: '1.0.0',
    description: 'A plugin with extensions',
    publisher: 'Test',
    mcp: { transport: 'http', url: 'https://example.com/mcp', bearer: 'secret-bearer' },
    permissions: { seAreas: ['home'], inbound: true },
    contributes: {
      data: [{ stream: 'level', title: 'Level', schema: { type: 'object' }, history: 0 }],
      widgets: [{ id: 'level', title: 'Level', icon: 'gauge', sizes: ['W'], body: FIGURE }],
      pages: [
        {
          id: 'overview',
          title: 'Overview',
          icon: 'gauge',
          sections: [{ title: 'Now', body: FIGURE }],
        },
      ],
      ...extra,
    },
  });
}

function install(id: string, enabled: boolean): void {
  const { store } = opened;
  store.plugins.create({
    manifest: manifestOf(id),
    source: 'local',
    location: null,
    trusted: true,
  });
  store.plugins.update(id, { enabled, settings: { apiKey: 'secret-setting' } });
}

function uiChanges(): LiveChange[] {
  return seen.filter((change) => change.table === 'plugin_ui');
}

describe('the plugin_ui rows', () => {
  it('hold the widgets and pages of enabled plugins and nothing else of the plugin', () => {
    install('garden', true);
    install('pool', false);
    const rows = opened.store.plugins.ui();
    expect(rows.map((row) => row.id)).toStrictEqual(['garden']);
    const [row] = rows;
    expect(Object.keys(row ?? {}).sort()).toStrictEqual([
      'icon_url',
      'id',
      'name',
      'pages',
      'tools_off',
      'widgets',
    ]);
    expect(row?.widgets.map((widget) => widget.id)).toStrictEqual(['level']);
    expect(row?.pages.map((page) => page.id)).toStrictEqual(['overview']);
    expect(JSON.stringify(rows)).not.toContain('secret');
  });

  it('appear when a plugin is switched on and go when it is switched off', () => {
    install('garden', false);
    expect(uiChanges()).toStrictEqual([]);
    opened.store.plugins.update('garden', { enabled: true });
    expect(uiChanges().map((change) => change.operation)).toStrictEqual(['INSERT']);
    opened.store.plugins.update('garden', { enabled: false });
    const [, removed] = uiChanges();
    expect(removed?.operation).toBe('DELETE');
    expect(removed?.record).toBeNull();
    expect(removed?.oldRecord).toMatchObject({ id: 'garden' });
  });

  it('go when the plugin is removed while it is on', () => {
    install('garden', true);
    seen.length = 0;
    opened.store.plugins.remove('garden');
    expect(uiChanges().map((change) => change.operation)).toStrictEqual(['DELETE']);
  });

  it('change when the manifest brings a new page and stay silent for a status change', () => {
    install('garden', true);
    seen.length = 0;
    opened.store.plugins.update('garden', { status: 'running', statusDetail: null });
    opened.store.plugins.update('garden', { settings: { other: true } });
    expect(uiChanges()).toStrictEqual([]);
    opened.store.plugins.update('garden', {
      manifest: manifestOf('garden', {
        pages: [
          {
            id: 'overview',
            title: 'Overview',
            icon: 'gauge',
            sections: [{ title: 'Now', body: FIGURE }],
          },
          { id: 'more', title: 'More', icon: 'gauge', sections: [{ title: 'Then', body: FIGURE }] },
        ],
      }),
    });
    const [changed] = uiChanges();
    expect(changed?.operation).toBe('UPDATE');
    expect(
      changed?.table === 'plugin_ui' && changed.record?.pages.map((page) => page.id),
    ).toStrictEqual(['overview', 'more']);
  });
});

describe('the tools switched off in a plugin_ui row', () => {
  const BUTTON = { kind: 'button', label: 'Water now', tool: 'water' } as const;
  const FLOW = {
    kind: 'slider',
    label: 'Flow',
    tool: 'set_flow',
    value: { stream: 'level' },
    arg: 'percent',
    min: 0,
    max: 100,
    step: 5,
  } as const;

  function installControls(): void {
    opened.store.plugins.create({
      manifest: manifestOf('garden', {
        widgets: [
          {
            id: 'valves',
            title: 'Valves',
            icon: 'gauge',
            sizes: ['W'],
            body: { type: 'controls', items: [BUTTON] },
          },
        ],
        pages: [
          {
            id: 'overview',
            title: 'Overview',
            icon: 'gauge',
            sections: [{ title: 'Flow', body: { type: 'controls', items: [FLOW, BUTTON] } }],
          },
        ],
      }),
      source: 'local',
      location: null,
      trusted: true,
    });
    opened.store.plugins.update('garden', { enabled: true });
  }

  it('list the control tools that are switched off and nothing else of the switches', () => {
    installControls();
    expect(opened.store.plugins.ui()[0]?.tools_off).toStrictEqual([]);
    opened.store.plugins.update('garden', {
      toolSwitches: { water: false, set_flow: true, unrelated: false },
    });
    expect(opened.store.plugins.ui()[0]?.tools_off).toStrictEqual(['water']);
    expect(JSON.stringify(opened.store.plugins.ui())).not.toContain('unrelated');
  });

  it('send an update when a tool is switched off and again when it is switched on', () => {
    installControls();
    seen.length = 0;
    opened.store.plugins.update('garden', { toolSwitches: { water: false } });
    opened.store.plugins.update('garden', { toolSwitches: { water: true } });
    const offered = uiChanges().map((change) =>
      change.table === 'plugin_ui' ? [change.operation, change.record?.tools_off] : null,
    );
    expect(offered).toStrictEqual([
      ['UPDATE', ['water']],
      ['UPDATE', []],
    ]);
  });

  it('stay silent when a switch changes for a tool no control uses', () => {
    installControls();
    seen.length = 0;
    opened.store.plugins.update('garden', { toolSwitches: { other: false } });
    expect(uiChanges()).toStrictEqual([]);
  });
});

describe('the board types of the AI', () => {
  it('qualify a widget id with its plugin id and keep one that already starts with it', () => {
    install('garden', true);
    opened.store.plugins.create({
      manifest: manifestOf('router', {
        widgets: [
          { id: 'router-internet', title: 'Internet', icon: 'globe', sizes: ['W'], body: FIGURE },
        ],
      }),
      source: 'local',
      location: null,
      trusted: true,
    });
    opened.store.plugins.update('router', { enabled: true });
    expect(boardTypes(opened.store)).toStrictEqual(['garden.level', 'router-internet']);
  });
});

describe('a live connection', () => {
  let hub: LiveHub;
  let http: Server;
  const sockets: WebSocket[] = [];

  beforeEach(async () => {
    hub = new LiveHub({
      store: opened.store,
      status: (): HubStatus => ({
        version: 'test',
        startedAt: '2026-10-08T10:00:00.000Z',
        cameras: 'running',
      }),
      log: testLogger('live'),
    });
    http = createServer();
    http.on('upgrade', (request, socket, head) => {
      hub.upgrade(request, socket, head);
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  });

  afterEach(() => {
    sockets.splice(0).forEach((socket) => {
      socket.terminate();
    });
    hub.stop();
    http.close();
  });

  async function connect(role: 'owner' | 'member'): Promise<string[]> {
    const token = createClientToken();
    opened.store.clients.create(
      { name: role, platform: 'android', role, tokenHash: hashClientToken(token) },
      role === 'owner',
    );
    const address = http.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/live`, [...liveProtocols(token)]);
    sockets.push(socket);
    const tables: string[] = [];
    let subscribed = false;
    socket.on('message', (data: Buffer) => {
      const message: unknown = JSON.parse(data.toString('utf8'));
      if (typeof message !== 'object' || message === null || !('type' in message)) return;
      if (message.type === 'subscribed') subscribed = true;
      if (message.type === 'change' && 'table' in message) tables.push(String(message.table));
    });
    await once(socket, 'open');
    socket.send(
      JSON.stringify({ type: 'subscribe', tables: ['plugins', 'plugin_ui'], streams: [] }),
    );
    await until(() => subscribed, 'the subscription to be confirmed');
    return tables;
  }

  it('gives a member the plugin_ui rows and never the plugins, and an owner both', async () => {
    const member = await connect('member');
    const owner = await connect('owner');
    install('garden', true);
    await until(
      () => owner.includes('plugins') && owner.includes('plugin_ui'),
      'the owner to hear',
    );
    await until(() => member.includes('plugin_ui'), 'the member to hear');
    expect(member).not.toContain('plugins');
  });
});
