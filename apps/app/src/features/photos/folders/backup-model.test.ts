import { describe, expect, it } from 'vitest';
import { backupStateLine, folderBackupChange, folderBacksUp } from './backup-model';

const KNOWN = ['camera', 'screens', 'whatsapp'];

describe('backing up a folder from the Folders page', () => {
  it('reads the same selection the Backup settings use', () => {
    expect(folderBacksUp({ enabled: true, albumIds: [] }, 'camera')).toBe(true);
    expect(folderBacksUp({ enabled: true, albumIds: ['screens'] }, 'camera')).toBe(false);
    expect(folderBacksUp({ enabled: false, albumIds: [] }, 'camera')).toBe(false);
    expect(backupStateLine({ enabled: true, albumIds: [] }, 'camera')).toBe('Backing up');
    expect(backupStateLine({ enabled: true, albumIds: ['screens'] }, 'camera')).toBe(
      'Not backed up',
    );
    expect(backupStateLine({ enabled: false, albumIds: [] }, 'camera')).toBe('Backup is off');
  });

  it('turns one folder off by keeping every other folder chosen', () => {
    expect(folderBackupChange({ enabled: true, albumIds: [] }, 'camera', false, KNOWN)).toEqual({
      enabled: true,
      albumIds: ['screens', 'whatsapp'],
    });
    expect(
      folderBackupChange(
        { enabled: true, albumIds: ['camera', 'screens'] },
        'camera',
        false,
        KNOWN,
      ),
    ).toEqual({ enabled: true, albumIds: ['screens'] });
  });

  it('turns backup off instead of choosing everything when the last folder goes', () => {
    expect(
      folderBackupChange({ enabled: true, albumIds: ['camera'] }, 'camera', false, KNOWN),
    ).toEqual({ enabled: false, albumIds: ['camera'] });
    expect(
      folderBackupChange({ enabled: true, albumIds: [] }, 'camera', false, ['camera']),
    ).toEqual({ enabled: false, albumIds: [] });
  });

  it('adds a folder to the selection and turns backup on for it', () => {
    expect(
      folderBackupChange({ enabled: true, albumIds: ['screens'] }, 'camera', true, KNOWN),
    ).toEqual({ enabled: true, albumIds: ['screens', 'camera'] });
    expect(folderBackupChange({ enabled: false, albumIds: [] }, 'camera', true, KNOWN)).toEqual({
      enabled: true,
      albumIds: ['camera'],
    });
    expect(
      folderBackupChange({ enabled: false, albumIds: ['camera'] }, 'camera', true, KNOWN),
    ).toEqual({ enabled: true, albumIds: ['camera'] });
  });

  it('leaves the choice alone when nothing changes', () => {
    const all = { enabled: true, albumIds: [] };
    expect(folderBackupChange(all, 'camera', true, KNOWN)).toBe(all);
    const off = { enabled: false, albumIds: [] };
    expect(folderBackupChange(off, 'camera', false, KNOWN)).toBe(off);
  });
});
