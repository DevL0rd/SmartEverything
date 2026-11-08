import { API_ENDPOINTS as E, PLANNER_COLLECTION_ROW } from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { systemClock } from '../../src/clock';
import { callTool, structured } from '../mcp/client';
import { bootServer, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';

const NOW = '2026-11-09T10:00:00.000Z';

let directory: { path: string; remove: () => Promise<void> };
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
    body: { name: 'Planner' },
  });
  token = E.createMcpToken.response.parse(created.body).token;
  const collection = await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/planner/collections',
    body: { kind: 'list', name: 'Chores', colour: 'family', icon: 'check' },
  });
  collectionId = PLANNER_COLLECTION_ROW.parse(collection.body).id;
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

describe('the planner tools over MCP', () => {
  it('adds a task and reads it back as an open task', async () => {
    const added = await callTool(booted.base, token, 'planner_edit', {
      action: 'add',
      item: { collection_id: collectionId, kind: 'task', title: 'Bins' },
    });
    expect(added.isError).toBe(false);
    const read = structured(await callTool(booted.base, token, 'planner_read', { view: 'tasks' }));
    expect(read).toMatchObject({
      result: { tasks: [{ title: 'Bins', status: 'open', created_by: 'person' }] },
    });
  });

  it('proposes drafts the person has not accepted yet', async () => {
    const proposed = await callTool(booted.base, token, 'planner_edit', {
      action: 'propose',
      items: [{ collection_id: collectionId, kind: 'task', title: 'Tidy' }],
    });
    expect(proposed.isError).toBe(false);
    const tasks = structured(await callTool(booted.base, token, 'planner_read', { view: 'tasks' }));
    expect(tasks).toMatchObject({ result: { tasks: [] } });
    const [draft] = z.array(z.uuid()).parse(structured(proposed)['ids']);
    const item = structured(
      await callTool(booted.base, token, 'planner_read', { view: 'item', itemId: draft }),
    );
    expect(item).toMatchObject({
      result: { item: { title: 'Tidy', status: 'proposed', created_by: 'ai' } },
    });
  });

  it('reads an empty clock and an unlinked Google account', async () => {
    expect(
      structured(await callTool(booted.base, token, 'planner_read', { view: 'alarms' })),
    ).toMatchObject({ result: { rows: [] } });
    expect(
      structured(await callTool(booted.base, token, 'planner_read', { view: 'google_status' })),
    ).toMatchObject({ result: { linked: false, account: null } });
  });

  it('refuses a field the chosen view does not take and a missing required field', async () => {
    const extra = await callTool(booted.base, token, 'planner_read', {
      view: 'stats',
      range: 'week',
      date: '2026-11-09',
    });
    expect(extra.isError).toBe(true);
    const missing = await callTool(booted.base, token, 'planner_edit', { action: 'complete' });
    expect(missing.isError).toBe(true);
  });
});
