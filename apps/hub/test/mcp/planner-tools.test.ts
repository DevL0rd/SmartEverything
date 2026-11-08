import {
  API_ENDPOINTS as E,
  PLANNER_COLLECTION_ROW,
  PLANNER_ITEM_CREATE,
  TEMPLATE_SCOPES,
  createClientToken,
  hashClientToken,
  type McpToolArea,
} from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { profileFor } from '../../src/extensions/mcp/tools/acting';
import { plannerHits } from '../../src/extensions/mcp/tools/search';
import type { ToolActor } from '../../src/extensions/mcp/tools/registry';
import { toolInScope } from '../../src/extensions/mcp/tools/visibility';
import { instantsOf } from '../../src/planner/instants';
import { systemClock } from '../../src/clock';
import { bootServer, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import { testStore, type TestStore } from '../support/store';
import { callTool, structured } from './client';

const NOW = '2026-11-09T07:00:00.000Z';

let directory: Awaited<ReturnType<typeof temporaryDirectory>>;
let booted: Booted;
let token: string;
let collectionId: string;

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path, {
    clock: { ...systemClock, now: () => new Date(NOW) },
  });
  await verifiedPublicUrl(booted);
  const created = await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/mcp/tokens',
    body: { name: 'ChatGPT' },
  });
  token = E.createMcpToken.response.parse(created.body).token;
  const collection = await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/planner/collections',
    body: { kind: 'calendar', name: 'Home', colour: 'home', icon: 'house' },
  });
  collectionId = PLANNER_COLLECTION_ROW.parse(collection.body).id;
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

function edit(args: Record<string, unknown>): ReturnType<typeof callTool> {
  return callTool(booted.base, token, 'planner_edit', args);
}

function read(args: Record<string, unknown>): ReturnType<typeof callTool> {
  return callTool(booted.base, token, 'planner_read', args);
}

function result(reply: Awaited<ReturnType<typeof callTool>>): unknown {
  return structured(reply)['result'];
}

async function addPlumber(): Promise<string> {
  const added = structured(
    await edit({
      action: 'add',
      item: {
        collection_id: collectionId,
        kind: 'event',
        title: 'Plumber',
        start_local: '2026-11-09T09:00',
        time_zone: 'UTC',
      },
    }),
  );
  return z.uuid().parse(added['id']);
}

describe('planner tools over the served MCP', () => {
  it('adds an event and reads it back as an item and in the person range', async () => {
    const id = await addPlumber();
    expect(result(await read({ view: 'item', itemId: id }))).toMatchObject({
      item: { id, title: 'Plumber', kind: 'event' },
      children: [],
    });
  });

  it('lists open tasks and drops one once it is completed', async () => {
    const added = structured(
      await edit({
        action: 'add',
        item: { collection_id: collectionId, kind: 'task', title: 'Bins' },
      }),
    );
    const id = z.uuid().parse(added['id']);
    expect(result(await read({ view: 'tasks' }))).toMatchObject({ tasks: [{ id }] });
    structured(await edit({ action: 'complete', itemId: id }));
    expect(result(await read({ view: 'tasks' }))).toMatchObject({ tasks: [] });
  });

  it('removes an item through planner_edit', async () => {
    const id = await addPlumber();
    structured(await edit({ action: 'remove', itemId: id }));
    const gone = await read({ view: 'item', itemId: id });
    expect(gone.isError).toBe(true);
  });

  it('stores proposed drafts as proposed items made by the AI', async () => {
    const proposed = structured(
      await edit({
        action: 'propose',
        items: [{ collection_id: collectionId, kind: 'task', title: 'Call the bank' }],
      }),
    );
    expect(proposed).toMatchObject({ ok: true });
    expect(result(await read({ view: 'tasks' }))).toMatchObject({ tasks: [] });
  });

  it('answers google_status for an unlinked person', async () => {
    expect(result(await read({ view: 'google_status' }))).toEqual({
      linked: false,
      account: null,
    });
  });

  it('finds planner items through home_search with a page target', async () => {
    const id = await addPlumber();
    const found = structured(await callTool(booted.base, token, 'home_search', { query: 'plumb' }));
    expect(found['planner']).toMatchObject([
      { title: 'Plumber', kind: 'event', target: { kind: 'page', path: `planner/item/${id}` } },
    ]);
  });
});

describe('planner tools that need the core and clock routes', () => {
  it('reads the day through the served tools', async () => {
    const id = await addPlumber();
    const day = structured(await read({ view: 'day', date: '2026-11-09' }));
    expect(JSON.stringify(day)).toContain(id);
  });

  it('sets and removes an alarm and starts and stops a timer', async () => {
    const alarm = structured(
      await edit({ action: 'alarm_set', alarm: { label: 'Wake', time: '07:00', days: [] } }),
    );
    const alarmId = z.uuid().parse(alarm['id']);
    expect(result(await read({ view: 'alarms' }))).toMatchObject({ rows: [{ id: alarmId }] });
    structured(await edit({ action: 'alarm_remove', alarmId }));
    const timer = structured(await edit({ action: 'timer_start', timer: { duration_ms: 180000 } }));
    const timerId = z.uuid().parse(timer['id']);
    expect(result(await read({ view: 'timers' }))).toMatchObject({ timers: [{ id: timerId }] });
    structured(await edit({ action: 'timer_stop', timerId }));
  });
});

describe('planner scope of a member AI', () => {
  let opened: TestStore;

  beforeEach(async () => {
    captureLogs();
    opened = await testStore();
  });

  afterEach(async () => {
    await opened.close();
  });

  function member(areas: readonly McpToolArea[]): {
    readonly context: { store: TestStore['store']; actor: ToolActor; caller: null };
    readonly profileId: string;
  } {
    const { store } = opened;
    store.clients.create(
      {
        name: 'Owner phone',
        platform: 'android',
        role: 'owner',
        tokenHash: hashClientToken(createClientToken()),
      },
      true,
    );
    const profile = store.profiles.create({ name: 'Robin' });
    store.clients.create({
      name: 'Robin phone',
      platform: 'android',
      role: 'member',
      tokenHash: hashClientToken(createClientToken()),
      profileId: profile.id,
    });
    store.personAccess.change(profile.id, {
      role: 'member',
      template: 'adult',
      scopes: { ...TEMPLATE_SCOPES.adult, areas: [...areas] },
    });
    const actor: ToolActor = {
      clientId: null,
      profileId: profile.id,
      role: 'member',
      chatId: null,
    };
    return { context: { store, actor, caller: null }, profileId: profile.id };
  }

  function bins(profileId: string): void {
    const { store } = opened;
    const list = store.plannerCollections.insert({
      profile_id: profileId,
      kind: 'list',
      name: 'Chores',
      colour: 'family',
      icon: 'check',
      position: 0,
      visible: true,
      default_reminders: [],
      source: 'local',
      google: null,
    });
    const draft = PLANNER_ITEM_CREATE.parse({
      collection_id: list.id,
      kind: 'task',
      title: 'Bins',
    });
    store.plannerItems.insert({
      ...draft,
      ...instantsOf(draft),
      position: 0,
      profile_id: profileId,
      series_id: null,
      original_start: null,
      status: 'open',
      google: null,
      created_by: 'person',
    });
  }

  it('reaches only its own planner and is refused another person', () => {
    const { context, profileId } = member(['planner']);
    expect(profileFor(context, {})).toBe(profileId);
    expect(() => profileFor(context, { personId: opened.store.profiles.first().id })).toThrow(
      'Only an owner may act for another person or app.',
    );
    bins(profileId);
    expect(plannerHits(context, { query: 'bins', limit: 10 })).toMatchObject([{ title: 'Bins' }]);
  });

  it('hides the planner tools and the planner search lines without the planner area', () => {
    const { context, profileId } = member(['home']);
    expect(toolInScope(context, 'planner_read')).toBe(false);
    expect(toolInScope(context, 'planner_edit')).toBe(false);
    bins(profileId);
    expect(plannerHits(context, { query: 'bins', limit: 10 })).toEqual([]);
  });
});
