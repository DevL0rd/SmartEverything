import { describe, expect, it } from 'vitest';
import {
  VACUUM_EVENT_FAMILY,
  deviceEventFromMiot,
  vacuumEvent,
  vacuumFaultEvent,
  vacuumFaultTable,
} from '../src';

const observed = { externalId: 'robot', occurredAt: '2026-10-24T10:00:00.000Z', details: {} };

describe('vacuum MIoT events', () => {
  it('turns sweep-complete into a finished cycle', () => {
    expect(vacuumEvent('vacuum', 'sweep-complete').eiid).toBe(2);
    expect(deviceEventFromMiot('sweep-complete', observed)).toStrictEqual({
      ...observed,
      kind: 'cycle_finished',
      details: { family: VACUUM_EVENT_FAMILY, miotEvent: 'sweep-complete', outcome: 'finished' },
    });
  });

  it('turns the other robot events into activity with a name', () => {
    const names = {
      'build-map-complete': 'map_built',
      'dust-arrest-complete': 'dust_emptied',
      'mop-wash-complete': 'mop_washed',
      'dry-complete': 'mop_dried',
    } as const;
    for (const [event, name] of Object.entries(names)) {
      expect(vacuumEvent('vacuum', event).name).toBe(event);
      const result = deviceEventFromMiot(event, observed);
      expect(result.kind).toBe('activity');
      expect(result.details).toMatchObject({ family: VACUUM_EVENT_FAMILY, name, miotEvent: event });
    }
  });

  it('keeps the arguments of a robot event out of the way of its own facts', () => {
    const result = deviceEventFromMiot('sweep-complete', observed, { area: 7 });
    expect(result.details).toMatchObject({ area: 7, family: VACUUM_EVENT_FAMILY });
  });
});

describe('vacuum faults', () => {
  const table = vacuumFaultTable();

  it('maps every code of the table by its type and nothing else', () => {
    expect(table.length).toBeGreaterThan(100);
    for (const entry of table) {
      const event = vacuumFaultEvent(entry.code, observed);
      expect(event.kind).toBe(entry.type === 'alert' ? 'activity' : 'fault');
      expect(event.details).toMatchObject({
        family: VACUUM_EVENT_FAMILY,
        code: entry.code,
        title: entry.title,
        message: entry.message,
      });
      expect(event.details['name']).toBe(entry.type === 'alert' ? 'alert' : undefined);
    }
  });

  it('treats 100051 like any other alert', () => {
    const entry = table.find((fault) => fault.code === 100051);
    expect(entry?.type).toBe('alert');
    expect(vacuumFaultEvent(100051, observed).kind).toBe('activity');
  });

  it('reports a code missing from the table as a fault without a description', () => {
    expect(table.some((fault) => fault.code === 100008)).toBe(false);
    expect(vacuumFaultEvent(100008, observed)).toStrictEqual({
      ...observed,
      kind: 'fault',
      details: {
        family: VACUUM_EVENT_FAMILY,
        code: 100008,
        title: 'Fault 100008',
        message: 'No description from Xiaomi',
      },
    });
  });

  it('carries the cleaning steps and the dock wording when the table has them', () => {
    const withDetail = table.find((fault) => fault.detail !== null);
    const withDock = table.find((fault) => fault.dockVariant !== null);
    expect(withDetail).toBeDefined();
    expect(vacuumFaultEvent(withDetail?.code ?? 0, observed).details['detail']).toStrictEqual(
      withDetail?.detail,
    );
    if (withDock !== undefined) {
      expect(vacuumFaultEvent(withDock.code, observed).details['dock']).toStrictEqual(
        withDock.dockVariant,
      );
    }
  });
});
