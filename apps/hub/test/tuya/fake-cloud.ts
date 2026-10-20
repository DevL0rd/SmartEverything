import { createCipheriv, createDecipheriv, createHash, createHmac } from 'node:crypto';
import {
  ENDPOINT,
  HOMES_RESULT,
  QR_TOKEN_REPLY,
  READ_ONLY_CODES,
  SCAN_PENDING_REPLY,
  SESSION_ENDED_REPLY,
  SIGNED_IN_RESULT,
  TOKEN_LIFETIME_SECONDS,
  USER_CODE,
  USER_CODE_REFUSED_REPLY,
  WRITE_ONLY_CODES,
  type RecordedPoint,
} from './recorded';

export { ENDPOINT, USER_CODE } from './recorded';

const LOGIN_HOST = 'https://apigw.iotbing.com';
const NONCE_LENGTH = 12;
const SIGNED_HEADERS = ['X-appKey', 'X-requestId', 'X-sid', 'X-time', 'X-token'] as const;

export interface FakeDevice {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly product_id: string;
  local_key: string;
  readonly sub: boolean;
  readonly online: boolean;
  readonly gateway_id?: string;
  readonly node_id?: string;
  readonly room?: string;
  status: { code: string; value: unknown }[];
}

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly body: unknown;
}

export interface FakeSession {
  readonly userCode: string;
  readonly terminalId: string;
  readonly endpoint: string;
  readonly uid: string;
  readonly username: string | null;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
}

interface Failure {
  readonly code: number;
  readonly msg: string;
}

interface OpenedRequest {
  readonly secret: string;
  readonly signed: boolean;
  readonly query: URLSearchParams;
  readonly body: unknown;
}

type Handler = (request: RecordedRequest, match: RegExpExecArray) => unknown;

function md5Hex(text: string): string {
  return createHash('md5').update(text).digest('hex');
}

function hmacHex(key: string, message: string): string {
  return createHmac('sha256', key).update(message).digest('hex');
}

function reply(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function seal(plain: string, secret: string, nonce: string): string {
  const cipher = createCipheriv('aes-128-gcm', Buffer.from(secret), Buffer.from(nonce));
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  return `${Buffer.from(nonce).toString('base64')}${body.toString('base64')}`;
}

function open(sealed: string, secret: string): string {
  const bytes = Buffer.from(sealed, 'base64');
  const decipher = createDecipheriv(
    'aes-128-gcm',
    Buffer.from(secret),
    bytes.subarray(0, NONCE_LENGTH),
  );
  const tail = bytes.subarray(NONCE_LENGTH);
  decipher.setAuthTag(tail.subarray(tail.length - 16));
  return Buffer.concat([
    decipher.update(tail.subarray(0, tail.length - 16)),
    decipher.final(),
  ]).toString('utf8');
}

function plainObject(text: string): Record<string, string> {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, received ${text}`);
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
}

function specificationItem(point: RecordedPoint): object {
  return { code: point.code, type: point.type, values: JSON.stringify(point.values) };
}

export function wnykqDevice(
  id: string,
  localKey: string,
  extra: Partial<FakeDevice> = {},
): FakeDevice {
  return {
    id,
    name: `Blaster ${id}`,
    category: 'wnykq',
    product_id: 'p-wnykq',
    local_key: localKey,
    sub: false,
    online: true,
    status: [],
    ...extra,
  };
}

export class FakeSmartLife {
  readonly requests: RecordedRequest[] = [];
  readonly logins: URL[] = [];
  readonly devices: FakeDevice[] = [];
  readonly points = new Map<string, readonly RecordedPoint[]>();
  readonly failures = new Map<string, Failure>();
  readonly commands: { readonly deviceId: string; readonly commands: unknown }[] = [];
  readonly validUserCodes = new Set<string>([USER_CODE]);
  pendingPolls = 2;
  signedIn = 0;
  refreshes = 0;
  terminalsExpired = 0;
  private issued = 0;
  private accessToken = 'access-0';
  private refreshToken = 'refresh-0';
  private ended = false;
  private readonly routes: readonly (readonly [string, RegExp, Handler])[] = [
    ['GET', /^\/v1\.0\/m\/life\/users\/homes$/, (): unknown => HOMES_RESULT],
    ['GET', /^\/v1\.0\/m\/life\/ha\/home\/devices$/, (): unknown => this.devices.map(listed)],
    [
      'GET',
      /^\/v1\.0\/m\/life\/ha\/devices\/detail$/,
      (request): unknown => this.details(request.query.get('devIds')),
    ],
    [
      'GET',
      /^\/v1\.1\/m\/life\/([^/]+)\/specifications$/,
      (_, match): unknown => this.specification(match[1]),
    ],
    [
      'GET',
      /^\/v1\.0\/m\/life\/devices\/([^/]+)\/status$/,
      (_, match): unknown => this.relations(match[1]),
    ],
    ['GET', /^\/v1\.0\/m\/life\/ha\/[^/]+\/code\/custom-type$/, (): unknown => false],
    ['GET', /^\/v1\.0\/m\/thing\/ha\/([^/]+)\/room$/, (_, match): unknown => this.room(match[1])],
    [
      'POST',
      /^\/v1\.1\/m\/thing\/([^/]+)\/commands$/,
      (request, match): unknown => this.command(match[1], request),
    ],
    ['POST', /^\/v1\.0\/m\/life\/ha\/access\/config$/, (): unknown => MESSAGING],
    ['POST', /^\/v1\.0\/m\/token\/terminal\/expire$/, (): unknown => this.expireTerminal()],
    ['GET', /^\/v1\.0\/m\/token\/([^/]+)$/, (_, match): unknown => this.refresh(match[1])],
  ];

  constructor(private readonly now: () => number) {}

  readonly fetch = (url: string, init: RequestInit): Promise<Response> =>
    Promise.resolve(
      url.startsWith(LOGIN_HOST) ? this.login(new URL(url), init) : this.api(new URL(url), init),
    );

  session(userCode: string = USER_CODE): FakeSession {
    return {
      userCode,
      terminalId: SIGNED_IN_RESULT.terminal_id,
      endpoint: ENDPOINT,
      uid: SIGNED_IN_RESULT.uid,
      username: null,
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      expiresAt: this.now() + TOKEN_LIFETIME_SECONDS * 1000,
    };
  }

  endSession(): void {
    this.ended = true;
  }

  calls(method: string, path: string): RecordedRequest[] {
    return this.requests.filter((request) => request.method === method && request.path === path);
  }

  commandsFor(deviceId: string): unknown[] {
    return this.commands
      .filter((entry) => entry.deviceId === deviceId)
      .map((entry) => entry.commands);
  }

  private login(url: URL, init: RequestInit): Response {
    this.logins.push(url);
    const userCode = url.searchParams.get('usercode') ?? '';
    if (!this.validUserCodes.has(userCode)) {
      return reply(USER_CODE_REFUSED_REPLY);
    }
    if (init.method === 'POST') {
      return reply(QR_TOKEN_REPLY);
    }
    if (this.pendingPolls > 0) {
      this.pendingPolls -= 1;
      return reply(SCAN_PENDING_REPLY);
    }
    this.signedIn += 1;
    this.ended = false;
    this.issueTokens();
    return reply({
      success: true,
      t: this.now(),
      result: {
        access_token: this.accessToken,
        refresh_token: this.refreshToken,
        expire_time: TOKEN_LIFETIME_SECONDS,
        ...SIGNED_IN_RESULT,
      },
    });
  }

  private issueTokens(): void {
    this.issued += 1;
    this.accessToken = `access-${String(this.issued)}`;
    this.refreshToken = `refresh-${String(this.issued)}`;
  }

  private api(url: URL, init: RequestInit): Response {
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    const opened = this.open(url, init, headers);
    this.requests.push({ method, path: url.pathname, query: opened.query, body: opened.body });
    const refusal = this.refusal(method, url.pathname, opened.signed, headers.get('X-token') ?? '');
    if (refusal !== null) {
      return reply({ success: false, ...refusal, t: this.now() });
    }
    const request = this.requests[this.requests.length - 1];
    const found = this.routes.find(
      ([routeMethod, pattern]) => routeMethod === method && pattern.test(url.pathname),
    );
    if (found === undefined || request === undefined) {
      return new Response('not found', { status: 404 });
    }
    const match = found[1].exec(url.pathname);
    if (match === null) {
      return new Response('not found', { status: 404 });
    }
    const nonce = `n${String(this.requests.length).padStart(NONCE_LENGTH - 1, '0')}`;
    return reply({
      success: true,
      t: this.now(),
      result: seal(JSON.stringify(found[2](request, match)), opened.secret, nonce),
    });
  }

  private open(url: URL, init: RequestInit, headers: Headers): OpenedRequest {
    const requestId = headers.get('X-requestId') ?? '';
    const sealedQuery = url.searchParams.get('encdata') ?? '';
    const sealedBody = typeof init.body === 'string' ? this.sealedBodyOf(init.body) : '';
    const hashKey = md5Hex(`${requestId}${this.refreshToken}`);
    const secret = hmacHex(requestId, hashKey).slice(0, 16);
    const signedHeaders = SIGNED_HEADERS.map((name) => [name, headers.get(name) ?? ''] as const)
      .filter(([, value]) => value !== '')
      .map(([name, value]) => `${name}=${value}`)
      .join('||');
    const expectedSign = hmacHex(hashKey, `${signedHeaders}${sealedQuery}${sealedBody}`);
    return {
      secret,
      signed: headers.get('X-sign') === expectedSign,
      query: new URLSearchParams(sealedQuery === '' ? {} : plainObject(open(sealedQuery, secret))),
      body: sealedBody === '' ? null : JSON.parse(open(sealedBody, secret)),
    };
  }

  private sealedBodyOf(body: string): string {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null || !('encdata' in parsed)) {
      throw new Error(`the request body is not sealed: ${body}`);
    }
    return String(parsed.encdata);
  }

  private refusal(method: string, path: string, signed: boolean, token: string): Failure | null {
    const failure = this.failures.get(`${method} ${path}`);
    if (failure !== undefined) {
      return failure;
    }
    if (this.ended) {
      return SESSION_ENDED_REPLY;
    }
    if (!signed) {
      return { code: 1004, msg: 'sign invalid' };
    }
    const isRefresh = path.startsWith('/v1.0/m/token/refresh-');
    return isRefresh || token === this.accessToken ? null : SESSION_ENDED_REPLY;
  }

  private refresh(presented: string | undefined): unknown {
    if (presented !== this.refreshToken) {
      throw new Error(`refresh token ${String(presented)} is not the current one`);
    }
    this.refreshes += 1;
    this.issueTokens();
    return {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      expireTime: TOKEN_LIFETIME_SECONDS,
      uid: SIGNED_IN_RESULT.uid,
    };
  }

  private expireTerminal(): unknown {
    this.terminalsExpired += 1;
    return true;
  }

  private details(devIds: string | null): unknown {
    const wanted = (devIds ?? '').split(',');
    return this.devices.filter((device) => wanted.includes(device.id)).map(listed);
  }

  private specification(deviceId: string | undefined): unknown {
    const points = this.points.get(deviceId ?? '') ?? [];
    return {
      functions: points.filter((point) => !READ_ONLY_CODES.has(point.code)).map(specificationItem),
      status: points.filter((point) => !WRITE_ONLY_CODES.has(point.code)).map(specificationItem),
    };
  }

  private relations(deviceId: string | undefined): unknown {
    return {
      dpStatusRelationDTOS: (this.points.get(deviceId ?? '') ?? []).map((point) => ({
        dpId: point.dpId,
        statusFormat: JSON.stringify({ [point.code]: '$' }),
        valueConvert: 'default',
        valueType: point.type.toLowerCase(),
        valueDesc: JSON.stringify(point.values),
        enumMappingMap: null,
        supportLocal: true,
      })),
    };
  }

  private room(deviceId: string | undefined): unknown {
    const name = this.devices.find((device) => device.id === deviceId)?.room;
    return name === undefined ? null : { id: 1, name };
  }

  private command(deviceId: string | undefined, request: RecordedRequest): unknown {
    this.commands.push({ deviceId: deviceId ?? '', commands: request.body });
    return true;
  }
}

function listed(device: FakeDevice): object {
  const { room: _room, ...rest } = device;
  return rest;
}

const MESSAGING = {
  url: 'ssl://broker.example.test:8883',
  clientId: 'client-0001',
  username: 'broker-user',
  password: 'broker-password',
  expireTime: 7200,
  topic: {
    ownerId: { sub: 'smart/in/owner/{ownerId}' },
    devId: { sub: 'smart/in/device/{devId}' },
  },
} as const;

export const MESSAGING_TOPICS = {
  owner: (ownerId: string): string => `smart/in/owner/${ownerId}`,
  device: (deviceId: string, suffix: 'pen' | 'sta'): string =>
    `smart/in/device/${deviceId}/${suffix}`,
} as const;

export function item(code: string, dpId: number, type: string, values: object = {}): RecordedPoint {
  return { code, dpId, type, values };
}
