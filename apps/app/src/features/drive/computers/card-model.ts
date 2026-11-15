import type { DrivePlacement } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { Tone } from '../../../components/tone';
import { joinParts, plural } from '../../../format/text';

export type CardActionId = 'browse' | 'synced';

export interface CardAction {
  readonly id: CardActionId;
  readonly label: string;
  readonly icon: IconName;
  readonly variant: 'filled' | 'tonal';
}

const BROWSE: CardAction = {
  id: 'browse',
  label: 'Browse files',
  icon: 'folder',
  variant: 'filled',
};

const SYNC: CardAction = {
  id: 'synced',
  label: 'Sync a folder',
  icon: 'folderSync',
  variant: 'tonal',
};

export function cardActionsOf(filesScope: boolean | null): readonly CardAction[] {
  return filesScope === true ? [BROWSE, SYNC] : [SYNC];
}

export interface PlacementCount {
  readonly line: string;
  readonly tone: Tone;
}

function failedOf(placement: DrivePlacement): boolean {
  return placement.hold === null && placement.enabled && placement.status.state === 'failed';
}

export function placementCountOf(
  computer: string,
  placements: readonly DrivePlacement[],
): PlacementCount {
  const synced = placements.filter((placement) => placement.mode === 'synced');
  if (synced.length === 0) {
    return { line: `No folders are synced to ${computer} yet.`, tone: 'variant' };
  }
  const failed = synced.filter(failedOf).length;
  const held = synced.filter((placement) => placement.hold !== null).length;
  const line = joinParts([
    plural(synced.length, 'synced folder'),
    failed === 0 ? null : `${String(failed)} failed`,
    held === 0 ? null : `${String(held)} on hold`,
  ]);
  if (failed > 0) return { line, tone: 'critical' };
  return { line, tone: held > 0 ? 'warning' : 'variant' };
}
