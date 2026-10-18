import { rm } from 'node:fs/promises';
import { API_ENDPOINTS as E, type RecordingRow } from '@smarteverything/domain';
import { thumbnailPathOf } from '../../cameras/thumbnails';
import { clientOf } from '../auth';
import { deviceScopeOf, reachableRows } from '../person-scope';
import type { ServerContext } from '../context';
import { requireOwner } from './transcripts';
import { DONE_REPLY, bound } from '../router';
import { messageOf } from '@smarteverything/logging';

async function removeFiles(context: ServerContext, recording: RecordingRow): Promise<void> {
  const path = context.recordingPath(recording.storage_path);
  await Promise.all([rm(path), rm(thumbnailPathOf(path), { force: true })]).catch(
    (cause: unknown) => {
      context.log.warn('recording.file_not_removed', {
        recordingId: recording.id,
        reason: messageOf(cause),
      });
    },
  );
}

function requireIrRemote(store: ServerContext['store'], remoteId: string): void {
  if (store.devices.find(remoteId)?.kind !== 'ir_remote') {
    store.infrared.remote(remoteId);
  }
}

const infraredRoutes = ({ store }: ServerContext) =>
  ({
    listIrRemotes: bound(E.listIrRemotes, () => store.infrared.remotes()),
    createIrRemote: bound(E.createIrRemote, ({ body }) => {
      store.devices.byId(body.blaster_id);
      return store.infrared.addRemote(body);
    }),
    removeIrRemote: bound(E.removeIrRemote, ({ params }) => {
      store.infrared.removeRemote(params.remoteId);
      store.settings.forgetIrRemote(params.remoteId);
      return DONE_REPLY;
    }),
    updateIrRemote: bound(E.updateIrRemote, ({ params, body }) => {
      requireIrRemote(store, params.remoteId);
      if (body.checkDeviceId !== undefined && body.checkDeviceId !== null) {
        store.devices.byId(body.checkDeviceId);
      }
      store.settings.setIrRemote(params.remoteId, body);
      return store.settings.irRemote(params.remoteId);
    }),
    listIrCodes: bound(E.listIrCodes, () => store.infrared.codes()),
    saveIrCode: bound(E.saveIrCode, ({ body }) => store.infrared.saveCode(body)),
    removeIrCode: bound(E.removeIrCode, ({ params }) => {
      store.infrared.removeCode(params.codeId);
      return DONE_REPLY;
    }),
  }) as const;

const cameraRoutes = ({ store, hub, links }: ServerContext) =>
  ({
    listCameras: bound(E.listCameras, ({ caller }) =>
      reachableRows(
        store,
        deviceScopeOf(store, caller),
        store.cameras.list(),
        (row) => row.device_id,
      ),
    ),
    updateCamera: bound(E.updateCamera, ({ params, body, caller }) => {
      if (body.transcribe === true) {
        requireOwner(caller);
      }
      return store.cameras.change(params.deviceId, body);
    }),
    offerCamera: bound(E.offerCamera, async ({ params, query, body, caller }) => ({
      sdp: await hub.answerOffer(params.deviceId, body.sdp, clientOf(caller).id, query.quality),
    })),
    talkCamera: bound(E.talkCamera, async ({ params, body, caller }) => ({
      sdp: await hub.answerTalk(params.deviceId, body.sdp, clientOf(caller).id),
    })),
    cameraStream: bound(E.cameraStream, async ({ params }) => {
      await hub.streamReady(params.deviceId);
      return links.cameraStream(params.deviceId);
    }),
    cameraSnapshot: bound(E.cameraSnapshot, async ({ params, query }) => {
      await hub.streamReady(params.deviceId);
      return links.cameraSnapshot(params.deviceId, query.size);
    }),
  }) as const;

const recordingRoutes = (context: ServerContext) =>
  ({
    listRecordings: bound(E.listRecordings, ({ query, caller }) =>
      reachableRows(
        context.store,
        deviceScopeOf(context.store, caller),
        context.store.cameras.recordings(query),
        (row) => row.device_id,
      ),
    ),
    recordingLinks: bound(E.recordingLinks, ({ body }) =>
      body.ids.map((id) => ({
        id: context.store.cameras.recording(id).id,
        ...context.links.recording(id, body.size),
      })),
    ),
    removeRecording: bound(E.removeRecording, async ({ params }) => {
      await removeFiles(context, context.store.cameras.removeRecording(params.recordingId));
      return DONE_REPLY;
    }),
    removeEvent: bound(E.removeEvent, async ({ params }) => {
      const event = context.store.events.byId(params.eventId);
      const recordings = context.store.cameras.recordingsOfEvent(event.id);
      const removed = recordings.map((recording) =>
        context.store.cameras.removeRecording(recording.id),
      );
      context.store.events.remove(event.id);
      await Promise.all(removed.map((recording) => removeFiles(context, recording)));
      context.log.info('event.removed', { eventId: event.id, recordings: removed.length });
      return DONE_REPLY;
    }),
  }) as const;

export const mediaRoutes = (context: ServerContext) =>
  ({
    ...cameraRoutes(context),
    ...recordingRoutes(context),
    ...infraredRoutes(context),
  }) as const;
