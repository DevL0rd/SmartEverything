import {
  CAMERA_OFFLINE_REPEAT_MINUTES,
  cameraCooldownMinutes,
  cameraNotificationOn,
  cameraQuietHours,
  inQuietHours,
  type CameraNotificationsPref,
  type ClientPrefRead,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { CameraNotice } from './camera-notice';

const MINUTE_MS = 60_000;

export interface CameraGateDeps {
  readonly prefOf: (clientId: string) => ClientPrefRead<CameraNotificationsPref>;
  readonly now: () => Date;
  readonly timeZone: () => string;
  readonly log: Logger;
}

function minuteOfDay(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const part = (type: string): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? 0);
  return part('hour') * 60 + part('minute');
}

export class CameraGate {
  private readonly lastAt = new Map<string, number>();
  private readonly offlineShown = new Set<string>();

  constructor(private readonly deps: CameraGateDeps) {}

  admit(clientId: string, notice: CameraNotice): boolean {
    const read = this.deps.prefOf(clientId);
    if (read.status === 'invalid') {
      this.deps.log.warn('push.camera_notifications_unreadable', {
        clientId,
        deviceId: notice.deviceId,
        reason: read.reason,
      });
      return true;
    }
    const pref = read.value;
    const own = `${clientId}|${notice.deviceId}`;
    if (notice.recovered) {
      return (
        this.offlineShown.delete(own) && cameraNotificationOn(pref, notice.deviceId, 'offline')
      );
    }
    if (!this.allowed(pref, clientId, notice)) {
      return false;
    }
    this.lastAt.set(`${own}|${notice.kind}`, this.deps.now().getTime());
    if (notice.kind === 'offline') {
      this.offlineShown.add(own);
    }
    return true;
  }

  private allowed(pref: CameraNotificationsPref, clientId: string, notice: CameraNotice): boolean {
    const { deviceId, kind } = notice;
    if (!cameraNotificationOn(pref, deviceId, kind)) {
      return false;
    }
    const now = this.deps.now();
    if (inQuietHours(cameraQuietHours(pref, deviceId), minuteOfDay(now, this.deps.timeZone()))) {
      return false;
    }
    const waitMinutes =
      kind === 'offline' ? CAMERA_OFFLINE_REPEAT_MINUTES : cameraCooldownMinutes(pref, deviceId);
    const last = this.lastAt.get(`${clientId}|${deviceId}|${kind}`);
    return last === undefined || now.getTime() - last >= waitMinutes * MINUTE_MS;
  }
}
