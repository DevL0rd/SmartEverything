import type { ConversationTrace } from './conversation-trace';
import type { LiveRenewal } from './live-renewal';
import type { ReplyWatchdog } from './reply-watchdog';

export class ModelReplies {
  private begun = false;

  constructor(
    private readonly watchdog: ReplyWatchdog,
    private readonly renewal: LiveRenewal,
    private readonly trace: ConversationTrace,
    private readonly now: () => number,
  ) {}

  get answering(): boolean {
    return this.begun;
  }

  output(): void {
    if (!this.begun) {
      this.begun = true;
      this.replied();
    }
  }

  completed(): void {
    if (!this.begun) {
      this.replied();
    }
    this.begun = false;
  }

  cut(): void {
    this.begun = false;
  }

  private replied(): void {
    this.watchdog.replied();
    const answer = this.renewal.replied(this.now());
    if (answer !== null) {
      this.trace.answered(answer);
    }
  }
}
