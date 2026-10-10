export interface RingPoint {
  readonly at: number;
  readonly value: number;
}

function pointsOf(times: Float64Array, values: Float32Array): RingPoint[] {
  const points: RingPoint[] = [];
  values.forEach((value, index) => {
    const at = times.at(index);
    if (at !== undefined) {
      points.push({ at, value });
    }
  });
  return points;
}

export class MetricRing {
  private readonly times: Float64Array;
  private readonly values: Float32Array;
  private head = 0;
  private size = 0;

  constructor(private readonly capacity: number) {
    this.times = new Float64Array(capacity);
    this.values = new Float32Array(capacity);
  }

  push(value: number, at: number): void {
    this.times[this.head] = at;
    this.values[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
  }

  since(from: number): RingPoint[] {
    const newer = pointsOf(this.times.subarray(0, this.head), this.values.subarray(0, this.head));
    const ordered =
      this.size < this.capacity
        ? newer
        : [...pointsOf(this.times.subarray(this.head), this.values.subarray(this.head)), ...newer];
    return ordered.filter((point) => point.at >= from);
  }
}
