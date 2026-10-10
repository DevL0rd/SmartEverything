import type { PluginEvent } from '@smarteverything/domain';

const COOLDOWN_MS = 30 * 60 * 1000;

export class AlertGate {
  readonly #sentAt = new Map<string, number>();

  constructor(private readonly emit: (event: PluginEvent) => void) {}

  offer(event: PluginEvent, now: number): void {
    const key = `${event.kind}|${event.subject ?? ''}`;
    const last = this.#sentAt.get(key);
    if (last !== undefined && now - last < COOLDOWN_MS) {
      return;
    }
    this.#sentAt.set(key, now);
    this.emit(event);
  }
}
