import type { AdapterSink, CapabilityKey, JsonValue } from '@smarteverything/domain';
import type { MetricHistory } from '../../metrics/history';
import type { CapabilityEntry } from './brand';
import { eventOf } from './events';
import type { DeviceState } from './fleet';

export interface PublisherDeps {
  readonly sink: () => AdapterSink;
  readonly metrics: Pick<MetricHistory, 'push'>;
}

export class Publisher {
  constructor(private readonly deps: PublisherDeps) {}

  snapshot(state: DeviceState, touched: ReadonlySet<string>, at: string): void {
    const { runtime } = state;
    const values = runtime.brand.values({
      touched,
      at,
      brushedSeconds: runtime.machine.brushedSeconds,
    });
    values.metrics.forEach(([series, value]) => {
      this.deps.metrics.push(state.deviceId, series, value, new Date(at));
    });
    [...this.activity(state, touched), ...values.entries].forEach(([key, value]) => {
      this.emit(state, key, value, at);
    });
    values.events.forEach((event) => {
      this.deps.sink().event(eventOf(state, event));
    });
  }

  link(state: DeviceState, at: string): void {
    this.emit(state, 'brush_link', state.link.phase, at);
  }

  fault(state: DeviceState, faulty: boolean, at: string): void {
    this.emit(state, 'brush_fault', faulty, at);
  }

  private activity(state: DeviceState, touched: ReadonlySet<string>): CapabilityEntry[] {
    const { runtime } = state;
    return touched.has('activity')
      ? [
          ['brush_activity', runtime.state.activity],
          ['brush_session', runtime.session],
        ]
      : [['brush_session', runtime.session]];
  }

  private emit(state: DeviceState, key: CapabilityKey, value: JsonValue, at: string): void {
    if (state.sent.get(key) === value) {
      return;
    }
    state.sent.set(key, value);
    this.deps.sink().state({
      externalId: state.entry.externalId,
      capability: key,
      value,
      observedAt: at,
    });
  }
}
