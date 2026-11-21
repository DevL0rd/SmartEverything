import { randomUUID } from 'node:crypto';
import {
  PLANNER_ALARM_ROW,
  PLANNER_COLLECTION_ROW,
  PLANNER_ITEM_ROW,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { useBootedServer } from '../support/booted';
import { call } from '../support/server';

const suite = useBootedServer({ linked: false });

describe('planner items with a client id', () => {
  it('keeps the client id and returns the same item when the create is repeated', async () => {
    const { base, owner } = suite.current;
    const list = await call(base, owner, {
      method: 'POST',
      path: '/api/planner/collections',
      body: { kind: 'list', name: 'Errands', colour: 'home', icon: 'house' },
    });
    const collectionId = PLANNER_COLLECTION_ROW.parse(list.body).id;
    const id = randomUUID();
    const body = { id, collection_id: collectionId, kind: 'task', title: 'Buy bulbs' };
    const first = await call(base, owner, { method: 'POST', path: '/api/planner/items', body });
    const again = await call(base, owner, { method: 'POST', path: '/api/planner/items', body });

    const made = PLANNER_ITEM_ROW.parse(first.body);
    expect(made.id).toBe(id);
    expect(PLANNER_ITEM_ROW.parse(again.body)).toEqual(made);
  });

  it('keeps the client id of a new list and returns the same list when the create is repeated', async () => {
    const { base, owner } = suite.current;
    const id = randomUUID();
    const body = { id, kind: 'list', name: 'Groceries', colour: 'home', icon: 'cart' };
    const first = await call(base, owner, {
      method: 'POST',
      path: '/api/planner/collections',
      body,
    });
    const again = await call(base, owner, {
      method: 'POST',
      path: '/api/planner/collections',
      body,
    });

    const made = PLANNER_COLLECTION_ROW.parse(first.body);
    expect(made.id).toBe(id);
    expect(PLANNER_COLLECTION_ROW.parse(again.body)).toEqual(made);
  });

  it('keeps the client id of a new alarm and returns the same alarm when the create is repeated', async () => {
    const { base, owner } = suite.current;
    const id = randomUUID();
    const body = { id, time: '06:30', label: 'Gym' };
    const first = await call(base, owner, { method: 'POST', path: '/api/planner/alarms', body });
    const again = await call(base, owner, { method: 'POST', path: '/api/planner/alarms', body });

    const made = PLANNER_ALARM_ROW.parse(first.body);
    expect(made.id).toBe(id);
    expect(PLANNER_ALARM_ROW.parse(again.body)).toEqual(made);
  });
});
