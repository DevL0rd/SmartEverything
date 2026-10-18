import { generateKeyPairSync } from 'node:crypto';
import { JWT } from 'google-auth-library';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const FORM = z.object({ assertion: z.string(), grant_type: z.string() });

describe('google-auth-library contract', () => {
  it('exchanges a signed assertion through the fetch it is given and returns the access token', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const requests: { url: string; form: string }[] = [];
    const jwt = new JWT({
      email: 'push@home-push.iam.gserviceaccount.com',
      key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      scopes: 'https://www.googleapis.com/auth/firebase.messaging',
      transporterOptions: {
        fetchImplementation: (
          input: string | URL | Request,
          init?: RequestInit,
        ): Promise<Response> => {
          const url =
            input instanceof URL ? input.href : typeof input === 'string' ? input : input.url;
          requests.push({
            url,
            form: init?.body instanceof URLSearchParams ? init.body.toString() : '',
          });
          return Promise.resolve(Response.json({ access_token: 'ya29.token', expires_in: 3599 }));
        },
      },
    });
    const { token } = await jwt.getAccessToken();
    expect(token).toBe('ya29.token');
    const [request] = requests;
    expect(request?.url).toBe('https://oauth2.googleapis.com/token');
    const form = FORM.parse(Object.fromEntries(new URLSearchParams(request?.form)));
    expect(form.grant_type).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(form.assertion.split('.')).toHaveLength(3);
  });

  it('reports a refused token exchange as a rejection carrying Google’s message', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwt = new JWT({
      email: 'push@home-push.iam.gserviceaccount.com',
      key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      scopes: 'https://www.googleapis.com/auth/firebase.messaging',
      transporterOptions: {
        retry: false,
        fetchImplementation: (): Promise<Response> =>
          Promise.resolve(
            Response.json(
              { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' },
              { status: 400 },
            ),
          ),
      },
    });
    await expect(jwt.getAccessToken()).rejects.toThrow(/invalid_grant|Invalid JWT Signature/);
  });
});
