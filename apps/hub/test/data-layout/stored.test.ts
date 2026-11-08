import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fromStored, toStored } from '../../src/data-layout';

const LAYOUT = { root: resolve('/srv/hub-data') };

describe('stored paths', () => {
  it('round-trips a nested file as a POSIX relative path', () => {
    const absolute = join(LAYOUT.root, 'people', 'p1', 'attachments', 'a1', 'x.png');
    const stored = toStored(LAYOUT, absolute);
    expect(stored).toBe('people/p1/attachments/a1/x.png');
    expect(fromStored(LAYOUT, stored)).toBe(absolute);
  });

  it.each([
    ['/etc/passwd'],
    [resolve('/srv/other/file')],
    [resolve('/srv/hub-data-sibling/file')],
    [LAYOUT.root],
    ['relative/file'],
  ])('refuses to store %s', (absolute) => {
    expect(() => toStored(LAYOUT, absolute)).toThrow();
  });

  it.each([
    ['/etc/passwd'],
    ['\\windows\\file'],
    ['C:/file'],
    ['../escape'],
    ['a/../../escape'],
    ['a/../b'],
    ['./a'],
    ['a//b'],
    ['a/'],
    [''],
    ['a\\b'],
    ['a\0b'],
  ])('refuses to read %j', (stored) => {
    expect(() => fromStored(LAYOUT, stored)).toThrow();
  });
});
