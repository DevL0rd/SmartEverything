import type { OralbSettings } from '@smarteverything/domain';

export const PROTOCOL_SIX_CHIP = 'Sessions are recorded live while your phone is near';

export const MISSED_TEXT = 'details not available';

const SHOWN_MISSED = 2;

export function restNotes(
  protocol: number | null,
  missed: OralbSettings['missed'],
  timeOf: (moment: string) => string,
): readonly string[] {
  const live = protocol === 6 ? [PROTOCOL_SIX_CHIP] : [];
  const away = missed
    .slice(-SHOWN_MISSED)
    .map((entry) => `Brushed at ${timeOf(entry.startedAt)} away from your phone: ${MISSED_TEXT}`);
  return [...live, ...away];
}
