import type { IconName } from '../../../../components/icon';
import { clock } from '../../../../format/time';
import type { VideoPhase } from '../data/vacuum-video';

export type VideoAction = 'open' | 'retry' | 'firewall';

export interface VideoCard {
  readonly icon: IconName;
  readonly tone: 'neutral' | 'warning' | 'critical';
  readonly title: string;
  readonly body: string | null;
  readonly actions: readonly VideoAction[];
}

export const PRIVACY_NOTE =
  'The robot can drive into private rooms, so its camera opens only when you ask.';

export const LIVE_PRIVACY = 'Live from the robot. It can drive into private rooms.';

export const WRONG_PASSWORD = 'Wrong password. Try again.';

export const PASSWORD_KEPT = 'Kept for this session only. Never stored.';

export const UNLOCK_MINUTES = 5;

type CardPhase = Exclude<VideoPhase, { readonly kind: 'live' | 'connecting' | 'opening' }>;

export function isCardPhase(phase: VideoPhase): phase is CardPhase {
  return phase.kind !== 'live' && phase.kind !== 'connecting' && phase.kind !== 'opening';
}

function pressCard(until: string, zone: string | null): VideoCard {
  return {
    icon: 'pressButton',
    tone: 'warning',
    title: 'Press the button on the robot, then open the camera again',
    body: `This allows video for ${String(UNLOCK_MINUTES)} minutes, until ${clock(until, zone)}.`,
    actions: ['open'],
  };
}

function firewallCard(address: string): VideoCard {
  return {
    icon: 'shield',
    tone: 'warning',
    title: "This computer's firewall blocks the robot's camera",
    body: `Allow video from ${address} in the firewall settings, then try again.`,
    actions: ['firewall', 'retry'],
  };
}

export function videoCard(phase: CardPhase, zone: string | null): VideoCard {
  switch (phase.kind) {
    case 'idle':
    case 'asking':
      return {
        icon: 'camera',
        tone: 'neutral',
        title: "The robot's camera is off",
        body: PRIVACY_NOTE,
        actions: ['open'],
      };
    case 'press_button':
      return pressCard(phase.until, zone);
    case 'firewall_blocked':
      return firewallCard(phase.address);
    case 'no_reply':
      return {
        icon: 'wifi',
        tone: 'warning',
        title: "The robot didn't answer",
        body: 'Check that it is on and near its Wi-Fi, then try again.',
        actions: ['retry'],
      };
    case 'unavailable':
      return {
        icon: 'cameraOff',
        tone: 'critical',
        title: "The robot's camera isn't available right now",
        body: phase.reason,
        actions: ['retry'],
      };
  }
}

export const ACTION_LABELS: Readonly<Record<VideoAction, string>> = {
  open: 'Open camera',
  retry: 'Try again',
  firewall: 'Open firewall settings',
};
