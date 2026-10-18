export class StampRing {
  readonly at: Float64Array;
  private next = 0;
  private size = 0;

  constructor(private readonly capacity: number) {
    this.at = new Float64Array(capacity);
  }

  claim(at: number): number {
    const slot = this.next;
    this.at[slot] = at;
    this.next = (slot + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
    return slot;
  }

  get length(): number {
    return this.size;
  }

  slotOf(order: number): number {
    return (this.next - this.size + order + this.capacity) % this.capacity;
  }
}
