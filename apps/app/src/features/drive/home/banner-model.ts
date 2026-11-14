import type { DriveRoot } from '@smarteverything/domain';
import type { StatusTone } from '../../../components/tone';
import { percent } from '../../../format/number';
import type { QuotaLevel } from './hero-model';
import { isDriveOwner } from '../model/drive-access';

export type DriveBannerAction = 'rescan' | 'storage';

export interface DriveBannerModel {
  readonly key: string;
  readonly tone: StatusTone;
  readonly title: string;
  readonly body: string;
  readonly action: DriveBannerAction | null;
}

export interface DriveBannerInput {
  readonly online: boolean;
  readonly root: DriveRoot | null;
  readonly mayRescan: boolean;
  readonly quota: QuotaLevel;
}

export const OFFLINE_TITLE = 'Showing the last known files · reconnecting';

function nameOf(root: DriveRoot): string {
  return root.scope === 'home' ? 'The Shared Drive' : 'Your drive';
}

function stateBanner(root: DriveRoot, mayRescan: boolean): DriveBannerModel | null {
  const action = mayRescan ? 'rescan' : null;
  if (root.state === 'error') {
    return {
      key: 'error',
      tone: 'critical',
      title: `${nameOf(root)} can’t be read`,
      body: root.stateReason ?? 'The hub could not read its folder. Nothing was deleted.',
      action,
    };
  }
  if (root.state !== 'unresponsive') return null;
  return {
    key: 'unresponsive',
    tone: 'warning',
    title: `${nameOf(root)} is not answering`,
    body: root.stateReason ?? 'Reading the data disk took too long. Nothing was deleted.',
    action,
  };
}

export function driveBannerOf(input: DriveBannerInput): DriveBannerModel | null {
  if (!input.online) {
    return {
      key: 'offline',
      tone: 'info',
      title: OFFLINE_TITLE,
      body: 'Uploads, renames and moves wait until the hub answers again.',
      action: null,
    };
  }
  const state = input.root === null ? null : stateBanner(input.root, input.mayRescan);
  if (state !== null) return state;
  return quotaBanner(input.quota);
}

function quotaBanner(quota: QuotaLevel): DriveBannerModel | null {
  switch (quota.kind) {
    case 'room':
      return null;
    case 'near':
      return {
        key: 'near',
        tone: 'warning',
        title: `Your drive is ${percent(quota.share)} full`,
        body: 'Uploads stop when it is full. Free some space or ask the home owner for more.',
        action: 'storage',
      };
    case 'full':
      return {
        key: 'full',
        tone: 'critical',
        title: 'Your drive is full',
        body: 'Uploads stop until you free some space or the home owner raises your limit.',
        action: 'storage',
      };
  }
}

export function mayRescanOf(
  root: DriveRoot | null,
  viewerId: string | null,
  owner: boolean,
): boolean {
  if (root === null) return false;
  return root.scope === 'home' ? owner : isDriveOwner(root, viewerId);
}
