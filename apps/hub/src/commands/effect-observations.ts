import {
  jsonEquals,
  type CommandRow,
  type JsonValue,
  type StateRow,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

interface Intent {
  readonly value: JsonValue;
  readonly until: number;
}
function key(deviceId: string, capability: string): string {
  return JSON.stringify([deviceId, capability]);
}
export class EffectObservations {
  private readonly pending = new Set<string>();
  private readonly buffered = new Map<string, StateRow>();
  private readonly intents = new Map<string, readonly Intent[]>();
  constructor(
    private readonly store: Store,
    private readonly now: () => Date,
    private readonly external: (row: StateRow) => void,
  ) {}
  begin(row: CommandRow, value: JsonValue): void {
    if (row.device_id === null) return;
    const target = key(row.device_id, row.capability);
    this.pending.add(target);
    const recent = (this.intents.get(target) ?? []).filter(
      (intent) => intent.until > this.now().getTime(),
    );
    this.intents.set(target, [...recent, { value, until: Date.parse(row.expires_at) }]);
  }
  finished(row: CommandRow): void {
    if (row.device_id === null) return;
    const target = key(row.device_id, row.capability);
    this.pending.delete(target);
    const buffered = this.buffered.get(target);
    this.buffered.delete(target);
    if (buffered !== undefined) this.observe(buffered);
  }
  observe(row: StateRow): void {
    const current = this.store.deviceEffects.find(row.device_id, row.capability);
    if (current === undefined || Date.parse(row.observed_at) < Date.parse(current.updated_at))
      return;
    const target = key(row.device_id, row.capability);
    if (this.pending.has(target)) {
      const previous = this.buffered.get(target);
      if (previous === undefined || Date.parse(previous.observed_at) <= Date.parse(row.observed_at))
        this.buffered.set(target, row);
      return;
    }
    if (jsonEquals(row.value, current.resolved)) return;
    const recent = (this.intents.get(target) ?? []).filter(
      (intent) => intent.until > this.now().getTime(),
    );
    this.intents.set(target, recent);
    if (recent.some((intent) => jsonEquals(intent.value, row.value))) return;
    this.external(row);
  }
}
