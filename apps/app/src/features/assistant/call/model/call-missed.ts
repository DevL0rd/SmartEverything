import type { SightSource } from '@smarteverything/domain';
import type { CallMissed, CallSightRequest } from '../call-state';
import { consentWish } from './call-copy';

export const MISSED_KEPT_MS = 2 * 60 * 1000;

export type MissedAction = 'camera' | 'share' | 'home' | 'window';

export function missedOf(request: CallSightRequest, at: number): CallMissed {
  return { requestId: request.requestId, what: request.what, target: request.target, at };
}

export function missedTitle(name: string, missed: CallMissed): string {
  return `Missed: ${name} wanted to ${consentWish(missed.what, missed.target)}`;
}

export function missedLeftMs(missed: CallMissed, now: number): number {
  return Math.max(0, missed.at + MISSED_KEPT_MS - now);
}

export function missedActionOf(source: SightSource): MissedAction {
  switch (source) {
    case 'phone_camera':
      return 'camera';
    case 'phone_screen':
    case 'desktop_screen':
      return 'share';
    case 'desktop_window':
      return 'window';
    case 'home_camera':
      return 'home';
  }
}
