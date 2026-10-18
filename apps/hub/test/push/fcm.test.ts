import { describe, expect, it } from 'vitest';
import { FcmClient, FCM_SCOPE } from '../../src/extensions/push/fcm';
import { claimsOf, FakeGoogle, headerOf, SERVICE_ACCOUNT, TOKEN_URI } from './fake-google';

const NOTIFICATION = { title: 'Doorbell', body: 'Someone is at the door', data: {} } as const;

function clientFor(google: FakeGoogle): FcmClient {
  return new FcmClient((input, init) => {
    const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url;
    return Promise.resolve(google.respond(url, init));
  });
}

describe('FcmClient', () => {
  it('signs an RS256 assertion for the FCM scope at Google’s token endpoint and reuses the token', async () => {
    const google = new FakeGoogle();
    const client = clientFor(google);
    expect(await client.send(SERVICE_ACCOUNT, 'phone-a', NOTIFICATION)).toStrictEqual({
      outcome: 'sent',
    });
    await client.send(SERVICE_ACCOUNT, 'phone-b', NOTIFICATION);
    expect(google.assertions).toHaveLength(1);
    const assertion = google.assertions[0] ?? '';
    expect(headerOf(assertion)).toStrictEqual({ alg: 'RS256' });
    expect(claimsOf(assertion)).toMatchObject({
      iss: SERVICE_ACCOUNT.client_email,
      scope: FCM_SCOPE,
      aud: TOKEN_URI,
    });
    expect(google.sent.map((sent) => sent.authorization)).toStrictEqual([
      'Bearer ya29.1',
      'Bearer ya29.1',
    ]);
  });

  it('asks for a new token once when FCM answers 401 and sends again with it', async () => {
    const google = new FakeGoogle();
    let refused = false;
    google.answer = (): { status: number; body: unknown } => {
      if (refused) {
        return { status: 200, body: {} };
      }
      refused = true;
      return {
        status: 401,
        body: { error: { code: 401, message: 'expired', status: 'UNAUTHENTICATED' } },
      };
    };
    const client = clientFor(google);
    expect(await client.send(SERVICE_ACCOUNT, 'phone-a', NOTIFICATION)).toStrictEqual({
      outcome: 'sent',
    });
    expect(google.sent.map((sent) => sent.authorization)).toStrictEqual([
      'Bearer ya29.1',
      'Bearer ya29.2',
    ]);
  });

  it('says Google refused the service account when the token endpoint refuses it', async () => {
    const google = new FakeGoogle();
    google.tokenStatus = 401;
    await expect(clientFor(google).send(SERVICE_ACCOUNT, 'phone-a', NOTIFICATION)).rejects.toThrow(
      'Google refused the Firebase service account: invalid_grant: Invalid JWT Signature.',
    );
    expect(google.sent).toStrictEqual([]);
  });

  it('takes a new token when the service account changes', async () => {
    const google = new FakeGoogle();
    const client = clientFor(google);
    await client.send(SERVICE_ACCOUNT, 'phone-a', NOTIFICATION);
    await client.send(
      { ...SERVICE_ACCOUNT, client_email: 'other@home-push.iam.gserviceaccount.com' },
      'phone-a',
      NOTIFICATION,
    );
    expect(google.assertions).toHaveLength(2);
  });
});
