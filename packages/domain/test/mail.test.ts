import { describe, expect, it } from 'vitest';
import {
  MAIL_LOG_ROW,
  MAIL_SETTINGS,
  MAIL_SETTINGS_WRITE,
  MAIL_TEST_BODY,
  MAIL_TEST_RESULT,
} from '../src/mail';

const settings = {
  host: 'smtp.example.com',
  port: 587,
  security: 'starttls',
  user: 'home@example.com',
  from_name: 'Home',
  from_address: 'home@example.com',
};

describe('outgoing email settings', () => {
  it('reads settings with whether a password is stored and never the password', () => {
    expect(MAIL_SETTINGS.safeParse({ ...settings, password_set: true }).success).toBe(true);
    expect(
      MAIL_SETTINGS.safeParse({ ...settings, password_set: true, password: 'secret' }).success,
    ).toBe(false);
  });

  it('keeps a password to a user name', () => {
    expect(MAIL_SETTINGS.safeParse({ ...settings, user: null, password_set: true }).success).toBe(
      false,
    );
    expect(MAIL_SETTINGS.safeParse({ ...settings, user: null, password_set: false }).success).toBe(
      true,
    );
  });

  it('checks the port, the security and the sender address', () => {
    const read = { ...settings, password_set: false };
    for (const port of [0, 65536, 25.5]) {
      expect(MAIL_SETTINGS.safeParse({ ...read, port }).success, String(port)).toBe(false);
    }
    expect(MAIL_SETTINGS.safeParse({ ...read, port: 25, security: 'none' }).success).toBe(true);
    expect(MAIL_SETTINGS.safeParse({ ...read, security: 'ssl' }).success).toBe(false);
    expect(MAIL_SETTINGS.safeParse({ ...read, from_address: 'home' }).success).toBe(false);
    expect(MAIL_SETTINGS.safeParse({ ...read, host: ' ' }).success).toBe(false);
  });

  it('writes the password as an explicit keep, set or clear', () => {
    for (const password of [
      { action: 'keep' },
      { action: 'clear' },
      { action: 'set', value: 'pw' },
    ]) {
      expect(MAIL_SETTINGS_WRITE.safeParse({ ...settings, password }).success).toBe(true);
    }
    expect(MAIL_SETTINGS_WRITE.safeParse(settings).success).toBe(false);
    expect(
      MAIL_SETTINGS_WRITE.safeParse({ ...settings, password: { action: 'set', value: '' } })
        .success,
    ).toBe(false);
    expect(
      MAIL_SETTINGS_WRITE.safeParse({
        ...settings,
        user: null,
        password: { action: 'set', value: 'pw' },
      }).success,
    ).toBe(false);
  });
});

describe('mail test and log', () => {
  it('sends a test to one address and answers sent or failed with the reason', () => {
    expect(MAIL_TEST_BODY.safeParse({ to: 'me@example.com' }).success).toBe(true);
    expect(MAIL_TEST_BODY.safeParse({ to: 'me' }).success).toBe(false);
    expect(MAIL_TEST_RESULT.safeParse({ outcome: 'sent' }).success).toBe(true);
    expect(MAIL_TEST_RESULT.safeParse({ outcome: 'failed' }).success).toBe(false);
    expect(MAIL_TEST_RESULT.safeParse({ outcome: 'failed', detail: 'refused' }).success).toBe(true);
  });

  const row = {
    id: '3f2b8c1e-5a4d-4b7e-9c6f-1a2b3c4d5e6f',
    kind: 'invite',
    to_hash: 'a'.repeat(64),
    subject: 'Invitation: Dinner',
    outcome: 'sent',
    detail: null,
    at: '2026-11-07T08:00:00Z',
  };

  it('logs a hashed recipient, never an address, and a reason only for a failure', () => {
    expect(MAIL_LOG_ROW.safeParse(row).success).toBe(true);
    expect(MAIL_LOG_ROW.safeParse({ ...row, to_hash: 'sam@example.com' }).success).toBe(false);
    expect(MAIL_LOG_ROW.safeParse({ ...row, outcome: 'failed' }).success).toBe(false);
    expect(MAIL_LOG_ROW.safeParse({ ...row, outcome: 'failed', detail: 'refused' }).success).toBe(
      true,
    );
    expect(MAIL_LOG_ROW.safeParse({ ...row, detail: 'x' }).success).toBe(false);
    expect(MAIL_LOG_ROW.safeParse({ ...row, kind: 'spam' }).success).toBe(false);
  });
});
