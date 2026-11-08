import type { PLUGIN_EVENT_KIND } from '@smarteverything/domain';
import type { z } from 'zod';
import { SYNC_ALERTS } from './event-plan';

type EventInput = z.input<typeof PLUGIN_EVENT_KIND>;

export const FOLDER_ERROR_EVENT = {
  kind: SYNC_ALERTS.folderError,
  title: 'A synced folder has errors',
  fields: { folder_id: 'string', count: 'number' },
} as const satisfies EventInput;

export const CONFLICT_EVENT = {
  kind: SYNC_ALERTS.conflict,
  title: 'A sync conflict appeared',
  fields: { folder_id: 'string', path: 'string' },
} as const satisfies EventInput;

export const DEVICE_INVITE_EVENT = {
  kind: SYNC_ALERTS.deviceInvite,
  title: 'A device wants to sync',
  fields: { count: 'number' },
} as const satisfies EventInput;

export const FOLDER_INVITE_EVENT = {
  kind: SYNC_ALERTS.folderInvite,
  title: 'A folder was offered',
  fields: { count: 'number' },
} as const satisfies EventInput;

export const DEVICE_OVERDUE_EVENT = {
  kind: SYNC_ALERTS.deviceOverdue,
  title: 'A sync device has been away too long',
  fields: { device_id: 'string', last_seen: 'string' },
} as const satisfies EventInput;

export const FAILURE_EVENT = {
  kind: SYNC_ALERTS.failure,
  title: 'Syncthing reported a failure',
  fields: { message: 'string' },
} as const satisfies EventInput;

export const SYNCTHING_EVENTS = [
  FOLDER_ERROR_EVENT,
  CONFLICT_EVENT,
  DEVICE_INVITE_EVENT,
  FOLDER_INVITE_EVENT,
  DEVICE_OVERDUE_EVENT,
  FAILURE_EVENT,
] as const;
