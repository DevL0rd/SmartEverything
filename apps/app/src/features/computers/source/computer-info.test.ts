import { describe, expect, it } from 'vitest';
import { nodeOfEntry, nodeOfTrash } from './computer-node';
import { infoRowsOf, modeText } from './computer-info';

const MOMENT = '2026-11-14T10:00:00.000Z';

const NODE = nodeOfEntry(
  {
    name: 'a.txt',
    path: '/home/dana/a.txt',
    kind: 'file',
    mime: 'text/plain',
    size: 2048,
    modifiedAt: MOMENT,
    hidden: false,
  },
  true,
  [],
);

describe('computer file info', () => {
  it('writes a mode as letters and octal digits', () => {
    expect(modeText(0o644)).toBe('rw-r--r-- (644)');
    expect(modeText(0o755)).toBe('rwxr-xr-x (755)');
    expect(modeText(0o7)).toBe('------rwx (007)');
  });

  it('shows location, size and modified before the properties arrive', () => {
    expect(infoRowsOf(NODE, undefined).map((row) => row.key)).toEqual(['path', 'size', 'modified']);
  });

  it('adds owner, group, permissions and the link target once known', () => {
    const rows = infoRowsOf(NODE, {
      name: 'a.txt',
      path: '/home/dana/a.txt',
      kind: 'link',
      size: 2048,
      mimeType: null,
      modifiedAt: MOMENT,
      createdAt: MOMENT,
      owner: 'dana',
      group: 'users',
      permissions: { readable: true, writable: false, mode: 0o444 },
      linkTarget: '/etc/hosts',
    });
    expect(rows.map((row) => row.key)).toEqual([
      'path',
      'size',
      'modified',
      'created',
      'owner',
      'group',
      'mode',
      'link',
    ]);
    expect(rows.find((row) => row.key === 'owner')?.value).toBe('dana');
    expect(rows.find((row) => row.key === 'mode')?.value).toContain('Read only');
    expect(rows.find((row) => row.key === 'link')?.value).toBe('/etc/hosts');
  });

  it('tells a Trash item where it was and when it went', () => {
    const rows = infoRowsOf(
      nodeOfTrash({
        trashId: 't',
        name: 'b.txt',
        originalPath: '/home/dana/b.txt',
        deletedAt: MOMENT,
        size: 5,
        kind: 'file',
      }),
      undefined,
    );
    expect(rows.map((row) => row.key)).toEqual(['original', 'deleted', 'size']);
    expect(rows[0]?.value).toBe('/home/dana/b.txt');
  });
});
