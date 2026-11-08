import { DatabaseSync } from 'node:sqlite';
import type { GoogleSyncCounts } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { TasksSync } from '../../src/planner/google/tasks-sync';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { GoogleAccountsRepository } from '../../src/store/repositories/google-accounts';
import { GoogleSyncLogRepository } from '../../src/store/repositories/google-sync-log';
import { GoogleSyncStateRepository } from '../../src/store/repositories/google-sync-state';
import { PlannerCollectionsRepository } from '../../src/store/repositories/planner-collections';
import {
  PlannerItemsRepository,
  type PlannerItemInput,
} from '../../src/store/repositories/planner-items';
import { PlannerOccurrencesRepository } from '../../src/store/repositories/planner-occurrences';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const LIST = 'L1';
const START = Date.parse('2026-11-07T08:00:00.000Z');

const REMOTE = z.object({
  id: z.string(),
  etag: z.string(),
  title: z.string(),
  notes: z.string().optional(),
  status: z.enum(['needsAction', 'completed']),
  due: z.string().optional(),
  parent: z.string().optional(),
  updated: z.string(),
  deleted: z.boolean().optional(),
});

type Remote = z.infer<typeof REMOTE>;

const PARTIAL_REMOTE = REMOTE.partial();

const REMOTE_KEYS = z.array(REMOTE.keyof());

const BODY = z.record(z.string(), z.unknown());

class Clock {
  private ms = START;

  tick(): string {
    this.ms += 1000;
    return this.iso();
  }

  iso(): string {
    return new Date(this.ms).toISOString();
  }
}

class FakeTasks {
  readonly tasks: Remote[] = [];
  readonly requests: string[] = [];
  failNext: 'before' | 'after' | null = null;
  beforePatch: ((task: Remote) => void) | null = null;
  pageSize = 100;
  private counter = 0;

  constructor(private readonly clock: Clock) {}

  seed(fields: Partial<Remote> & { title: string }, at = this.tasks.length): Remote {
    this.counter += 1;
    const task: Remote = {
      id: `t${String(this.counter)}`,
      etag: `e${String(this.counter)}`,
      status: 'needsAction',
      updated: this.clock.tick(),
      ...fields,
    };
    this.tasks.splice(at, 0, task);
    return task;
  }

  touch(
    task: Pick<Remote, 'id'>,
    fields: Partial<Remote>,
    clear: readonly (keyof Remote)[] = [],
  ): void {
    this.counter += 1;
    const index = this.tasks.findIndex((candidate) => candidate.id === task.id);
    const next: Record<string, unknown> = {
      ...this.tasks[index],
      ...fields,
      etag: `e${String(this.counter)}`,
      updated: this.clock.tick(),
    };
    for (const key of clear) Reflect.deleteProperty(next, key);
    this.tasks[index] = REMOTE.parse(next);
  }

  fetch = (input: string, init: RequestInit): Promise<Response> => {
    this.requests.push(`${init.method ?? 'GET'} ${input}`);
    return Promise.resolve(this.route(input, init));
  };

  private route(input: string, init: RequestInit): Response {
    const method = init.method ?? 'GET';
    const url = new URL(input);
    const parts = url.pathname.split('/').filter((part) => part !== '');
    if (parts.at(-1) === 'lists') {
      return this.json({ items: [{ id: LIST, title: 'Inbox', etag: 'l1' }] });
    }
    const taskId = parts.at(-1) === 'move' ? parts.at(-2) : parts.at(-1);
    if (taskId === 'tasks')
      return method === 'GET' ? this.list(url) : this.insert(url, this.bodyOf(init));
    return this.single(taskId, method, url, init);
  }

  private single(
    taskId: string | undefined,
    method: string,
    url: URL,
    init: RequestInit,
  ): Response {
    const task = this.tasks.find((candidate) => candidate.id === taskId);
    if (task === undefined) return this.json({ error: { code: 404, message: 'gone' } }, 404);
    const headers = new Headers(init.headers);
    if (method === 'GET') return this.json(this.view(task));
    if (method === 'DELETE') return this.remove(task, headers);
    if (url.pathname.endsWith('/move')) return this.move(task, url);
    return this.patch(task, this.bodyOf(init), headers);
  }

  private bodyOf(init: RequestInit): Record<string, unknown> {
    return BODY.parse(typeof init.body === 'string' ? JSON.parse(init.body) : {});
  }

  private json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
  }

  private view(task: Remote): Record<string, unknown> {
    const position = String(this.tasks.indexOf(task) + 1).padStart(20, '0');
    return { ...task, position, kind: 'tasks#task' };
  }

  private fresh(task: Remote): Remote {
    return this.tasks.find((candidate) => candidate.id === task.id) ?? task;
  }

  private list(url: URL): Response {
    const min = url.searchParams.get('updatedMin');
    const offset = Number(url.searchParams.get('pageToken') ?? '0');
    const matching = this.tasks.filter((task) => min === null || task.updated >= min);
    const page = matching.slice(offset, offset + this.pageSize);
    const more = offset + this.pageSize < matching.length;
    return this.json({
      items: page.map((task) => this.view(task)),
      ...(more ? { nextPageToken: String(offset + this.pageSize) } : {}),
    });
  }

  private insert(url: URL, body: Record<string, unknown>): Response {
    const outcome = this.failNext;
    this.failNext = null;
    if (outcome === 'before') throw new TypeError('network down');
    const parent = url.searchParams.get('parent');
    const previous = url.searchParams.get('previous');
    const at =
      previous === null ? this.tasks.length : this.tasks.findIndex((t) => t.id === previous) + 1;
    const task = this.seed(
      {
        title: String(body['title']),
        status: body['status'] === 'completed' ? 'completed' : 'needsAction',
        ...(typeof body['notes'] === 'string' ? { notes: body['notes'] } : {}),
        ...(typeof body['due'] === 'string' ? { due: body['due'] } : {}),
        ...(parent === null ? {} : { parent }),
      },
      at,
    );
    if (outcome === 'after') throw new TypeError('connection reset');
    return this.json(this.view(task));
  }

  private patch(task: Remote, body: Record<string, unknown>, headers: Headers): Response {
    const hook = this.beforePatch;
    this.beforePatch = null;
    hook?.(task);
    const current = this.fresh(task);
    if (headers.get('If-Match') !== current.etag) {
      return this.json({ error: { code: 412, message: 'precondition' } }, 412);
    }
    const cleared = Object.entries(body).filter(([, value]) => value === null);
    const next = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== null));
    const fields: Partial<Remote> = {};
    for (const [key, value] of Object.entries(PARTIAL_REMOTE.parse(next))) {
      if (value !== undefined) Object.assign(fields, { [key]: value });
    }
    this.touch(current, fields, REMOTE_KEYS.parse(cleared.map(([key]) => key)));
    return this.json(this.view(this.fresh(task)));
  }

  private move(task: Remote, url: URL): Response {
    const previous = url.searchParams.get('previous');
    const parent = url.searchParams.get('parent');
    this.tasks.splice(this.tasks.indexOf(task), 1);
    const at = previous === null ? 0 : this.tasks.findIndex((t) => t.id === previous) + 1;
    this.tasks.splice(at, 0, task);
    this.touch(task, parent === null ? {} : { parent }, parent === null ? ['parent'] : []);
    return this.json(this.view(this.fresh(task)));
  }

  private remove(task: Remote, headers: Headers): Response {
    if (headers.get('If-Match') !== this.fresh(task).etag) {
      return this.json({ error: { code: 412, message: 'precondition' } }, 412);
    }
    this.touch(task, { deleted: true });
    return new Response(null, { status: 204 });
  }
}

let clock: Clock;
let remote: FakeTasks;
let items: PlannerItemsRepository;
let collections: PlannerCollectionsRepository;
let log: GoogleSyncLogRepository;
let states: GoogleSyncStateRepository;
let sync: TasksSync;
let ann: string;
let collection: string;

function local(fields: Partial<PlannerItemInput> & { title: string }): PlannerItemInput {
  return {
    profile_id: ann,
    collection_id: collection,
    kind: 'task',
    parent_id: null,
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    start_local: null,
    end_local: null,
    time_zone: null,
    all_day: false,
    due_date: null,
    due_at: null,
    rrule: null,
    exdates: [],
    series_id: null,
    original_start: null,
    start: null,
    end: null,
    series_end: null,
    status: 'open',
    position: 100,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [],
    google: null,
    created_by: 'person',
    ...fields,
  };
}

const run = (): Promise<GoogleSyncCounts> => {
  clock.tick();
  return sync.sync(ann, 'manual');
};

const titles = (): string[] =>
  items
    .list(ann)
    .map((row) => row.title)
    .sort();

beforeEach(() => {
  captureLogs();
  clock = new Clock();
  remote = new FakeTasks(clock);
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, clock.iso(), testLogger());
  const feed = new ChangeFeed(testLogger('store'));
  const context = new StoreContext(sql, feed, () => new Date(clock.iso()));
  ann = new ProfilesRepository(context).create({ name: 'Ann' }).id;
  items = new PlannerItemsRepository(context, new PlannerOccurrencesRepository(context));
  collections = new PlannerCollectionsRepository(context, items);
  new GoogleAccountsRepository(context).insert({
    profile_id: ann,
    email: 'ann@example.com',
    scopes: ['https://www.googleapis.com/auth/tasks'],
    status: 'linked',
    problem: null,
    calendar_ids: [],
    list_ids: [LIST],
    last_sync_at: null,
    last_error: null,
  });
  log = new GoogleSyncLogRepository(context);
  states = new GoogleSyncStateRepository(context);
  collection = collections.insert({
    profile_id: ann,
    kind: 'list',
    name: 'Inbox',
    colour: 'personal',
    icon: 'list',
    position: 0,
    visible: true,
    default_reminders: [],
    source: 'google',
    google: { id: LIST, etag: null, syncToken: null },
  }).id;
  sync = new TasksSync({
    fetch: remote.fetch,
    accessToken: (): Promise<string> => Promise.resolve('token'),
    items,
    collections,
    states,
    log,
    now: (): string => clock.iso(),
  });
});

describe('Google Tasks sync', () => {
  it('sends the due date only and keeps the local time', async () => {
    const row = items.insert(
      local({ title: 'Pay rent', due_date: '2026-11-10', due_at: '2026-11-10T17:30:00.000Z' }),
    );
    await run();
    expect(remote.tasks[0]?.due).toBe('2026-11-10T00:00:00.000Z');
    expect(items.byId(row.id, ann).due_at).toBe('2026-11-10T17:30:00.000Z');
    const task = remote.tasks[0];
    if (task === undefined) throw new Error('missing');
    remote.touch(task, { title: 'Pay rent now' });
    await run();
    expect(items.byId(row.id, ann).due_at).toBe('2026-11-10T17:30:00.000Z');
    remote.touch(task, { due: '2026-11-12T00:00:00.000Z' });
    await run();
    const moved = items.byId(row.id, ann);
    expect([moved.due_date, moved.due_at]).toEqual(['2026-11-12', null]);
  });

  it('imports Google tasks with their parent and order', async () => {
    const parent = remote.seed({ title: 'Trip' });
    remote.seed({ title: 'Book hotel', parent: parent.id });
    remote.seed({ title: 'Pack' });
    const counts = await run();
    const rows = items.list(ann);
    const trip = rows.find((row) => row.title === 'Trip');
    const hotel = rows.find((row) => row.title === 'Book hotel');
    expect(hotel?.parent_id).toBe(trip?.id);
    expect(counts.created).toBe(3);
    const order = rows.sort((a, b) => a.position - b.position).map((row) => row.title);
    expect(order).toEqual(['Trip', 'Book hotel', 'Pack']);
    expect(rows.every((row) => row.created_by === 'google')).toBe(true);
  });

  it('sends a child after its parent with the parent and the previous sibling', async () => {
    const parent = items.insert(local({ title: 'Trip', position: 1 }));
    items.insert(local({ title: 'Book hotel', parent_id: parent.id, position: 2 }));
    await run();
    const trip = remote.tasks.find((task) => task.title === 'Trip');
    const hotel = remote.tasks.find((task) => task.title === 'Book hotel');
    expect(hotel?.parent).toBe(trip?.id);
    const posts = remote.requests.filter((request) => request.startsWith('POST'));
    expect(posts[1]).toContain(`parent=${trip?.id ?? ''}`);
  });

  it('moves a reordered task and adopts the Google position', async () => {
    const first = remote.seed({ title: 'One' });
    remote.seed({ title: 'Two' });
    await run();
    const two = items.list(ann).find((row) => row.title === 'Two');
    if (two === undefined) throw new Error('missing');
    items.update(two.id, ann, { position: 0 });
    await run();
    expect(remote.tasks.map((task) => task.title)).toEqual(['Two', 'One']);
    expect(remote.requests.some((request) => request.includes(`${first.id}/move`))).toBe(false);
    expect(remote.requests.some((request) => request.includes('/move'))).toBe(true);
  });

  it('appends rules and attachments to the notes once and strips them on the way back', async () => {
    const row = items.insert(
      local({
        title: 'Water plants',
        notes: 'Front room first',
        rrule: 'FREQ=WEEKLY;BYDAY=SA',
        start_local: '2026-11-07T09:00',
        time_zone: 'UTC',
        start: '2026-11-07T09:00:00.000Z',
        attachments: [{ kind: 'link', url: 'https://example.com/care', title: 'Care guide' }],
      }),
    );
    await run();
    expect(remote.tasks[0]?.notes).toBe(
      'Front room first\nRepeats FREQ=WEEKLY;BYDAY=SA · Attached Care guide https://example.com/care',
    );
    const task = remote.tasks[0];
    if (task === undefined) throw new Error('missing');
    remote.touch(task, { title: 'Water the plants' });
    await run();
    const after = items.byId(row.id, ann);
    expect(after.notes).toBe('Front room first');
    expect(after.title).toBe('Water the plants');
  });

  it('pulls only what changed since the largest server time and skips its own writes', async () => {
    remote.seed({ title: 'One' });
    await run();
    const second = remote.seed({ title: 'Two' });
    remote.requests.length = 0;
    await run();
    const listRequest = remote.requests.find((request) => request.includes('/tasks?')) ?? '';
    expect(listRequest).toContain('updatedMin=');
    expect(titles()).toEqual(['One', 'Two']);
    expect(states.find({ profileId: ann, product: 'tasks', resourceId: LIST })?.sync_token).toBe(
      second.updated,
    );
    const counts = await run();
    expect([counts.created, counts.updated, counts.pushed]).toEqual([0, 0, 0]);
  });

  it('follows every page of a pull', async () => {
    remote.pageSize = 2;
    for (const title of ['A', 'B', 'C', 'D', 'E']) remote.seed({ title });
    await run();
    expect(titles()).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('turns a Google delete into a local trash and a local delete into a Google delete', async () => {
    const gone = remote.seed({ title: 'Old' });
    remote.seed({ title: 'Keep' });
    await run();
    remote.touch(gone, { deleted: true });
    await run();
    expect(titles()).toEqual(['Keep']);
    const keep = items.list(ann)[0];
    if (keep === undefined) throw new Error('missing');
    items.trash(keep.id, ann);
    await run();
    expect(remote.tasks.find((task) => task.title === 'Keep')?.deleted).toBe(true);
    expect(items.trashed(ann).filter((row) => row.title === 'Keep')).toEqual([]);
  });

  it('brings back an item deleted here when Google edited it, and logs it', async () => {
    const task = remote.seed({ title: 'Shared list' });
    await run();
    const row = items.list(ann)[0];
    if (row === undefined) throw new Error('missing');
    items.trash(row.id, ann);
    remote.touch(task, { title: 'Shared list v2' });
    await run();
    expect(titles()).toEqual(['Shared list v2']);
    expect(remote.tasks.find((candidate) => candidate.id === task.id)?.deleted).toBeUndefined();
    const entry = log.list(ann).find((candidate) => candidate.conflicts.length > 0);
    expect(entry?.conflicts[0]?.field).toBe('deleted');
  });

  it('merges edits to different fields and logs the losing value of the same field', async () => {
    const task = remote.seed({ title: 'Plan', notes: 'draft' });
    await run();
    const row = items.list(ann)[0];
    if (row === undefined) throw new Error('missing');
    items.update(row.id, ann, { title: 'Plan trip' });
    remote.touch(task, { notes: 'final' });
    await run();
    const merged = items.byId(row.id, ann);
    expect([merged.title, merged.notes]).toEqual(['Plan trip', 'final']);
    expect(remote.tasks[0]?.title).toBe('Plan trip');
    items.update(row.id, ann, { title: 'Local title' });
    remote.touch(task, { title: 'Remote title' });
    clock.tick();
    await run();
    const entry = log.list(ann).find((candidate) => candidate.conflicts.length > 0);
    expect(entry?.conflicts[0]).toMatchObject({
      field: 'title',
      winner: 'google',
      losing_value: 'Local title',
    });
    expect(items.byId(row.id, ann).title).toBe('Remote title');
  });

  it('merges and pushes once when Google rejects the precondition', async () => {
    const task = remote.seed({ title: 'Plan', notes: 'draft' });
    await run();
    const row = items.list(ann)[0];
    if (row === undefined) throw new Error('missing');
    items.update(row.id, ann, { title: 'Plan trip' });
    remote.beforePatch = (current): void => {
      remote.touch(current, { notes: 'raced' });
    };
    await run();
    expect(remote.requests.filter((request) => request.startsWith('PATCH'))).toHaveLength(2);
    expect([remote.tasks[0]?.title, remote.tasks[0]?.notes]).toEqual(['Plan trip', 'raced']);
    expect(items.byId(row.id, ann).notes).toBe('raced');
    expect(task.id).toBe(remote.tasks[0]?.id);
  });

  it('adopts an uncertain insert once and never duplicates it', async () => {
    items.insert(local({ title: 'Call the bank' }));
    remote.failNext = 'after';
    await expect(run()).rejects.toThrow('connection reset');
    const sending = items.list(ann)[0];
    expect(sending?.google?.state).toBe('sending');
    expect(remote.tasks).toHaveLength(1);
    await run();
    await run();
    expect(remote.tasks).toHaveLength(1);
    const adopted = items.list(ann)[0];
    expect(adopted?.google).toMatchObject({ id: remote.tasks[0]?.id, state: 'synced' });
    expect(remote.requests.filter((request) => request.startsWith('POST'))).toHaveLength(1);
  });

  it('sends again when the unknown insert never reached Google', async () => {
    items.insert(local({ title: 'Call the bank' }));
    remote.failNext = 'before';
    await expect(run()).rejects.toThrow('network down');
    await run();
    expect(remote.tasks.map((task) => task.title)).toEqual(['Call the bank']);
    expect(items.list(ann)[0]?.google?.state).toBe('synced');
  });

  it('writes a choice entry when two Google tasks match, and adopts the picked one', async () => {
    const row = items.insert(local({ title: 'Call the bank' }));
    remote.failNext = 'before';
    await expect(run()).rejects.toThrow();
    const first = remote.seed({ title: 'Call the bank' });
    const second = remote.seed({ title: 'Call the bank' });
    await run();
    await run();
    expect(items.byId(row.id, ann).google?.state).toBe('sending');
    expect(items.list(ann)).toHaveLength(1);
    const entries = log.list(ann).filter((entry) => entry.choice !== null);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.choice?.candidates.map((candidate) => candidate.google_id)).toEqual([
      first.id,
      second.id,
    ]);
    const entry = entries[0];
    if (entry === undefined) throw new Error('missing');
    await sync.resolveChoice(ann, entry.id, second.id);
    expect(items.byId(row.id, ann).google).toMatchObject({ id: second.id, state: 'synced' });
    expect(items.list(ann)).toHaveLength(2);
    expect(log.byId(entry.id, ann).choice?.resolved_google_id).toBe(second.id);
  });

  it('mirrors a Google list as a collection', async () => {
    collections.remove(collection, ann);
    await run();
    const mirrored = collections.byGoogle(ann, LIST);
    expect(mirrored).toMatchObject({ kind: 'list', name: 'Inbox', source: 'google' });
  });
});
