import { passwordHash } from '@smarteverything/xiaomi';
import { accountJson, plain, redirect, type FakeRequest, type Route } from './fake-http';

export const USER_ID = '1234567890';
export const SSECURITY = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex').toString('base64');
export const PASSWORD = 'correct horse';
export const CAPTCHA = 'x7k2';
export const EMAIL_CODE = '123456';

const SIGN = {
  code: 70016,
  _sign: 'sign1',
  qs: '?sid=xiaomiio&_json=true',
  callback: 'https://sts.api.io.mi.com/sts',
  sid: 'xiaomiio',
};

const NOTIFICATION =
  'https://account.xiaomi.com/fe/service/identity/authStart?sid=xiaomiio&context=ctx1';

export interface AccountScript {
  captcha: boolean;
  verification: boolean;
  wrongCaptchas: number;
}

export class FakeAccount {
  readonly passTokens = new Set<string>();
  readonly asked: string[] = [];
  serviceToken = 'service-1';
  issued = 0;

  constructor(readonly script: AccountScript) {}

  readonly route: Route = (request) => {
    const path = `${request.url.host}${request.url.pathname}`;
    switch (path) {
      case 'account.xiaomi.com/pass/serviceLogin':
        return this.serviceLogin(request);
      case 'account.xiaomi.com/pass/serviceLoginAuth2':
        return this.loginAuth(request);
      case 'account.xiaomi.com/pass/getCode':
        return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          status: 200,
          headers: {
            'content-type': 'image/jpeg; charset=binary',
            'set-cookie': 'ick=ick1; Path=/',
          },
        });
      case 'account.xiaomi.com/identity/list':
      case 'account.xiaomi.com/identity/auth/verifyEmail':
      case 'account.xiaomi.com/identity/auth/sendEmailTicket':
      case 'account.xiaomi.com/identity/result/check':
        return this.identity(path, request);
      case 'account.xiaomi.com/pass/serviceLoginAuth2/end':
        return redirect('https://sts.api.io.mi.com/sts?d=end');
      case 'sts.api.io.mi.com/sts':
        return this.sts(request);
      default:
        return null;
    }
  };

  private session(passToken: string): Record<string, unknown> {
    return {
      code: 0,
      location: 'https://sts.api.io.mi.com/sts?d=session',
      ssecurity: SSECURITY,
      passToken,
      userId: Number(USER_ID),
      cUserId: 'c-user',
    };
  }

  private serviceLogin(request: FakeRequest): Response {
    const passToken = request.cookies.get('passToken');
    const known = passToken !== undefined && this.passTokens.has(passToken);
    return accountJson(
      known && request.cookies.get('userId') === USER_ID ? this.session(passToken) : SIGN,
    );
  }

  private loginAuth(request: FakeRequest): Response {
    const form = request.form;
    if (form.get('_sign') !== SIGN._sign || form.get('hash') !== passwordHash(PASSWORD)) {
      return accountJson({ code: 70016, desc: 'wrong password' });
    }
    if (this.script.captcha) {
      const answered = form.get('captCode');
      if (answered === null || request.cookies.get('ick') !== 'ick1') {
        return accountJson({ code: 0, captchaUrl: '/pass/getCode?icodeType=login' });
      }
      if (answered !== CAPTCHA || this.script.wrongCaptchas > 0) {
        this.script.wrongCaptchas -= 1;
        return accountJson({ code: 87001, captchaUrl: '/pass/getCode?icodeType=login' });
      }
    }
    if (this.script.verification) {
      return accountJson({ code: 0, notificationUrl: NOTIFICATION });
    }
    return accountJson(this.session(this.newPassToken()));
  }

  private identity(path: string, request: FakeRequest): Response {
    switch (path) {
      case 'account.xiaomi.com/identity/list':
        return accountJson({ code: 0, flag: 8, options: [8] }, ['identity_session=ids1; Path=/']);
      case 'account.xiaomi.com/identity/auth/verifyEmail':
        return this.verifyEmail(request);
      case 'account.xiaomi.com/identity/auth/sendEmailTicket':
        return accountJson(
          request.cookies.get('identity_session') === 'ids1' ? { code: 0 } : { code: 1 },
        );
      default:
        return this.issuePassToken();
    }
  }

  private verifyEmail(request: FakeRequest): Response {
    if (request.cookies.get('identity_session') !== 'ids1') {
      return accountJson({ code: 1 });
    }
    if (request.method === 'GET') {
      return accountJson({ code: 0, maskedEmail: 'd***@example.com' });
    }
    return request.form.get('ticket') === EMAIL_CODE
      ? accountJson({ code: 0, location: 'https://account.xiaomi.com/identity/result/check?ctx=1' })
      : accountJson({ code: 70014 });
  }

  private issuePassToken(): Response {
    return redirect('https://account.xiaomi.com/pass/serviceLoginAuth2/end?x=1', [
      `passToken=${this.newPassToken()}; Path=/; Domain=.xiaomi.com`,
      `userId=${USER_ID}; Path=/`,
    ]);
  }

  private sts(request: FakeRequest): Response {
    this.asked.push(request.url.search);
    this.serviceToken = `service-${String(this.issued + 1)}`;
    return plain(200, 'ok', [
      `serviceToken=${this.serviceToken}; Path=/; Domain=sts.api.io.mi.com`,
    ]);
  }

  private newPassToken(): string {
    this.issued += 1;
    const token = `V1:pass-${String(this.issued)}`;
    this.passTokens.add(token);
    return token;
  }
}
