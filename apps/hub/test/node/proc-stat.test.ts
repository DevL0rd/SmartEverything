import { describe, expect, it } from 'vitest';
import {
  ioBytesOf,
  parsePasswd,
  parseStat,
  totalJiffiesOf,
} from '../../src/node/controls/linux/proc-stat';

const TAIL =
  '1 1234 1234 0 -1 4194560 1000 0 0 0 150 50 0 0 20 0 7 0 987654 123456789 2500 18446744073709551615 1 1 0';

describe('parseStat', () => {
  it('reads the name, state, parent, CPU ticks, threads, start time and resident pages', () => {
    expect(parseStat(`1234 (firefox) S ${TAIL}`)).toEqual({
      name: 'firefox',
      state: 'sleeping',
      ppid: 1,
      ticks: 200,
      threads: 7,
      start: 987_654,
      rssPages: 2500,
    });
  });

  it('keeps spaces and parentheses inside the process name', () => {
    expect(parseStat(`77 (Web Content (isolated)) R ${TAIL}`)).toMatchObject({
      name: 'Web Content (isolated)',
      state: 'running',
      ticks: 200,
    });
  });

  it('maps kernel states to the ones people see and calls an unknown one other', () => {
    const state = (letter: string): string | undefined =>
      parseStat(`1 (x) ${letter} ${TAIL}`)?.state;
    expect(state('R')).toBe('running');
    expect(['S', 'D', 'I'].map(state)).toEqual(['sleeping', 'sleeping', 'sleeping']);
    expect(['T', 't'].map(state)).toEqual(['stopped', 'stopped']);
    expect(state('Z')).toBe('zombie');
    expect(['X', 'K', 'P'].map(state)).toEqual(['other', 'other', 'other']);
  });

  it('is null for text that has no process name', () => {
    expect(parseStat('')).toBeNull();
    expect(parseStat('garbage without parentheses')).toBeNull();
    expect(parseStat(') backwards (')).toBeNull();
  });

  it('counts the missing trailing fields of a short line as zero', () => {
    expect(parseStat('9 (short) S 1')).toEqual({
      name: 'short',
      state: 'sleeping',
      ppid: 1,
      ticks: 0,
      threads: 0,
      start: 0,
      rssPages: 0,
    });
  });
});

describe('ioBytesOf', () => {
  it('adds the bytes a process read from and wrote to storage', () => {
    const text = [
      'rchar: 100',
      'wchar: 200',
      'syscr: 1',
      'syscw: 2',
      'read_bytes: 4096',
      'write_bytes: 8192',
      'cancelled_write_bytes: 0',
    ].join('\n');
    expect(ioBytesOf(text)).toBe(12_288);
  });

  it('does not mistake cancelled or character counts for storage bytes', () => {
    expect(ioBytesOf('rchar: 5\nwchar: 7\ncancelled_write_bytes: 9\n')).toBe(0);
    expect(ioBytesOf('')).toBe(0);
    expect(ioBytesOf('read_bytes: 10\n')).toBe(10);
  });
});

describe('totalJiffiesOf', () => {
  it('adds the busy and idle fields of the total line only', () => {
    expect(totalJiffiesOf('cpu  1 2 3 4 5 6 7 8 9 10\ncpu0 100 100 100 100\n')).toBe(36);
    expect(totalJiffiesOf('cpu 1 1 1 1 1 1 1 1')).toBe(8);
  });
});

describe('parsePasswd', () => {
  it('maps user ids to names, the first name winning for a repeated id', () => {
    const names = parsePasswd(
      'root:x:0:0::/root:/bin/bash\nalice:x:1000:1000::/home/a:/bin/zsh\ntwin:x:1000:1000::/h:/bin/sh\n\n',
    );
    expect(names.get(0)).toBe('root');
    expect(names.get(1000)).toBe('alice');
    expect(names.size).toBe(2);
  });
});
