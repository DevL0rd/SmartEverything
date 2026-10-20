import {
  LAUNDRY_NOTICE_KINDS,
  type CapabilityRole,
  type DevicePresentation,
  type LaundryNoticeKind,
} from '@smarteverything/domain';
import type { SelectOption } from '../../../components/select-picker';
import { rolesOf } from './snapshot';

const NOTICE_ROLES: Readonly<Record<LaundryNoticeKind, CapabilityRole>> = {
  finished: 'laundry_status',
  fault: 'fault',
  detergent: 'detergent_level',
  softener: 'softener_level',
  filter: 'filter_clean',
  unload: 'unload_pending',
};

const UNLOAD_CHOICES: readonly number[] = [15, 30, 45, 60, 90, 120];

export function noticeKindsOf(presentation: DevicePresentation): readonly LaundryNoticeKind[] {
  if (presentation.family !== 'laundry') {
    return [];
  }
  const roles = rolesOf(presentation);
  return LAUNDRY_NOTICE_KINDS.filter((kind) => roles.has(NOTICE_ROLES[kind]));
}

export function unloadOptions(current: number): readonly SelectOption<string>[] {
  const minutes = [...new Set([...UNLOAD_CHOICES, current])].sort((left, right) => left - right);
  return minutes.map((value) => ({ value: String(value), label: `After ${String(value)} min` }));
}
