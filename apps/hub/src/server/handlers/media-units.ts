import type { API_ENDPOINTS as E } from '@smarteverything/domain';
import { type RecordingRow } from '@smarteverything/domain';
import type { z } from 'zod';
import { storeUnit } from '../../store/host/unit';
import type { Store } from '../../store/store';

function requireIrRemote(store: Store, remoteId: string): void {
  if (store.devices.find(remoteId)?.kind === 'ir_remote') return;
  if (store.irAppliances.find(remoteId) !== undefined) return;
  store.infrared.remote(remoteId);
}

export interface IrRemoteChange {
  readonly remoteId: string;
  readonly body: z.output<typeof E.updateIrRemote.body>;
}

export const MEDIA_READ_UNITS = {
  recordingIds: storeUnit((store, ids: readonly string[]): string[] =>
    ids.map((id) => store.cameras.recording(id).id),
  ),
} as const;

export const MEDIA_WRITE_UNITS = {
  createIrRemote: storeUnit((store, body: z.output<typeof E.createIrRemote.body>) => {
    store.devices.byId(body.blaster_id);
    return store.infrared.addRemote(body);
  }),
  removeIrRemote: storeUnit((store, remoteId: string): void => {
    store.infrared.removeRemote(remoteId);
    store.settings.forgetIrRemote(remoteId);
  }),
  updateIrRemote: storeUnit((store, { remoteId, body }: IrRemoteChange) => {
    requireIrRemote(store, remoteId);
    if (body.checkDeviceId !== undefined && body.checkDeviceId !== null) {
      store.devices.byId(body.checkDeviceId);
    }
    store.settings.setIrRemote(remoteId, body);
    return store.settings.irRemote(remoteId);
  }),
  removeEvent: storeUnit((store, eventId: string): RecordingRow[] => {
    const event = store.events.byId(eventId);
    const removed = store.cameras
      .recordingsOfEvent(event.id)
      .map((recording) => store.cameras.removeRecording(recording.id));
    store.events.remove(event.id);
    return removed;
  }),
} as const;
