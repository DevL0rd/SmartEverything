import { describe, expect, it } from 'vitest';
import { personalRootRow, rootRow } from '../data/fixtures';
import { firstRunBodiesOf, parentProblemOf } from './first-run-card';
import { ME, OTHER_ROOT, ROOT, WORKSTATION } from './placement-fixture';

describe('first run mounts', () => {
  it('mounts My Drive and the Shared Drive side by side under the parent folder', () => {
    const bodies = firstRunBodiesOf(WORKSTATION, '/home/me/SmartEverything', [
      { root: personalRootRow(ROOT, ME), name: 'My Drive' },
      { root: rootRow(OTHER_ROOT, 'ready'), name: 'Shared Drive' },
    ]);
    expect(bodies).toEqual([
      {
        deviceId: WORKSTATION,
        rootId: ROOT,
        folderItemId: null,
        mode: 'mounted',
        localPath: '/home/me/SmartEverything/My Drive',
        enabled: true,
      },
      {
        deviceId: WORKSTATION,
        rootId: OTHER_ROOT,
        folderItemId: null,
        mode: 'mounted',
        localPath: '/home/me/SmartEverything/Shared Drive',
        enabled: true,
      },
    ]);
  });

  it('needs a full path for the parent folder', () => {
    expect(parentProblemOf('')).toBe('Type a folder');
    expect(parentProblemOf('SmartEverything')).toContain('full path');
    expect(parentProblemOf('/home/me/SmartEverything')).toBeNull();
    expect(parentProblemOf('C:\\Users\\Me')).toBeNull();
  });
});
