import { describe, expect, it } from 'vitest';
import {
  API_ENDPOINTS,
  COMPUTER_DOWNLOAD,
  DOWNLOAD_PLAN,
  FILE_CHUNK_BYTES,
  FILE_PLACES,
  NODE_REQUEST,
  NODE_VERB_SCOPES,
} from '../src';

describe('computer downloads', () => {
  it('ask the computer for a plan, then for the bytes, with the files permission', () => {
    const requests = [
      { verb: 'download_open', paths: ['/home/dana', '/etc/hosts'] },
      { verb: 'download_read', id: 'abc', length: FILE_CHUNK_BYTES },
      { verb: 'download_close', id: 'abc' },
      { verb: 'file_places' },
    ];
    for (const request of requests) {
      expect(NODE_VERB_SCOPES[NODE_REQUEST.parse(request).verb]).toBe('files');
    }
  });

  it('refuse an empty list, a relative path and a read bigger than a chunk', () => {
    expect(NODE_REQUEST.safeParse({ verb: 'download_open', paths: [] }).success).toBe(false);
    expect(NODE_REQUEST.safeParse({ verb: 'download_open', paths: ['a/b'] }).success).toBe(false);
    expect(
      NODE_REQUEST.safeParse({ verb: 'download_read', id: 'a', length: FILE_CHUNK_BYTES + 1 })
        .success,
    ).toBe(false);
  });

  it('describe a file or a zip, with no limit on how big', () => {
    const facts = { name: 'a', files: 1, folders: 0, bytes: 9e15, skipped: [] };
    expect(
      DOWNLOAD_PLAN.parse({
        kind: 'file',
        path: '/a',
        size: 9e15,
        mimeType: 'text/plain',
        ...facts,
      }),
    ).toMatchObject({ kind: 'file' });
    expect(DOWNLOAD_PLAN.parse({ kind: 'zip', id: 'x', ...facts })).toMatchObject({ kind: 'zip' });
    expect(DOWNLOAD_PLAN.safeParse({ kind: 'zip', ...facts }).success).toBe(false);
  });

  it('answer with a link and what was left out', () => {
    expect(
      COMPUTER_DOWNLOAD.parse({
        kind: 'zip',
        name: 'proj.zip',
        size: null,
        files: 3,
        folders: 1,
        bytes: 10,
        skipped: [{ path: '/a/b', reason: 'No permission.' }],
        url: '/media/computers/d/downloads/t?expires=1&signature=a',
        expiresAt: '2026-10-18T10:00:00.000Z',
      }),
    ).toMatchObject({ skipped: [{ path: '/a/b' }] });
  });

  it('are endpoints members can use, with places to start from', () => {
    expect(API_ENDPOINTS.prepareComputerDownload.access).toBe('member');
    expect(API_ENDPOINTS.readComputerPlaces.access).toBe('member');
    expect(
      FILE_PLACES.parse({
        home: '/home/dana',
        places: [{ label: 'Home', path: '/home/dana', kind: 'home' }],
      }).places,
    ).toHaveLength(1);
  });
});
