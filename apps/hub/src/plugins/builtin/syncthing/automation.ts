import type { FlowType } from '@smarteverything/domain';
import {
  actionNode,
  automation,
  input,
  optionalInput,
  output,
  ports,
  queryNode,
  streamValue,
  type PortKind,
} from '../automation-kit';
import { FOLDER, INVITE, PEER, SYNCTHING_ENTITIES } from './automation-entities';
import {
  ACTIVITY_DEFAULT,
  ACTIVITY_TOOL,
  INVITE_TOOL,
  PAUSE_TOOL,
  RESCAN_TOOL,
} from './automation-tools';
import { SYNCTHING_TRIGGERS } from './automation-triggers';
import { SNAPSHOT_STREAM } from './runtime';
import { ACTIVITY_KEPT } from './sync-monitor';

const COMMAND_TIMEOUT = { default: 30_000, max: 120_000 } as const;

const INSTANT: PortKind<string> = { type: { t: 'instant' } };

function maybe<V>(kind: PortKind<V>): PortKind<V | null> {
  return { type: { t: 'optional', of: kind.type } };
}

const PAUSE_SCOPE = ports.choice([
  { id: 'everything', label: 'Everything' },
  { id: 'folder', label: 'One folder' },
  { id: 'peer', label: 'One sync device' },
] as const);

const INVITE_ANSWER = ports.choice([
  { id: 'accept', label: 'Accept' },
  { id: 'ignore', label: 'Ignore' },
] as const);

const ACTIVITY_KIND = ports.choice([
  { id: 'added', label: 'File added' },
  { id: 'modified', label: 'File changed' },
  { id: 'deleted', label: 'File deleted' },
  { id: 'connected', label: 'Device connected' },
  { id: 'disconnected', label: 'Device disconnected' },
  { id: 'paused', label: 'Paused' },
  { id: 'resumed', label: 'Resumed' },
  { id: 'error', label: 'Error' },
] as const);

const CHANGE_TYPE: FlowType = {
  t: 'record',
  fields: {
    id: ports.number({ integer: true, min: 0 }).type,
    at: INSTANT.type,
    kind: ACTIVITY_KIND.type,
    folderId: maybe(FOLDER.kind).type,
    path: maybe(ports.text()).type,
    deviceId: maybe(PEER.kind).type,
    remote: ports.boolean().type,
  },
};

const BYTES = ports.number({ min: 0, unit: 'B' });

const RATE = ports.number({ min: 0, unit: 'B/s' });

const PERCENT = ports.number({ min: 0, max: 100, unit: '%' });

export const PAUSE_NODE = actionNode({
  id: 'pause',
  version: 1,
  title: 'Pause or resume syncing',
  description:
    'Pauses or resumes syncing with every device, one folder or one sync device. Turn Paused off to resume.',
  icon: 'folderSync',
  keywords: ['syncthing', 'sync', 'pause', 'resume', 'folder', 'device'],
  summary: 'Set paused {paused} for {what} {folder} {peer}',
  tool: PAUSE_TOOL,
  inputs: {
    what: input(PAUSE_SCOPE, {
      title: 'What',
      description: 'Everything, one folder or one sync device.',
    }),
    folder: optionalInput(FOLDER.kind, {
      title: 'Folder',
      description: 'The folder to pause or resume. Needed when What is one folder.',
    }),
    peer: optionalInput(PEER.kind, {
      title: 'Sync device',
      description: 'The device to pause or resume. Needed when What is one sync device.',
    }),
    paused: input(ports.boolean(), {
      title: 'Paused',
      description: 'On pauses syncing, off resumes it.',
    }),
  },
  args: {
    what: { port: 'what' },
    folderId: { port: 'folder' },
    deviceId: { port: 'peer' },
    paused: { port: 'paused' },
  },
  retry: 'idempotent',
  timeout: COMMAND_TIMEOUT,
});

export const RESCAN_NODE = actionNode({
  id: 'rescan',
  version: 1,
  title: 'Rescan folders',
  description: 'Looks for changed files now in one folder, or in every folder when none is chosen.',
  icon: 'folderSync',
  keywords: ['syncthing', 'sync', 'rescan', 'scan', 'folder', 'refresh'],
  summary: 'Rescan {folder}',
  tool: RESCAN_TOOL,
  inputs: {
    folder: optionalInput(FOLDER.kind, {
      title: 'Folder',
      description: 'The folder to rescan. Every folder when left empty.',
    }),
  },
  args: { folderId: { port: 'folder' } },
  retry: 'idempotent',
  timeout: COMMAND_TIMEOUT,
});

export const INVITE_NODE = actionNode({
  id: 'invite',
  version: 1,
  title: 'Accept or ignore an invitation',
  description:
    'Answers a device that asked to connect or a folder another device offered. An accepted folder goes to Syncthing’s default location.',
  icon: 'folderSync',
  keywords: ['syncthing', 'sync', 'invitation', 'invite', 'accept', 'ignore', 'offer'],
  summary: '{answer} {invite}',
  tool: INVITE_TOOL,
  inputs: {
    invite: input(INVITE.kind, {
      title: 'Invitation',
      description: 'The device request or folder offer to answer.',
    }),
    answer: input(INVITE_ANSWER, {
      title: 'Answer',
      description: 'Accept adds it, ignore stops it from asking again.',
    }),
  },
  args: { invite: { port: 'invite' }, answer: { port: 'answer' } },
  timeout: COMMAND_TIMEOUT,
});

export const ACTIVITY_NODE = queryNode({
  id: 'activity',
  version: 1,
  title: 'Recent file activity',
  description:
    'Files added, changed or deleted and devices connecting, newest first, optionally for one folder.',
  icon: 'folderSync',
  keywords: ['syncthing', 'sync', 'activity', 'changes', 'files', 'recent', 'history'],
  summary: 'Recent activity in {folder}',
  tool: ACTIVITY_TOOL,
  inputs: {
    folder: optionalInput(FOLDER.kind, {
      title: 'Folder',
      description: 'Only this folder. Every folder when left empty.',
    }),
    limit: optionalInput(ports.number({ integer: true, min: 1, max: ACTIVITY_KEPT }), {
      title: 'How many',
      description: 'The most recent entries to return.',
      default: ACTIVITY_DEFAULT,
    }),
  },
  outputs: {
    changes: output(ports.list({ type: CHANGE_TYPE }), {
      title: 'Changes',
      description: 'The recent entries, newest first.',
      from: '/activity',
    }),
    count: output(ports.number({ integer: true, min: 0 }), {
      title: 'Count',
      description: 'How many entries came back.',
      from: '/count',
    }),
  },
  args: { limit: { port: 'limit' }, folderId: { port: 'folder' } },
  timeout: COMMAND_TIMEOUT,
});

export const FOLDER_VALUE = streamValue({
  id: 'folder',
  version: 1,
  title: 'Synced folder',
  description: 'How one synced folder is doing right now.',
  icon: 'folderSync',
  keywords: ['syncthing', 'sync', 'folder', 'progress', 'percent', 'errors'],
  summary: 'State of {folder}',
  inputs: {
    folder: input(FOLDER.kind, { title: 'Folder', description: 'The folder to read.' }),
  },
  stream: SNAPSHOT_STREAM,
  select: { list: '/folders', key: '/id', port: 'folder' },
  outputs: {
    state: { kind: ports.text(), from: '/state' },
    percent: { kind: PERCENT, from: '/completionPercent' },
    bytesLeft: { kind: BYTES, from: '/needBytes' },
    errors: { kind: ports.number({ integer: true, min: 0 }), from: '/errorCount' },
    paused: { kind: ports.boolean(), from: '/paused' },
  },
});

export const PEER_VALUE = streamValue({
  id: 'peer',
  version: 1,
  title: 'Sync device',
  description: 'How one sync device is doing right now.',
  icon: 'folderSync',
  keywords: ['syncthing', 'sync', 'device', 'online', 'progress', 'rate'],
  summary: 'State of {peer}',
  inputs: {
    peer: input(PEER.kind, { title: 'Sync device', description: 'The device to read.' }),
  },
  stream: SNAPSHOT_STREAM,
  select: { list: '/peers', key: '/id', port: 'peer' },
  outputs: {
    online: { kind: ports.boolean(), from: '/connected' },
    percent: { kind: PERCENT, from: '/completionPercent' },
    lastSeen: { kind: maybe(INSTANT), from: '/lastSeen' },
    downloadRate: { kind: RATE, from: '/inBytesPerSecond' },
    uploadRate: { kind: RATE, from: '/outBytesPerSecond' },
  },
});

export const SYNCTHING_AUTOMATION = automation({
  nodes: [PAUSE_NODE, RESCAN_NODE, INVITE_NODE, ACTIVITY_NODE],
  triggers: [...SYNCTHING_TRIGGERS],
  values: [FOLDER_VALUE, PEER_VALUE],
  entities: [...SYNCTHING_ENTITIES],
});
