import { ValueStore, useValue } from '../../design/external-store';
import type { WeighedReading } from '../../store/people';

const requested = new ValueStore<string | null>(null);

export function askWhoWeighed(readingId: string): void {
  requested.set(readingId);
}

export function askedWeighIn(): string | null {
  return requested.get();
}

export function settleWeighIn(readingId: string): void {
  requested.update((current) => (current === readingId ? null : current));
}

export function useAskedWeighIn(): string | null {
  return useValue(requested);
}

export function weighInToAsk(
  pending: readonly WeighedReading[],
  asked: string | null,
  dismissed: readonly string[],
): WeighedReading | undefined {
  const chosen = asked === null ? undefined : pending.find((reading) => reading.id === asked);
  return chosen ?? pending.find((reading) => !dismissed.includes(reading.id));
}
