import { describe, expect, it, vi } from 'vitest';
import {
  NO_SELECTION,
  type MediaSelectionControls,
} from '../../../components/media-grid/selection';
import { INITIAL_BACKUP_STATUS, type BackupStatus } from '../backup/model/status';

function controlsOf(begin: () => void): MediaSelectionControls {
  const noop = (): void => undefined;
  return {
    selection: NO_SELECTION,
    begin,
    clear: noop,
    all: noop,
    press: () => false,
    day: noop,
    dragStart: noop,
    dragOver: noop,
    dragEnd: noop,
  };
}

function statusOf(phase: BackupStatus['phase']): BackupStatus {
  return { ...INITIAL_BACKUP_STATUS, phase, total: 10, done: 4 };
}

describe('library page modules', () => {
  it('load without crashing the app on open', { timeout: 240_000 }, async () => {
    const screen = await import('./library-screen');
    const hub = await import('./hub-tab');
    const device = await import('./device-tab');
    const selection = await import('./library-selection');
    const chip = await import('./backup-chip');
    const merge = await import('./phone-merge');
    expect(typeof screen.LibraryScreen).toBe('function');
    expect(typeof hub.HubTab).toBe('function');
    expect(typeof device.DeviceTab).toBe('function');
    expect(typeof selection.LibrarySelection).toBe('function');
    expect(typeof chip.BackupChip).toBe('function');
    expect(typeof merge.useLocalMerge).toBe('function');
  });

  it('keeps Upload as the one primary and Select, with no search opener', async () => {
    const { libraryActions } = await import('./hub-tab');
    const begin = vi.fn();
    const wide = libraryActions(false, controlsOf(begin));
    expect(wide.map((action) => action.label)).toEqual(['Upload', 'Select']);
    expect(wide.filter((action) => action.primary === true).map((action) => action.label)).toEqual([
      'Upload',
    ]);
    wide.find((action) => action.label === 'Select')?.onPress?.();
    expect(begin).toHaveBeenCalledTimes(1);
    const compact = libraryActions(true, controlsOf(vi.fn()));
    expect(compact.every((action) => action.iconOnly === true)).toBe(true);
  });

  it('shows Turn on backup when backup is off and a warning when photo access is off', async () => {
    const { libraryPhoneChipOf } = await import('./backup-chip');
    expect(libraryPhoneChipOf(statusOf('off'))).toEqual({
      mark: 'off',
      label: 'Turn on backup',
      progress: 0,
    });
    expect(libraryPhoneChipOf(statusOf('denied'))?.mark).toBe('warning');
    const uploading = libraryPhoneChipOf(statusOf('uploading'));
    expect(uploading?.mark).toBe('ring');
    expect(uploading?.label).toBe('Backing up 6');
    expect(libraryPhoneChipOf(statusOf('unavailable'))).toBeNull();
  });
});
