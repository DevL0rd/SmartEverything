export class SocketStats {
  closer: string | null = null;
  lastPongAt = performance.now();
  sent = 0;
  sentChars = 0;
  filtered = 0;
  maxBuffered = 0;
  backlogged = false;
  subscribes = 0;
  messages = 0;
  frames = 0;
  frameBytes = 0;

  closedBy(reason: string): void {
    this.closer ??= reason;
  }

  ponged(): void {
    this.lastPongAt = performance.now();
  }

  sinceLastPongMs(): number {
    return Math.round(performance.now() - this.lastPongAt);
  }

  delivered(chars: number): void {
    this.sent += 1;
    this.sentChars += chars;
  }

  skipped(): void {
    this.filtered += 1;
  }

  buffered(bytes: number): void {
    if (bytes > this.maxBuffered) this.maxBuffered = bytes;
  }

  backlog(on: boolean): void {
    this.backlogged = on;
  }

  subscribed(): void {
    this.subscribes += 1;
  }

  message(): void {
    this.messages += 1;
  }

  frame(bytes: number): void {
    this.frames += 1;
    this.frameBytes += bytes;
  }
}

export class LiveTally {
  sent = 0;
  chars = 0;
  filtered = 0;
  opened = 0;
  closed = 0;
  readonly types = new Map<string, number>();

  delivered(type: string, chars: number): void {
    this.sent += 1;
    this.chars += chars;
    this.types.set(type, (this.types.get(type) ?? 0) + 1);
  }

  skipped(): void {
    this.filtered += 1;
  }

  open(): void {
    this.opened += 1;
  }

  close(): void {
    this.closed += 1;
  }
}
