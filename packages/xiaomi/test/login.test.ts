import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_BASE,
  XIAOMI_SID,
  XiaomiLoginError,
  absoluteAccountUrl,
  cookieHeader,
  identityListUrl,
  mergeSetCookies,
  parseIdentityList,
  parseLoginAuth,
  parseLoginJson,
  parseSendTicket,
  parseServiceLogin,
  parseVerifyTicket,
  passwordHash,
  verificationDestination,
  verificationFlag,
} from '../src';

const session = {
  code: 0,
  location: 'https://sts.api.io.mi.com/sts?d=1',
  ssecurity: 'c2Vj',
  passToken: 'V1:pass',
  userId: 12345,
  cUserId: 'c',
};

describe('account replies', () => {
  it('start with &&&START&&& followed by JSON', () => {
    expect(parseLoginJson('step', '&&&START&&&{"code":0}')).toStrictEqual({ code: 0 });
  });

  it('are refused without the prefix or with broken JSON', () => {
    expect(() => parseLoginJson('serviceLogin', '<html>')).toThrow(
      new XiaomiLoginError('serviceLogin', 'a reply starting with &&&START&&&', '<html>'),
    );
    const page = `<html>${'x'.repeat(100)}`;
    expect(() => parseLoginJson('serviceLogin', page)).toThrow(
      new XiaomiLoginError('serviceLogin', 'a reply starting with &&&START&&&', page.slice(0, 80)),
    );
    expect(() => parseLoginJson('serviceLogin', '&&&START&&&{')).toThrow(
      /Xiaomi sign-in failed at serviceLogin: expected JSON after the prefix, received SyntaxError/,
    );
  });
});

describe('the password hash', () => {
  it('is the upper-case MD5 of the password', () => {
    expect(passwordHash('secret')).toBe('5EBE2294ECD0E0F08EAB7690D2A6EE69');
  });
});

describe('account URLs', () => {
  it('are made absolute against the account host', () => {
    expect(ACCOUNT_BASE).toBe('https://account.xiaomi.com');
    expect(XIAOMI_SID).toBe('xiaomiio');
    expect(absoluteAccountUrl('/pass/x')).toBe('https://account.xiaomi.com/pass/x');
    expect(absoluteAccountUrl('https://other/x')).toBe('https://other/x');
  });
});

describe('serviceLogin', () => {
  it('returns a session when the passToken is still valid', () => {
    expect(parseServiceLogin(session)).toStrictEqual({
      kind: 'session',
      session: {
        code: 0,
        location: session.location,
        ssecurity: 'c2Vj',
        passToken: 'V1:pass',
        userId: '12345',
      },
    });
  });

  it('returns the signature needed for a password sign-in', () => {
    expect(
      parseServiceLogin({
        code: 70016,
        _sign: 'abc',
        qs: '?sid',
        callback: 'cb',
        sid: 'xiaomiio',
      }),
    ).toStrictEqual({
      kind: 'sign',
      sign: { _sign: 'abc', qs: '?sid', callback: 'cb', sid: 'xiaomiio' },
    });
  });

  it('refuses a session with an empty user id', () => {
    expect(() => parseServiceLogin({ ...session, userId: '' })).toThrow(XiaomiLoginError);
  });

  it('refuses anything else', () => {
    expect(() => parseServiceLogin({ passToken: 'secret', code: 1 })).toThrow(
      new XiaomiLoginError('serviceLogin', 'a session or a _sign', 'fields [code, passToken]'),
    );
  });
});

describe('serviceLoginAuth2', () => {
  it('returns the session of a successful sign-in', () => {
    expect(parseLoginAuth({ ...session, userId: '9' })).toStrictEqual({
      kind: 'session',
      session: { ...parseSessionOnly(), userId: '9' },
    });
  });

  it('asks for a captcha, noting when the previous answer was wrong', () => {
    expect(
      parseLoginAuth({ code: 87001, captchaUrl: '/pass/getCode?icodeType=login' }),
    ).toStrictEqual({
      kind: 'captcha',
      url: 'https://account.xiaomi.com/pass/getCode?icodeType=login',
      wrongAnswer: true,
    });
    expect(parseLoginAuth({ code: 0, captchaURL: '/pass/getCode' })).toStrictEqual({
      kind: 'captcha',
      url: 'https://account.xiaomi.com/pass/getCode',
      wrongAnswer: false,
    });
  });

  it('asks for identity verification', () => {
    expect(
      parseLoginAuth({ code: 0, notificationUrl: '/fe/service/identity/authStart?context=x' }),
    ).toStrictEqual({
      kind: 'verify',
      notificationUrl: 'https://account.xiaomi.com/fe/service/identity/authStart?context=x',
    });
  });

  it('asks for identity verification when the reply carries null and empty fields', () => {
    expect(
      parseLoginAuth({
        code: 0,
        captchaUrl: null,
        captchaURL: '',
        child: 0,
        desc: '成功',
        description: '成功',
        location: '',
        miDemo: 0,
        notificationUrl: '/fe/service/identity/authStart?context=y',
        pwd: 1,
        result: 'ok',
        securityStatus: 16,
      }),
    ).toStrictEqual({
      kind: 'verify',
      notificationUrl: 'https://account.xiaomi.com/fe/service/identity/authStart?context=y',
    });
  });

  it('reads a captcha from either spelling when the other is null', () => {
    expect(
      parseLoginAuth({ code: 87001, captchaUrl: null, captchaURL: '/pass/getCode' }),
    ).toStrictEqual({
      kind: 'captcha',
      url: 'https://account.xiaomi.com/pass/getCode',
      wrongAnswer: true,
    });
  });

  it('names the code and description of a refused sign-in', () => {
    expect(() => parseLoginAuth({ code: 70016, desc: 'wrong password' })).toThrow(
      new XiaomiLoginError(
        'serviceLoginAuth2',
        'a session, a captcha or a verification',
        'code 70016 wrong password',
      ),
    );
    expect(() => parseLoginAuth({ code: 20003, description: 'no user' })).toThrow(
      /received code 20003 no user\./,
    );
    expect(() => parseLoginAuth({ code: 1 })).toThrow(/received code 1\.$/);
    expect(() => parseLoginAuth('x')).toThrow(
      new XiaomiLoginError(
        'serviceLoginAuth2',
        'a reply with a numeric code',
        'a value of type string, invalid []',
      ),
    );
    expect(() => parseLoginAuth({ code: 'x', notificationUrl: 3 })).toThrow(
      new XiaomiLoginError(
        'serviceLoginAuth2',
        'a reply with a numeric code',
        'fields [code, notificationUrl], invalid [code, notificationUrl]',
      ),
    );
  });
});

function parseSessionOnly(): Record<string, unknown> {
  return {
    code: 0,
    location: session.location,
    ssecurity: session.ssecurity,
    passToken: session.passToken,
  };
}

describe('identity verification', () => {
  it('lists methods at the identity/list URL', () => {
    expect(
      identityListUrl('https://account.xiaomi.com/fe/service/identity/authStart?sid=xiaomiio'),
    ).toBe('https://account.xiaomi.com/identity/list?sid=xiaomiio');
    expect(() => identityListUrl('https://x/other')).toThrow(
      new XiaomiLoginError(
        'identity',
        'a notification URL containing /fe/service/identity/authStart',
        'https://x/other',
      ),
    );
  });

  it('chooses the first supported method from the options', () => {
    expect(parseIdentityList({ flag: 4, options: [8, 4] })).toBe('Email');
    expect(parseIdentityList({ flag: 4 })).toBe('Phone');
    expect(parseIdentityList({ flag: 4, options: [16, 4] })).toBe('Phone');
    expect(() => parseIdentityList({ flag: 16, options: [16, 32] })).toThrow(
      new XiaomiLoginError('identity/list', 'phone (4) or email (8) verification', '16, 32'),
    );
    expect(() => parseIdentityList({})).toThrow(
      new XiaomiLoginError('identity/list', 'a flag', 'fields []'),
    );
  });

  it('uses flag 4 for phone and 8 for email', () => {
    expect(verificationFlag('Phone')).toBe('4');
    expect(verificationFlag('Email')).toBe('8');
  });

  it('names the masked destination of the code', () => {
    expect(verificationDestination({ maskedEmail: 'a***@b.com' }, 'Email')).toBe('a***@b.com');
    expect(verificationDestination({ maskedPhone: '+44***1' }, 'Phone')).toBe('+44***1');
    expect(verificationDestination({ maskedPhone: '+44***1' }, 'Email')).toBe(
      'the email address on the Xiaomi account',
    );
    expect(verificationDestination(null, 'Phone')).toBe('the phone number on the Xiaomi account');
  });

  it('knows whether a ticket was sent or a captcha must be solved first', () => {
    expect(parseSendTicket({ code: 0 })).toStrictEqual({ kind: 'sent' });
    expect(parseSendTicket({ code: 87001, captchaUrl: '/pass/getCode' })).toStrictEqual({
      kind: 'captcha',
      url: 'https://account.xiaomi.com/pass/getCode',
    });
    expect(() => parseSendTicket([1])).toThrow(
      new XiaomiLoginError(
        'sendTicket',
        'a reply with a numeric code',
        'a value of type object, invalid []',
      ),
    );
    expect(() => parseSendTicket({ code: 70022 })).toThrow(
      new XiaomiLoginError('sendTicket', 'code 0', 'code 70022'),
    );
  });

  it('returns the location after a verified ticket', () => {
    expect(parseVerifyTicket({ code: 0, location: 'https://x/check' })).toBe('https://x/check');
    const refused = [
      [{ location: 'https://x', code: 1 }, 'fields [code, location]'],
      [{ code: 0 }, 'fields [code]'],
      [{ code: 0, location: null }, 'fields [code, location]'],
      [{ code: 0, location: '' }, 'fields [code, location]'],
      ['x', 'a value of type string'],
    ] as const;
    for (const [reply, shape] of refused) {
      expect(() => parseVerifyTicket(reply)).toThrow(
        new XiaomiLoginError('verifyTicket', 'code 0 and a location', shape),
      );
    }
  });
});

describe('cookies', () => {
  it('collect name and value from Set-Cookie headers and drop deleted ones', () => {
    const jar = mergeSetCookies(
      new Map([
        ['old', '1'],
        ['gone', '2'],
        ['zero', '3'],
      ]),
      [
        'serviceToken=abc=; Path=/; Domain=.mi.com',
        'userId=42',
        'gone=EXPIRED; Path=/',
        'zero=still; Max-Age=0',
        'no-equals',
        '=no-value',
        'blank=',
      ],
    );
    expect([...jar.entries()]).toStrictEqual([
      ['old', '1'],
      ['serviceToken', 'abc='],
      ['userId', '42'],
    ]);
    expect(mergeSetCookies(new Map(), ['a=deleted']).size).toBe(0);
    expect(mergeSetCookies(new Map(), ['a=1; max-age=0']).size).toBe(0);
    expect(mergeSetCookies(new Map(), ['a=1; max-age=10']).get('a')).toBe('1');
    expect(mergeSetCookies(new Map(), ['a=1;Max-Age=0']).size).toBe(0);
    expect(mergeSetCookies(new Map(), ['a=1']).get('a')).toBe('1');
    expect(mergeSetCookies(new Map(), [' a = 1 ']).get('a')).toBe('1');
  });

  it('write the named cookies that exist into one header', () => {
    expect(
      cookieHeader(
        new Map([
          ['a', '1'],
          ['b', '2'],
        ]),
        ['b', 'missing', 'a'],
      ),
    ).toBe('b=2; a=1');
  });
});
