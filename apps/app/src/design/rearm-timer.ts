export class RearmTimer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private due = 0;

  constructor(private readonly fire: () => void) {}

  rearm(ms: number): void {
    this.due = Date.now() + ms;
    this.timer ??= setTimeout(this.check, ms);
  }

  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private readonly check = (): void => {
    const remaining = this.due - Date.now();
    if (remaining > 1) {
      this.timer = setTimeout(this.check, remaining);
      return;
    }
    this.timer = null;
    this.fire();
  };
}
