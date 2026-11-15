const SETTLE_PASSES = 4;

export interface SettleHost<Node> {
  readonly deliver: (node: Node) => boolean;
  readonly flush: (run: () => boolean) => boolean;
  readonly queue: (task: () => void) => void;
}

export class LayoutSettle<Node> {
  private readonly due = new Set<Node>();
  private queued = false;
  private moved = false;

  constructor(private readonly host: SettleHost<Node>) {}

  committed(node: Node, resumed: boolean, delivered: boolean): void {
    if (resumed && delivered) {
      this.moved = true;
    }
    if (resumed || this.queued) {
      this.due.add(node);
      this.request();
    }
  }

  forget(node: Node): void {
    this.due.delete(node);
  }

  private request(): void {
    if (this.queued) {
      return;
    }
    this.queued = true;
    this.host.queue(() => {
      this.settle();
    });
  }

  private settle(): void {
    for (let pass = 0; pass < SETTLE_PASSES && this.moved; pass += 1) {
      this.moved = false;
      if (this.host.flush(() => this.deliverDue())) {
        this.moved = true;
      }
    }
    this.queued = false;
    this.moved = false;
    this.due.clear();
  }

  private deliverDue(): boolean {
    const nodes = [...this.due];
    this.due.clear();
    let delivered = false;
    for (const node of nodes) {
      delivered = this.host.deliver(node) || delivered;
    }
    return delivered;
  }
}
