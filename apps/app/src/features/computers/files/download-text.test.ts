import { describe, expect, it } from 'vitest';
import type { ComputerDownload } from '@smarteverything/domain';
import { doneText, downloadFacts, skippedHeading, targetsTitle } from './download-text';

const BASE: ComputerDownload = {
  kind: 'zip',
  name: 'proj.zip',
  size: null,
  files: 12,
  folders: 4,
  bytes: 3 * 1024 * 1024,
  skipped: [],
  url: '/media/x',
  expiresAt: '2026-10-18T10:00:00Z',
};

describe('download wording', () => {
  it('names one item by its name and several by their count', () => {
    expect(targetsTitle([{ path: '/a/b', name: 'b', kind: 'file' }])).toBe('b');
    expect(
      targetsTitle([
        { path: '/a/b', name: 'b', kind: 'file' },
        { path: '/a/c', name: 'c', kind: 'folder' },
      ]),
    ).toBe('2 items');
  });

  it('describes a zip by what it holds and a file by its size', () => {
    expect(downloadFacts(BASE)).toBe('Zip of 12 files, 3 folders · 3.0\u00a0MB');
    expect(downloadFacts({ ...BASE, kind: 'file', size: 5, files: 1, folders: 0, bytes: 5 })).toBe(
      '5\u00a0B',
    );
    expect(downloadFacts({ ...BASE, folders: 1 })).toBe('Zip of 12 files · 3.0\u00a0MB');
  });

  it('says what could not be included and what happened', () => {
    expect(skippedHeading(1)).toBe('1 item can’t be included');
    expect(skippedHeading(2)).toBe('2 items can’t be included');
    expect(doneText('save', 'completed', 'this device')).toBe('Saved to this device.');
    expect(doneText('save', 'external', 'this phone')).toBe(
      'The download started in your browser.',
    );
    expect(doneText('share', 'completed', 'this phone')).toBe('Shared.');
  });
});
