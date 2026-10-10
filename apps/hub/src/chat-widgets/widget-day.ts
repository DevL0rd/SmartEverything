import type { ChatWidget } from '@smarteverything/domain';
import { z } from 'zod';
import type { RuleInput } from './rule-input';

const DAY_TEXT = /^(\d{4}-\d{2}-\d{2})/;
const MIDNIGHT = /T00:00(:00(\.0+)?)?/;
const DAY_KEYS = ['day', 'date', 'at', 'consumedAt'] as const;
const RANGE = z.looseObject({ from: z.string(), to: z.string() });

function dayText(value: unknown): string | null {
  return typeof value === 'string' ? (DAY_TEXT.exec(value)?.[1] ?? null) : null;
}

function nextDay(day: string): string {
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function rangeDay(args: RuleInput['args']): string | null {
  const range = RANGE.safeParse(args);
  if (!range.success) {
    return null;
  }
  const from = dayText(range.data.from);
  const to = dayText(range.data.to);
  if (from === null || to === null) {
    return null;
  }
  const endsAtMidnight = MIDNIGHT.test(range.data.to) && to === nextDay(from);
  return from === to || endsAtMidnight ? from : null;
}

function ownDay(args: RuleInput['args']): string | null {
  for (const key of DAY_KEYS) {
    const day = dayText(args[key]);
    if (day !== null) {
      return day;
    }
  }
  return rangeDay(args);
}

const NESTED = z.looseObject({ query: z.record(z.string(), z.unknown()) });

export function dayOfCall(args: RuleInput['args']): string | null {
  const nested = NESTED.safeParse(args);
  return ownDay(args) ?? (nested.success ? ownDay(nested.data.query) : null);
}

export function withDay(widgets: readonly ChatWidget[], day: string | null): ChatWidget[] {
  return widgets.map((widget) =>
    day !== null &&
    (widget.kind === 'health' || widget.kind === 'nutrition') &&
    widget.day === undefined
      ? { ...widget, day }
      : widget,
  );
}
