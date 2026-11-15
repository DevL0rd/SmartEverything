import type { MailKind } from '@smarteverything/domain';

export interface MailCalendar {
  readonly method: 'REQUEST' | 'CANCEL';
  readonly filename: string;
  readonly content: string;
}

export interface MailMessage {
  readonly kind: MailKind;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly calendar: MailCalendar | null;
}

export type MailResult =
  { readonly outcome: 'sent' } | { readonly outcome: 'failed'; readonly detail: string };
