import { decimal, signed } from '../../../format/number';
import type { ScaleFacts } from './weigh-ins';

type LineTone = 'variant' | 'warning';

export interface ScaleLine {
  readonly text: string;
  readonly tone: LineTone;
}

export const EMPTY_LINE = 'Step on the scale with your phone nearby';

export function scaleLine(
  facts: ScaleFacts,
  when: (iso: string, stale: boolean) => string,
): ScaleLine {
  const { latest, weekDelta, stale } = facts;
  if (latest === null) {
    return { text: EMPTY_LINE, tone: 'variant' };
  }
  if (latest.outlier) {
    return { text: `${decimal(latest.kg, 1)} kg looks off · not counted`, tone: 'warning' };
  }
  if (stale) {
    return { text: `Last weigh-in ${when(latest.iso, true)}`, tone: 'variant' };
  }
  const week = weekDelta === null ? [] : [`${signed(weekDelta, 1)} kg this week`];
  return { text: [when(latest.iso, false), ...week].join(' · '), tone: 'variant' };
}

export type ScaleAction =
  | { readonly kind: 'queue'; readonly label: string; readonly filled: true }
  | { readonly kind: 'one'; readonly label: string; readonly filled: boolean };

export function readingsLabel(count: number): string {
  return `${String(count)} ${count === 1 ? 'reading needs' : 'readings need'} a person`;
}

export function scaleActions(facts: ScaleFacts, pending: number): readonly ScaleAction[] {
  const queue: readonly ScaleAction[] =
    pending > 0
      ? [
          {
            kind: 'queue',
            label: `Assign ${String(pending)} ${pending === 1 ? 'reading' : 'readings'}`,
            filled: true,
          },
        ]
      : [];
  const one: readonly ScaleAction[] =
    facts.notMe && facts.latest !== null
      ? [{ kind: 'one', label: 'Not me?', filled: facts.latest.outlier }]
      : [];
  return [...queue, ...one];
}

export function scaleTicker(facts: ScaleFacts, pending: number): string | null {
  if (pending > 0) {
    return `${String(pending)} need a person`;
  }
  return facts.latest?.outlier === true ? 'Not counted' : null;
}

function bodyFatSpoken(facts: ScaleFacts): string | null {
  const composition = facts.latest?.composition;
  return composition === undefined || composition === null
    ? null
    : `body fat ${decimal(composition.body_fat_percent, 0)} percent`;
}

export function scaleSummary(
  label: string,
  facts: ScaleFacts,
  line: string,
  pending: number,
): string {
  const parts = [
    label,
    facts.latest === null ? null : `${decimal(facts.latest.kg, 1)} kilograms`,
    line,
    bodyFatSpoken(facts),
    pending > 0 ? readingsLabel(pending) : null,
  ];
  return parts.filter((part): part is string => part !== null).join(', ');
}
