import { createHash } from 'node:crypto';
import { ApiError, type MailLogRow, type MailTestResult } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import type { MailMessage, MailResult } from './message';
import type { MailSettingsStore } from './settings';
import { smtpTransport, type MailTransport } from './transport';

export interface MailServiceDeps {
  readonly settings: MailSettingsStore;
  readonly store: Pick<Store, 'mailLog'>;
  readonly log: Logger;
  readonly transport?: MailTransport;
}

const ADDRESS = /[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/g;

export function addressHash(address: string): string {
  return createHash('sha256').update(address.trim().toLowerCase()).digest('hex');
}

export function failureDetail(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : String(cause);
  const clean = text.replace(ADDRESS, 'an address').replace(/\s+/g, ' ').trim();
  return clean === '' ? 'The mail server refused the message.' : clean;
}

export class MailService {
  private readonly transport: MailTransport;

  constructor(private readonly deps: MailServiceDeps) {
    this.transport = deps.transport ?? smtpTransport;
  }

  get configured(): boolean {
    return this.deps.settings.config() !== null;
  }

  fromAddress(): string | null {
    return this.deps.settings.config()?.from_address ?? null;
  }

  fromName(): string | null {
    return this.deps.settings.config()?.from_name ?? null;
  }

  recent(count: number): MailLogRow[] {
    return this.deps.store.mailLog.recent(count);
  }

  async send(message: MailMessage): Promise<MailResult> {
    const config = this.deps.settings.config();
    if (config === null) return { outcome: 'failed', detail: 'No email server is set up.' };
    let result: MailResult = { outcome: 'sent' };
    try {
      await this.transport(config, message);
    } catch (cause) {
      result = { outcome: 'failed', detail: failureDetail(cause) };
    }
    this.record(message, result);
    return result;
  }

  async test(to: string): Promise<MailTestResult> {
    if (!this.configured) {
      throw new ApiError('conflict', 'Set up the email server before sending a test.');
    }
    return this.send({
      kind: 'test',
      to,
      subject: 'SmartEverything test email',
      text: 'This is a test message from your SmartEverything hub. Email invitations will arrive the same way.',
      html: '<p>This is a test message from your SmartEverything hub. Email invitations will arrive the same way.</p>',
      calendar: null,
    });
  }

  private record(message: MailMessage, result: MailResult): void {
    this.deps.store.mailLog.insert({
      kind: message.kind,
      to_hash: addressHash(message.to),
      subject: message.subject,
      outcome: result.outcome,
      detail: result.outcome === 'failed' ? result.detail : null,
    });
    if (result.outcome === 'sent') this.deps.log.info('mail.sent', { kind: message.kind });
    else this.deps.log.warn('mail.failed', { kind: message.kind, detail: result.detail });
  }
}
