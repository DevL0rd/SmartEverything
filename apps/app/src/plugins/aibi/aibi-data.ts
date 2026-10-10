import {
  ROBOT_ACTIVITY,
  ROBOT_ACTIVITY_STREAM,
  ROBOT_ACTION_CAPABILITY,
  ROBOT_MOVES,
  ROBOT_MOVES_STREAM,
  ROBOT_PLUGIN_ID,
  ROBOT_STATUS,
  ROBOT_STATUS_STREAM,
  type RobotActivityEntry,
  type RobotMoves,
  type RobotStatus,
} from '@smarteverything/domain';
import { useDevices } from '../../store/selectors';
import type { Device } from '../../store/state';
import { useControl, type Control } from '../../store/control';
import type { PluginNoticeText } from '../shared/plugin-notice';
import { usePluginStream, type PluginStream } from '../shared/use-plugin-stream';
import type { IconName } from '../../components/icon';
import type { Tone } from '../../components/tone';
import type { BadgeTone } from '../../components/badge';

export const AIBI_PLUGIN = ROBOT_PLUGIN_ID;

export function useRobotStatus(): PluginStream<RobotStatus> {
  return usePluginStream(AIBI_PLUGIN, ROBOT_STATUS_STREAM, ROBOT_STATUS);
}

export function useRobotActivity(): PluginStream<{
  readonly entries: readonly RobotActivityEntry[];
}> {
  return usePluginStream(AIBI_PLUGIN, ROBOT_ACTIVITY_STREAM, ROBOT_ACTIVITY);
}

export function useRobotMoves(): PluginStream<RobotMoves> {
  return usePluginStream(AIBI_PLUGIN, ROBOT_MOVES_STREAM, ROBOT_MOVES);
}

export function useRobotDevice(): Device | null {
  return useDevices({ includeHidden: true }).find((device) => device.kind === 'robot') ?? null;
}

export function isRobot(device: { readonly kind: string }): boolean {
  return device.kind === 'robot';
}

export function useMoveControl(device: Device): Control {
  return useControl(device.id, ROBOT_ACTION_CAPABILITY);
}

export const LISTENER_BADGE: Readonly<
  Record<RobotStatus['server']['state'], { readonly label: string; readonly tone: BadgeTone }>
> = {
  off: { label: 'Off', tone: 'neutral' },
  starting: { label: 'Starting…', tone: 'info' },
  running: { label: 'Running', tone: 'positive' },
  failed: { label: 'Problem', tone: 'critical' },
};

export const ACTIVITY_LOOK: Readonly<
  Record<RobotActivityEntry['kind'], { readonly icon: IconName; readonly tone: Tone }>
> = {
  heard: { icon: 'mic', tone: 'primary' },
  said: { icon: 'speaker', tone: 'positive' },
  action: { icon: 'move', tone: 'info' },
  chat: { icon: 'messageCircle', tone: 'variant' },
  task: { icon: 'sparkles', tone: 'primary' },
  status: { icon: 'info', tone: 'variant' },
  request: { icon: 'arrowRight', tone: 'variant' },
  unknown: { icon: 'search', tone: 'warning' },
  firmware: { icon: 'download', tone: 'warning' },
  network: { icon: 'wifi', tone: 'info' },
  warning: { icon: 'alert', tone: 'critical' },
};

export function robotProblem(status: RobotStatus): PluginNoticeText | null {
  if (status.server.state === 'failed') {
    return {
      tone: 'critical',
      title: 'AIBI’s server did not start',
      body: status.server.reason ?? 'The plugin could not open its ports.',
      settings: true,
    };
  }
  if (!status.configured) {
    return {
      tone: 'warning',
      title: 'AIBI cannot talk yet',
      body: 'Add a Gemini key in Settings › AI assistant › Voice.',
      settings: false,
    };
  }
  return status.dns.state === 'failed'
    ? {
        tone: 'warning',
        title: 'AIBI’s name lookups are not answered',
        body: status.dns.reason ?? 'The DNS server did not start.',
        settings: true,
      }
    : null;
}

function waitingNotice(status: RobotStatus): PluginNoticeText | null {
  if (status.contact !== null) {
    return null;
  }
  return {
    tone: 'info',
    title: 'Waiting for AIBI',
    body:
      status.address === null
        ? 'No network address was found for this computer.'
        : `Point your router’s DNS at ${status.address}, then wake AIBI.`,
    settings: false,
  };
}

function modeNotice(status: RobotStatus): PluginNoticeText | null {
  if (status.mode === 'passthrough') {
    return {
      tone: 'info',
      title: 'AIBI is using its own cloud',
      body: 'This server only watches; it does not answer AIBI.',
      settings: true,
    };
  }
  return status.capture
    ? {
        tone: 'warning',
        title: 'Copying everything AIBI sends',
        body: 'Its requests, microphone audio and photos are saved on this computer.',
        settings: true,
      }
    : null;
}

export function robotNotice(status: RobotStatus): PluginNoticeText | null {
  return robotProblem(status) ?? waitingNotice(status) ?? modeNotice(status);
}
