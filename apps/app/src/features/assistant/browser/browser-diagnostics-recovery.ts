const MAX_RECOVERIES = 3;
const HEALTHY_MS = 30_000;
const RETRY_DELAYS = [0, 250, 1000] as const;
interface RecoveryPorts {
  readonly connect: () => void;
  readonly eligible: () => boolean;
  readonly connected: () => boolean;
}
export class DiagnosticsRecovery {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private openedAt: number | null = null;
  private nextAt = 0;
  private disposed = false;
  constructor(private readonly ports: RecoveryPorts) {}
  opened(): void {
    this.openedAt = Date.now();
    this.cancel();
  }
  resume(): void {
    this.attempts = 0;
    this.nextAt = 0;
    this.activity();
  }
  epoch(): void {
    this.disposed = false;
    this.cancel();
    this.attempts = 0;
    this.nextAt = 0;
    this.openedAt = null;
  }
  closed(): void {
    if (this.openedAt !== null && Date.now() - this.openedAt >= HEALTHY_MS) this.attempts = 0;
    this.openedAt = null;
    this.schedule();
  }
  activity(): void {
    if (!this.available()) return;
    if (Date.now() < this.nextAt) {
      this.schedule();
      return;
    }
    this.cancel();
    this.attempts += 1;
    const delay = RETRY_DELAYS[this.attempts] ?? HEALTHY_MS;
    this.nextAt = Date.now() + delay;
    this.ports.connect();
  }
  private available(): boolean {
    return (
      !this.disposed &&
      !this.ports.connected() &&
      this.ports.eligible() &&
      this.attempts < MAX_RECOVERIES
    );
  }
  private schedule(): void {
    if (!this.available() || this.timer !== null) return;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this.activity();
      },
      Math.max(0, this.nextAt - Date.now()),
    );
  }
  private cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  dispose(): void {
    this.disposed = true;
    this.cancel();
  }
}
