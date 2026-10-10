import type { WebhookEventEntry } from '@smarteverything/smartthings';

export type WebhookReceiver = (events: readonly WebhookEventEntry[]) => void;

export class SmartThingsWebhooks {
  private readonly receivers = new Map<string, WebhookReceiver>();

  attach(installedAppId: string, receiver: WebhookReceiver): () => void {
    this.receivers.set(installedAppId, receiver);
    return () => {
      if (this.receivers.get(installedAppId) === receiver) {
        this.receivers.delete(installedAppId);
      }
    };
  }

  deliver(installedAppId: string, events: readonly WebhookEventEntry[]): boolean {
    const receiver = this.receivers.get(installedAppId);
    if (receiver === undefined) {
      return false;
    }
    receiver(events);
    return true;
  }
}
