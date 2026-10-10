import { localClock, type RowChange, type SignalInput } from '@smarteverything/domain';

export interface FeedContext {
  readonly at: string;
  readonly today: () => string;
}

export type FeedProducer = (change: RowChange, context: FeedContext) => readonly SignalInput[];

export function signalAt(
  context: FeedContext,
  signal: Omit<SignalInput, 'at' | 'previous' | 'data'> &
    Partial<Pick<SignalInput, 'previous' | 'data'>>,
): SignalInput {
  return { previous: null, data: {}, ...signal, at: context.at };
}

function padded(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function homeDay(instant: Date, timeZone: string): string {
  const { year, month, day } = localClock(instant, timeZone);
  return `${padded(year, 4)}-${padded(month, 2)}-${padded(day, 2)}`;
}

export function feedContextOf(now: Date, timeZone: () => string): FeedContext {
  return { at: now.toISOString(), today: () => homeDay(now, timeZone()) };
}
