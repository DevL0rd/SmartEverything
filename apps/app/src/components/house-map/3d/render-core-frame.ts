export class FrameLoop {
  private active = false;
  private dirty = false;
  private held = 0;
  private divisor = 1;
  private request: number | null = null;

  constructor(private readonly drawFrame: (nowMs: number) => boolean) {}

  get running(): boolean {
    return this.active;
  }

  setDivisor(divisor: number): void {
    this.divisor = divisor;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (active) {
      this.invalidate();
      return;
    }
    this.cancel();
  }

  invalidate(): void {
    this.dirty = true;
    this.schedule();
  }

  private schedule(): void {
    if (!this.active || this.request !== null) return;
    this.request = requestAnimationFrame((nowMs) => {
      this.onFrame(nowMs);
    });
  }

  private onFrame(nowMs: number): void {
    this.request = null;
    if (!this.active) return;
    this.held += 1;
    if (!this.dirty && this.held < this.divisor) {
      this.schedule();
      return;
    }
    this.held = 0;
    this.dirty = false;
    if (this.drawFrame(nowMs)) this.schedule();
  }

  private cancel(): void {
    if (this.request === null) return;
    cancelAnimationFrame(this.request);
    this.request = null;
  }
}
