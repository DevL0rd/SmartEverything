import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AUTOMATION_CATALOG_REPLY,
  PLUGIN_MANIFEST,
  type AutomationCatalogReply,
  type PluginManifest,
} from '@smarteverything/domain';
import {
  createKindCatalog,
  syncContribution,
  type KindCatalog,
} from '../../../src/automations/plugin-kinds/catalog';
import { persistPluginKinds } from '../../../src/automations/plugin-kinds/store';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import type { Caller } from '../../../src/server/auth';
import { automationProgramReadRoutes } from '../../../src/server/handlers/automation-program-reads';
import { captureLogs, testLogger } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';
import { ONLINE_VALUE, POSTED_TRIGGER, POST_NODE, manifestWith } from './fixtures';

const POST = 'plugin.chat_hub.post_message';
const ONLINE = 'plugin.chat_hub.members_online';

function callerOf(role: 'owner' | 'member'): Caller {
  return {
    kind: 'service',
    authority: {
      event_id: randomUUID(),
      profile_id: randomUUID(),
      client_id: null,
      kind: 'service',
      role,
      hub_os_ban: false,
      tools: null,
      plugin_id: null,
      requester: null,
    },
    profileId: randomUUID(),
    chatId: null,
  };
}

function manifestOf(mcp: unknown): PluginManifest {
  return PLUGIN_MANIFEST.parse({ ...manifestWith('chat-hub', {}), mcp });
}

function chatHub(): KindCatalog {
  const catalog = createKindCatalog();
  syncContribution(
    catalog,
    pluginContribution(
      manifestWith('chat-hub', {
        nodes: [POST_NODE],
        triggers: [POSTED_TRIGGER],
        values: [ONLINE_VALUE],
      }),
    ),
  );
  return catalog;
}

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

async function catalogue(
  kinds: KindCatalog,
  query: Record<string, string>,
  role: 'owner' | 'member' = 'owner',
): Promise<AutomationCatalogReply> {
  const routes = automationProgramReadRoutes({
    store: opened.store,
    secrets: { list: (): never[] => [] },
    functions: { list: (): never[] => [] },
    kinds,
  });
  const reply = await routes.listAutomationCatalog.run(
    callerOf(role),
    { params: {}, query, body: undefined, remote: 'test', headers: {} },
    testLogger('catalogue-view'),
  );
  return AUTOMATION_CATALOG_REPLY.parse(reply);
}

describe('the catalogue view of core kinds', () => {
  it('tells the error exit, the run modes and the picker source of each port', async () => {
    const { nodes } = await catalogue(createKindCatalog(), { kind: 'device.set' });
    const [entry] = nodes;
    expect(entry?.fallible).toBe(true);
    expect(entry?.modes).toEqual({
      default: 'fire_and_forget',
      allowed: ['fire_and_forget', 'wait_for_result'],
    });
    expect(entry?.pickers).toMatchObject({
      target: 'ref:target',
      control: 'device.writable_controls',
    });
    expect(entry?.origin).toBeUndefined();
    expect(entry?.available).toBeUndefined();
  });

  it('says a kind that always waits and cannot fail has no choice and no error exit', async () => {
    const { nodes } = await catalogue(createKindCatalog(), { kind: 'flow.wait' });
    expect(nodes.every((entry) => entry.modes?.allowed.length === 1)).toBe(true);
    const sum = await catalogue(createKindCatalog(), { kind: 'math.add' });
    for (const entry of sum.nodes) {
      expect(entry.fallible).toBeUndefined();
      expect(entry.modes).toBeUndefined();
    }
  });

  it('gives every shipped kind a consistent entry', async () => {
    const { nodes } = await catalogue(createKindCatalog(), {});
    expect(nodes.length).toBeGreaterThan(100);
    for (const entry of nodes) {
      if (entry.modes === undefined) continue;
      expect(entry.modes.allowed, entry.kind).toContain(entry.modes.default);
      expect(entry.fallible, entry.kind).toBeTypeOf('boolean');
    }
  });
});

describe('the catalogue view of plugin kinds', () => {
  it('lists the plugin and its availability', async () => {
    const { nodes } = await catalogue(chatHub(), { group: 'plugins' });
    const post = nodes.find((entry) => entry.kind === POST);
    expect(post?.origin).toEqual({ kind: 'plugin', id: 'chat-hub', name: 'Chat hub' });
    expect(post?.available).toBe(true);
    expect(post?.unavailable).toBeUndefined();
    expect(nodes.find((entry) => entry.kind === ONLINE)?.origin?.id).toBe('chat-hub');
  });

  it('gives plugin kinds the same error exit, run mode and picker facts as core kinds', async () => {
    const { nodes } = await catalogue(chatHub(), { group: 'plugins' });
    const post = nodes.find((entry) => entry.kind === POST);
    expect(post?.fallible).toBe(true);
    expect(post?.modes?.allowed).toContain('wait_for_result');
    expect(post?.pickers).toMatchObject({ channel: 'entity:chat-hub.channel' });
    expect(nodes.find((entry) => entry.kind === ONLINE)?.fallible).toBe(false);
  });

  it('lists an owner only plugin node to a member as unavailable with the reason', async () => {
    const { nodes } = await catalogue(chatHub(), { query: 'chat_hub' }, 'member');
    const post = nodes.find((entry) => entry.kind === POST);
    expect(post?.available).toBe(false);
    expect(post?.unavailable).toMatch(/owner/i);
    expect(nodes.find((entry) => entry.kind === ONLINE)?.available).toBe(true);
  });

  it('lists the kinds of a switched off plugin as unavailable instead of hiding them', async () => {
    const kinds = chatHub();
    const stop = persistPluginKinds(kinds, opened.store.pluginKinds, () => new Set());
    stop();
    opened.store.pluginKinds.switchOff('plugin:chat-hub');
    const { nodes } = await catalogue(createKindCatalog(), { group: 'plugins' });
    const post = nodes.find((entry) => entry.kind === POST);
    expect(post?.available).toBe(false);
    expect(post?.unavailable).toMatch(/switched off/i);
    expect(post?.origin?.name).toBe('Chat hub');
  });

  it('lists the kinds of a disabled plugin whose kinds are still loaded as unavailable', async () => {
    const manifest = manifestOf(null);
    opened.store.plugins.create({ manifest, source: 'local', location: '/tmp/x', trusted: true });
    opened.store.plugins.update('chat-hub', { enabled: false });
    const { nodes } = await catalogue(chatHub(), { kind: ONLINE });
    expect(nodes[0]?.available).toBe(false);
    expect(nodes[0]?.unavailable).toMatch(/switched off/i);
  });

  it('lists the kinds of an external local process plugin as unavailable', async () => {
    const manifest = manifestOf({ transport: 'stdio', command: 'chat-hub' });
    opened.store.plugins.create({ manifest, source: 'local', location: '/tmp/x', trusted: true });
    opened.store.plugins.update('chat-hub', { enabled: true });
    const { nodes } = await catalogue(chatHub(), { kind: ONLINE });
    expect(nodes[0]?.available).toBe(false);
    expect(nodes[0]?.unavailable).toMatch(/external local process/i);
  });

  it('keeps a built in plugin with a local transport available', async () => {
    const manifest = manifestOf({ transport: 'stdio', command: 'chat-hub' });
    opened.store.plugins.create({
      manifest,
      source: 'builtin',
      location: 'builtin',
      trusted: true,
    });
    opened.store.plugins.update('chat-hub', { enabled: true });
    const { nodes } = await catalogue(chatHub(), { kind: ONLINE });
    expect(nodes[0]?.available).toBe(true);
  });
});
