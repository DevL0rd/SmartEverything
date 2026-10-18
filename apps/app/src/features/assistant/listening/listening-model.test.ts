import { describe, expect, it } from 'vitest';
import type { ListeningSource, ListeningView } from '@smarteverything/domain';
import {
  claimBarHeight,
  countsOf,
  dbLabel,
  groupsOf,
  levelShare,
  lookOf,
  masterOf,
  rowsOf,
  switchable,
} from './listening-model';

function source(over: Partial<ListeningSource>): ListeningSource {
  return {
    key: 'a',
    kind: 'camera',
    name: 'Camera',
    profileId: null,
    wake: true,
    transcribe: false,
    state: 'listening',
    writing: { state: 'off' },
    sensitivity: 'standard',
    changeable: true,
    claims: [],
    ...over,
  };
}

function view(...sources: ListeningSource[]): ListeningView {
  return { sources, last: null };
}

describe('listening rows', () => {
  it('marks a camera the AI may not talk through as blocked whatever the hub says', () => {
    const rows = rowsOf(
      view(source({ key: 'bed', state: 'off', wake: false }), source({ key: 'hall' })),
      new Set(['hall']),
    );
    expect(rows.map((row) => row.state)).toEqual(['blocked', 'listening']);
  });

  it('keeps the hub state while the allowed cameras are not known yet', () => {
    const rows = rowsOf(view(source({ key: 'bed', state: 'off' })), null);
    expect(rows[0]?.state).toBe('off');
  });

  it('never blocks a phone for the camera allow list', () => {
    const rows = rowsOf(view(source({ key: 'ph', kind: 'phone' })), new Set());
    expect(rows[0]?.state).toBe('listening');
  });

  it('cannot switch a blocked camera or a source its own settings decide', () => {
    const [blocked, fixed, plain] = rowsOf(
      view(
        source({ key: 'bed' }),
        source({ key: 'w', kind: 'walkie', changeable: false }),
        source({ key: 'ok' }),
      ),
      new Set(['w', 'ok']),
    );
    expect([blocked, fixed, plain].map((row) => row === undefined || switchable(row))).toEqual([
      false,
      false,
      true,
    ]);
  });
});

describe('listening groups and counts', () => {
  const rows = rowsOf(
    view(
      source({ key: 'p', kind: 'phone', state: 'needs_permission' }),
      source({ key: 'c1' }),
      source({ key: 'c2', state: 'privacy' }),
      source({ key: 'w', kind: 'walkie', changeable: false }),
    ),
    null,
  );

  it('orders groups cameras, phones, computers, Discord, walkie and drops empty ones', () => {
    expect(groupsOf(rows).map((group) => group.kind)).toEqual(['camera', 'phone', 'walkie']);
  });

  it('counts rows by what they are doing', () => {
    expect(countsOf(rows, false)).toEqual({ listening: 2, busy: 0, rest: 1, need: 1, gone: 0 });
  });

  it('counts every row as last known while the hub is unreachable', () => {
    expect(countsOf(rows, true)).toEqual({ listening: 0, busy: 0, rest: 0, need: 0, gone: 4 });
  });

  it('reports a mixed master switch when only some switchable rows are on', () => {
    const cameras = groupsOf(
      rowsOf(view(source({ key: 'a', wake: true }), source({ key: 'b', wake: false })), null),
    )[0];
    expect(masterOf(cameras?.rows ?? [], 'wake')).toEqual({ value: false, mixed: true });
  });

  it('turns a master switch on only when every switchable row is on', () => {
    const cameras = groupsOf(
      rowsOf(view(source({ key: 'a', wake: true }), source({ key: 'b', wake: true })), null),
    )[0];
    expect(masterOf(cameras?.rows ?? [], 'wake')).toEqual({ value: true, mixed: false });
  });
});

describe('loudness helpers', () => {
  it('maps -60 dB to nothing and 0 dB to a full bar', () => {
    expect([levelShare(-60), levelShare(-30), levelShare(0)]).toEqual([0, 0.5, 1]);
  });

  it('clamps silence below the floor', () => {
    expect(levelShare(-120)).toBe(0);
  });

  it('writes the level with a true minus sign', () => {
    expect(dbLabel(-21.4)).toBe('−21 dB');
  });

  it('makes louder wakes taller', () => {
    expect(claimBarHeight(-20)).toBeGreaterThan(claimBarHeight(-40));
  });

  it('labels the blocked state and keeps hub labels for the rest', () => {
    expect(lookOf('blocked').label).toBe('Blocked by setting');
    expect(lookOf('discord_call').label).toBe('Off during Discord call');
    expect(lookOf('no_host')).toEqual({
      label: 'Needs a computer to listen',
      mark: 'warning',
      category: 'need',
    });
  });
});

describe('last known look', () => {
  it('prefixes the state and hollows the dot while the hub is unreachable', () => {
    expect(lookOf('listening', true)).toMatchObject({
      label: 'Last known · Listening',
      mark: 'hollow',
    });
  });

  it('keeps the blocked look as it is while the hub is unreachable', () => {
    expect(lookOf('blocked', true).label).toBe('Blocked by setting');
  });
});
