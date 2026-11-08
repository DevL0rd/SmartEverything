import type { VacuumVideoOpening } from '@smarteverything/domain';
import { rawErrorText } from '../../../../format/errors';

export const VIDEO_PASSWORD_DIGITS = 4;

const PASSWORD_PATTERN = /^\d{4}$/u;

export type VideoPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'asking'; readonly wrong: boolean }
  | { readonly kind: 'opening' }
  | { readonly kind: 'connecting' }
  | { readonly kind: 'live' }
  | { readonly kind: 'press_button'; readonly until: string }
  | { readonly kind: 'firewall_blocked'; readonly address: string }
  | { readonly kind: 'no_reply' }
  | { readonly kind: 'unavailable'; readonly reason: string };

export const IDLE: VideoPhase = { kind: 'idle' };

export function isVideoPassword(text: string): boolean {
  return PASSWORD_PATTERN.test(text);
}

const passwords = new Map<string, string>();

export function rememberedPassword(deviceId: string): string | null {
  return passwords.get(deviceId) ?? null;
}

export function rememberPassword(deviceId: string, password: string): void {
  passwords.set(deviceId, password);
}

export function forgetPassword(deviceId: string): void {
  passwords.delete(deviceId);
}

export function phaseOfOpening(opening: VacuumVideoOpening): VideoPhase {
  switch (opening.status) {
    case 'live':
      return { kind: 'connecting' };
    case 'press_button':
      return { kind: 'press_button', until: opening.until };
    case 'password_required':
      return { kind: 'asking', wrong: false };
    case 'wrong_password':
      return { kind: 'asking', wrong: true };
    case 'firewall_blocked':
      return { kind: 'firewall_blocked', address: opening.address };
    case 'no_reply':
      return { kind: 'no_reply' };
  }
}

export interface OpeningPorts {
  readonly offer: () => Promise<string>;
  readonly post: (password: string | null, sdp: string) => Promise<VacuumVideoOpening>;
  readonly answer: (sdp: string) => Promise<void>;
}

export async function runOpening(
  ports: OpeningPorts,
  password: string | null,
): Promise<VideoPhase> {
  try {
    const opening = await ports.post(password, await ports.offer());
    if (opening.status === 'live') {
      await ports.answer(opening.sdp);
    }
    return phaseOfOpening(opening);
  } catch (error) {
    return { kind: 'unavailable', reason: rawErrorText(error) };
  }
}

export function keepsPassword(phase: VideoPhase): boolean {
  return phase.kind !== 'asking';
}

export type PeerLinkState = 'connected' | 'disconnected' | 'failed' | 'closed' | 'other';

export function phaseOfLink(state: PeerLinkState, current: VideoPhase): VideoPhase {
  if (current.kind !== 'connecting' && current.kind !== 'live') {
    return current;
  }
  switch (state) {
    case 'connected':
      return { kind: 'live' };
    case 'disconnected':
      return { kind: 'connecting' };
    case 'failed':
      return { kind: 'unavailable', reason: 'No network path reached the robot camera' };
    case 'closed':
      return { kind: 'unavailable', reason: 'The robot camera stream ended' };
    case 'other':
      return current;
  }
}
