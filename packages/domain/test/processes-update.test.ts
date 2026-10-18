import { describe, expect, it } from 'vitest';
import {
  completeProcessRow,
  mergeProcessUpdates,
  PROCESSES_UPDATE,
  type ProcessRow,
  type ProcessRowUpdate,
} from '../src';

const FULL: ProcessRow = {
  pid: 7,
  start: 3,
  ppid: 1,
  name: 'node',
  command: 'node app.js',
  user: 'me',
  state: 'sleeping',
  cpu: 1,
  memoryBytes: 10,
  gpu: null,
  diskRate: 0,
  threads: 2,
  descendants: 0,
  own: true,
};

const MOVING: ProcessRowUpdate = {
  pid: 7,
  start: 3,
  state: 'sleeping',
  cpu: 5,
  memoryBytes: 10,
  gpu: null,
  diskRate: 0,
  threads: 2,
  descendants: 0,
  own: true,
};

describe('process row updates', () => {
  it('accepts a row without its fixed fields on the wire', () => {
    const part = { total: 1, offset: 0, order: ['7:3'], rows: [MOVING] };
    expect(PROCESSES_UPDATE.parse(part)).toEqual(part);
  });

  it('completes an update from the row already known', () => {
    expect(completeProcessRow(FULL, MOVING)).toEqual({ ...FULL, cpu: 5 });
    expect(completeProcessRow(FULL, { ...MOVING, name: 'bun' })).toEqual({
      ...FULL,
      cpu: 5,
      name: 'bun',
    });
  });

  it('cannot complete an update of a row never seen whole', () => {
    expect(completeProcessRow(undefined, MOVING)).toBeNull();
    expect(completeProcessRow(undefined, FULL)).toEqual(FULL);
  });

  it('joins two updates so nothing changed in either is lost', () => {
    const joined = mergeProcessUpdates(
      { total: 2, offset: 0, order: ['7:3', '8:3'], rows: [MOVING, { ...MOVING, pid: 8 }] },
      { total: 2, offset: 0, order: ['8:3', '7:3'], rows: [{ ...MOVING, pid: 8, cpu: 9 }] },
    );
    expect(joined.order).toEqual(['8:3', '7:3']);
    expect(joined.rows.map((row) => [row.pid, row.cpu])).toEqual([
      [7, 5],
      [8, 9],
    ]);
  });
});
