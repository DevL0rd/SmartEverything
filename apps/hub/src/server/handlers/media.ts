import { rm } from 'node:fs/promises';
import { API_ENDPOINTS as E, type RecordingRow } from '@smarteverything/domain';
import { thumbnailPathOf } from '../../cameras/thumbnails';
import { clientOf } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound, type Bound } from '../router';

type InfraredRoutes = Record<
  | 'listIrRemotes'
  | 'createIrRemote'
  | 'removeIrRemote'
  | 'listIrCodes'
  | 'saveIrCode'
  | 'removeIrCode',
  Bound
>;

type MediaRoutes = InfraredRoutes &
  Record<
    | 'listCameras'
    | 'updateCamera'
    | 'offerCamera'
    | 'talkCamera'
    | 'cameraStream'
    | 'cameraSnapshot'
    | 'listRecordings'
    | 'recordingLinks'
    | 'removeRecording'
    | 'removeEvent',
    Bound
  >;

async function removeFiles(context: ServerContext, recording: RecordingRow): Promise<void> {
  const path = context.recordingPath(recording.storage_path);
  await Promise.all([rm(path), rm(thumbnailPathOf(path), { force: true })]).catch(
    (cause: unknown) => {
      context.log.warn('recording.file_not_removed', {
        recordingId: recording.id,
        reason: cause instanceof Error ? cause.message : String(cause),
      });
    },
  );
}

function infraredRoutes({ store }: ServerContext): InfraredRoutes {
  return {
    listIrRemotes: bound(E.listIrRemotes, () => store.infrared.remotes()),
    createIrRemote: bound(E.createIrRemote, ({ body }) => {
      store.devices.byId(body.blaster_id);
      return store.infrared.addRemote(body);
    }),
    removeIrRemote: bound(E.removeIrRemote, ({ params }) => {
      store.infrared.removeRemote(params.remoteId);
      return DONE_REPLY;
    }),
    listIrCodes: bound(E.listIrCodes, () => store.infrared.codes()),
    saveIrCode: bound(E.saveIrCode, ({ body }) => store.infrared.saveCode(body)),
    removeIrCode: bound(E.removeIrCode, ({ params }) => {
      store.infrared.removeCode(params.codeId);
      return DONE_REPLY;
    }),
  };
}

export function mediaRoutes(context: ServerContext): MediaRoutes {
  const { store, hub, links } = context;
  return {
    listCameras: bound(E.listCameras, () => store.cameras.list()),
    updateCamera: bound(E.updateCamera, ({ params, body }) =>
      store.cameras.setRecordEvents(params.deviceId, body.record_events),
    ),
    offerCamera: bound(E.offerCamera, async ({ params, body, caller }) => ({
      sdp: await hub.answerOffer(params.deviceId, body.sdp, clientOf(caller).id),
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
    listRecordings: bound(E.listRecordings, ({ query }) => store.cameras.recordings(query)),
    recordingLinks: bound(E.recordingLinks, ({ body }) =>
      body.ids.map((id) => ({
        id: store.cameras.recording(id).id,
        ...links.recording(id, body.size),
      })),
    ),
    removeRecording: bound(E.removeRecording, async ({ params }) => {
      await removeFiles(context, store.cameras.removeRecording(params.recordingId));
      return DONE_REPLY;
    }),
    removeEvent: bound(E.removeEvent, async ({ params }) => {
      const event = store.events.byId(params.eventId);
      const recordings = store.cameras.recordingsOfEvent(event.id);
      const removed = recordings.map((recording) => store.cameras.removeRecording(recording.id));
      store.events.remove(event.id);
      await Promise.all(removed.map((recording) => removeFiles(context, recording)));
      context.log.info('event.removed', { eventId: event.id, recordings: removed.length });
      return DONE_REPLY;
    }),
    ...infraredRoutes(context),
  };
}
