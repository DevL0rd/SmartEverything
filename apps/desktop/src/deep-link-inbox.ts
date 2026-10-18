import type { DesktopEventChannel } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { parseDeepLink, type DeepLinkParse } from './deep-link.js';

const log = new Logger('desktop.deep-link');

export interface DeepLinkRecipient {
  send(channel: DesktopEventChannel, url: string): void;
  isDestroyed(): boolean;
}

export type DeepLinkRefusal = Extract<DeepLinkParse, { kind: 'refused' }>;

export class DeepLinkInbox {
  readonly #onRefused: (refusal: DeepLinkRefusal) => void;
  #pending: string[] = [];
  #recipient: DeepLinkRecipient | undefined;

  constructor(onRefused: (refusal: DeepLinkRefusal) => void) {
    this.#onRefused = onRefused;
  }

  receive(candidate: string): void {
    const parsed = parseDeepLink(candidate);
    if (parsed.kind === 'refused') {
      log.warn('link.refused', { reason: parsed.reason, length: candidate.length });
      this.#onRefused(parsed);
      return;
    }
    const recipient = this.#recipient;
    if (recipient === undefined || recipient.isDestroyed()) {
      this.#pending = [...this.#pending, parsed.url];
      log.info('link.queued', {
        pending: this.#pending.length,
        recipient: recipient === undefined ? 'none' : 'destroyed',
      });
      return;
    }
    log.info('link.delivered', { length: parsed.url.length });
    recipient.send('desktop:deep-link', parsed.url);
  }

  take(recipient: DeepLinkRecipient): readonly string[] {
    this.#recipient = recipient;
    const pending = this.#pending;
    this.#pending = [];
    log.info('link.taken', { count: pending.length });
    return pending;
  }
}
