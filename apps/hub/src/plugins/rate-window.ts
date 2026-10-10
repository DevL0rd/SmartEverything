export class RateWindow {
  private readonly moments: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly spanMs: number,
  ) {}

  admit(now: number): boolean {
    while (this.moments.length > 0 && (this.moments[0] ?? now) <= now - this.spanMs) {
      this.moments.shift();
    }
    if (this.moments.length >= this.limit) {
      return false;
    }
    this.moments.push(now);
    return true;
  }
}
