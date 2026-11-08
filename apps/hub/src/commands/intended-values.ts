import type { JsonValue } from '@smarteverything/domain';
import { STALE_FRAME_MS } from './command-budgets';

interface Intended {
  readonly value: JsonValue;
  readonly newerAfter: number;
  readonly expiresAt: number;
}

export interface SentValue {
  readonly value: JsonValue;
  readonly sentAt: number;
  readonly expiresAt: number;
}

export class IntendedValues {
  private readonly values = new Map<string, Intended>();

  constructor(private readonly now: () => Date) {}

  record(key: string, { value, sentAt, expiresAt }: SentValue): void {
    const completedAt = this.now().getTime();
    this.values.set(key, {
      value,
      newerAfter: Math.max(completedAt, sentAt + STALE_FRAME_MS),
      expiresAt,
    });
  }

  drop(key: string): void {
    this.values.delete(key);
  }

  value(key: string, observedAt?: string): JsonValue | undefined {
    const intended = this.values.get(key);
    if (intended === undefined) return undefined;
    if (
      this.now().getTime() >= intended.expiresAt ||
      (observedAt !== undefined && Date.parse(observedAt) > intended.newerAfter)
    ) {
      this.values.delete(key);
      return undefined;
    }
    return intended.value;
  }
}
