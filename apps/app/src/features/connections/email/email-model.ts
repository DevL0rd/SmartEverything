import {
  MAIL_SETTINGS_WRITE,
  MAIL_TEST_BODY,
  type MailSecurity,
  type MailSettings,
  type MailSettingsWrite,
} from '@smarteverything/domain';

export interface EmailDraft {
  readonly host: string;
  readonly port: string;
  readonly security: MailSecurity;
  readonly user: string;
  readonly password: string;
  readonly passwordSet: boolean;
  readonly clearPassword: boolean;
  readonly fromName: string;
  readonly fromAddress: string;
}

export const SECURITY_PORT: Readonly<Record<MailSecurity, number>> = {
  tls: 465,
  starttls: 587,
  none: 25,
};

export const SECURITY_LABEL: Readonly<Record<MailSecurity, string>> = {
  tls: 'TLS',
  starttls: 'STARTTLS',
  none: 'None',
};

export const SECURITY_TEXT: Readonly<Record<MailSecurity, string>> = {
  tls: 'Encrypted from the first byte, usually port 465.',
  starttls: 'Starts plain and switches to encryption, usually port 587.',
  none: 'Not encrypted. Only for a mail server inside your home network.',
};

const EMPTY_DRAFT: EmailDraft = {
  host: '',
  port: String(SECURITY_PORT.starttls),
  security: 'starttls',
  user: '',
  password: '',
  passwordSet: false,
  clearPassword: false,
  fromName: '',
  fromAddress: '',
};

export function draftOfSettings(settings: MailSettings | null): EmailDraft {
  if (settings === null) return EMPTY_DRAFT;
  return {
    host: settings.host,
    port: String(settings.port),
    security: settings.security,
    user: settings.user ?? '',
    password: '',
    passwordSet: settings.password_set,
    clearPassword: false,
    fromName: settings.from_name ?? '',
    fromAddress: settings.from_address,
  };
}

export function securityEdit(draft: EmailDraft, security: MailSecurity): Partial<EmailDraft> {
  const defaultPort = String(SECURITY_PORT[draft.security]);
  return draft.port === defaultPort || draft.port.trim() === ''
    ? { security, port: String(SECURITY_PORT[security]) }
    : { security };
}

function passwordOf(draft: EmailDraft): MailSettingsWrite['password'] {
  if (draft.user.trim() === '') return draft.passwordSet ? { action: 'clear' } : { action: 'keep' };
  if (draft.password !== '') return { action: 'set', value: draft.password };
  return draft.clearPassword ? { action: 'clear' } : { action: 'keep' };
}

function optional(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

export function writeOf(draft: EmailDraft): MailSettingsWrite | null {
  const parsed = MAIL_SETTINGS_WRITE.safeParse({
    host: draft.host.trim(),
    port: Number(draft.port.trim()),
    security: draft.security,
    user: optional(draft.user),
    from_name: optional(draft.fromName),
    from_address: draft.fromAddress.trim(),
    password: passwordOf(draft),
  });
  return parsed.success ? parsed.data : null;
}

export interface EmailProblems {
  readonly host: string | null;
  readonly port: string | null;
  readonly fromAddress: string | null;
}

export function isAddress(text: string): boolean {
  return MAIL_TEST_BODY.safeParse({ to: text.trim() }).success;
}

export function problemsOf(draft: EmailDraft): EmailProblems {
  const port = Number(draft.port.trim());
  return {
    host: draft.host.trim() === '' ? 'Enter the server name' : null,
    port:
      Number.isInteger(port) && port >= 1 && port <= 65535 ? null : 'Enter a port from 1 to 65535',
    fromAddress: isAddress(draft.fromAddress) ? null : 'Enter the address mail comes from',
  };
}

export function sameAsSaved(draft: EmailDraft, settings: MailSettings | null): boolean {
  const saved = draftOfSettings(settings);
  return (
    draft.host.trim() === saved.host &&
    draft.port.trim() === saved.port &&
    draft.security === saved.security &&
    draft.user.trim() === saved.user &&
    draft.fromName.trim() === saved.fromName &&
    draft.fromAddress.trim() === saved.fromAddress &&
    draft.password === '' &&
    !draft.clearPassword
  );
}

export function senderOf(settings: MailSettings): string {
  return settings.from_name === null
    ? settings.from_address
    : `${settings.from_name} <${settings.from_address}>`;
}

export function emailStatusOf(settings: MailSettings | null): string {
  if (settings === null) return 'Not set up. Email guests get a link to copy instead.';
  return `Sends as ${senderOf(settings)} through ${settings.host}`;
}
