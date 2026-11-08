import { eventTrigger, ports } from '../automation-kit';
import { FOLDER, PEER } from './automation-entities';
import {
  CONFLICT_EVENT,
  DEVICE_INVITE_EVENT,
  DEVICE_OVERDUE_EVENT,
  FAILURE_EVENT,
  FOLDER_ERROR_EVENT,
  FOLDER_INVITE_EVENT,
} from './automation-events';

export const FOLDER_ERROR_TRIGGER = eventTrigger({
  id: 'folder_error',
  version: 1,
  title: 'A synced folder has errors',
  description:
    'Runs when Syncthing reports files it could not sync in a folder. Choose a folder to react to only that one.',
  icon: 'folderSync',
  keywords: ['syncthing', 'sync', 'folder', 'error', 'failed'],
  summary: 'Errors in {folder}',
  event: FOLDER_ERROR_EVENT,
  filters: {
    folder: {
      kind: FOLDER.kind,
      title: 'Folder',
      description: 'Only errors in this folder.',
      match: 'folder_id',
    },
  },
  outputs: {
    folder: { kind: FOLDER.kind, title: 'Folder', from: 'folder_id' },
    count: { kind: ports.number({ integer: true }), title: 'Files with errors', from: 'count' },
  },
});

export const CONFLICT_TRIGGER = eventTrigger({
  id: 'conflict',
  version: 1,
  title: 'A sync conflict appears',
  description:
    'Runs when two devices changed the same file and Syncthing kept both versions. Choose a folder to react to only that one.',
  icon: 'folderSync',
  keywords: ['syncthing', 'sync', 'conflict', 'file'],
  summary: 'A conflict in {folder}',
  event: CONFLICT_EVENT,
  filters: {
    folder: {
      kind: FOLDER.kind,
      title: 'Folder',
      description: 'Only conflicts in this folder.',
      match: 'folder_id',
    },
  },
  outputs: {
    folder: { kind: FOLDER.kind, title: 'Folder', from: 'folder_id' },
    path: { kind: ports.text(), title: 'Conflicting file', from: 'path' },
  },
});

export const DEVICE_OVERDUE_TRIGGER = eventTrigger({
  id: 'device_overdue',
  version: 1,
  title: 'A sync device has been away too long',
  description:
    'Runs when a sync device has not connected for longer than the overdue time set in the Syncthing plugin. Choose a device to react to only that one.',
  icon: 'folderSync',
  keywords: ['syncthing', 'sync', 'device', 'overdue', 'offline', 'away'],
  summary: '{peer} is overdue',
  event: DEVICE_OVERDUE_EVENT,
  filters: {
    peer: {
      kind: PEER.kind,
      title: 'Sync device',
      description: 'Only this device.',
      match: 'device_id',
    },
  },
  outputs: {
    peer: { kind: PEER.kind, title: 'Sync device', from: 'device_id' },
    lastSeen: { kind: ports.text(), title: 'Last seen', from: 'last_seen' },
  },
});

export const DEVICE_INVITE_TRIGGER = eventTrigger({
  id: 'device_invite',
  version: 1,
  title: 'A device asks to sync',
  description: 'Runs when another device asks to connect to Syncthing.',
  icon: 'folderSync',
  keywords: ['syncthing', 'sync', 'device', 'invitation', 'invite', 'request'],
  summary: 'A device asks to sync',
  event: DEVICE_INVITE_EVENT,
  outputs: {
    count: { kind: ports.number({ integer: true }), title: 'New requests', from: 'count' },
  },
});

export const FOLDER_INVITE_TRIGGER = eventTrigger({
  id: 'folder_invite',
  version: 1,
  title: 'A folder is offered',
  description: 'Runs when another device offers to share a folder.',
  icon: 'folderSync',
  keywords: ['syncthing', 'sync', 'folder', 'invitation', 'invite', 'offer'],
  summary: 'A folder is offered',
  event: FOLDER_INVITE_EVENT,
  outputs: {
    count: { kind: ports.number({ integer: true }), title: 'New offers', from: 'count' },
  },
});

export const FAILURE_TRIGGER = eventTrigger({
  id: 'failure',
  version: 1,
  title: 'Syncthing reports a failure',
  description: 'Runs when Syncthing itself reports a failure.',
  icon: 'folderSync',
  keywords: ['syncthing', 'sync', 'failure', 'error', 'problem'],
  summary: 'Syncthing fails',
  event: FAILURE_EVENT,
  outputs: {
    message: { kind: ports.text(), title: 'Message', from: 'message' },
  },
});

export const SYNCTHING_TRIGGERS = [
  FOLDER_ERROR_TRIGGER,
  CONFLICT_TRIGGER,
  DEVICE_OVERDUE_TRIGGER,
  DEVICE_INVITE_TRIGGER,
  FOLDER_INVITE_TRIGGER,
  FAILURE_TRIGGER,
] as const;
