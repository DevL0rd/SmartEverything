import { doorReleaseAllowed, type CapabilityRole, type LaundryRole } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { LaundryState } from './state';

export type LaundryActionId =
  | 'pause'
  | 'resume'
  | 'stop'
  | 'garment'
  | 'stopTumbling'
  | 'unlock'
  | 'startNow'
  | 'cancelDelay'
  | 'advice';

type LaundryActionLook = 'filled' | 'tonal' | 'outlined';

export interface LaundryAction {
  readonly id: LaundryActionId;
  readonly label: string;
  readonly look: LaundryActionLook;
  readonly icon?: IconName;
  readonly disabled: boolean;
  readonly reason: string | null;
}

export const ACTION_ROLE: Readonly<Record<LaundryActionId, LaundryRole | null>> = {
  pause: 'cycle_pause',
  resume: 'cycle_start',
  stop: 'cycle_stop',
  garment: 'door_release',
  stopTumbling: 'anti_crease_stop',
  unlock: 'door_release',
  startNow: 'cycle_start',
  cancelDelay: 'delay_mode',
  advice: null,
};

function action(
  id: LaundryActionId,
  label: string,
  look: LaundryActionLook,
  icon?: IconName,
): LaundryAction {
  return {
    id,
    label,
    look,
    ...(icon === undefined ? {} : { icon }),
    disabled: false,
    reason: null,
  };
}

const PAUSE = action('pause', 'Pause', 'filled', 'pause');
const RESUME = action('resume', 'Resume', 'filled', 'play');
const STOP = action('stop', 'Stop', 'outlined');

function garment(door: string | null): LaundryAction {
  const allowed = door !== null && doorReleaseAllowed(door, 'paused');
  return {
    ...action('garment', 'Add a garment', 'tonal', 'plus'),
    disabled: !allowed,
    reason: allowed ? null : 'Off while the door is locked for safety.',
  };
}

function hasOpenDoor(door: string | null): boolean {
  return door === 'Open' || door === 'Closed And Can Be Opened';
}

function pausedActions(door: string | null): readonly LaundryAction[] {
  return hasOpenDoor(door) ? [RESUME, STOP] : [RESUME, STOP, garment(door)];
}

const ANTI_CREASE = [
  action('stopTumbling', 'Stop tumbling', 'filled'),
  action('unlock', 'Unlock door', 'tonal', 'lockOpen'),
];

const DELAYED = [
  action('startNow', 'Start now', 'tonal', 'play'),
  action('cancelDelay', 'Cancel delay', 'outlined'),
];

const ADVICE = action('advice', 'What to do', 'filled');

function faultActions(state: LaundryState): readonly LaundryAction[] {
  const idle = state.underlying === 'idle' || state.underlying === 'off';
  return idle ? [ADVICE] : [ADVICE, STOP];
}

function restingActions(state: LaundryState, door: string | null): readonly LaundryAction[] {
  if (state.key === 'paused') {
    return pausedActions(door);
  }
  if (state.key === 'anti_crease') {
    return ANTI_CREASE;
  }
  if (state.key === 'delayed') {
    return DELAYED;
  }
  return state.key === 'fault' ? faultActions(state) : [];
}

function tableFor(state: LaundryState, door: string | null): readonly LaundryAction[] {
  if (state.offline) {
    return [];
  }
  return state.running ? [PAUSE, STOP] : restingActions(state, door);
}

export function laundryActions(
  state: LaundryState,
  door: string | null,
  roles: ReadonlySet<CapabilityRole>,
): readonly LaundryAction[] {
  return tableFor(state, door).filter((entry) => {
    const role = ACTION_ROLE[entry.id];
    return role === null || roles.has(role);
  });
}
