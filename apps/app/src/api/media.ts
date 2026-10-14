import {
  API_ENDPOINTS as E,
  HUB_COMMAND,
  type CameraChange,
  type EventRow,
  type IceServer,
  type MediaSize,
  type RecordingRow,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';
import type { ApiClient } from './connection/client';

const log = new Logger('app.media');

export interface SignedLink {
  readonly url: string;
  readonly expiresAt: string;
}

const EXPIRY_MARGIN_MS = 30_000;

export function linkLifetimeMs(expiresAt: string | undefined): number {
  return expiresAt === undefined
    ? 0
    : Math.max(0, Date.parse(expiresAt) - Date.now() - EXPIRY_MARGIN_MS);
}

export interface CameraDay {
  readonly events: readonly EventRow[];
  readonly recordings: readonly RecordingRow[];
}

export interface DayWindow {
  readonly start: string;
  readonly end: string;
}

const DAY_ROWS_KEPT = 500;

export async function answerCameraOffer(
  deviceId: string,
  sdp: string,
  client: ApiClient = api(),
): Promise<string> {
  return (await client.call(E.offerCamera, { params: { deviceId }, body: { sdp } })).sdp;
}

export async function answerTalkOffer(
  deviceId: string,
  sdp: string,
  client: ApiClient = api(),
): Promise<string> {
  return (await client.call(E.talkCamera, { params: { deviceId }, body: { sdp } })).sdp;
}

export async function cameraRelayUrl(deviceId: string, client: ApiClient = api()): Promise<string> {
  const media = client.forMedia(false);
  const link = await media.call(E.cameraStream, { params: { deviceId } });
  return media.urlOf(link.url).replace(/^http/, 'ws');
}

export async function cameraSnapshotLink(deviceId: string, size: MediaSize): Promise<SignedLink> {
  const client = api().forMedia();
  const link = await client.call(E.cameraSnapshot, { params: { deviceId }, query: { size } });
  return {
    url: await client.resourceUrl(link.url, link.expiresAt, 'image'),
    expiresAt: link.expiresAt,
  };
}

export async function recordingLinks(
  ids: readonly string[],
  size: MediaSize,
): Promise<Readonly<Record<string, SignedLink>>> {
  if (ids.length === 0) {
    return {};
  }
  const client = api().forMedia();
  const links = await client.call(E.recordingLinks, { body: { ids: [...ids], size } });
  return Object.fromEntries(
    await Promise.all(
      links.map(
        async (link) =>
          [
            link.id,
            {
              url: await client.resourceUrl(
                link.url,
                link.expiresAt,
                size === 'thumb' ? 'image' : 'recording',
              ),
              expiresAt: link.expiresAt,
            },
          ] as const,
      ),
    ),
  );
}

export async function deleteRecording(recordingId: string): Promise<void> {
  await api().call(E.removeRecording, { params: { recordingId } });
  log.info('recording.deleted', { recordingId });
}

export async function removeEvent(eventId: string): Promise<void> {
  await api().call(E.removeEvent, { params: { eventId } });
  log.info('event.deleted', { eventId });
}

export async function acknowledgeEvent(eventId: string): Promise<void> {
  await api().call(E.acknowledgeEvent, { params: { eventId } });
  log.info('event.acknowledged', { eventId });
}

export async function changeCamera(deviceId: string, change: CameraChange): Promise<void> {
  await api().call(E.updateCamera, { params: { deviceId }, body: change });
  log.info('camera.changed', { deviceId, ...change });
}

export async function recordClip(deviceId: string, seconds: number): Promise<void> {
  const command = HUB_COMMAND.parse({
    capability: 'hub:record_clip',
    value: { deviceId, seconds },
  });
  const row = await api().call(E.sendCommand, {
    body: { device_id: null, capability: command.capability, value: command.value },
  });
  log.info('camera.clip_requested', { commandId: row.id, seconds });
}

export async function readCameraDay(
  deviceIds: readonly string[],
  window: DayWindow,
): Promise<CameraDay> {
  if (deviceIds.length === 0) {
    return { events: [], recordings: [] };
  }
  const query = {
    deviceIds: [...deviceIds],
    from: window.start,
    to: window.end,
    limit: DAY_ROWS_KEPT,
  };
  const [events, recordings] = await Promise.all([
    api().call(E.listEvents, { query }),
    api().call(E.listRecordings, { query }),
  ]);
  return { events, recordings };
}

export interface RemoteViewingChange {
  readonly ice_servers?: readonly IceServer[];
  readonly webrtc_candidates?: readonly string[];
}

export async function updateRemoteViewing(change: RemoteViewingChange): Promise<void> {
  await api().call(E.updateNetwork, {
    body: {
      ...(change.ice_servers === undefined ? {} : { ice_servers: [...change.ice_servers] }),
      ...(change.webrtc_candidates === undefined
        ? {}
        : { webrtc_candidates: [...change.webrtc_candidates] }),
    },
  });
  log.info('camera.remote_viewing_changed', {
    iceServers: change.ice_servers?.length ?? null,
    candidates: change.webrtc_candidates?.length ?? null,
  });
}
