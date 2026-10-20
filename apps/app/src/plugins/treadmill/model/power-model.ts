import type { BeltState, TreadmillStateView } from '@smarteverything/domain';
import { relative } from '../../../format/time';
import { STATE_LABEL } from './treadmill-model';

export const POWER_NOTE =
  'The G15 cannot be switched off over Bluetooth. Stop halts the belt. It goes to standby by itself after a few idle minutes. To switch it off, use the power switch on the treadmill.';

export const STOP_NOTE = 'Stops the belt, same as Stop on the page.';

export function powerStateLine(
  link: TreadmillStateView['link'],
  state: BeltState,
  now: number,
): string {
  if (link.phase === 'lost' && (state === 'stopped' || state === 'idle')) {
    return 'Standby or switched off';
  }
  if (link.phase !== 'linked') {
    return link.lastHeardAt === null
      ? 'Not reachable'
      : `Not reachable · last heard ${relative(link.lastHeardAt, now)}`;
  }
  return STATE_LABEL[state];
}

export function canStopBelt(link: TreadmillStateView['link'], state: BeltState): boolean {
  return (
    link.phase === 'linked' && (state === 'running' || state === 'paused' || state === 'countdown')
  );
}
