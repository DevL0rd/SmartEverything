import type { JsonValue } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  CAMERA_EVENT_HOST,
  CAMERA_EVENT_PATH,
  apiBaseUrl,
  cameraEventListData,
  createNonce,
  decryptResponse,
  encryptRequest,
  isSessionExpired,
  parseCloudEnvelope,
  regionalHost,
  type CameraEventQuery,
  type CloudPayload,
  type HttpMethod,
} from '@smarteverything/xiaomi';
import { XiaomiSessionRejectedError, type XiaomiSecrets } from './account';
import { AccountHttp } from './account-http';
import type { XiaomiDependencies } from './dependencies';
import { signInWithPassToken } from './login-flow';

const NONCE_RANDOM_BYTES = 8;
const SDK_VERSION = 'accountsdk-18.8.15';

export class XiaomiHttpError extends Error {
  override readonly name = 'XiaomiHttpError';

  constructor(
    readonly path: string,
    readonly status: number,
  ) {
    super(`The Xiaomi cloud answered ${path} with HTTP ${String(status)}, expected 200.`);
  }
}

export interface CloudHooks {
  readonly saveSecrets: (secrets: XiaomiSecrets) => Promise<void>;
  readonly needsAttention: (cause: Error) => Promise<void>;
  readonly log: Logger;
}

interface Target {
  readonly method: HttpMethod;
  readonly base: string;
  readonly path: string;
  readonly data: string;
}

export function accountCookies(deviceId: string): Record<string, string> {
  return { sdkVersion: SDK_VERSION, deviceId };
}

function isExpired(error: unknown): boolean {
  return (error instanceof XiaomiHttpError && error.status === 401) || isSessionExpired(error);
}

export class XiaomiCloud {
  private renewal: Promise<void> | null = null;
  private rejected = false;

  constructor(
    private readonly dependencies: XiaomiDependencies,
    private secrets: XiaomiSecrets,
    private readonly hooks: CloudHooks,
  ) {}

  get region(): XiaomiSecrets['region'] {
    return this.secrets.region;
  }

  get account(): Pick<XiaomiSecrets, 'userId' | 'passToken' | 'deviceId' | 'region'> {
    const { userId, passToken, deviceId, region } = this.secrets;
    return { userId, passToken, deviceId, region };
  }

  async call(path: string, data: JsonValue): Promise<JsonValue> {
    const payload = await this.request({
      method: 'POST',
      base: apiBaseUrl(this.secrets.region),
      path,
      data: JSON.stringify(data),
    });
    return payload.result;
  }

  async cameraEvents(query: Omit<CameraEventQuery, 'region'>): Promise<JsonValue> {
    const data = cameraEventListData({ ...query, region: this.secrets.region });
    const base = regionalHost(this.secrets.region, CAMERA_EVENT_HOST);
    const payload = await this.request({ method: 'GET', base, path: CAMERA_EVENT_PATH, data });
    return payload.data;
  }

  private async request(target: Target): Promise<CloudPayload> {
    if (this.rejected) {
      throw new XiaomiSessionRejectedError();
    }
    try {
      return await this.signed(target);
    } catch (error) {
      if (!isExpired(error)) {
        throw error;
      }
      this.hooks.log.info('xiaomi_cloud.session_expired', { path: target.path });
      await this.renew();
      return this.signed(target);
    }
  }

  private async renew(): Promise<void> {
    this.renewal ??= this.renewOnce().finally(() => {
      this.renewal = null;
    });
    return this.renewal;
  }

  private async renewOnce(): Promise<void> {
    const http = new AccountHttp(this.dependencies.fetch, accountCookies(this.secrets.deviceId));
    const tokens = await signInWithPassToken(http, this.secrets.userId, this.secrets.passToken);
    if (tokens === null) {
      this.rejected = true;
      const rejected = new XiaomiSessionRejectedError();
      await this.hooks.needsAttention(rejected);
      throw rejected;
    }
    this.secrets = { ...this.secrets, ...tokens };
    await this.hooks.saveSecrets(this.secrets);
    this.hooks.log.info('xiaomi_cloud.session_renewed');
  }

  private headers(): Headers {
    return new Headers({
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept-Encoding': 'identity',
      'User-Agent': 'APP/com.xiaomi.mihome APPV/10.5.201',
      'x-xiaomi-protocal-flag-cli': 'PROTOCAL-HTTP2',
      'MIOT-ENCRYPT-ALGORITHM': 'ENCRYPT-RC4',
      Cookie: [
        `userId=${this.secrets.userId}`,
        `yetAnotherServiceToken=${this.secrets.serviceToken}`,
        `serviceToken=${this.secrets.serviceToken}`,
        'locale=en_GB',
        'channel=MI_APP_STORE',
      ].join('; '),
    });
  }

  private async signed(target: Target): Promise<CloudPayload> {
    const nonce = createNonce(
      this.dependencies.randomBytes(NONCE_RANDOM_BYTES),
      this.dependencies.now(),
    );
    const fields = new URLSearchParams(
      encryptRequest({ ...target, ssecurity: this.secrets.ssecurity, nonce }).map(
        ([name, value]) => [name, value],
      ),
    ).toString();
    const url =
      target.method === 'GET'
        ? `${target.base}${target.path}?${fields}`
        : `${target.base}${target.path}`;
    const response = await this.dependencies.fetch(url, {
      method: target.method,
      headers: this.headers(),
      ...(target.method === 'POST' ? { body: fields } : {}),
    });
    const text = await response.text();
    if (response.status !== 200) {
      throw new XiaomiHttpError(target.path, response.status);
    }
    const plain = text.trimStart().startsWith('{')
      ? text
      : decryptResponse(this.secrets.ssecurity, nonce, text);
    return parseCloudEnvelope(target.path, plain);
  }
}
