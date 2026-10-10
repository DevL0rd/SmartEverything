import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import {
  PLUGIN_MANIFEST,
  hashMcpToken,
  type InboundMessage,
  type PluginStatus,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ToolCaller } from '../../src/ai-tools/hub-tool';
import { PluginHost } from '../../src/plugins/host';
import { PluginSecrets } from '../../src/plugins/plugin-secrets';
import { SecretStore } from '../../src/secrets/store';
import type { Store } from '../../src/store/store';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { writeFakePlugin } from './fake-plugin';

const CALLER: ToolCaller = {
  profileId: 'p1',
  role: 'owner',
  chatId: null,
  via: 'app',
  clientId: null,
};

const ECHOED = z.strictObject({ said: z.string(), url: z.string(), token: z.string() });

function nothing(): void {
  return undefined;
}

function now(): Date {
  return new Date();
}

interface Rig {
  readonly host: PluginHost;
  readonly messages: InboundMessage[];
}

let opened: TestStore | null = null;
let rig: Rig | null = null;

function storeOf(): Store {
  if (opened === null) {
    throw new Error('no store');
  }
  return opened.store;
}

function statusOf(id: string): PluginStatus {
  return storeOf().plugins.byId(id).status;
}

function reaches(id: string, wanted: PluginStatus): Promise<void> {
  return new Promise((resolve) => {
    if (statusOf(id) === wanted) {
      resolve();
      return;
    }
    const stop = storeOf().feed.subscribe(() => {
      if (statusOf(id) === wanted) {
        stop();
        resolve();
      }
    });
  });
}

async function addPlugin(inbound: boolean): Promise<string> {
  const store = storeOf();
  const script = await writeFakePlugin(opened?.directory ?? '');
  const manifest = PLUGIN_MANIFEST.parse({
    id: 'fake',
    name: 'Fake',
    version: '1.0.0',
    description: 'A plugin for tests',
    publisher: 'Tests',
    mcp: { transport: 'stdio', command: process.execPath, args: [script] },
    permissions: { seAreas: ['devices'], inbound },
  });
  store.plugins.create({ manifest, source: 'local', location: null, trusted: true });
  store.plugins.update('fake', { enabled: true });
  return 'fake';
}

async function rigged(): Promise<Rig> {
  const store = storeOf();
  const directory = opened?.directory ?? '';
  const secrets = await SecretStore.open(join(directory, 'secrets'), randomBytes(32));
  const messages: InboundMessage[] = [];
  const host = new PluginHost({
    store,
    secrets: new PluginSecrets(secrets),
    builtins: [],
    builtin: {
      drivers: {
        registry: { register: (): (() => void) => nothing },
        viewers: { watch: (): (() => void) => nothing, watched: (): boolean => false },
        metrics: { push: nothing },
        deviceIdOf: (): undefined => undefined,
        target: (deviceId): string => `device:${deviceId}`,
      },
      now,
    },
    contributions: {
      signals: { emit: nothing, register: (): (() => void) => nothing },
      inbound: (_pluginId, message): void => {
        messages.push(message);
      },
      now,
    },
    configure: (): Promise<void> => Promise.resolve(),
    dataDirectory: directory,
    mcpUrl: (): string => 'http://127.0.0.1:1',
    now,
    log: testLogger('plugins'),
  });
  return { host, messages };
}

beforeEach(async () => {
  opened = await testStore();
  rig = await rigged();
});

afterEach(async () => {
  await rig?.host.shutdown();
  await opened?.close();
  rig = null;
  opened = null;
});

function hostOf(): Rig {
  if (rig === null) {
    throw new Error('no host');
  }
  return rig;
}

describe('plugin host', () => {
  it('starts a stdio plugin, lists and calls its tools with a scoped plugin key', async () => {
    const id = await addPlugin(true);
    await hostOf().host.launch(id);
    expect(statusOf(id)).toBe('running');
    expect(
      hostOf()
        .host.running()
        .map((entry) => entry.tool.name),
    ).toStrictEqual(['echo', 'crash']);
    const result = await hostOf().host.call(id, 'echo', { text: 'hi' }, CALLER);
    const echoed = ECHOED.parse(JSON.parse(String(result.response['text'])));
    expect(echoed).toMatchObject({ said: 'hi', url: 'http://127.0.0.1:1/mcp' });
    expect(storeOf().plugins.tokenByHash(hashMcpToken(echoed.token))).toStrictEqual({
      pluginId: id,
      areas: ['devices'],
    });
  });

  it('hands a chat message over only when the plugin may post into chats', async () => {
    const id = await addPlugin(true);
    await hostOf().host.launch(id);
    await expect.poll(() => hostOf().messages.length).toBe(1);
    expect(hostOf().messages[0]?.conversation.key).toBe('general');
  });

  it('ignores chat messages from a plugin without the inbound power', async () => {
    const id = await addPlugin(false);
    await hostOf().host.launch(id);
    await expect
      .poll(() =>
        hostOf()
          .host.slot(id)
          ?.logs.read()
          .map((entry) => entry.line)
          .join('\n'),
      )
      .toContain('ready');
    expect(hostOf().messages).toStrictEqual([]);
  });

  it('shows a crash and starts the plugin again after a second', async () => {
    const id = await addPlugin(true);
    await hostOf().host.launch(id);
    const crashed = reaches(id, 'crashed');
    await hostOf()
      .host.call(id, 'crash', {}, CALLER)
      .catch(() => undefined);
    await crashed;
    expect(hostOf().host.running()).toStrictEqual([]);
    await reaches(id, 'running');
    expect(hostOf().host.running()).toHaveLength(2);
  });

  it('stops the plugin and drops its key when switched off', async () => {
    const id = await addPlugin(true);
    await hostOf().host.launch(id);
    storeOf().plugins.update(id, { enabled: false });
    await hostOf().host.halt(id);
    expect(statusOf(id)).toBe('disabled');
    expect(hostOf().host.running()).toStrictEqual([]);
  });
});
