import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { triggerCatalogueView } from '../../src/signals/trigger-catalogue-view';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { furnishHome, type ToolHome } from '../support/tool-home';

let held: TestStore;
let home: ToolHome;

beforeEach(async () => {
  captureLogs();
  held = await testStore();
  home = furnishHome(held.store);
});

afterEach(async () => {
  await held.close();
});

const ASK = { limit: 50 } as const;

describe('the trigger catalogue the AI reads', () => {
  it('lists signal kinds and the values of the home devices as compact rows with a sentence', () => {
    const view = triggerCatalogueView(held.store, null, { ...ASK, query: 'desk lamp' });
    expect(view.total).toBe(1);
    expect(view.rows).toStrictEqual([
      {
        source: 'device',
        kind: 'state',
        label: 'Desk lamp Power',
        group: 'devices',
        subject: home.lamp.id,
        field: 'power',
        room: 'Study',
        how: ['changes', 'becomes', 'stays', 'times_in', 'first', 'quiet'],
        fields: ['power'],
        match: ['family', 'kind', 'roomId', 'provider', 'name', 'role', 'unit', 'cause'],
        sentence: 'Desk lamp turns on',
      },
    ]);
  });

  it('finds every value of a room by the room name', () => {
    const view = triggerCatalogueView(held.store, null, { ...ASK, query: 'study' });
    const subjects = new Set(view.rows.map((row) => row.subject));
    expect(subjects).toStrictEqual(new Set([home.lamp.id]));
  });

  it('narrows to a group and caps the rows while still counting all of them', () => {
    const all = triggerCatalogueView(held.store, null, { limit: 200, group: 'cameras' });
    expect(all.rows.length).toBe(all.total);
    expect(all.rows.every((row) => row.group === 'cameras')).toBe(true);
    const capped = triggerCatalogueView(held.store, null, { limit: 1, group: 'cameras' });
    expect(capped.rows).toHaveLength(1);
    expect(capped.total).toBe(all.total);
  });

  it('gives each kind of signal one summary row without a device', () => {
    const view = triggerCatalogueView(held.store, null, { ...ASK, query: 'forecast' });
    expect(view.rows[0]).toMatchObject({
      source: 'weather',
      kind: 'forecast',
      group: 'time',
      subject: null,
      field: null,
    });
  });

  it('shows a person with limited devices only the devices they may use', () => {
    const view = triggerCatalogueView(
      held.store,
      { mode: 'only', rooms: [], devices: [home.lamp.id] },
      { limit: 200 },
    );
    const subjects = new Set(
      view.rows.flatMap((row) => (row.subject === null ? [] : [row.subject])),
    );
    expect(subjects).toStrictEqual(new Set([home.lamp.id]));
  });
});
