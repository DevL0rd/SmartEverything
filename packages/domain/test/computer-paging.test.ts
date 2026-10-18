import { describe, expect, it } from 'vitest';
import { FILE_CHUNK_BYTES, FILE_LIST, FILE_RANGE, LIST_CURSOR } from '../src/node/computer-files';
import { PROCESS_LIST, PROCESS_QUERY } from '../src/node/computer-processes';
import { NODE_REQUEST } from '../src/node/node-requests';
import { API_ENDPOINTS } from '../src/api/endpoints';

describe('computer listings', () => {
  it('start at the first page and count query strings as numbers', () => {
    expect(LIST_CURSOR.parse(undefined)).toBe(0);
    expect(LIST_CURSOR.parse('1000')).toBe(1000);
    expect(() => LIST_CURSOR.parse('-1')).toThrow();
    expect(PROCESS_QUERY.parse({})).toEqual({ sort: 'cpu', limit: 50, cursor: 0 });
  });

  it('put no ceiling on how many programs one page may ask for', () => {
    expect(PROCESS_QUERY.parse({ limit: '5000', cursor: '50' })).toMatchObject({
      limit: 5000,
      cursor: 50,
    });
  });

  it('carry the cursor of the following page, or null on the last', () => {
    const base = { path: '/tmp', parent: '/', entries: [], total: 0 };
    expect(FILE_LIST.parse({ ...base, next: 500 }).next).toBe(500);
    expect(FILE_LIST.parse({ ...base, next: null }).next).toBeNull();
    const at = '2026-10-17T09:00:00.000Z';
    expect(PROCESS_LIST.parse({ at, total: 0, next: null, processes: [] }).next).toBeNull();
  });
});

describe('node file requests', () => {
  it('list a folder from a cursor and read a bounded byte range', () => {
    expect(NODE_REQUEST.safeParse({ verb: 'files', path: null, cursor: 500 }).success).toBe(true);
    expect(NODE_REQUEST.safeParse({ verb: 'files', path: null }).success).toBe(false);
    const range = { verb: 'file_range', path: '/mnt/video.mp4', start: 0 };
    expect(NODE_REQUEST.safeParse({ ...range, length: FILE_CHUNK_BYTES }).success).toBe(true);
    expect(NODE_REQUEST.safeParse({ ...range, length: FILE_CHUNK_BYTES + 1 }).success).toBe(false);
    expect(NODE_REQUEST.safeParse({ ...range, length: 0 }).success).toBe(false);
  });

  it('answer a byte range as base64 with the whole file size', () => {
    const range = { name: 'a.bin', size: 10, mimeType: 'application/octet-stream' };
    expect(FILE_RANGE.safeParse({ ...range, data: 'AAEC' }).success).toBe(true);
    expect(FILE_RANGE.safeParse({ ...range, data: 'not base64!' }).success).toBe(false);
  });
});

describe('computer endpoints', () => {
  it('give the connect links their own member endpoint instead of the computer reading', () => {
    expect(API_ENDPOINTS.listComputerLinks).toMatchObject({
      method: 'GET',
      path: '/api/computers/:deviceId/links',
      access: 'member',
    });
    expect(Object.keys(API_ENDPOINTS.readComputer.response.shape)).not.toContain('links');
  });
});
