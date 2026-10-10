import { XiaomiLoginError } from '@smarteverything/xiaomi';
import { afterEach, describe, expect, it } from 'vitest';
import { createXiaomiModule } from '../../src/adapters/xiaomi/module';
import { CAPTCHA, EMAIL_CODE, FakeAccount, PASSWORD, SSECURITY, USER_ID } from './fake-account';
import { dependencies, harness, routedFetch, type Harness } from './harness';

const credentials = {
  provider: 'xiaomi',
  username: 'person@example.com',
  password: PASSWORD,
  region: 'de',
} as const;

let current: Harness | null = null;

afterEach(async () => {
  await current?.cleanup();
  current = null;
});

async function link(
  account: FakeAccount,
  seen: string[] = [],
): Promise<Awaited<ReturnType<ReturnType<typeof createXiaomiModule>['link']>>> {
  current = await harness((prompt) => (prompt.kind === 'captcha' ? CAPTCHA : EMAIL_CODE));
  const module = createXiaomiModule(dependencies(routedFetch([account.route], seen), 0), null);
  return module.link(credentials, current.context);
}

describe('linking a Xiaomi account', () => {
  it('signs in with the password and keeps only the session secrets', async () => {
    const account = new FakeAccount({ captcha: false, verification: false, wrongCaptchas: 0 });
    const stored = await link(account);
    expect(stored.label).toBe(`Xiaomi account ${USER_ID} (de)`);
    const { deviceId, ...secrets } = stored.secrets;
    expect(secrets).toStrictEqual({
      userId: USER_ID,
      passToken: 'V1:pass-1',
      ssecurity: SSECURITY,
      serviceToken: 'service-2',
      region: 'de',
    });
    expect(deviceId).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(JSON.stringify(stored)).not.toContain(PASSWORD);
    expect(current?.prompts).toStrictEqual([]);
  });

  it('asks the person to solve a captcha and sends the answer with the captcha cookie', async () => {
    const account = new FakeAccount({ captcha: true, verification: false, wrongCaptchas: 0 });
    const stored = await link(account);
    expect(current?.prompts).toStrictEqual([
      { kind: 'captcha', image: 'data:image/jpeg;base64,/9j/' },
    ]);
    expect(stored.secrets['passToken']).toBe('V1:pass-1');
  });

  it('asks again when the captcha answer was wrong', async () => {
    const account = new FakeAccount({ captcha: true, verification: false, wrongCaptchas: 1 });
    await link(account);
    expect(current?.prompts.map((prompt) => prompt.kind)).toStrictEqual(['captcha', 'captcha']);
    expect(current?.logs.map((record) => record.event)).toContain('xiaomi_login.captcha_refused');
  });

  it('gives up with a named error after too many wrong captchas', async () => {
    const account = new FakeAccount({ captcha: true, verification: false, wrongCaptchas: 10 });
    await expect(link(account)).rejects.toThrow(
      new XiaomiLoginError(
        'serviceLoginAuth2',
        'a correct captcha within 3 attempts',
        'more captchas',
      ),
    );
  });

  it('completes email verification and signs in with the passToken it returns', async () => {
    const account = new FakeAccount({ captcha: true, verification: true, wrongCaptchas: 0 });
    const seen: string[] = [];
    const stored = await link(account, seen);
    expect(current?.prompts).toStrictEqual([
      { kind: 'captcha', image: 'data:image/jpeg;base64,/9j/' },
      { kind: 'verification_code', destination: 'd***@example.com' },
    ]);
    expect(stored.secrets).toMatchObject({
      userId: USER_ID,
      passToken: 'V1:pass-1',
      ssecurity: SSECURITY,
    });
    expect(seen).toContain('POST https://account.xiaomi.com/identity/auth/sendEmailTicket');
    expect(seen).toContain('GET https://account.xiaomi.com/identity/result/check?ctx=1');
  });

  it('refuses a wrong password with the code Xiaomi gave', async () => {
    const account = new FakeAccount({ captcha: false, verification: false, wrongCaptchas: 0 });
    current = await harness(() => '');
    const module = createXiaomiModule(dependencies(routedFetch([account.route]), 0), null);
    await expect(
      module.link({ ...credentials, password: 'nope' }, current.context),
    ).rejects.toThrow(
      new XiaomiLoginError(
        'serviceLoginAuth2',
        'a session, a captcha or a verification',
        'code 70016 wrong password',
      ),
    );
  });

  it('refuses a captcha that is not an image', async () => {
    const account = new FakeAccount({ captcha: true, verification: false, wrongCaptchas: 0 });
    current = await harness(() => CAPTCHA);
    const notImage = routedFetch([
      (request): Response | null =>
        request.url.pathname === '/pass/getCode'
          ? new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })
          : null,
      account.route,
    ]);
    const module = createXiaomiModule(dependencies(notImage, 0), null);
    await expect(module.link(credentials, current.context)).rejects.toThrow(
      new XiaomiLoginError('captcha', 'an image', 'HTTP 200 text/html'),
    );
  });
});
