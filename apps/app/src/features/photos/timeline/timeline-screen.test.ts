import { describe, expect, it, vi } from 'vitest';
import {
  NO_SELECTION,
  type MediaSelectionControls,
} from '../../../components/media-grid/selection';

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

describe('timeline page modules', () => {
  it('load without crashing the app on open', { timeout: 240_000 }, async () => {
    const screen = await import('./timeline-screen');
    const selection = await import('./timeline-selection');
    const media = await import('./use-media-actions');
    const chip = await import('./backup-chip');
    const merge = await import('./phone-merge');
    expect(typeof screen.TimelineScreen).toBe('function');
    expect(typeof selection.TimelineSelection).toBe('function');
    expect(typeof selection.TimelineActionRow).toBe('function');
    expect(typeof media.useMediaActions).toBe('function');
    expect(typeof chip.BackupChip).toBe('function');
    expect(typeof chip.NotBackedUpChip).toBe('function');
    expect(typeof merge.useLocalMerge).toBe('function');
  });

  it('keeps Upload and Select while the library frame owns the settings entry', async () => {
    const { timelineActions } = await import('./timeline-screen');
    const begin = vi.fn();
    const wide = timelineActions(false, controlsOf(begin));
    expect(wide.map((action) => action.label)).toEqual(['Upload', 'Select']);
    expect(wide.filter((action) => action.primary === true).map((action) => action.label)).toEqual([
      'Upload',
    ]);
    wide.find((action) => action.label === 'Select')?.onPress?.();
    expect(begin).toHaveBeenCalledTimes(1);
  });

  it('adds the search opener on phones and shows every action as an icon', async () => {
    const { timelineActions } = await import('./timeline-screen');
    const compact = timelineActions(true, controlsOf(vi.fn()));
    expect(compact.map((action) => action.label)).toEqual(['Search photos', 'Upload', 'Select']);
    expect(compact.every((action) => action.iconOnly === true)).toBe(true);
  });
});
