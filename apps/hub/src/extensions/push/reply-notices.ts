export interface ReplyExtras {
  readonly tag?: string;
  readonly link?: string;
  readonly sound?: string;
}

export class ReplyNotices {
  private readonly pending = new Map<string, ReplyExtras>();

  expect(messageId: string, extras: ReplyExtras): void {
    this.pending.set(messageId, extras);
  }

  take(messageId: string): ReplyExtras | undefined {
    const extras = this.pending.get(messageId);
    this.pending.delete(messageId);
    return extras;
  }

  discard(messageId: string): void {
    this.pending.delete(messageId);
  }
}
