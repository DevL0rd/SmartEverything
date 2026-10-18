import { describe, expect, it } from 'vitest';
import { splitMiddle } from './text-middle';

describe('splitMiddle', () => {
  it('keeps the registrable domain of a long host name visible', () => {
    expect(splitMiddle('a-very-long-subdomain.tracking.example.net')).toEqual({
      head: 'a-very-long-subdomain.tracking.',
      tail: 'example.net',
    });
  });

  it('keeps the file name of a path visible', () => {
    expect(splitMiddle('Photos/2026/trip/IMG_2202.HEIC')).toEqual({
      head: 'Photos/2026/trip/',
      tail: 'IMG_2202.HEIC',
    });
  });

  it('prefers the last slash over dots in earlier folders', () => {
    expect(splitMiddle('backup.d/old.copy/notes.txt')).toEqual({
      head: 'backup.d/old.copy/',
      tail: 'notes.txt',
    });
  });

  it('keeps the last eight characters of long plain text', () => {
    expect(splitMiddle('Living room ceiling speaker')).toEqual({
      head: 'Living room ceiling',
      tail: ' speaker',
    });
  });

  it('leaves short text whole', () => {
    expect(splitMiddle('example.net')).toEqual({ head: 'example.net', tail: '' });
    expect(splitMiddle('Kitchen')).toEqual({ head: 'Kitchen', tail: '' });
  });
});
