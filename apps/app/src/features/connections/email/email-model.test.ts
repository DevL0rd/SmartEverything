import type { MailSettings } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  draftOfSettings,
  emailStatusOf,
  problemsOf,
  sameAsSaved,
  securityEdit,
  writeOf,
} from './email-model';

const SAVED: MailSettings = {
  host: 'smtp.example.com',
  port: 587,
  security: 'starttls',
  user: 'alex@example.com',
  from_name: 'Alex at home',
  from_address: 'alex@example.com',
  password_set: true,
};

describe('the email settings form', () => {
  it('starts empty on port 587 with STARTTLS when nothing is set up', () => {
    const draft = draftOfSettings(null);
    expect(draft).toMatchObject({
      host: '',
      port: '587',
      security: 'starttls',
      passwordSet: false,
    });
    expect(writeOf(draft)).toBeNull();
    expect(problemsOf(draft)).toEqual({
      host: 'Enter the server name',
      port: null,
      fromAddress: 'Enter the address mail comes from',
    });
  });

  it('keeps the saved password unless a new one is typed or it is removed', () => {
    const draft = draftOfSettings(SAVED);
    expect(sameAsSaved(draft, SAVED)).toBe(true);
    expect(writeOf(draft)?.password).toEqual({ action: 'keep' });
    expect(writeOf({ ...draft, password: 'secret' })?.password).toEqual({
      action: 'set',
      value: 'secret',
    });
    expect(writeOf({ ...draft, clearPassword: true })?.password).toEqual({ action: 'clear' });
    expect(sameAsSaved({ ...draft, clearPassword: true }, SAVED)).toBe(false);
  });

  it('drops the password with the user name and sends blank fields as nothing', () => {
    const draft = { ...draftOfSettings(SAVED), user: ' ', fromName: '  ' };
    expect(writeOf(draft)).toMatchObject({
      user: null,
      from_name: null,
      password: { action: 'clear' },
    });
  });

  it('moves the port with the security choice only while it is the usual one', () => {
    const draft = draftOfSettings(null);
    expect(securityEdit(draft, 'tls')).toEqual({ security: 'tls', port: '465' });
    expect(securityEdit({ ...draft, port: '2525' }, 'tls')).toEqual({ security: 'tls' });
  });

  it('refuses a port outside 1 to 65535', () => {
    const draft = { ...draftOfSettings(SAVED), port: '70000' };
    expect(problemsOf(draft).port).toBe('Enter a port from 1 to 65535');
    expect(writeOf(draft)).toBeNull();
  });

  it('says who mail comes from and through which server', () => {
    expect(emailStatusOf(SAVED)).toBe(
      'Sends as Alex at home <alex@example.com> through smtp.example.com',
    );
    expect(emailStatusOf(null)).toBe('Not set up. Email guests get a link to copy instead.');
  });
});
