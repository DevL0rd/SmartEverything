import type { PhoneWatchStatus } from '../../../modules/health-connect';
import { useMinuteOf } from '../../store/clock';
import { useActiveProfile } from '../../store/people';
import type { Device } from '../../store/state';
import {
  heartReadingOf,
  heartViewOf,
  relayLastSeen,
  sameHeartView,
  type HeartView,
} from './watch-heart';

function wornOf(device: Device): boolean | null {
  const worn = device.details['worn'];
  return typeof worn === 'boolean' ? worn : null;
}

export interface WatchPulse {
  readonly heart: HeartView | null;
  readonly lastSeen: number | null;
}

function samePulse(left: WatchPulse, right: WatchPulse): boolean {
  return left.lastSeen === right.lastSeen && sameHeartView(left.heart, right.heart);
}

export function useWatchPulse(device: Device, phone: PhoneWatchStatus | null): WatchPulse {
  const reading = heartReadingOf({
    phone,
    details: device.details,
    worn: phone === null ? wornOf(device) : phone.worn,
  });
  const connected = phone !== null;
  const reportedAt = device.details['reportedAt'];
  return useMinuteOf(
    (now) => ({
      heart: heartViewOf(reading, now),
      lastSeen: relayLastSeen(connected, reportedAt, now),
    }),
    samePulse,
  );
}

export function useOwnWatch(device: Device): boolean {
  return useActiveProfile()?.id === device.details['profileId'];
}
