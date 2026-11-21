import { memoOnInputs } from '../../../store/memo-selector';
import { devicesIn } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import type { Device, StoreState } from '../../../store/state';
import { deepEqual } from '../model/editor/deep-equal';

export function sameEditorDevice(kept: Device, next: Device): boolean {
  return (
    kept === next ||
    (kept.id === next.id &&
      kept.label === next.label &&
      kept.kind === next.kind &&
      kept.model === next.model &&
      kept.room_id === next.room_id &&
      kept.hidden === next.hidden &&
      deepEqual(kept.capabilities, next.capabilities))
  );
}

export function sameEditorDevices(kept: readonly Device[], next: readonly Device[]): boolean {
  return (
    kept.length === next.length &&
    kept.every((device, index) => {
      const other = next[index];
      return other !== undefined && sameEditorDevice(device, other);
    })
  );
}

const devicesTable = (state: StoreState): readonly unknown[] => [state.tables.devices];

function heldDevices(includeHidden: boolean): (state: StoreState) => readonly Device[] {
  let held: readonly Device[] | null = null;
  return memoOnInputs(devicesTable, (state) => {
    const next = devicesIn(state, { includeHidden });
    if (held === null || !sameEditorDevices(held, next)) held = next;
    return held;
  });
}

export const editorDevicesIn = heldDevices(true);

export const shownEditorDevicesIn = heldDevices(false);

export function useEditorDevices(): readonly Device[] {
  return useStoreSelector(editorDevicesIn);
}

export function useShownEditorDevices(): readonly Device[] {
  return useStoreSelector(shownEditorDevicesIn);
}
