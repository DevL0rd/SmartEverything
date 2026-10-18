import type { DeviceValues } from './state';

const BUCKETS = 32;
const SAMPLE = 8;

type Bucket = Readonly<Record<string, DeviceValues>>;

const NO_BUCKET: Bucket = {};

function bucketOf(deviceId: string): number {
  let hash = deviceId.length;
  const from = Math.max(0, deviceId.length - SAMPLE);
  for (let index = from; index < deviceId.length; index += 1) {
    hash = (hash * 31 + deviceId.charCodeAt(index)) | 0;
  }
  return (hash >>> 0) % BUCKETS;
}

export class DeviceValueIndex {
  static readonly empty = new DeviceValueIndex(
    Array.from({ length: BUCKETS }, () => NO_BUCKET),
    0,
  );

  static from(entries: Iterable<readonly [string, DeviceValues]>): DeviceValueIndex {
    const buckets: Record<string, DeviceValues>[] = Array.from({ length: BUCKETS }, () => ({}));
    let size = 0;
    for (const [deviceId, values] of entries) {
      const bucket = buckets[bucketOf(deviceId)];
      if (bucket === undefined) continue;
      if (!(deviceId in bucket)) size += 1;
      bucket[deviceId] = values;
    }
    return new DeviceValueIndex(buckets, size);
  }

  private constructor(
    private readonly buckets: readonly Bucket[],
    readonly size: number,
  ) {}

  get(deviceId: string): DeviceValues | undefined {
    return this.buckets[bucketOf(deviceId)]?.[deviceId];
  }

  set(deviceId: string, values: DeviceValues): DeviceValueIndex {
    const at = bucketOf(deviceId);
    const bucket = this.buckets[at] ?? NO_BUCKET;
    if (bucket[deviceId] === values) return this;
    const buckets = this.buckets.slice();
    buckets[at] = { ...bucket, [deviceId]: values };
    return new DeviceValueIndex(buckets, deviceId in bucket ? this.size : this.size + 1);
  }

  *entries(): IterableIterator<readonly [string, DeviceValues]> {
    for (const bucket of this.buckets) {
      for (const deviceId in bucket) {
        const values = bucket[deviceId];
        if (values !== undefined) yield [deviceId, values];
      }
    }
  }

  changedIds(other: DeviceValueIndex, visit: (deviceId: string) => void): void {
    if (other === this) return;
    for (let at = 0; at < BUCKETS; at += 1) {
      const before = this.buckets[at] ?? NO_BUCKET;
      const after = other.buckets[at] ?? NO_BUCKET;
      if (before === after) continue;
      for (const deviceId in after) {
        if (before[deviceId] !== after[deviceId]) visit(deviceId);
      }
      for (const deviceId in before) {
        if (!(deviceId in after)) visit(deviceId);
      }
    }
  }
}
