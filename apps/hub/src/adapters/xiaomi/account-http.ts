import {
  ACCOUNT_BASE,
  XiaomiLoginError,
  mergeSetCookies,
  type CookieJar,
} from '@smarteverything/xiaomi';
import type { FetchLike } from '../../plugins/builtin/fetch-like';

const MAX_REDIRECTS = 10;
const ACCOUNT_HOST = new URL(ACCOUNT_BASE).host;
const USER_AGENT =
  'Android-7.1.1-1.0.0-ONEPLUS A3010-136-SMARTEVERYTHING APP/xiaomi.smarthome APPV/62830';

export interface AccountReply {
  readonly status: number;
  readonly text: string;
  readonly location: string | null;
}

export interface AccountImage {
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

export class AccountHttp {
  private jar: CookieJar;

  constructor(
    private readonly fetch: FetchLike,
    cookies: Readonly<Record<string, string>>,
  ) {
    this.jar = new Map(Object.entries(cookies));
  }

  cookie(name: string): string | null {
    return this.jar.get(name) ?? null;
  }

  setCookie(name: string, value: string): void {
    this.jar = new Map([...this.jar, [name, value]]);
  }

  async get(url: string): Promise<AccountReply> {
    return this.reply(await this.send(url, { method: 'GET' }));
  }

  async post(url: string, form: Readonly<Record<string, string>>): Promise<AccountReply> {
    return this.reply(
      await this.send(url, {
        method: 'POST',
        body: new URLSearchParams(form).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );
  }

  async image(url: string): Promise<AccountImage> {
    const response = await this.send(url, { method: 'GET' });
    const contentType = response.headers.get('content-type') ?? 'none';
    if (response.status !== 200 || !contentType.startsWith('image/')) {
      throw new XiaomiLoginError(
        'captcha',
        'an image',
        `HTTP ${String(response.status)} ${contentType}`,
      );
    }
    return {
      contentType: contentType.split(';')[0] ?? contentType,
      bytes: new Uint8Array(await response.arrayBuffer()),
    };
  }

  async follow(start: string): Promise<AccountReply> {
    let url = start;
    for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
      const reply = await this.get(url);
      if (reply.location === null) {
        return reply;
      }
      url = new URL(reply.location, url).toString();
    }
    throw new XiaomiLoginError('redirects', `at most ${String(MAX_REDIRECTS)} redirects`, start);
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('User-Agent', USER_AGENT);
    if (new URL(url).host === ACCOUNT_HOST && this.jar.size > 0) {
      headers.set('Cookie', [...this.jar].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    const response = await this.fetch(url, { ...init, headers, redirect: 'manual' });
    this.jar = mergeSetCookies(this.jar, response.headers.getSetCookie());
    return response;
  }

  private async reply(response: Response): Promise<AccountReply> {
    const redirected = response.status >= 300 && response.status < 400;
    return {
      status: response.status,
      text: await response.text(),
      location: redirected ? response.headers.get('location') : null,
    };
  }
}
