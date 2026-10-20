import type { PushNotification } from './fcm';
import {
  cameraDetectionOf,
  type CameraNotificationKind,
  type EventKind,
  type EventRow,
  type RecordingRow,
} from '@smarteverything/domain';

export interface CameraNotice {
  readonly deviceId: string;
  readonly eventId: string;
  readonly kind: CameraNotificationKind;
  readonly recovered: boolean;
  readonly eventKind: EventKind | 'clip_ready';
}

const EVENT_NOTICES: Readonly<Partial<Record<EventKind, CameraNotificationKind>>> = {
  motion: 'motion',
  person: 'person',
  pet: 'pet',
  sound: 'sound',
  doorbell: 'doorbell',
  call: 'doorbell',
  alarm: 'alarm',
  device_offline: 'offline',
  device_online: 'offline',
};

function noticeKindOf(row: EventRow): CameraNotificationKind | null {
  if (cameraDetectionOf(row.kind, row.details) === 'baby_cry') {
    return 'baby_cry';
  }
  return EVENT_NOTICES[row.kind] ?? null;
}

export function cameraNoticeOfEvent(
  row: EventRow,
  isCamera: (deviceId: string) => boolean,
): CameraNotice | null {
  const kind = noticeKindOf(row);
  if (kind === null || row.device_id === null || !isCamera(row.device_id)) {
    return null;
  }
  return {
    deviceId: row.device_id,
    eventId: row.id,
    kind,
    recovered: row.kind === 'device_online',
    eventKind: row.kind,
  };
}

export function cameraNoticeOfRecording(row: RecordingRow): CameraNotice | null {
  return row.kind === 'clip'
    ? {
        deviceId: row.device_id,
        eventId: row.event_id ?? row.id,
        kind: 'clip_ready',
        recovered: false,
        eventKind: 'clip_ready',
      }
    : null;
}

export function cameraNoticeTag(notice: CameraNotice): string {
  return `camera=${notice.deviceId}&kind=${notice.kind}`;
}

interface Wording {
  readonly title: string;
  readonly body: (camera: string) => string;
}

const WORDING: Readonly<Record<CameraNotificationKind, Wording>> = {
  motion: { title: 'Motion', body: (camera) => `${camera} saw movement` },
  person: { title: 'Person', body: (camera) => `${camera} saw a person` },
  pet: { title: 'Pet', body: (camera) => `${camera} saw a pet` },
  sound: { title: 'Sound', body: (camera) => `${camera} heard a sound` },
  baby_cry: { title: 'Baby crying', body: (camera) => `${camera} heard a baby crying` },
  doorbell: { title: 'Doorbell', body: (camera) => `Someone is at the door (${camera})` },
  alarm: { title: 'Camera alert', body: (camera) => `${camera} has seen nobody for a long time` },
  offline: { title: 'Camera offline', body: (camera) => `${camera} is offline` },
  clip_ready: { title: 'Clip ready', body: (camera) => `A new clip from ${camera} is saved` },
};

export function cameraNotificationFor(
  notice: CameraNotice,
  camera: string,
): { readonly title: string; readonly body: string } {
  if (notice.recovered) {
    return { title: 'Camera back online', body: `${camera} is back online` };
  }
  const wording = WORDING[notice.kind];
  return { title: wording.title, body: wording.body(camera) };
}

export function cameraPushOf(notice: CameraNotice, camera: string): PushNotification {
  return {
    ...cameraNotificationFor(notice, camera),
    data: { eventId: notice.eventId, kind: notice.eventKind, deviceId: notice.deviceId },
    tag: cameraNoticeTag(notice),
    silent: notice.recovered,
  };
}
