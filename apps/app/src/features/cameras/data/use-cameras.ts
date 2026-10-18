import type { CameraReach, EventRow, RecordingRow } from '@smarteverything/domain';
import { memoOnInputs } from '../../../store/memo-selector';
import { rowsOf } from '../../../store/state';
import { shallowEqual, useStoreSelector } from '../../../store/store-context';
import { cameraEntriesOf, sameEntries, type CameraEntry } from '../logic/cameras';
import { CAMERA_EVENT_KINDS } from '../logic/timeline';

export const selectCameraEntries = memoOnInputs(
  (state) => [state.tables.devices, state.tables.cameras, state.tables.rooms],
  (state): CameraEntry[] =>
    cameraEntriesOf({
      devices: rowsOf(state.tables.devices),
      cameras: state.tables.cameras.byId,
      rooms: rowsOf(state.tables.rooms),
    }),
);

export function useCameraEntries(): readonly CameraEntry[] {
  return useStoreSelector(selectCameraEntries, sameEntries);
}

export function useCameraEntry(deviceId: string): CameraEntry | null {
  return useCameraEntries().find((entry) => entry.device.id === deviceId) ?? null;
}

const CAMERA_KIND_SET: ReadonlySet<string> = new Set(CAMERA_EVENT_KINDS);

export function useCameraEvents(deviceIds: readonly string[]): readonly EventRow[] {
  const key = deviceIds.join(',');
  return useStoreSelector(
    (state) => {
      const ids = new Set(key.split(','));
      return rowsOf(state.tables.events).filter(
        (event) =>
          event.device_id !== null && ids.has(event.device_id) && CAMERA_KIND_SET.has(event.kind),
      );
    },
    shallowEqual,
    [key],
  );
}

export function useCameraRecordings(deviceIds: readonly string[]): readonly RecordingRow[] {
  const key = deviceIds.join(',');
  return useStoreSelector(
    (state) => {
      const ids = new Set(key.split(','));
      return rowsOf(state.tables.recordings).filter((recording) => ids.has(recording.device_id));
    },
    shallowEqual,
    [key],
  );
}

export function useRecording(recordingId: string): RecordingRow | null {
  return useStoreSelector((state) => state.tables.recordings.byId[recordingId] ?? null);
}

export function useCameraReach(deviceId: string): CameraReach | null {
  return useStoreSelector(
    (state) => state.firewall?.cameras.find((camera) => camera.deviceId === deviceId) ?? null,
  );
}

export function useCameraReaches(): readonly CameraReach[] {
  return useStoreSelector((state) => state.firewall?.cameras ?? [], shallowEqual);
}
