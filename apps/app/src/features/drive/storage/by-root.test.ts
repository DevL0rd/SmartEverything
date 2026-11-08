import { DRIVE_ROOT, DRIVE_STATS, type DriveRoot } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { describe, expect, it } from 'vitest';
import { OTHER_ROOT_ID, ROOT_ID, rootRow } from '../../nas/data/fixtures';
import { rootEntriesOf } from './by-root';

const GB = 1024 ** 3;

function root(id: string, label: string): DriveRoot {
  return DRIVE_ROOT.parse({ ...rootRow(id, 'ready'), label });
}

const MEDIA = root(ROOT_ID, 'Media disk');
const PROJECTS = root(OTHER_ROOT_ID, 'Projects');

const EMPTY = {
  items: 0,
  folders: 0,
  bytes: 0,
  liveBytes: 0,
  versionBytes: 0,
  trashBytes: 0,
  kinds: [],
  volumes: [],
  purges: [],
  growth: null,
};

describe('Storage by library folder', () => {
  it('ranks the folders by size against the largest and skips folders the viewer cannot see', () => {
    const entries = rootEntriesOf(
      DRIVE_STATS.parse({
        ...EMPTY,
        roots: [
          { rootId: OTHER_ROOT_ID, items: 1, folders: 0, bytes: 100 * GB },
          { rootId: ROOT_ID, items: 40, folders: 2, bytes: 200 * GB },
          { rootId: '00000000-0000-4000-8000-0000000000ff', items: 3, folders: 0, bytes: 900 * GB },
        ],
      }),
      [MEDIA, PROJECTS],
    );
    expect(entries.map((entry) => [entry.label, entry.value, entry.share])).toEqual([
      ['Media disk', bytes(200 * GB), 1],
      ['Projects', bytes(100 * GB), 0.5],
    ]);
    expect(entries[0]?.spoken).toBe(`Media disk, ${bytes(200 * GB)}, 40 files`);
  });
});
