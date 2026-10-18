export const NO_REPLY_MS = 10_000;
export const LONGEST_TURN_MS = 30_000;

export type WatchdogStep = 'nudge' | 'give_up' | 'end_turn' | 'silent' | null;

export class ReplyWatchdog {
  private waitingSince: number | null = null;
  private owedSince: number | null = null;
  private nudged = false;
  private turnSince: number | null = null;
  private tools = 0;

  get toolsRunning(): number {
    return this.tools;
  }

  turnStarted(now: number): void {
    this.turnSince = now;
    this.waitingSince = null;
  }

  turnEnded(now: number): void {
    this.turnSince = null;
    this.waitingSince = now;
    this.nudged = false;
  }

  asked(now: number): void {
    this.owedSince ??= now;
  }

  toolStarted(): void {
    this.tools += 1;
  }

  toolFinished(): void {
    this.tools -= 1;
  }

  busy(): boolean {
    return this.owed() || this.turnSince !== null || this.tools > 0;
  }

  owed(): boolean {
    return this.waitingSince !== null || this.owedSince !== null;
  }

  talking(now: number): void {
    this.waitingSince = this.waitingSince === null ? null : now;
    this.owedSince = this.owedSince === null ? null : now;
  }

  replied(): void {
    this.waitingSince = null;
    this.owedSince = null;
    this.nudged = false;
  }

  check(now: number, unanswered: boolean): WatchdogStep {
    if (this.turnSince !== null && now - this.turnSince > LONGEST_TURN_MS) {
      this.turnSince = null;
      return 'end_turn';
    }
    const since = Math.min(this.waitingSince ?? Infinity, this.owedSince ?? Infinity);
    if (now - since < NO_REPLY_MS) {
      return null;
    }
    if (unanswered) {
      this.talking(now);
      return 'silent';
    }
    this.owedSince = null;
    return this.waitingSince === null ? null : this.unreplied(now, this.waitingSince);
  }

  private unreplied(now: number, waitingSince: number): WatchdogStep {
    if (now - waitingSince < NO_REPLY_MS) {
      return null;
    }
    if (this.nudged) {
      this.waitingSince = null;
      return 'give_up';
    }
    this.nudged = true;
    this.waitingSince = now;
    return 'nudge';
  }
}
