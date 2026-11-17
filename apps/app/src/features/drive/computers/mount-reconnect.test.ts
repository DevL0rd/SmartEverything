import { SNAPSHOT, type Snapshot } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { applyChange, replaceWith } from '../../../store/live-reducers';
import { snapshotWire } from '../../../store/snapshot-fixture';
import { emptyState, type StoreState } from '../../../store/state';
import { placement, ROOT, WORKSTATION } from './placement-fixture';
import { mountOn } from './placement-model';

const WIRE = snapshotWire();
const TABLES = SNAPSHOT.parse(WIRE).tables;

function snapshotWith(rows: readonly unknown[]): Snapshot {
  return SNAPSHOT.parse({ ...WIRE, tables: { ...TABLES, drive_placements: rows } });
}

function switchOn(state: StoreState): boolean {
  return mountOn(WORKSTATION, state.tables.drive_placements.rows, ROOT)?.enabled === true;
}

describe('the Mount My Drive switch across reconnects', () => {
  const mounted = placement({ enabled: true }, { state: 'mounted' });

  it('stays on when the app reloads its snapshot after a reconnect', () => {
    const turnedOn = applyChange(replaceWith(emptyState(), snapshotWith([])), {
      type: 'change',
      table: 'drive_placements',
      operation: 'INSERT',
      record: mounted,
      oldRecord: null,
    });
    expect(switchOn(turnedOn)).toBe(true);
    const reconnected = replaceWith(turnedOn, snapshotWith([mounted]));
    expect(switchOn(reconnected)).toBe(true);
  });

  it('shows the mount on from a fresh start, before any live change arrives', () => {
    expect(switchOn(replaceWith(emptyState(), snapshotWith([mounted])))).toBe(true);
  });

  it('shows the mount off when the snapshot says it is off', () => {
    const off = placement({ enabled: false }, { state: 'stopped' });
    expect(switchOn(replaceWith(emptyState(), snapshotWith([off])))).toBe(false);
  });

  it('refuses a snapshot without the placements table', () => {
    const withoutPlacements = Object.fromEntries(
      Object.entries(TABLES).filter(([name]) => name !== 'drive_placements'),
    );
    expect(SNAPSHOT.safeParse({ ...WIRE, tables: withoutPlacements }).success).toBe(false);
  });
});
