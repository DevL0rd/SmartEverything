import type {
  PlannerAlarmRow,
  PlannerDay,
  PlannerMissedReason,
  PlannerOccurrenceView,
  PlannerRingRow,
} from '@smarteverything/domain';
import { clock } from '../../../format/time';
import { byTime } from './done-ribbon';

export type CatchUpCard =
  | {
      readonly kind: 'item';
      readonly key: string;
      readonly at: number;
      readonly occurrence: PlannerOccurrenceView;
    }
  | {
      readonly kind: 'alarm';
      readonly key: string;
      readonly at: number;
      readonly ring: PlannerRingRow;
      readonly alarm: PlannerAlarmRow | null;
    };

export type ItemCard = Extract<CatchUpCard, { readonly kind: 'item' }>;
export type AlarmCard = Extract<CatchUpCard, { readonly kind: 'alarm' }>;

const MISSED_REASON: Readonly<Record<PlannerMissedReason, string>> = {
  hub_down: 'hub was off',
  phone_off: 'phone was off',
  computer_asleep: 'computer was asleep',
};

const GHOST = { inset: 12, offset: 7, spread: 96 } as const;

function missedAt(occurrence: PlannerOccurrenceView): number {
  const at = occurrence.start ?? occurrence.due_at;
  return at === null ? Number.POSITIVE_INFINITY : Date.parse(at);
}

function missedAlarm(ring: PlannerRingRow): boolean {
  return ring.kind === 'alarm' && ring.outcome === 'missed';
}

export function catchUpCardsOf(
  day: PlannerDay,
  alarms: readonly PlannerAlarmRow[],
  hidden: ReadonlySet<string>,
): readonly CatchUpCard[] {
  const alarmById = new Map(alarms.map((alarm) => [alarm.id, alarm]));
  const cards: CatchUpCard[] = [
    ...day.missed.map((occurrence) => ({
      kind: 'item' as const,
      key: `item:${occurrence.item_id}:${occurrence.occurrence_key}`,
      at: missedAt(occurrence),
      occurrence,
    })),
    ...day.rings.filter(missedAlarm).map((ring) => ({
      kind: 'alarm' as const,
      key: `alarm:${ring.id}`,
      at: Date.parse(ring.due_at),
      ring,
      alarm: alarmById.get(ring.ref_id) ?? null,
    })),
  ];
  return cards.filter((card) => !hidden.has(card.key)).sort(byTime);
}

export interface GhostCard {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

export interface GhostStack {
  readonly ghosts: readonly GhostCard[];
  readonly pad: { readonly paddingBottom: number };
}

export function ghostStackOf(count: number): GhostStack {
  const ghosts = Math.max(0, count - 1);
  const room = Math.max(1, ghosts);
  const inset = Math.min(GHOST.inset, GHOST.spread / room);
  const offset = Math.min(GHOST.offset, GHOST.spread / 2 / room);
  return {
    ghosts: Array.from({ length: ghosts }, (_, index) => ({
      left: inset * (index + 1),
      right: inset * (index + 1),
      bottom: offset * (ghosts - 1 - index),
    })),
    pad: { paddingBottom: offset * ghosts },
  };
}

export function fitPromptOf(cards: readonly CatchUpCard[]): string | null {
  const titles = cards.flatMap((card) => (card.kind === 'item' ? [card.occurrence.title] : []));
  if (titles.length === 0) return null;
  return `Fit what I missed into the rest of today: ${titles.join(', ')}.`;
}

export function missedAlarmTitleOf(card: AlarmCard, timeZone: string): string {
  return `Missed alarm ${clock(card.ring.due_at, timeZone)}`;
}

export function missedReasonOf(ring: PlannerRingRow): string {
  return ring.missed_reason === null ? 'did not ring' : MISSED_REASON[ring.missed_reason];
}
