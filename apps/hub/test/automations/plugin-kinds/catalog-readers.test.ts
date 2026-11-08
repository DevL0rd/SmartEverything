import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  NODE_REGISTRY,
  STATIC_KIND_LOOKUP,
  type NodeKind,
  type NodeKindLookup,
} from '@smarteverything/domain';
import type { ReadRequest } from '@smarteverything/flow/interpret/frames';
import { PlanBook } from '../../../src/automations/engine-v3-plans';
import { readPort } from '../../../src/automations/engine-v3-context';
import {
  createKindCatalog,
  syncContribution,
  type KindCatalog,
} from '../../../src/automations/plugin-kinds/catalog';
import { pluginContribution } from '../../../src/automations/plugin-kinds/contributions';
import { lintContextOf } from '../../../src/automations/service-programs-analysis';
import { comparePrograms } from '../../../src/automations/service-programs-compare';
import { requireOwnerForTriggers } from '../../../src/automations/service-reach';
import { compileTriggers } from '../../../src/automations/triggers-v3/armers';
import { leadingReads } from '../../../src/automations/triggers-v3/admit';
import { readKindIds } from '../../../src/automations/world-v3/world-reads';
import { automationProgramReadRoutes } from '../../../src/server/handlers/automation-program-reads';
import type { Caller } from '../../../src/server/auth';
import { graphAutomation } from '../../automations-v3/support/graph-of';
import { node, programOf, saveAutomation, trigger } from '../../support/automation-fixture';
import { captureLogs, testLogger } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';
import { ONLINE_VALUE, POSTED_TRIGGER, POST_NODE, manifestWith } from './fixtures';

const POST = 'plugin.chat_hub.post_message';
const ONLINE = 'plugin.chat_hub.members_online';
const POSTED = 'trigger.plugin.chat_hub.message_posted';
const WATCH_VALUE = 'trigger.plugin.demo.watch_value';

function core(id: string): NodeKind {
  const found = NODE_REGISTRY.get(id);
  if (found === undefined) throw new Error(`${id} is not a core kind`);
  return found;
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

function lookupWith(extra: readonly NodeKind[]): NodeKindLookup {
  const byId = new Map(extra.map((kind) => [kind.id, kind]));
  return {
    get: (id) => byId.get(id) ?? NODE_REGISTRY.get(id),
    has: (id) => byId.has(id) || NODE_REGISTRY.has(id),
  };
}

function memberCaller(): Caller {
  return {
    kind: 'service',
    authority: {
      event_id: randomUUID(),
      profile_id: randomUUID(),
      client_id: null,
      kind: 'service',
      role: 'member',
      hub_os_ban: false,
      tools: null,
      plugin_id: null,
      requester: null,
    },
    profileId: randomUUID(),
    chatId: null,
  };
}

function ownerCaller(): Caller {
  const member = memberCaller();
  if (member.kind !== 'service') throw new Error('expected a service caller');
  return { ...member, authority: { ...member.authority, role: 'owner' } };
}

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

describe('hub readers resolve kinds through the catalog', () => {
  it('lowers a program with the kinds the plan book was given', () => {
    const { store } = opened;
    const row = saveAutomation(store, {
      triggers: [trigger('trigger.time', { at: '23:00' })],
      body: [node('debug.log', { message: 'hi' })],
    });
    const asked: string[] = [];
    const kinds: NodeKindLookup = {
      get: (id) => {
        asked.push(id);
        return STATIC_KIND_LOOKUP.get(id);
      },
      has: (id) => STATIC_KIND_LOOKUP.has(id),
    };
    const repositories = {
      plans: store.automationPlans,
      owned: store.automationOwnedValues,
      functions: store.automationFunctions,
    };
    const book = new PlanBook(repositories, testLogger('plans'), kinds);
    expect(book.compile(row)).toBeDefined();
    expect(asked).toContain('debug.log');
  });

  it('wraps reference ports of a plugin read node using the catalog kind', () => {
    const reading: NodeKind = { ...core('device.get'), id: 'plugin.demo.reading' };
    const seen: unknown[] = [];
    const reads = {
      read: (_kind: string, inputs: unknown): { outputs: Record<string, never> } => {
        seen.push(inputs);
        return { outputs: {} };
      },
    };
    const persistent = { read: (): undefined => undefined };
    const request: ReadRequest = {
      kind: reading.id,
      node: { id: 'n', key: 'k' },
      inputs: { device: 'lamp' },
      seed: 0,
      activation: 'a',
      instance: '',
      kept: () => ({ ok: true, value: undefined }),
    };
    const withKinds = readPort({ reads, persistent, kinds: lookupWith([reading]) }, 'auto');
    const withoutKinds = readPort({ reads, persistent, kinds: createKindCatalog() }, 'auto');
    withKinds.node(request);
    withoutKinds.node(request);
    expect(seen).toEqual([{ device: { device: 'lamp' } }, { device: 'lamp' }]);
  });

  it('lists the plugin value among the read kinds of the world', () => {
    expect(readKindIds(chatHub())).toContain(ONLINE);
    expect(readKindIds(createKindCatalog())).not.toContain(ONLINE);
    expect(readKindIds(createKindCatalog())).toContain('device.get');
  });

  it('treats a plugin read node as a leading read of an admission', () => {
    const body = [node(ONLINE), node(POST, { channel: 'c' })];
    expect(leadingReads(body, chatHub()).map((entry) => entry.kind)).toEqual([ONLINE]);
    expect(leadingReads(body, createKindCatalog())).toEqual([]);
  });

  it('keeps an owner only plugin trigger away from a member', () => {
    const ownerOnly: NodeKind = { ...core('trigger.signal'), id: POSTED, access: 'owner' };
    const kinds = lookupWith([ownerOnly]);
    const program = graphAutomation(programOf([trigger(POSTED)]), kinds);
    expect(() => {
      requireOwnerForTriggers(memberCaller(), program, kinds);
    }).toThrow('Only an owner can start an automation from');
    expect(() => {
      requireOwnerForTriggers(ownerCaller(), program, kinds);
    }).not.toThrow();
    expect(() => {
      requireOwnerForTriggers(memberCaller(), program, createKindCatalog());
    }).not.toThrow();
  });

  it('names plugin nodes in a program comparison and lints through the env kinds', () => {
    const catalog = chatHub();
    const before = graphAutomation(programOf([], []), catalog);
    const after = graphAutomation(programOf([], [node(POST, { channel: 'c' })]), catalog);
    const summaries = (kinds: NodeKindLookup): string[] =>
      comparePrograms(before, after, kinds).map((change) => change.summary);
    expect(summaries(catalog).join(' ')).toContain('Post a message');
    expect(summaries(createKindCatalog()).join(' ')).not.toContain('Post a message');
    const env = {
      store: opened.store,
      programs: opened.store.automations,
      functions: opened.store.automationFunctions,
      plans: opened.store.automationPlans,
      secrets: { list: (): never[] => [] },
    };
    expect(lintContextOf({ ...env, kinds: catalog }).kinds(POST)?.id).toBe(POST);
    expect(lintContextOf({ ...env, kinds: createKindCatalog() }).kinds(POST)).toBeUndefined();
  });

  it('compiles triggers only for kinds the matcher lookup knows', () => {
    const nodes = [trigger('trigger.device', { device: randomUUID(), control: 'power' })];
    const core = createKindCatalog();
    expect(compileTriggers('auto', nodes, core.matcher).signals).toHaveLength(1);
    expect(compileTriggers('auto', nodes, () => undefined).signals).toHaveLength(0);
    const catalog = chatHub();
    expect(compileTriggers('auto', nodes, (kind) => catalog.matcher(kind)).signals).toHaveLength(1);
  });

  it('refuses to remove a Value a plugin trigger references only when the kinds are given', () => {
    const { store } = opened;
    const watching: NodeKind = { ...core('trigger.value'), id: WATCH_VALUE };
    const value = store.automationValues.create({
      kind: 'number',
      name: 'Count',
      value: 1,
      bounds: { overflow: 'reject' },
    });
    saveAutomation(store, {
      name: 'Watcher',
      triggers: [trigger(WATCH_VALUE, { value: value.id })],
    });
    expect(() => {
      store.automationValues.remove(value.id, lookupWith([watching]));
    }).toThrow('referenced by automation Watcher');
    store.automationValues.remove(value.id, createKindCatalog());
    expect(store.automationValues.list()).toEqual([]);
  });

  it('serves plugin kinds in the catalogue view to an owner and to a member', async () => {
    const routes = automationProgramReadRoutes({
      store: opened.store,
      secrets: { list: (): never[] => [] },
      functions: { list: (): never[] => [] },
      kinds: chatHub(),
    });
    const raw = {
      params: {},
      query: { query: 'chat_hub' },
      body: undefined,
      remote: 'test',
      headers: {},
    };
    const log = testLogger('catalogue');
    const owner = await routes.listAutomationCatalog.run(ownerCaller(), raw, log);
    const member = await routes.listAutomationCatalog.run(memberCaller(), raw, log);
    const kindsOf = (reply: unknown): string[] =>
      typeof reply === 'object' && reply !== null && 'nodes' in reply && Array.isArray(reply.nodes)
        ? reply.nodes.flatMap((entry: unknown) =>
            typeof entry === 'object' && entry !== null && 'kind' in entry
              ? [String(entry.kind)]
              : [],
          )
        : [];
    expect(kindsOf(owner)).toEqual(expect.arrayContaining([POST, ONLINE, POSTED]));
    expect(kindsOf(member)).toEqual(expect.arrayContaining([POST, ONLINE, POSTED]));
    expect(STATIC_KIND_LOOKUP.has(POST)).toBe(false);
  });
});
