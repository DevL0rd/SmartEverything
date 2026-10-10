import type { SyncTarget, SyncthingCommand } from '@smarteverything/domain';
import type { z } from 'zod';
import type { SyncthingRest } from './rest-client';
import {
  CONFIG_DEVICE,
  DEFAULT_DEVICE,
  DEFAULT_FOLDER,
  IGNORED_DEVICES,
  PENDING_DEVICES,
  PENDING_FOLDERS,
} from './rest-schemas';

class SyncthingCommandError extends Error {
  override readonly name = 'SyncthingCommandError';
}

function path(prefix: string, id: string): string {
  return `${prefix}/${encodeURIComponent(id)}`;
}

async function setPaused(
  rest: SyncthingRest,
  target: SyncTarget,
  paused: boolean,
): Promise<string> {
  const verb = paused ? 'Paused' : 'Resumed';
  switch (target.kind) {
    case 'all':
      await rest.write(paused ? '/rest/system/pause' : '/rest/system/resume', { method: 'POST' });
      return `${verb} syncing with every device`;
    case 'folder':
      await rest.write(path('/rest/config/folders', target.id), {
        method: 'PATCH',
        body: { paused },
      });
      return `${verb} the folder`;
    case 'device':
      await rest.write(path('/rest/config/devices', target.id), {
        method: 'PATCH',
        body: { paused },
      });
      return `${verb} the device`;
  }
}

async function acceptDevice(rest: SyncthingRest, deviceId: string, name: string): Promise<string> {
  const defaults = await rest.read('/rest/config/defaults/device', DEFAULT_DEVICE);
  await rest.write('/rest/config/devices', {
    method: 'POST',
    body: { ...defaults, deviceID: deviceId, name },
  });
  return `Added ${name}`;
}

async function ignoreDevice(rest: SyncthingRest, deviceId: string): Promise<string> {
  const pending = await rest.read('/rest/cluster/pending/devices', PENDING_DEVICES);
  const offer = pending[deviceId];
  if (offer === undefined) {
    throw new SyncthingCommandError('That device is no longer asking to connect');
  }
  const ignored = await rest.read('/rest/config/remoteIgnoredDevices', IGNORED_DEVICES);
  const entry = {
    deviceID: deviceId,
    name: offer.name,
    address: offer.address,
    time: new Date().toISOString(),
  };
  await rest.write('/rest/config/remoteIgnoredDevices', {
    method: 'PUT',
    body: [...ignored, entry],
  });
  return 'Ignored the device';
}

async function folderOffer(
  rest: SyncthingRest,
  folderId: string,
): Promise<z.output<typeof PENDING_FOLDERS>[string]> {
  const pending = await rest.read('/rest/cluster/pending/folders', PENDING_FOLDERS);
  const offer = pending[folderId];
  if (offer === undefined) {
    throw new SyncthingCommandError('That folder is no longer offered');
  }
  return offer;
}

function defaultPath(base: string, label: string): string {
  const trimmed = base.replace(/\/+$/, '');
  if (trimmed.length === 0) {
    throw new SyncthingCommandError(
      'Syncthing has no default folder location; choose where to put it',
    );
  }
  return `${trimmed}/${label}`;
}

async function acceptFolder(
  rest: SyncthingRest,
  folderId: string,
  chosenPath: string | null,
): Promise<string> {
  const offer = await folderOffer(rest, folderId);
  const defaults = await rest.read('/rest/config/defaults/folder', DEFAULT_FOLDER);
  const offers = Object.entries(offer.offeredBy);
  const label = offers.find(([, by]) => by.label.length > 0)?.[1].label ?? folderId;
  const folderPath = chosenPath ?? defaultPath(defaults.path, label);
  await rest.write('/rest/config/folders', {
    method: 'POST',
    body: {
      ...defaults,
      id: folderId,
      label,
      path: folderPath,
      type: offers.some(([, by]) => by.receiveEncrypted) ? 'receiveencrypted' : 'sendreceive',
      devices: offers.map(([deviceID]) => ({ deviceID })),
    },
  });
  return `Added ${label} at ${folderPath}`;
}

async function ignoreFolder(rest: SyncthingRest, folderId: string): Promise<string> {
  const offer = await folderOffer(rest, folderId);
  await Promise.all(
    Object.entries(offer.offeredBy).map(async ([deviceId, by]) => {
      const device = await rest.read(path('/rest/config/devices', deviceId), CONFIG_DEVICE);
      const ignored = [
        ...device.ignoredFolders,
        { id: folderId, label: by.label, time: new Date().toISOString() },
      ];
      await rest.write(path('/rest/config/devices', deviceId), {
        method: 'PATCH',
        body: { ignoredFolders: ignored },
      });
    }),
  );
  return 'Ignored the folder';
}

type InviteCommand = Extract<
  SyncthingCommand,
  { readonly command: 'accept_device' | 'ignore_device' | 'accept_folder' | 'ignore_folder' }
>;

function answerInvite(rest: SyncthingRest, command: InviteCommand): Promise<string> {
  switch (command.command) {
    case 'accept_device':
      return acceptDevice(rest, command.deviceId, command.name);
    case 'ignore_device':
      return ignoreDevice(rest, command.deviceId);
    case 'accept_folder':
      return acceptFolder(rest, command.folderId, command.path);
    case 'ignore_folder':
      return ignoreFolder(rest, command.folderId);
  }
}

async function rescan(rest: SyncthingRest, folderId: string | null): Promise<string> {
  await rest.write('/rest/db/scan', {
    method: 'POST',
    ...(folderId === null ? {} : { query: { folder: folderId } }),
  });
  return folderId === null ? 'Rescanning every folder' : 'Rescanning the folder';
}

async function resolveFolder(
  rest: SyncthingRest,
  action: 'override' | 'revert',
  folderId: string,
): Promise<string> {
  await rest.write(`/rest/db/${action}`, { method: 'POST', query: { folder: folderId } });
  return action === 'override'
    ? 'This computer’s version now wins for the folder'
    : 'Local changes in the folder were undone';
}

export function runSyncthingCommand(
  rest: SyncthingRest,
  command: SyncthingCommand,
): Promise<string> {
  switch (command.command) {
    case 'set_paused':
      return setPaused(rest, command.target, command.paused);
    case 'rescan':
      return rescan(rest, command.folderId);
    case 'override':
    case 'revert':
      return resolveFolder(rest, command.command, command.folderId);
    case 'accept_device':
    case 'ignore_device':
    case 'accept_folder':
    case 'ignore_folder':
      return answerInvite(rest, command);
  }
}
