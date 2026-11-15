import { MAIL_SETTINGS, MAIL_SETTINGS_WRITE, MAIL_TEST_BODY, MAIL_TEST_RESULT } from '../mail';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING } from './primitives';

export const MAIL_ENDPOINTS = {
  readMailSettings: endpoint({
    method: 'GET',
    path: '/api/mail/settings',
    access: 'owner',
    summary:
      'The outgoing email server the hub sends invitations through, or nothing when none is set up',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: MAIL_SETTINGS.nullable(),
  }),
  writeMailSettings: endpoint({
    method: 'PUT',
    path: '/api/mail/settings',
    access: 'owner',
    summary:
      'Set up the outgoing email server: host, port, security, user, password and the sender',
    params: NOTHING,
    query: NOTHING,
    body: MAIL_SETTINGS_WRITE,
    response: MAIL_SETTINGS,
  }),
  sendMailTest: endpoint({
    method: 'POST',
    path: '/api/mail/test',
    access: 'owner',
    summary: 'Send a test email through the outgoing email server to an address',
    params: NOTHING,
    query: NOTHING,
    body: MAIL_TEST_BODY,
    response: MAIL_TEST_RESULT,
  }),
} as const;
