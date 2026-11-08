import { z } from 'zod';
import type { IconName } from '../../../components/icon';

export type VacuumTab = 'clean' | 'schedule' | 'history' | 'care' | 'settings';

export const VACUUM_TABS: readonly { readonly key: VacuumTab; readonly label: string }[] = [
  { key: 'clean', label: 'Clean' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'history', label: 'History' },
  { key: 'care', label: 'Care' },
  { key: 'settings', label: 'Settings' },
];

const REVEAL_TARGET = z.enum(['rooms', 'zones']);

export type RevealTarget = z.infer<typeof REVEAL_TARGET>;

export const VACUUM_SHOW_PARAM = 'show';

export interface RevealRequest {
  readonly target: RevealTarget;
  readonly seq: number;
}

export interface ShowAction {
  readonly target: RevealTarget;
  readonly label: string;
  readonly icon: IconName;
}

export const SHOW_ACTIONS: readonly ShowAction[] = [
  { target: 'rooms', label: 'Rooms', icon: 'door' },
  { target: 'zones', label: 'Zones', icon: 'grid' },
];

export function nextReveal(previous: RevealRequest | null, target: RevealTarget): RevealRequest {
  return { target, seq: (previous?.seq ?? 0) + 1 };
}

export function revealSeqOf(request: RevealRequest | null, target: RevealTarget): number | null {
  return request?.target === target ? request.seq : null;
}

export function revealOfParam(value: unknown): RevealRequest | null {
  const parsed = REVEAL_TARGET.safeParse(value);
  return parsed.success ? nextReveal(null, parsed.data) : null;
}
