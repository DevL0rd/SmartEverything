import type { CameraReach, EventRow, RecordingRow } from '@smarteverything/domain';
import { rowsOf, type StoreState } from '../../../store/state';
import { shallowEqual, useStoreSelector } from '../../../store/store-context';
import { cameraEntriesOf, sameEntries, type CameraEntry } from '../logic/cameras';
import { CAMERA_EVENT_KINDS } from '../logic/timeline';

function entriesOf(state: StoreState): CameraEntry[] {
  return cameraEntriesOf({
    devices: rowsOf(state.tables.devices),
    cameras: state.tables.cameras.byId,
    rooms: rowsOf(state.tables.rooms),
  });
}

export function useCameraEntries(): readonly CameraEntry[] {
  return useStoreSelector(entriesOf, sameEntries);
}

export function useCameraEntry(deviceId: string): CameraEntry | null {
  return useCameraEntries().find((entry) => entry.device.id === deviceId) ?? null;
}

function cameraEventsOf(state: StoreState, deviceIds: ReadonlySet<string>): EventRow[] {
  return rowsOf(state.tables.events).filter(
    (event) =>
      event.device_id !== null &&
      deviceIds.has(event.device_id) &&
      CAMERA_EVENT_KINDS.includes(event.kind),
  );
}

export function useCameraEvents(deviceIds: readonly string[]): readonly EventRow[] {
  const key = deviceIds.join(',');
  return useStoreSelector((state) => cameraEventsOf(state, new Set(key.split(','))), shallowEqual);
}

export function useCameraRecordings(deviceIds: readonly string[]): readonly RecordingRow[] {
  const key = deviceIds.join(',');
  return useStoreSelector(
    (state) =>
      rowsOf(state.tables.recordings).filter((recording) =>
        key.split(',').includes(recording.device_id),
      ),
    shallowEqual,
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
