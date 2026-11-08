import { DatabaseSync } from 'node:sqlite';
import {
  MCP_TOOL_AREAS,
  TEMPLATE_SCOPES,
  createClientToken,
  hashClientToken,
  type ClientRow,
  type LiveChange,
  type NodeKind,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createKindCatalog, syncContribution } from '../../../src/automations/plugin-kinds/catalog';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import {
  PluginKindStore,
  kindOwnerOf,
  persistPluginKinds,
} from '../../../src/automations/plugin-kinds/store';
import { visible } from '../../../src/server/live-visibility';
import { migrate } from '../../../src/store/migrate';
import { MIGRATIONS } from '../../../src/store/migrations';
import { ChangeFeed } from '../../../src/store/feed';
import { StoreContext } from '../../../src/store/context';
import { Sql } from '../../../src/store/sql';
import { captureLogs, testLogger } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';
import { ONLINE_VALUE, POSTED_TRIGGER, POST_NODE, manifestWith } from './fixtures';

const FIRST = '2026-10-25T10:00:00.000Z';
const SECOND = '2026-10-25T11:00:00.000Z';

let clock = new Date(FIRST);
let logs = captureLogs();

interface Rig {
  readonly store: PluginKindStore;
  readonly changes: LiveChange[];
  readonly database: DatabaseSync;
}

function rig(): Rig {
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, FIRST, testLogger());
  const feed = new ChangeFeed(testLogger());
  const changes: LiveChange[] = [];
  feed.subscribe((change) => {
    changes.push(change);
  });
  return {
    store: new PluginKindStore(new StoreContext(sql, feed, () => clock)),
    changes,
    database,
  };
}

function statusesOf(store: PluginKindStore): Record<string, string> {
  return Object.fromEntries(store.all().map((row) => [row.kind_id, row.status]));
}

function valueKinds(id: string): readonly NodeKind[] {
  const catalog = createKindCatalog();
  syncContribution(
    catalog,
    pluginContribution(manifestWith(id, { values: [ONLINE_VALUE], autoTriggers: false })),
  );
  return catalog.kinds().filter((kind) => kind.origin?.id === id);
}

function chatKinds(
  id = 'chat-hub',
  node: Readonly<Record<string, unknown>> = POST_NODE,
): readonly NodeKind[] {
  const catalog = createKindCatalog();
  syncContribution(
    catalog,
    pluginContribution(manifestWith(id, { nodes: [node], triggers: [POSTED_TRIGGER] })),
  );
  return catalog.kinds().filter((kind) => kind.origin?.id === id);
}

beforeEach(() => {
  clock = new Date(FIRST);
  logs = captureLogs();
});

describe('PluginKindStore.publish', () => {
  it('stores every kind as an active row with its interface hash and declaration', () => {
    const { store, changes } = rig();
    const kinds = chatKinds();
    const result = store.publish('plugin:chat-hub', kinds);
    expect(result).toStrictEqual({ inserted: 2, updated: 0, retired: 0, rejected: [] });
    const rows = store.forOwner('plugin:chat-hub');
    expect(rows.map((row) => row.kind_id)).toStrictEqual([
      'plugin.chat_hub.post_message',
      'trigger.plugin.chat_hub.message_posted',
    ]);
    for (const row of rows) {
      expect(row.status).toBe('active');
      expect(row.version).toBe('1');
      expect(row.updated).toBe(FIRST);
      expect(row.interface_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.declaration).toStrictEqual(kinds.find((kind) => kind.id === row.kind_id));
    }
    expect(changes.map((change) => [change.table, change.operation])).toStrictEqual([
      ['automation_plugin_kinds', 'INSERT'],
      ['automation_plugin_kinds', 'INSERT'],
    ]);
  });

  it('writes nothing when the declaration is unchanged and keeps its stamp', () => {
    const { store, changes } = rig();
    store.publish('plugin:chat-hub', chatKinds());
    changes.length = 0;
    clock = new Date(SECOND);
    expect(store.publish('plugin:chat-hub', chatKinds())).toMatchObject({
      inserted: 0,
      updated: 0,
      retired: 0,
    });
    expect(changes).toStrictEqual([]);
    expect(store.all().every((row) => row.updated === FIRST)).toBe(true);
  });

  it('updates the row when the declaration changes and the hash only when the interface does', () => {
    const { store, changes } = rig();
    store.publish('plugin:chat-hub', chatKinds());
    const before = store.all().find((row) => row.kind_id === 'plugin.chat_hub.post_message');
    changes.length = 0;
    clock = new Date(SECOND);
    const reworded = { ...POST_NODE, description: 'Sends a message to a channel.' };
    store.publish('plugin:chat-hub', chatKinds('chat-hub', reworded));
    const reworded_row = store.all().find((row) => row.kind_id === 'plugin.chat_hub.post_message');
    expect(reworded_row?.interface_hash).toBe(before?.interface_hash);
    expect(reworded_row?.declaration.description).toBe('Sends a message to a channel.');
    expect(reworded_row?.updated).toBe(SECOND);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ operation: 'UPDATE' });
    const widened = {
      ...POST_NODE,
      inputs: [
        ...POST_NODE.inputs,
        { name: 'silent', title: 'Silent', type: { t: 'text' }, required: false, description: 'x' },
      ],
    };
    store.publish('plugin:chat-hub', chatKinds('chat-hub', widened));
    const widened_row = store.all().find((row) => row.kind_id === 'plugin.chat_hub.post_message');
    expect(widened_row?.interface_hash).not.toBe(before?.interface_hash);
  });

  it('retires a kind the new version no longer declares and leaves other owners alone', () => {
    const { store, changes } = rig();
    store.publish('plugin:chat-hub', chatKinds());
    store.publish('plugin:other', valueKinds('other'));
    changes.length = 0;
    clock = new Date(SECOND);
    const [node] = chatKinds().filter((kind) => kind.class === 'effect');
    const result = store.publish('plugin:chat-hub', node === undefined ? [] : [node]);
    expect(result.retired).toBe(1);
    const statuses = Object.fromEntries(
      store.all().map((row) => [row.kind_id, [row.status, row.updated]]),
    );
    expect(statuses['trigger.plugin.chat_hub.message_posted']).toStrictEqual(['retired', SECOND]);
    expect(statuses['plugin.chat_hub.post_message']).toStrictEqual(['active', FIRST]);
    expect(statuses['plugin.other.members_online']).toStrictEqual(['active', FIRST]);
    expect(changes).toHaveLength(1);
  });

  it('brings a retired kind back to active when it is declared again', () => {
    const { store } = rig();
    store.publish('plugin:chat-hub', chatKinds());
    store.publish('plugin:chat-hub', []);
    expect(store.forOwner('plugin:chat-hub').map((row) => row.status)).toStrictEqual([
      'retired',
      'retired',
    ]);
    clock = new Date(SECOND);
    store.publish('plugin:chat-hub', chatKinds());
    expect(store.forOwner('plugin:chat-hub').map((row) => row.status)).toStrictEqual([
      'active',
      'active',
    ]);
  });

  it('refuses kinds that belong to another owner', () => {
    const { store } = rig();
    expect(() => store.publish('plugin:other', chatKinds())).toThrow(/does not belong/);
    expect(store.all()).toStrictEqual([]);
  });

  it('rejects a kind that cannot be stored, logs it and still stores the rest', () => {
    const { store } = rig();
    const [node, trigger] = chatKinds();
    if (node === undefined || trigger === undefined) throw new Error('two kinds were assembled');
    const withFunction: NodeKind = { ...trigger, reads: () => [] };
    const result = store.publish('plugin:chat-hub', [node, withFunction]);
    expect(result.inserted).toBe(1);
    expect(result.rejected.map((entry) => entry.kindId)).toStrictEqual([trigger.id]);
    expect(store.all().map((row) => row.kind_id)).toStrictEqual([node.id]);
    expect(logs.events()).toContain('plugin_kinds.row_rejected');
  });
});

describe('PluginKindStore.switchOff', () => {
  it('marks active rows off, leaves retired rows and comes back on the next publish', () => {
    const { store, changes } = rig();
    store.publish('plugin:chat-hub', chatKinds());
    const [node] = chatKinds().filter((kind) => kind.class === 'effect');
    store.publish('plugin:chat-hub', node === undefined ? [] : [node]);
    changes.length = 0;
    clock = new Date(SECOND);
    expect(store.switchOff('plugin:chat-hub')).toBe(1);
    expect(Object.fromEntries(store.all().map((row) => [row.kind_id, row.status]))).toStrictEqual({
      'plugin.chat_hub.post_message': 'off',
      'trigger.plugin.chat_hub.message_posted': 'retired',
    });
    expect(changes).toHaveLength(1);
    expect(store.switchOff('plugin:chat-hub')).toBe(0);
    store.publish('plugin:chat-hub', node === undefined ? [] : [node]);
    expect(store.forOwner('plugin:chat-hub').map((row) => row.status)).toStrictEqual([
      'active',
      'retired',
    ]);
  });
});

describe('persistPluginKinds', () => {
  it('writes the rows when a plugin syncs and marks them off when it is removed', () => {
    const { store } = rig();
    const catalog = createKindCatalog();
    const stop = persistPluginKinds(catalog, store, () => new Set());
    syncContribution(
      catalog,
      pluginContribution(
        manifestWith('chat-hub', {
          nodes: [POST_NODE],
          values: [ONLINE_VALUE],
          autoTriggers: false,
        }),
      ),
    );
    syncContribution(
      catalog,
      pluginContribution(manifestWith('other', { values: [ONLINE_VALUE], autoTriggers: false })),
    );
    expect(statusesOf(store)).toStrictEqual({
      'plugin.chat_hub.members_online': 'active',
      'plugin.chat_hub.post_message': 'active',
      'plugin.other.members_online': 'active',
    });
    catalog.remove('plugin:chat-hub');
    expect(statusesOf(store)).toStrictEqual({
      'plugin.chat_hub.members_online': 'off',
      'plugin.chat_hub.post_message': 'off',
      'plugin.other.members_online': 'active',
    });
    syncContribution(
      catalog,
      pluginContribution(
        manifestWith('chat-hub', {
          nodes: [POST_NODE],
          values: [ONLINE_VALUE],
          autoTriggers: false,
        }),
      ),
    );
    expect(store.forOwner('plugin:chat-hub').map((row) => row.status)).toStrictEqual([
      'active',
      'active',
    ]);
    stop();
    catalog.remove('plugin:other');
    expect(store.forOwner('plugin:other').map((row) => row.status)).toStrictEqual(['active']);
  });

  it('stores what the catalog already holds when it is bound and touches no plugin that has not loaded', () => {
    const { store } = rig();
    store.publish('plugin:asleep', valueKinds('asleep'));
    const catalog = createKindCatalog();
    syncContribution(
      catalog,
      pluginContribution(manifestWith('chat-hub', { nodes: [POST_NODE], autoTriggers: false })),
    );
    persistPluginKinds(catalog, store, () => new Set());
    expect(store.forOwner('plugin:chat-hub')).toHaveLength(1);
    expect(store.forOwner('plugin:asleep').map((row) => row.status)).toStrictEqual(['active']);
  });

  it('logs a failed write and keeps the catalog working', () => {
    const { store, database } = rig();
    const catalog = createKindCatalog();
    persistPluginKinds(catalog, store, () => new Set());
    database.exec('drop table automation_plugin_kinds');
    expect(() => {
      syncContribution(
        catalog,
        pluginContribution(manifestWith('chat-hub', { nodes: [POST_NODE] })),
      );
    }).not.toThrow();
    expect(logs.events()).toContain('plugin_kinds.persist_failed');
    expect(catalog.get('plugin.chat_hub.post_message')).toBeDefined();
  });
});

describe('the live table', () => {
  let opened: TestStore;

  beforeEach(async () => {
    opened = await testStore(() => clock);
  });

  afterEach(async () => {
    await opened.close();
  });

  function clientOf(role: 'owner' | 'member', areas: readonly string[]): ClientRow {
    const profile = opened.store.profiles.create({ name: `${role} ${String(areas.length)}` });
    opened.store.personAccess.change(profile.id, {
      role,
      template: role === 'owner' ? 'owner' : 'adult',
      ...(role === 'owner'
        ? {}
        : {
            scopes: {
              ...TEMPLATE_SCOPES.adult,
              areas: MCP_TOOL_AREAS.filter((a) => areas.includes(a)),
            },
          }),
    });
    return opened.store.clients.create({
      name: `${role} phone ${String(areas.length)}`,
      platform: 'android',
      role,
      tokenHash: hashClientToken(createClientToken()),
      profileId: profile.id,
    });
  }

  it('reaches only connections that subscribed to it and may use automations', () => {
    const { store, changes } = rig();
    store.publish('plugin:chat-hub', chatKinds());
    const [change] = changes;
    if (change === undefined) throw new Error('a change was emitted');
    const owner = clientOf('owner', []);
    const allowed = clientOf('member', ['automations']);
    const denied = clientOf('member', ['home']);
    const hears = (client: ClientRow, subscribed: boolean): boolean =>
      visible(
        {
          client,
          tables: new Set(subscribed ? (['automation_plugin_kinds'] as const) : []),
        },
        change,
        opened.store,
      );
    expect(hears(owner, true)).toBe(true);
    expect(hears(owner, false)).toBe(false);
    expect(hears(allowed, true)).toBe(true);
    expect(hears(allowed, false)).toBe(false);
    expect(hears(denied, true)).toBe(false);
    expect(kindOwnerOf({ kind: 'driver', id: 'kingsmith-g15' })).toBe('driver:kingsmith-g15');
  });
});
