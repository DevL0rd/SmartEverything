export type PendingKind = 'request' | 'tool_result';

export class Turn {
  speechEndAt: number | null = null;
  transcriptAt: number | null = null;
  transcripts = 0;
  requestAt: number | null = null;
  firstOutputAt: number | null = null;
  firstAudioAt: number | null = null;
  tools = 0;
  lastResultAt: number | null = null;
  firstOutputAfterResultAt: number | null = null;
  slowestToolMs = 0;
  pending: { readonly since: number; readonly kind: PendingKind } | null = null;
  warned = false;

  constructor(
    readonly id: string,
    readonly startedAt: number,
    readonly kind: 'speech' | 'note' | 'model',
  ) {}

  pendingMs(at: number): number {
    return this.pending === null ? 0 : at - this.pending.since;
  }

  heard(at: number): void {
    this.transcriptAt = at;
    this.transcripts += 1;
  }

  requested(at: number): void {
    this.requestAt = at;
  }

  spoke(at: number): void {
    this.speechEndAt = at;
  }

  output(at: number): { readonly first: boolean; readonly afterResult: boolean } {
    const first = this.firstOutputAt === null;
    this.firstOutputAt ??= at;
    const afterResult = this.lastResultAt !== null && this.firstOutputAfterResultAt === null;
    if (afterResult) {
      this.firstOutputAfterResultAt = at;
    }
    this.pending = null;
    return { first, afterResult };
  }

  audio(at: number): boolean {
    const first = this.firstAudioAt === null;
    this.firstAudioAt ??= at;
    return first;
  }

  toolReceived(): void {
    this.tools += 1;
  }

  toolRan(ms: number): void {
    this.slowestToolMs = Math.max(this.slowestToolMs, ms);
  }

  resulted(at: number): void {
    this.lastResultAt = at;
    this.firstOutputAfterResultAt = null;
  }

  wait(since: number, kind: PendingKind): void {
    this.pending = { since, kind };
  }

  warn(): void {
    this.warned = true;
  }
}
