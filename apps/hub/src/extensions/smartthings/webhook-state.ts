import type { SmartThingsWebhook } from '@smarteverything/domain';

const EVENT_NOTICE_MS = 60_000;

export class WebhookState {
  private status: SmartThingsWebhook = { confirmedAt: null, lastEventAt: null, lastError: null };

  constructor(private readonly changed: (status: SmartThingsWebhook) => void) {}

  current(): SmartThingsWebhook {
    return this.status;
  }

  confirmed(at: string): void {
    this.set({ ...this.status, confirmedAt: at, lastError: null });
  }

  accepted(): void {
    this.set({ ...this.status, lastError: null });
  }

  failed(reason: string): void {
    this.set({ ...this.status, lastError: reason });
  }

  eventArrived(at: string): void {
    const previous = this.status.lastEventAt;
    const recent = previous !== null && Date.parse(at) - Date.parse(previous) < EVENT_NOTICE_MS;
    this.status = { ...this.status, lastEventAt: at };
    if (!recent) {
      this.changed(this.status);
    }
  }

  private set(next: SmartThingsWebhook): void {
    if (next.confirmedAt === this.status.confirmedAt && next.lastError === this.status.lastError) {
      return;
    }
    this.status = next;
    this.changed(next);
  }
}
