import { PROVIDER_PROMPT, type ProviderPrompt } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { TuyaCloudError } from '@smarteverything/tuya';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ProviderProblemError,
  type LinkContext,
  type RunContext,
  type StoredAccount,
} from '../../src/adapters/contract';
import { smartLifeAccount } from '../../src/adapters/tuya/account';
import { createTuyaModule } from '../../src/adapters/tuya/module';
import { USER_CODE } from './fake-cloud';
import { harness, type Harness } from './harness';

const CLOCK = 1_000_000;
const WRONG_CODE_TEXT =
  'That User Code did not work. Copy it again from Smart Life: Me > Settings > Account and Security > User Code. Capital letters matter.';
const MISSING_CODE_TEXT =
  'Enter the User Code from the Smart Life app: Me > Settings > Account and Security > User Code.';
const DEVELOPER_ACCOUNT: StoredAccount = {
  label: 'Developer project · EU · 2 devices',
  secrets: {
    method: 'developer_project',
    accessId: 'access-id',
    accessSecret: 'access-secret',
    region: 'eu',
    appUserId: 'app-user',
  },
};

let current: Harness | null = null;

function setup(): Harness {
  current = harness(6668, { now: () => CLOCK });
  return current;
}

afterEach(() => {
  current = null;
});

interface Linking {
  readonly context: LinkContext;
  readonly shown: ProviderPrompt[];
}

function linking(stored?: StoredAccount): Linking {
  const shown: ProviderPrompt[] = [];
  const context: LinkContext = {
    log: new Logger('tool.tuya-test'),
    dataDirectory: '/nonexistent',
    ask: () => Promise.reject(new Error('the Tuya provider never asks')),
    show: (prompt) => {
      shown.push(PROVIDER_PROMPT.parse(prompt));
      return Promise.resolve({
        answer: new Promise<string>(() => undefined),
        dismiss: () => Promise.resolve(),
      });
    },
    ...(stored === undefined ? {} : { stored }),
  };
  return { context, shown };
}

function userCodesAsked(h: Harness): (string | null)[] {
  return h.cloud.logins.map((url) => url.searchParams.get('usercode'));
}

describe('first link with a User Code', () => {
  it('shows the QR code, waits for the scan and stores a Smart Life account', async () => {
    const h = setup();
    const { context, shown } = linking();
    const account = await createTuyaModule(h.dependencies).link(
      { provider: 'tuya', method: 'smart_life', userCode: USER_CODE },
      context,
    );
    expect(shown).toStrictEqual([
      {
        kind: 'scan_qr',
        app: 'Smart Life or Tuya Smart',
        content: 'tuyaSmart--qrLogin?token=qr-token-0001',
        expiresAt: new Date(CLOCK + 2000).toISOString(),
      },
    ]);
    expect(account).toMatchObject({
      label: 'Smart Life account',
      secrets: {
        method: 'smart_life',
        userCode: USER_CODE,
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresAt: CLOCK + 7_200_000,
      },
    });
    expect(h.cloud.calls('GET', '/v1.0/m/life/users/homes')).toHaveLength(1);
  });

  it('refuses a User Code the cloud does not know before showing any QR code', async () => {
    const h = setup();
    const { context, shown } = linking();
    const wrong = createTuyaModule(h.dependencies).link(
      { provider: 'tuya', method: 'smart_life', userCode: USER_CODE.toLowerCase() },
      context,
    );
    await expect(wrong).rejects.toMatchObject({
      name: 'ProviderProblemError',
      problem: 'bad_credentials',
      message: WRONG_CODE_TEXT,
      cause: { name: 'UserCodeRejectedError', cause: { kind: 'credentials' } },
    });
    expect(shown).toStrictEqual([]);
    expect(h.cloud.requests).toStrictEqual([]);
  });
});

describe('every later link', () => {
  it('reuses the stored User Code and goes straight to the QR code', async () => {
    const h = setup();
    const stored = smartLifeAccount(h.cloud.session());
    const { context, shown } = linking(stored);
    const account = await createTuyaModule(h.dependencies).link(
      { provider: 'tuya', method: 'smart_life' },
      context,
    );
    expect(userCodesAsked(h)).toStrictEqual([USER_CODE, USER_CODE, USER_CODE, USER_CODE]);
    expect(shown.map((prompt) => prompt.kind)).toStrictEqual(['scan_qr']);
    expect(account.secrets).toMatchObject({ method: 'smart_life', userCode: USER_CODE });
  });

  it('uses the User Code it is given instead of the stored one', async () => {
    const h = setup();
    const other = 'EU9z8Y7x';
    h.cloud.validUserCodes.add(other);
    const { context } = linking(smartLifeAccount(h.cloud.session()));
    const account = await createTuyaModule(h.dependencies).link(
      { provider: 'tuya', method: 'smart_life', userCode: other },
      context,
    );
    expect(new Set(userCodesAsked(h))).toStrictEqual(new Set([other]));
    expect(account.secrets).toMatchObject({ userCode: other });
  });

  it('refuses to link with no User Code when nothing is stored, without calling Tuya', async () => {
    const h = setup();
    const { context, shown } = linking();
    await expect(
      createTuyaModule(h.dependencies).link({ provider: 'tuya', method: 'smart_life' }, context),
    ).rejects.toMatchObject({
      name: 'ProviderProblemError',
      problem: 'bad_credentials',
      message: MISSING_CODE_TEXT,
    });
    expect(shown).toStrictEqual([]);
    expect(h.cloud.logins).toStrictEqual([]);
    expect(h.cloud.requests).toStrictEqual([]);
  });

  it('asks for the User Code when the stored account is not a Smart Life sign-in', async () => {
    const h = setup();
    const { context } = linking(DEVELOPER_ACCOUNT);
    await expect(
      createTuyaModule(h.dependencies).link({ provider: 'tuya', method: 'smart_life' }, context),
    ).rejects.toMatchObject({ problem: 'bad_credentials', message: MISSING_CODE_TEXT });
    expect(h.cloud.logins).toStrictEqual([]);
  });
});

function runContext(h: Harness): { context: RunContext; problems: ProviderProblemError[] } {
  const problems: ProviderProblemError[] = [];
  const context: RunContext = {
    ...h.context,
    needsAttention: (cause) => {
      if (cause instanceof ProviderProblemError) {
        problems.push(cause);
      }
      return h.context.needsAttention(cause);
    },
  };
  return { context, problems };
}

describe('a running account', () => {
  it('renews the session before it expires and saves the new tokens', async () => {
    const h = setup();
    const expiring = smartLifeAccount({ ...h.cloud.session(), expiresAt: CLOCK + 30_000 });
    await createTuyaModule(h.dependencies).start(expiring, h.context);
    expect(h.cloud.refreshes).toBe(1);
    expect(h.saved).toHaveLength(1);
    expect(h.saved[0]?.secrets).toMatchObject({
      method: 'smart_life',
      userCode: USER_CODE,
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: CLOCK + 7_200_000,
    });
  });

  it('asks for a new sign-in when the cloud has ended the session, and a scan alone then relinks it', async () => {
    const h = setup();
    const ended = smartLifeAccount({ ...h.cloud.session(), expiresAt: CLOCK + 30_000 });
    h.cloud.endSession();
    const { context, problems } = runContext(h);
    const module = createTuyaModule(h.dependencies);
    await expect(module.start(ended, context)).rejects.toBeInstanceOf(TuyaCloudError);
    expect(problems.map((problem) => problem.problem)).toContain('session_expired');
    expect(h.attention.length).toBeGreaterThan(0);
    const relinked = await module.link(
      { provider: 'tuya', method: 'smart_life' },
      linking(ended).context,
    );
    expect(relinked.secrets).toMatchObject({ userCode: USER_CODE, accessToken: 'access-1' });
    await expect(module.start(relinked, h.context)).resolves.toMatchObject({ provider: 'tuya' });
  });

  it('shows a stored developer project as a sign-in that has ended, not a crash', async () => {
    const h = setup();
    const { context, problems } = runContext(h);
    const module = createTuyaModule(h.dependencies);
    await expect(module.start(DEVELOPER_ACCOUNT, context)).rejects.toMatchObject({
      name: 'ProviderProblemError',
      problem: 'session_expired',
      cause: { name: 'StoredTuyaAccountUnreadableError' },
    });
    expect(problems).toStrictEqual([]);
    expect(h.cloud.requests).toStrictEqual([]);
    expect(h.cloud.logins).toStrictEqual([]);
  });

  it('asks for attention when the account may no longer read devices', async () => {
    const h = setup();
    h.cloud.failures.set('GET /v1.0/m/life/users/homes', { code: 1106, msg: 'permission deny' });
    await expect(
      createTuyaModule(h.dependencies).start(smartLifeAccount(h.cloud.session()), h.context),
    ).rejects.toBeInstanceOf(TuyaCloudError);
    expect(h.attention).toStrictEqual([
      'Tuya cloud refused listing the Smart Life homes: code 1106, "permission deny".',
    ]);
  });

  it('does not ask for attention for a passing cloud fault', async () => {
    const h = setup();
    h.cloud.failures.set('GET /v1.0/m/life/users/homes', { code: 500, msg: 'system error' });
    await expect(
      createTuyaModule(h.dependencies).start(smartLifeAccount(h.cloud.session()), h.context),
    ).rejects.toBeInstanceOf(TuyaCloudError);
    expect(h.attention).toStrictEqual([]);
  });

  it('signs the hub out of Smart Life when the account is forgotten', async () => {
    const h = setup();
    await createTuyaModule(h.dependencies).forget?.(
      smartLifeAccount(h.cloud.session()),
      linking().context,
    );
    expect(h.cloud.terminalsExpired).toBe(1);
  });
});
