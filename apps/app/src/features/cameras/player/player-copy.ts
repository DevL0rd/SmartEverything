import type { IconName } from '../../../components/icon';
import { moment } from '../../../format/time';
import type { ConnectStep, FailureReason, PlayerState } from './player-state';

export interface StateCopy {
  readonly title: string;
  readonly body: string | null;
  readonly icon: IconName;
  readonly critical: boolean;
}

const STEP_HINT: Readonly<Record<ConnectStep, string>> = {
  reaching: 'Reaching the camera',
  starting: 'Starting video',
  reconnecting: 'The connection dropped for a moment',
};

const FAILURES: Readonly<Record<FailureReason, Omit<StateCopy, 'critical'>>> = {
  unreachable: {
    title: 'Can’t reach the camera on your network',
    body: 'Check that it’s plugged in and on Wi-Fi.',
    icon: 'wifi',
  },
  server: {
    title: 'Can’t load video',
    body: 'The server couldn’t start this camera’s video. Try again.',
    icon: 'server',
  },
  dropped: { title: 'The video stopped', body: 'Try again to reconnect.', icon: 'cameraOff' },
  relayUnsupported: {
    title: 'Watching through your server isn’t available here',
    body: 'Try again to reconnect.',
    icon: 'cameraOff',
  },
  noStream: { title: 'This camera has no live view', body: null, icon: 'cameraOff' },
  network: {
    title: 'This device couldn’t set up the video',
    body: 'Check its network connection, then try again.',
    icon: 'wifi',
  },
  busy: {
    title: 'Too many viewers',
    body: 'Close the camera on another screen, then try again.',
    icon: 'users',
  },
  unknown: { title: 'The video didn’t start', body: null, icon: 'cameraOff' },
};

export interface CopyContext {
  readonly name: string;
  readonly timeZone: string;
  readonly now: number;
}

function connectingCopy(step: ConnectStep, name: string): StateCopy {
  return {
    title: step === 'reconnecting' ? `Reconnecting to ${name}…` : `Connecting to ${name}…`,
    body: STEP_HINT[step],
    icon: 'loader',
    critical: false,
  };
}

type Problem = Exclude<PlayerState, { readonly kind: 'live' } | { readonly kind: 'connecting' }>;

function problemCopy(state: Problem, context: CopyContext): StateCopy {
  switch (state.kind) {
    case 'offline':
      return {
        title: `${context.name} is offline`,
        body:
          state.lastSeen === null
            ? null
            : `Last seen ${moment(state.lastSeen, context.now, context.timeZone)}`,
        icon: 'wifi',
        critical: false,
      };
    case 'privacy':
      return {
        title: 'Privacy mode is on',
        body: `${context.name} isn’t streaming.`,
        icon: 'eyeOff',
        critical: false,
      };
    case 'blockedByFirewall':
      return {
        title: 'Your computer’s firewall is blocking this camera',
        body: null,
        icon: 'shield',
        critical: true,
      };
    case 'failed':
      return { ...FAILURES[state.reason], critical: true };
    case 'noVideo':
      return {
        title: 'Connected, but the camera isn’t sending video',
        body: 'Try again, or restart the camera.',
        icon: 'cameraOff',
        critical: true,
      };
  }
}

export function stateCopy(state: PlayerState, context: CopyContext): StateCopy | null {
  if (state.kind === 'live') {
    return null;
  }
  if (state.kind === 'connecting') {
    return connectingCopy(state.step, context.name);
  }
  return problemCopy(state, context);
}
