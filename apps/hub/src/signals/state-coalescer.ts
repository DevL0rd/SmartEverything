import type { SignalInput } from '@smarteverything/domain';
import type { Cancel, Clock } from '../clock';

interface Held {
  readonly signal: SignalInput;
  readonly cancel: Cancel;
}

export class StateCoalescer {
  private readonly held = new Map<string, Held>();

  constructor(
    private readonly at: Clock['at'],
    private readonly release: (signal: SignalInput) => void,
  ) {}

  hold(key: string, signal: SignalInput, dueMs: number): void {
    const cancel =
      this.held.get(key)?.cancel ??
      this.at(new Date(dueMs), () => {
        this.flush(key);
      });
    this.held.set(key, { signal, cancel });
  }

  drop(key: string): void {
    this.held.get(key)?.cancel();
    this.held.delete(key);
  }

  close(): void {
    for (const held of this.held.values()) held.cancel();
    this.held.clear();
  }

  private flush(key: string): void {
    const held = this.held.get(key);
    if (held === undefined) return;
    this.held.delete(key);
    this.release(held.signal);
  }
}
