import { describe, expect, it } from 'vitest';
import type { ProcessRow } from '@smarteverything/domain';
import { diskText, gpuText, helpersText, layoutOf, phoneLine, spokenRow } from './process-format';

const ROW: ProcessRow = {
  pid: 4,
  start: 1,
  ppid: 1,
  name: 'firefox',
  command: 'firefox',
  user: 'root',
  state: 'running',
  cpu: 14.24,
  memoryBytes: 2_147_483_648,
  gpu: null,
  diskRate: 0,
  threads: 40,
  descendants: 3,
  own: false,
};

describe('layoutOf', () => {
  it('picks the phone rows, the four columns or all seven', () => {
    expect(layoutOf(400)).toBe('phone');
    expect(layoutOf(700)).toBe('table');
    expect(layoutOf(728)).toBe('full');
  });
});

describe('row words', () => {
  it('shows a dash where the computer has no figure', () => {
    expect(gpuText(ROW)).toBe('—');
    expect(diskText(ROW)).toBe('—');
    expect(gpuText({ ...ROW, gpu: 7.4 })).toBe('7 %');
  });

  it('counts helpers and says them aloud', () => {
    expect(helpersText(ROW)).toBe('+3 helpers');
    expect(helpersText({ ...ROW, descendants: 0 })).toBeNull();
    expect(spokenRow(ROW)).toContain('firefox and 3 helpers, 14.2 percent processor');
  });

  it('names the user on the second phone line', () => {
    expect(phoneLine(ROW, true)).toBe('root');
    expect(phoneLine({ ...ROW, gpu: 3, own: true }, true)).toBe('GPU 3 % · you');
  });
});
