import type { DesktopEventChannel } from '@smarteverything/domain';
import { parseDeepLink, type DeepLinkParse } from './deep-link.js';

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
      this.#onRefused(parsed);
      return;
    }
    const recipient = this.#recipient;
    if (recipient === undefined || recipient.isDestroyed()) {
      this.#pending = [...this.#pending, parsed.url];
      return;
    }
    recipient.send('desktop:deep-link', parsed.url);
  }

  take(recipient: DeepLinkRecipient): readonly string[] {
    this.#recipient = recipient;
    const pending = this.#pending;
    this.#pending = [];
    return pending;
  }
}
