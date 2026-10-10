export const NO_REPLY_MS = 10_000;
export const LONGEST_TURN_MS = 30_000;

export type WatchdogStep = 'nudge' | 'give_up' | 'end_turn' | null;

export class ReplyWatchdog {
  private waitingSince: number | null = null;
  private nudged = false;
  private turnSince: number | null = null;
  private tools = 0;

  turnStarted(now: number): void {
    this.turnSince = now;
    this.waitingSince = null;
  }

  turnEnded(now: number): void {
    this.turnSince = null;
    this.waitingSince = now;
    this.nudged = false;
  }

  toolStarted(): void {
    this.tools += 1;
  }

  toolFinished(): void {
    this.tools -= 1;
  }

  busy(): boolean {
    return this.waitingSince !== null || this.turnSince !== null || this.tools > 0;
  }

  replied(): void {
    this.waitingSince = null;
    this.nudged = false;
  }

  check(now: number): WatchdogStep {
    if (this.turnSince !== null && now - this.turnSince > LONGEST_TURN_MS) {
      this.turnSince = null;
      return 'end_turn';
    }
    if (this.waitingSince === null || now - this.waitingSince < NO_REPLY_MS) {
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
