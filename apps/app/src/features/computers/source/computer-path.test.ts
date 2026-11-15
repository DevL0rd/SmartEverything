import { describe, expect, it } from 'vitest';
import {
  baseName,
  chunkOf,
  isWithin,
  joinPath,
  normalPath,
  parentOf,
  piecesOf,
  rootOf,
  segmentsOf,
} from './computer-path';

describe('computer paths', () => {
  it('finds the root of POSIX, drive and network paths', () => {
    expect(rootOf('/home/dana')).toBe('/');
    expect(rootOf('C:\\Users\\Dana')).toBe('C:\\');
    expect(rootOf('\\\\nas\\share\\docs')).toBe('\\\\nas\\share');
  });

  it('joins and splits with the separator of the path', () => {
    expect(joinPath('/', 'etc')).toBe('/etc');
    expect(joinPath('/home/dana/', 'notes.txt')).toBe('/home/dana/notes.txt');
    expect(joinPath('C:\\', 'Users')).toBe('C:\\Users');
    expect(joinPath('C:\\Users', 'Dana')).toBe('C:\\Users\\Dana');
    expect(segmentsOf('C:\\Users\\Dana')).toEqual(['Users', 'Dana']);
    expect(baseName('/home/dana/')).toBe('dana');
    expect(baseName('/')).toBe('/');
  });

  it('walks up to the root and stops there', () => {
    expect(parentOf('/home/dana')).toBe('/home');
    expect(parentOf('/home')).toBe('/');
    expect(parentOf('/')).toBeNull();
    expect(parentOf('C:\\Users')).toBe('C:\\');
    expect(parentOf('C:\\Users\\Dana')).toBe('C:\\Users');
    expect(parentOf('C:\\')).toBeNull();
  });

  it('drops trailing separators except on a root', () => {
    expect(normalPath('/home/dana///')).toBe('/home/dana');
    expect(normalPath('/')).toBe('/');
    expect(normalPath('C:\\Users\\')).toBe('C:\\Users');
  });

  it('knows a path inside a folder and refuses a sibling with the same prefix', () => {
    expect(isWithin('/home/dana/Documents', '/home/dana')).toBe(true);
    expect(isWithin('/home/dana', '/home/dana')).toBe(true);
    expect(isWithin('/home/danaX', '/home/dana')).toBe(false);
    expect(isWithin('/anything', '/')).toBe(true);
    expect(isWithin('D:\\data', 'C:\\')).toBe(false);
  });

  it('cuts an upload into pieces with the last one final', () => {
    expect(piecesOf(0)).toEqual([{ start: 0, end: 0, final: true }]);
    expect(piecesOf(10, 4)).toEqual([
      { start: 0, end: 4, final: false },
      { start: 4, end: 8, final: false },
      { start: 8, end: 10, final: true },
    ]);
    expect(chunkOf('/a', { start: 0, end: 1, final: true }, 'AA==', true)).toEqual({
      path: '/a',
      start: 0,
      data: 'AA==',
      final: true,
      replace: true,
    });
  });
});
