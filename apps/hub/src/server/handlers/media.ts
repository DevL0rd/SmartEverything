import { rm } from 'node:fs/promises';
import { API_ENDPOINTS as E, type RecordingRow } from '@smarteverything/domain';
import { thumbnailPathOf } from '../../cameras/thumbnails';
import { libraryBrands, libraryCategories, libraryModels } from '../../infrared/library/browse';
import { clientOf } from '../auth';
import { reachableFor } from '../person-scope';
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

const applianceRoutes = ({ irAppliances }: ServerContext) =>
  ({
    listIrAppliances: bound(E.listIrAppliances, () => irAppliances.list()),
    promoteIrRemote: bound(E.promoteIrRemote, ({ params }) =>
      irAppliances.promote(params.remoteId),
    ),
    listIrLibraryCategories: bound(E.listIrLibraryCategories, () =>
      libraryCategories(irAppliances.library),
    ),
    listIrLibraryBrands: bound(E.listIrLibraryBrands, ({ query }) =>
      libraryBrands(irAppliances.library, query.category),
    ),
    listIrLibraryModels: bound(E.listIrLibraryModels, ({ query }) =>
      libraryModels(irAppliances.library, query.category, query.brand),
    ),
    createIrApplianceFromLibrary: bound(E.createIrApplianceFromLibrary, ({ body }) =>
      irAppliances.createFromLibrary({
        libraryId: body.library_id,
        blasterId: body.blaster_id,
        name: body.name,
        ...(body.room_id === undefined ? {} : { roomId: body.room_id }),
      }),
    ),
    rebindIrAppliance: bound(E.rebindIrAppliance, ({ params, body }) =>
      irAppliances.rebind(params.applianceId, body.blaster_id),
    ),
    saveIrApplianceKey: bound(E.saveIrApplianceKey, ({ params, body }) =>
      irAppliances.saveKey(params.applianceId, body),
    ),
    applyIrAppliance: bound(E.applyIrAppliance, ({ params, body }) =>
      irAppliances.apply(params.applianceId, body),
    ),
    removeIrAppliance: bound(E.removeIrAppliance, async ({ params }) => {
      await irAppliances.remove(params.applianceId);
      return DONE_REPLY;
    }),
  }) as const;

const infraredRoutes = ({ store }: ServerContext) =>
  ({
    listIrRemotes: bound(E.listIrRemotes, () => store.host.call('infrared', 'remotes')),
    createIrRemote: bound(E.createIrRemote, ({ body }) => store.host.write('createIrRemote', body)),
    removeIrRemote: bound(E.removeIrRemote, async ({ params }) => {
      await store.host.write('removeIrRemote', params.remoteId);
      return DONE_REPLY;
    }),
    updateIrRemote: bound(E.updateIrRemote, ({ params, body }) =>
      store.host.write('updateIrRemote', { remoteId: params.remoteId, body }),
    ),
    listIrCodes: bound(E.listIrCodes, () => store.host.call('infrared', 'codes')),
    saveIrCode: bound(E.saveIrCode, ({ body }) => store.host.call('infrared', 'saveCode', body)),
    removeIrCode: bound(E.removeIrCode, async ({ params }) => {
      await store.host.call('infrared', 'removeCode', params.codeId);
      return DONE_REPLY;
    }),
  }) as const;

const cameraRoutes = ({ store, hub, links }: ServerContext) =>
  ({
    listCameras: bound(E.listCameras, async ({ caller }) =>
      reachableFor(store, caller, await store.host.call('cameras', 'list'), (row) => row.device_id),
    ),
    updateCamera: bound(E.updateCamera, ({ params, body, caller }) => {
      if (body.transcribe === true) {
        requireOwner(caller);
      }
      return store.host.call('cameras', 'change', params.deviceId, body);
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
    listRecordings: bound(E.listRecordings, async ({ query, caller }) =>
      reachableFor(
        context.store,
        caller,
        await context.store.host.call('cameras', 'recordings', query),
        (row) => row.device_id,
      ),
    ),
    recordingLinks: bound(E.recordingLinks, async ({ body }) =>
      (await context.store.host.read('recordingIds', body.ids)).map((id) => ({
        id,
        ...context.links.recording(id, body.size),
      })),
    ),
    removeRecording: bound(E.removeRecording, async ({ params }) => {
      await removeFiles(
        context,
        await context.store.host.call('cameras', 'removeRecording', params.recordingId),
      );
      return DONE_REPLY;
    }),
    removeEvent: bound(E.removeEvent, async ({ params }) => {
      const removed = await context.store.host.write('removeEvent', params.eventId);
      await Promise.all(removed.map((recording) => removeFiles(context, recording)));
      context.log.info('event.removed', { eventId: params.eventId, recordings: removed.length });
      return DONE_REPLY;
    }),
  }) as const;

export const mediaRoutes = (context: ServerContext) =>
  ({
    ...cameraRoutes(context),
    ...recordingRoutes(context),
    ...infraredRoutes(context),
    ...applianceRoutes(context),
  }) as const;
