import type { DrivePlacement } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { joinParts } from '../../../format/text';

export type CardActionId = 'browse' | 'synced' | 'mounted';

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

export function cardActionsOf(filesScope: boolean | null): readonly CardAction[] {
  const browsing = filesScope === true;
  return [
    ...(browsing ? [BROWSE] : []),
    {
      id: 'synced',
      label: 'Sync a folder',
      icon: 'folderSync',
      variant: browsing ? 'tonal' : 'filled',
    },
    { id: 'mounted', label: 'Mount a folder', icon: 'cloud', variant: 'tonal' },
  ];
}

export function placementCountOf(computer: string, placements: readonly DrivePlacement[]): string {
  const synced = placements.filter((placement) => placement.mode === 'synced').length;
  const mounted = placements.length - synced;
  if (placements.length === 0) return `Nothing is synced or mounted on ${computer} yet.`;
  return joinParts([
    synced === 0 ? null : `${String(synced)} synced`,
    mounted === 0 ? null : `${String(mounted)} mounted`,
  ]);
}
