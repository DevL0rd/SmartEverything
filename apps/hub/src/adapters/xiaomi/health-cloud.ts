import type { Logger } from '@smarteverything/logging';
import {
  ACCOUNT_BASE,
  HEALTH_HOST,
  HEALTH_SID,
  HEALTH_USER_AGENT,
  SOURCE_LIST_PATH,
  XiaomiLoginError,
  clientSign,
  createNonce,
  decryptResponse,
  encryptRequest,
  regionalHost,
  parseCloudEnvelope,
  parseLoginJson,
  parseServiceLogin,
  parseSourceList,
  rawNonceOf,
  sourceListData,
  type LoginSession,
  type SourceList,
} from '@smarteverything/xiaomi';
import { XiaomiSessionRejectedError, type XiaomiSecrets } from './account';
import { AccountHttp } from './account-http';
import { XiaomiHttpError, accountCookies } from './cloud-api';
import type { XiaomiDependencies } from './dependencies';

const SERVICE_LOGIN = `${ACCOUNT_BASE}/pass/serviceLogin?sid=${HEALTH_SID}&_json=true`;
const NONCE_RANDOM_BYTES = 8;

export type HealthAccount = Pick<XiaomiSecrets, 'userId' | 'passToken' | 'deviceId' | 'region'>;

interface HealthSession {
  readonly userId: string;
  readonly cUserId: string | null;
  readonly ssecurity: string;
  readonly serviceToken: string;
}

function stsUrl(session: LoginSession, loginText: string): string {
  const nonce = rawNonceOf(loginText);
  if (nonce === null) {
    return session.location;
  }
  const sign = encodeURIComponent(clientSign(nonce, session.ssecurity));
  return `${session.location}&clientSign=${sign}`;
}

export class XiaomiHealthCloud {
  constructor(
    private readonly dependencies: XiaomiDependencies,
    private readonly account: HealthAccount,
    private readonly log: Logger,
  ) {}

  async wearables(): Promise<SourceList> {
    const session = await this.signIn();
    const list = parseSourceList(await this.sourceList(session));
    this.log.info('xiaomi_health.wearables_read', {
      wearables: list.wearables.length,
      models: list.wearables.map((wearable) => wearable.model ?? wearable.name).join(', '),
      keyFields: list.wearables.map((wearable) => wearable.keyField).join(', '),
      skipped: list.skipped.length,
    });
    for (const skipped of list.skipped) {
      this.log.warn('xiaomi_health.source_skipped', { ...skipped });
    }
    return list;
  }

  private async signIn(): Promise<HealthSession> {
    const http = new AccountHttp(this.dependencies.fetch, accountCookies(this.account.deviceId));
    http.setCookie('userId', this.account.userId);
    http.setCookie('passToken', this.account.passToken);
    const { text } = await http.get(SERVICE_LOGIN);
    const reply = parseServiceLogin(parseLoginJson('serviceLogin', text));
    if (reply.kind !== 'session') {
      this.log.warn('xiaomi_health.sign_in_refused', { sid: HEALTH_SID });
      throw new XiaomiSessionRejectedError();
    }
    await http.follow(stsUrl(reply.session, text));
    const serviceToken = http.cookie('serviceToken');
    if (serviceToken === null) {
      throw new XiaomiLoginError('sts', 'a Mi Fitness serviceToken cookie', 'none');
    }
    this.log.info('xiaomi_health.signed_in', {
      sid: HEALTH_SID,
      cUserId: reply.session.cUserId !== undefined,
    });
    return {
      userId: reply.session.userId,
      cUserId: reply.session.cUserId ?? null,
      ssecurity: reply.session.ssecurity,
      serviceToken,
    };
  }

  private cookies(session: HealthSession): string {
    const identity =
      session.cUserId === null
        ? [`userId=${session.userId}`]
        : [`userId=${session.userId}`, `cUserId=${session.cUserId}`];
    return [...identity, `serviceToken=${session.serviceToken}`, 'locale=en_us'].join('; ');
  }

  private async sourceList(session: HealthSession): Promise<unknown> {
    const nonce = createNonce(
      this.dependencies.randomBytes(NONCE_RANDOM_BYTES),
      this.dependencies.now(),
    );
    const fields = encryptRequest({
      method: 'POST',
      path: SOURCE_LIST_PATH,
      data: JSON.stringify(sourceListData()),
      ssecurity: session.ssecurity,
      nonce,
    });
    const response = await this.dependencies.fetch(
      `${regionalHost(this.account.region, HEALTH_HOST)}${SOURCE_LIST_PATH}`,
      {
        method: 'POST',
        headers: new Headers({
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept-Encoding': 'identity',
          'User-Agent': HEALTH_USER_AGENT,
          region_tag: this.account.region,
          Cookie: this.cookies(session),
        }),
        body: new URLSearchParams(fields.map(([name, value]) => [name, value])).toString(),
      },
    );
    const text = await response.text();
    if (response.status !== 200) {
      throw new XiaomiHttpError(SOURCE_LIST_PATH, response.status);
    }
    const plain = text.trimStart().startsWith('{')
      ? text
      : decryptResponse(session.ssecurity, nonce, text);
    return parseCloudEnvelope(SOURCE_LIST_PATH, plain).result;
  }
}
