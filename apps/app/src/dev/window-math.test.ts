import { describe, expect, it } from 'vitest';
import { CounterDelta, TallyTable, kilobytes, percent, perSecond, sizeOf } from './window-math';
import { RouteVisits } from './route-visits';

describe('window math', () => {
  it('computes percentages and rates without dividing by zero', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(5, 0)).toBe(0);
    expect(perSecond(25, 5000)).toBe(5);
    expect(perSecond(3, 0)).toBe(0);
    expect(kilobytes(1536)).toBe(1.5);
  });

  it('tallies rows, totals them and ranks the top rows', () => {
    const table = new TallyTable();
    table.add('a', 5, 100);
    table.add('b', 20, 0);
    table.add('a', 30, 924);
    expect(table.total()).toEqual({ count: 3, ms: 55, bytes: 1024, worstMs: 30 });
    expect(table.top(1, (row) => row.ms)[0]?.[0]).toBe('a');
    expect(table.encode(2, (row) => row.ms)).toBe('a:2/35/1,b:1/20/0');
    table.clear();
    expect(table.size).toBe(0);
  });

  it('shortens long names in encoded rows', () => {
    const table = new TallyTable();
    table.add('ExpoSecureStore.getValueWithKeyAsync', 1, 0);
    expect(table.encode(1, (row) => row.ms)).toBe('ExpoSecureStore.getVal:1/1/0');
  });

  it('turns cumulative counters into deltas and never goes negative on a counter reset', () => {
    const delta = new CounterDelta();
    expect(delta.next({ gc: 10, ms: 100 })).toBeNull();
    expect(delta.next({ gc: 14, ms: 160 })).toEqual({ gc: 4, ms: 60 });
    expect(delta.next({ gc: 2, ms: 5 })).toEqual({ gc: 2, ms: 5 });
  });

  it('measures the size of text and binary frames', () => {
    expect(sizeOf('abc')).toBe(3);
    expect(sizeOf(new ArrayBuffer(8))).toBe(8);
    expect(sizeOf(new Uint8Array(4))).toBe(4);
    expect(sizeOf({})).toBe(0);
  });
});

describe('route visits', () => {
  it('reports seconds spent on each route within a window', () => {
    const visits = new RouteVisits('home', 0);
    visits.enter('devices', 1500);
    visits.enter('home', 4000);
    expect(visits.take(5000)).toBe('home:2.5,devices:2.5');
    expect(visits.current).toBe('home');
    expect(visits.take(7000)).toBe('home:2');
  });

  it('ignores entering the route it is already on', () => {
    const visits = new RouteVisits('chat', 0);
    visits.enter('chat', 1000);
    expect(visits.take(3000)).toBe('chat:3');
  });
});
