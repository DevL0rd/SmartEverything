import type { DriveRoot } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { MetricItem } from '../../../components/metric-strip';
import type { StatusTone } from '../../../components/tone';
import { bytes, count } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { relative } from '../../../format/time';
import {
  MY_DRIVE_LABEL,
  SHARED_DRIVE_LABEL,
  ownDriveOf,
  sharedDriveOf,
} from '../model/drive-access';

export interface DriveStateLine {
  readonly text: string;
  readonly tone: StatusTone;
}

export interface DriveSettingsCard {
  readonly root: DriveRoot;
  readonly label: string;
  readonly icon: IconName;
  readonly who: string;
  readonly editable: boolean;
  readonly note: string | null;
}

export const VERSIONS_NOTE =
  'Keeps older copies when files change or are replaced. They use space and count toward the limit.';

export const HIDDEN_NOTE = 'Files and folders whose names start with a dot';

export const SKIP_FOOTER =
  'Matching files and folders stay on the disk but are left out of Drive, search and sync.';

export const SHARED_LOCKED_NOTE = 'The owner of the home sets these for the Shared Drive.';

export const NO_DRIVES = 'Your drives are being set up on the Hub';

function myDriveCard(root: DriveRoot): DriveSettingsCard {
  return {
    root,
    label: MY_DRIVE_LABEL,
    icon: 'hardDrive',
    who: 'Only you, and the people you share with',
    editable: true,
    note: null,
  };
}

function sharedDriveCard(root: DriveRoot, owner: boolean): DriveSettingsCard {
  return {
    root,
    label: SHARED_DRIVE_LABEL,
    icon: 'users',
    who: 'Everyone in the home',
    editable: owner,
    note: owner ? null : SHARED_LOCKED_NOTE,
  };
}

export function driveSettingsCardsOf(
  roots: readonly DriveRoot[],
  viewerId: string | null,
  owner: boolean,
): readonly DriveSettingsCard[] {
  const mine = ownDriveOf(roots, viewerId);
  const shared = sharedDriveOf(roots);
  return [
    ...(mine === null ? [] : [myDriveCard(mine)]),
    ...(shared === null ? [] : [sharedDriveCard(shared, owner)]),
  ];
}

function withReason(text: string, reason: string | null): string {
  return reason === null ? text : `${text} · ${reason}`;
}

export function driveStateLineOf(root: DriveRoot, now: number): DriveStateLine {
  switch (root.state) {
    case 'scanning':
      return { text: 'Reading files', tone: 'info' };
    case 'unresponsive':
      return {
        text: withReason('The data disk is not answering', root.stateReason),
        tone: 'warning',
      };
    case 'error':
      return { text: withReason('This drive cannot be read', root.stateReason), tone: 'critical' };
    case 'ready':
      if (root.health.corrupt > 0) {
        return { text: `${plural(root.health.corrupt, 'damaged file')} found`, tone: 'warning' };
      }
      return {
        text: joinParts([
          'Up to date',
          root.scannedAt === null ? null : `read ${relative(root.scannedAt, now)}`,
        ]),
        tone: 'positive',
      };
  }
}

export function driveTilesOf(root: DriveRoot): readonly MetricItem[] {
  return [
    { key: 'size', label: 'Size', value: bytes(root.bytes) },
    { key: 'files', label: 'Files', value: count(root.items) },
    { key: 'folders', label: 'Folders', value: count(root.folders) },
  ];
}
