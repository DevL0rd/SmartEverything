import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';

export const TOKEN_URI = 'https://oauth2.google.test/token';

export const SEND_URL = 'https://fcm.googleapis.com/v1/projects/home-push/messages:send';

export interface SentMessage {
  readonly authorization: string;
  readonly body: unknown;
}

type Answer = (token: string) => { readonly status: number; readonly body: unknown };

const KEYS = generateKeyPairSync('rsa', { modulusLength: 2048 });

export const SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: 'home-push',
  client_email: 'push@home-push.iam.gserviceaccount.com',
  private_key: KEYS.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  token_uri: TOKEN_URI,
} as const;

function textOf(body: RequestInit['body']): string {
  return typeof body === 'string' ? body : '';
}

export class FakeGoogle {
  readonly assertions: string[] = [];
  readonly sent: SentMessage[] = [];
  tokenStatus = 200;
  private issued = 0;
  answer: Answer = () => ({ status: 200, body: { name: 'projects/home-push/messages/1' } });

  handles(url: string): boolean {
    return url === TOKEN_URI || url === SEND_URL;
  }

  respond(url: string, init: RequestInit | undefined): Response {
    if (url === TOKEN_URI) {
      return this.token(textOf(init?.body));
    }
    const body: unknown = JSON.parse(textOf(init?.body));
    const authorization = new Headers(init?.headers).get('authorization') ?? '';
    this.sent.push({ authorization, body });
    const token = /"token":"([^"]+)"/.exec(JSON.stringify(body))?.[1] ?? '';
    const answer = this.answer(token);
    return Response.json(answer.body, { status: answer.status });
  }

  private token(form: string): Response {
    const assertion = new URLSearchParams(form).get('assertion') ?? '';
    this.assertions.push(assertion);
    const [header = '', claims = '', signature = ''] = assertion.split('.');
    const valid = verify(
      'RSA-SHA256',
      Buffer.from(`${header}.${claims}`),
      createPublicKey(SERVICE_ACCOUNT.private_key),
      Buffer.from(signature, 'base64url'),
    );
    if (!valid || this.tokenStatus !== 200) {
      return Response.json({ error: 'invalid_grant' }, { status: valid ? this.tokenStatus : 400 });
    }
    this.issued += 1;
    return Response.json({ access_token: `ya29.${String(this.issued)}`, expires_in: 3599 });
  }
}

export function claimsOf(assertion: string): unknown {
  return JSON.parse(Buffer.from(assertion.split('.')[1] ?? '', 'base64url').toString('utf8'));
}

export function headerOf(assertion: string): unknown {
  return JSON.parse(Buffer.from(assertion.split('.')[0] ?? '', 'base64url').toString('utf8'));
}
