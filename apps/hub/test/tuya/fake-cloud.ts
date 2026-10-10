import { createHash, createHmac } from 'node:crypto';

export const ACCESS_ID = 'test-access-id';
export const ACCESS_SECRET = '0123456789abcdefFEDCBA9876543210';
export const APP_USER = 'app-user-1';

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
}

export interface SpecItem {
  readonly code: string;
  readonly dp_id: number;
  readonly type: string;
  readonly values: string;
}

export interface FakeSpec {
  readonly functions: readonly SpecItem[];
  readonly status: readonly SpecItem[];
}

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly body: unknown;
}

interface Failure {
  readonly code: number;
  readonly msg: string;
}

type Handler = (request: RecordedRequest, match: RegExpExecArray) => unknown;

function envelope(result: unknown): Response {
  return new Response(JSON.stringify({ success: true, result, t: 1, tid: 'x' }), { status: 200 });
}

function refusal(failure: Failure): Response {
  return new Response(JSON.stringify({ success: false, ...failure, t: 1, tid: 'x' }), {
    status: 200,
  });
}

function sortedUrl(url: URL): string {
  const pairs = [...url.searchParams.keys()]
    .sort()
    .map((key) => `${key}=${url.searchParams.get(key) ?? ''}`);
  return pairs.length === 0 ? url.pathname : `${url.pathname}?${pairs.join('&')}`;
}

export class FakeTuyaCloud {
  readonly requests: RecordedRequest[] = [];
  readonly devices: FakeDevice[] = [];
  readonly specs = new Map<string, FakeSpec>();
  readonly statuses = new Map<string, { code: string; value: unknown }[]>();
  readonly failures = new Map<string, Failure>();
  readonly homes: {
    home_id: number;
    name: string;
    rooms: { room_id: number; name: string; devices: string[] }[];
  }[] = [];
  readonly remotes = new Map<
    string,
    {
      remote_id: string;
      remote_name: string;
      category_id: number;
      keys: { key: string; key_id: number }[];
    }[]
  >();
  learnedCode: string | null = null;
  tokens = 0;
  tokenLifetimeSeconds = 7200;
  private validToken: string | null = null;
  private readonly routes: readonly (readonly [string, RegExp, Handler])[] = [
    ['GET', /^\/v1\.0\/token$/, (): unknown => this.issueToken()],
    ['GET', /^\/v1\.0\/token\/refresh-\d+$/, (): unknown => this.issueToken()],
    ['GET', /^\/v1\.3\/iot-03\/devices$/, (request): unknown => this.devicePage(request.query)],
    [
      'GET',
      /^\/v1\.1\/devices\/([^/]+)\/specifications$/,
      (_, match): unknown => this.specs.get(match[1] ?? '') ?? { functions: [], status: [] },
    ],
    [
      'GET',
      /^\/v1\.0\/iot-03\/devices\/status$/,
      (request): unknown => this.statusesOf(request.query),
    ],
    ['POST', /^\/v1\.0\/iot-03\/devices\/[^/]+\/commands$/, (): unknown => true],
    [
      'GET',
      /^\/v1\.0\/users\/[^/]+\/homes$/,
      (): unknown => this.homes.map((home) => ({ home_id: home.home_id, name: home.name })),
    ],
    [
      'GET',
      /^\/v1\.0\/homes\/(\d+)\/rooms$/,
      (_, match): unknown => ({ rooms: this.home(match[1]).rooms }),
    ],
    [
      'GET',
      /^\/v1\.0\/homes\/(\d+)\/rooms\/(\d+)\/devices$/,
      (_, match): unknown => this.roomDevices(match[1], match[2]),
    ],
    [
      'GET',
      /^\/v2\.0\/infrareds\/([^/]+)\/remotes$/,
      (_, match): unknown => this.remotes.get(match[1] ?? '') ?? [],
    ],
    [
      'GET',
      /^\/v2\.0\/infrareds\/([^/]+)\/remotes\/([^/]+)\/keys$/,
      (_, match): unknown => this.keysOf(match[1], match[2]),
    ],
    ['POST', /^\/v2\.0\/infrareds\/[^/]+\/remotes\/[^/]+\/raw\/command$/, (): unknown => true],
    ['PUT', /^\/v2\.0\/infrareds\/[^/]+\/learning-state$/, (): unknown => true],
    [
      'GET',
      /^\/v2\.0\/infrareds\/[^/]+\/learning-codes$/,
      (): unknown => ({ success: this.learnedCode !== null, code: this.learnedCode }),
    ],
  ];

  readonly fetch = (url: string, init: RequestInit): Promise<Response> =>
    Promise.resolve(this.answer(new URL(url), init));

  expireToken(): void {
    this.validToken = null;
  }

  calls(method: string, path: string): RecordedRequest[] {
    return this.requests.filter((request) => request.method === method && request.path === path);
  }

  private answer(url: URL, init: RequestInit): Response {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? init.body : '';
    const headers = new Headers(init.headers);
    const parsedBody: unknown = body === '' ? null : JSON.parse(body);
    const request = { method, path: url.pathname, query: url.searchParams, body: parsedBody };
    this.requests.push(request);
    const signError = this.checkSignature(url, method, body, headers);
    if (signError !== null) {
      return refusal(signError);
    }
    const failure = this.failures.get(`${method} ${url.pathname}`);
    if (failure !== undefined) {
      return refusal(failure);
    }
    for (const [routeMethod, pattern, handler] of this.routes) {
      const match = pattern.exec(url.pathname);
      if (routeMethod === method && match !== null) {
        return envelope(handler(request, match));
      }
    }
    return new Response('not found', { status: 404 });
  }

  private checkSignature(url: URL, method: string, body: string, headers: Headers): Failure | null {
    const isToken = url.pathname.startsWith('/v1.0/token');
    const token = headers.get('access_token');
    if (!isToken && (token === null || token !== this.validToken)) {
      return { code: 1010, msg: 'token invalid' };
    }
    const contentHash = createHash('sha256').update(body).digest('hex');
    const toSign = `${method}\n${contentHash}\n\n${sortedUrl(url)}`;
    const message = [
      ACCESS_ID,
      isToken ? '' : token,
      headers.get('t'),
      headers.get('nonce'),
      toSign,
    ].join('');
    const expected = createHmac('sha256', ACCESS_SECRET)
      .update(message)
      .digest('hex')
      .toUpperCase();
    const valid =
      headers.get('client_id') === ACCESS_ID &&
      headers.get('sign_method') === 'HMAC-SHA256' &&
      headers.get('sign') === expected;
    return valid ? null : { code: 1004, msg: 'sign invalid' };
  }

  private issueToken(): unknown {
    this.tokens += 1;
    this.validToken = `token-${String(this.tokens)}`;
    return {
      access_token: this.validToken,
      refresh_token: `refresh-${String(this.tokens)}`,
      expire_time: this.tokenLifetimeSeconds,
      uid: 'u',
    };
  }

  private devicePage(query: URLSearchParams): unknown {
    const filter = query.get('device_ids');
    const selected =
      filter === null
        ? this.devices
        : this.devices.filter((device) => filter.split(',').includes(device.id));
    const start = Number(query.get('last_row_key') ?? '0');
    const list = selected.slice(start, start + 2);
    const more = start + 2 < selected.length;
    return {
      list,
      has_more: more,
      ...(more ? { last_row_key: String(start + 2) } : {}),
      total: selected.length,
    };
  }

  private statusesOf(query: URLSearchParams): unknown {
    return (query.get('device_ids') ?? '')
      .split(',')
      .filter((id) => this.statuses.has(id))
      .map((id) => ({ id, status: this.statuses.get(id) }));
  }

  private home(homeId: string | undefined): FakeTuyaCloud['homes'][number] {
    const home = this.homes.find((candidate) => String(candidate.home_id) === homeId);
    if (home === undefined) {
      throw new Error(`no home ${String(homeId)}`);
    }
    return home;
  }

  private roomDevices(homeId: string | undefined, roomId: string | undefined): unknown {
    const room = this.home(homeId).rooms.find((candidate) => String(candidate.room_id) === roomId);
    return (room?.devices ?? []).map((id) => ({ id }));
  }

  private keysOf(blasterId: string | undefined, remoteId: string | undefined): unknown {
    const remote = (this.remotes.get(blasterId ?? '') ?? []).find(
      (candidate) => candidate.remote_id === remoteId,
    );
    return { category_id: remote?.category_id ?? 0, key_list: remote?.keys ?? [] };
  }
}

export function item(code: string, dpId: number, type: string, values: object = {}): SpecItem {
  return { code, dp_id: dpId, type, values: JSON.stringify(values) };
}
