import type {
  AdapterSink,
  CapabilityKey,
  DiscoveredDevice,
  JsonValue,
} from '@smarteverything/domain';
import type { PluginMetrics } from './contract';

interface SampledReadings {
  readonly keys: ReadonlySet<CapabilityKey>;
  readonly metrics: PluginMetrics;
  readonly stateEveryMs: number;
}

export interface DeviceMirrorSpec<T> {
  readonly externalId: string;
  readonly describe: (value: T) => DiscoveredDevice | null;
  readonly readings: (value: T) => ReadonlyMap<CapabilityKey, JsonValue> | null;
  readonly observedAt: (value: T) => string;
  readonly sampled: SampledReadings | null;
}

export class DeviceMirror<T> {
  #sink: AdapterSink | null = null;
  #latest: T | null = null;
  #described: string | null = null;
  #sent = new Map<CapabilityKey, JsonValue>();
  #sampledAt = 0;

  constructor(private readonly spec: DeviceMirrorSpec<T>) {}

  attach(sink: AdapterSink): void {
    this.#sink = sink;
    this.#described = null;
    this.#sent = new Map();
    if (this.#latest !== null) {
      this.update(this.#latest);
    }
  }

  detach(): void {
    this.#sink = null;
  }

  update(value: T): void {
    this.#latest = value;
    const sink = this.#sink;
    const device = this.spec.describe(value);
    if (sink === null || device === null) {
      return;
    }
    const signature = JSON.stringify([device.online, device.model, device.details]);
    if (signature !== this.#described) {
      this.#described = signature;
      sink.devices([device]);
    }
    const readings = this.spec.readings(value);
    if (readings !== null) {
      this.#report(sink, readings, this.spec.observedAt(value));
    }
  }

  #report(
    sink: AdapterSink,
    readings: ReadonlyMap<CapabilityKey, JsonValue>,
    observedAt: string,
  ): void {
    const sampled = this.spec.sampled;
    const now = Date.now();
    const sampledDue = sampled === null || now - this.#sampledAt >= sampled.stateEveryMs;
    if (sampledDue) {
      this.#sampledAt = now;
    }
    for (const [capability, value] of readings) {
      const isSampled = sampled?.keys.has(capability) === true;
      if (isSampled && typeof value === 'number') {
        sampled.metrics.push(this.spec.externalId, capability, value, observedAt);
      }
      if ((sampledDue || !isSampled) && this.#sent.get(capability) !== value) {
        this.#sent.set(capability, value);
        sink.state({ externalId: this.spec.externalId, capability, value, observedAt });
      }
    }
  }
}
