import { describe, expect, it } from 'vitest';
import { TASKS_API, itemsOf, link, session, tasksUrl, textOf, type Api } from './helpers';
import type { TaskListStore } from './tasks-store';
import { createFakeGoogle, type FakeGoogleOptions } from './index';

const EMAIL = 'owner@example.test';

interface Setup {
  readonly api: Api;
  readonly store: TaskListStore;
}

async function setup(options: FakeGoogleOptions = {}): Promise<Setup> {
  const google = createFakeGoogle(options);
  const tokens = await link(google, EMAIL);
  const store = google.account(EMAIL).tasks.list('@default');
  return { api: session(google, tokens.access_token), store };
}

function titles(items: readonly Record<string, unknown>[]): readonly unknown[] {
  return items.map((item) => item['title']);
}

describe('fake Google Tasks', () => {
  it('lists task lists and resolves the default alias', async () => {
    const { api } = await setup();
    const lists = await api.get(`${TASKS_API}/users/@me/lists`);
    expect(itemsOf(lists)).toMatchObject([{ title: 'My Tasks' }]);
    const empty = await api.get(tasksUrl('@default'));
    expect(empty.status).toBe(200);
    expect(empty.body['items']).toBeUndefined();
    expect((await api.get(tasksUrl('missing'))).status).toBe(404);
  });

  it('inserts at the top, after a previous sibling, and pages by position', async () => {
    const { api } = await setup();
    const a = await api.post(tasksUrl('@default'), { title: 'A' });
    await api.post(tasksUrl('@default'), { title: 'B' });
    await api.post(tasksUrl('@default', `previous=${textOf(a, 'id')}`), {
      title: 'C',
    });
    const all = await api.get(tasksUrl('@default'));
    expect(titles(itemsOf(all))).toEqual(['B', 'A', 'C']);
    const first = await api.get(tasksUrl('@default', 'maxResults=2'));
    expect(titles(itemsOf(first))).toEqual(['B', 'A']);
    const second = await api.get(
      tasksUrl('@default', `maxResults=2&pageToken=${textOf(first, 'nextPageToken')}`),
    );
    expect(titles(itemsOf(second))).toEqual(['C']);
    expect(second.body['nextPageToken']).toBeUndefined();
  });

  it('keeps ordering when top insertions exhaust the position gap', async () => {
    const { store } = await setup();
    for (let index = 0; index < 30; index += 1) {
      store.insert({ title: `t${String(index)}` }, { parent: null, previous: null });
    }
    const listed = store.list({
      showCompleted: true,
      showDeleted: false,
      showHidden: false,
      updatedMinMs: null,
      maxResults: 100,
      offset: 0,
    });
    expect(titles(listed.items)).toEqual(
      Array.from({ length: 30 }, (_, i) => `t${String(29 - i)}`),
    );
  });

  it('drops the time of a due date and keeps completion fields consistent', async () => {
    const { api } = await setup();
    const created = await api.post(tasksUrl('@default'), {
      title: 'due',
      due: '2026-11-12T23:30:00-05:00',
    });
    expect(created.body['due']).toBe('2026-11-12T00:00:00.000Z');
    const url = `${tasksUrl('@default')}/${textOf(created, 'id')}`;
    const done = await api.patch(url, { status: 'completed' });
    expect(typeof done.body['completed']).toBe('string');
    const visible = await api.get(tasksUrl('@default', 'showCompleted=false'));
    expect(itemsOf(visible)).toHaveLength(0);
    const reopened = await api.patch(url, { status: 'needsAction', due: null });
    expect(reopened.body['completed']).toBeUndefined();
    expect(reopened.body['due']).toBeUndefined();
  });

  it('keeps deleted and cleared tasks as tombstones behind showDeleted and showHidden', async () => {
    const { api } = await setup();
    const parent = await api.post(tasksUrl('@default'), { title: 'parent' });
    await api.post(tasksUrl('@default', `parent=${textOf(parent, 'id')}`), {
      title: 'child',
    });
    const done = await api.post(tasksUrl('@default'), {
      title: 'done',
      status: 'completed',
    });
    expect((await api.post(`${TASKS_API}/lists/@default/clear`)).status).toBe(204);
    expect(titles(itemsOf(await api.get(tasksUrl('@default'))))).toEqual(['parent', 'child']);
    const withHidden = await api.get(tasksUrl('@default', 'showHidden=true'));
    expect(itemsOf(withHidden)).toContainEqual(
      expect.objectContaining({ id: done.body['id'], hidden: true }),
    );
    await api.del(`${tasksUrl('@default')}/${textOf(parent, 'id')}`);
    expect(itemsOf(await api.get(tasksUrl('@default')))).toHaveLength(0);
    const tombstones = await api.get(tasksUrl('@default', 'showDeleted=true&showHidden=true'));
    expect(itemsOf(tombstones).filter((item) => item['deleted'] === true)).toHaveLength(2);
    expect((await api.get(`${tasksUrl('@default')}/${textOf(parent, 'id')}`)).status).toBe(404);
  });

  it('treats updatedMin as inclusive by default and exclusive on request', async () => {
    for (const inclusive of [true, false]) {
      const { api, store } = await setup({ tasksUpdatedMinInclusive: inclusive });
      const created = store.insert({ title: 'only' }, { parent: null, previous: null });
      const updated = String(created['updated']);
      const listed = await api.get(
        tasksUrl('@default', `updatedMin=${encodeURIComponent(updated)}`),
      );
      expect(itemsOf(listed)).toHaveLength(inclusive ? 1 : 0);
    }
  });

  it('honours If-Match unless the vendor behaviour is switched off', async () => {
    for (const honour of [true, false]) {
      const { api } = await setup({ honourTasksIfMatch: honour });
      const created = await api.post(tasksUrl('@default'), { title: 'a' });
      const url = `${tasksUrl('@default')}/${textOf(created, 'id')}`;
      await api.patch(url, { title: 'b' });
      const stale = await api.patch(url, { title: 'c' }, { 'If-Match': textOf(created, 'etag') });
      expect(stale.status).toBe(honour ? 412 : 200);
    }
  });

  it('moves a task under a parent, rejects cycles and ignores parent in patch', async () => {
    const { api } = await setup();
    const a = await api.post(tasksUrl('@default'), { title: 'A' });
    const b = await api.post(tasksUrl('@default'), { title: 'B' });
    const aUrl = `${tasksUrl('@default')}/${textOf(a, 'id')}`;
    const bUrl = `${tasksUrl('@default')}/${textOf(b, 'id')}`;
    const moved = await api.post(`${bUrl}/move?parent=${textOf(a, 'id')}`);
    expect(moved.body['parent']).toBe(textOf(a, 'id'));
    const cycle = await api.post(`${aUrl}/move?parent=${textOf(b, 'id')}`);
    expect(cycle.status).toBe(400);
    const patched = await api.patch(bUrl, { parent: 'nope', position: '9' });
    expect(patched.body['parent']).toBe(textOf(a, 'id'));
    const toTop = await api.post(`${bUrl}/move`);
    expect(toTop.body['parent']).toBeUndefined();
    const order = await api.get(tasksUrl('@default'));
    expect(titles(itemsOf(order))).toEqual(['B', 'A']);
  });

  it('rejects an oversized title', async () => {
    const { api } = await setup();
    const long = await api.post(tasksUrl('@default'), {
      title: 'x'.repeat(1025),
    });
    expect(long.status).toBe(400);
  });
});
