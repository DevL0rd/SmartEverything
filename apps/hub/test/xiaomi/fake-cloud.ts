import { readFileSync } from 'node:fs';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { decryptResponse, rc4Drop1024, signFields, signedNonce } from '@smarteverything/xiaomi';
import { z } from 'zod';
import { SSECURITY, USER_ID, type FakeAccount } from './fake-account';
import { plain, type FakeRequest, type Route } from './fake-http';

const FIXTURES = new URL('../../../../packages/xiaomi/test/fixtures/', import.meta.url);
const ADDRESS = z.object({
  did: z.string(),
  siid: z.number(),
  piid: z.number(),
  value: JSON_VALUE.optional(),
});

const SPECS: Readonly<Record<string, string>> = {
  'zhimi.airp.mb5': 'urn:miot-spec-v2:device:air-purifier:0000A007:zhimi-mb5:1',
  'lumi.sensor_motion.aq2': 'urn:miot-spec-v2:device:motion-sensor:0000A014:lumi-aq2:1',
  'lumi.gateway.mgl03': 'urn:miot-spec-v2:device:gateway:0000A019:lumi-mgl03:2',
  'xiaomi.camera.091ac1': 'urn:miot-spec-v2:device:camera:0000A01C:xiaomi-091ac1:1:0000D070',
  'chuangmi.camera.ipc019': 'urn:miot-spec-v2:device:camera:0000A01C:chuangmi-ipc019:1',
};

function fixtureFor(type: string): string {
  const name = type.split(':')[5] ?? '';
  return readFileSync(new URL(`${name}.json`, FIXTURES), 'utf8');
}

export interface CameraUnit {
  readonly createTime: number;
  readonly eventType: string;
  readonly fileId: string;
}

export class FakeCloud {
  readonly calls: string[] = [];
  readonly specDownloads: string[] = [];
  readonly cloudProperties = new Map<string, JsonValue>();
  readonly actions: JsonValue[] = [];
  readonly rpcs: { readonly path: string; readonly data: JsonValue }[] = [];
  readonly failPaths = new Set<string>();
  devices: JsonValue[] = [];
  homes: JsonValue = { homelist: [] };
  cameraUnits: CameraUnit[] = [];
  expireNext = 0;
  failStatus: number | null = null;

  constructor(private readonly account: FakeAccount) {}

  readonly route: Route = (request) => {
    if (request.url.host === 'miot-spec.org') {
      return this.spec(request);
    }
    if (
      request.url.host === 'de.api.io.mi.com' ||
      request.url.host === 'de.business.smartcamera.api.io.mi.com'
    ) {
      return this.api(request);
    }
    return null;
  };

  private spec(request: FakeRequest): Response {
    this.specDownloads.push(`${request.url.pathname}${request.url.search}`);
    if (request.url.pathname === '/miot-spec-v2/instances') {
      const instances = Object.entries(SPECS).map(([model, type]) => ({
        model,
        version: 1,
        type,
        status: 'released',
      }));
      return plain(200, JSON.stringify({ instances }));
    }
    const type = request.url.searchParams.get('type') ?? '';
    return Object.values(SPECS).includes(type)
      ? plain(200, fixtureFor(type))
      : plain(404, 'not found');
  }

  private refusal(path: string, request: FakeRequest): Response | null {
    if (this.failStatus !== null || this.failPaths.has(path)) {
      return plain(this.failStatus ?? 503, 'unavailable');
    }
    if (
      request.cookies.get('serviceToken') !== this.account.serviceToken ||
      request.cookies.get('userId') !== USER_ID
    ) {
      return plain(401, 'unauthorized');
    }
    if (this.expireNext > 0) {
      this.expireNext -= 1;
      return plain(200, JSON.stringify({ code: 3, message: 'auth err' }));
    }
    return null;
  }

  private api(request: FakeRequest): Response {
    const path = request.url.pathname.replace(/^\/app/, '');
    this.calls.push(path);
    const refusal = this.refusal(path, request);
    if (refusal !== null) {
      return refusal;
    }
    const nonce = Buffer.from(request.form.get('_nonce') ?? '', 'base64');
    const key = signedNonce(SSECURITY, nonce);
    const data = request.form.get('data') ?? '';
    const hash = request.form.get('rc4_hash__') ?? '';
    const expected = signFields(
      { method: request.method === 'GET' ? 'GET' : 'POST', path },
      [
        ['data', data],
        ['rc4_hash__', hash],
      ],
      key,
    );
    if (expected !== request.form.get('signature')) {
      return plain(200, JSON.stringify({ code: -1, message: 'invalid signature' }));
    }
    const reply = this.handle(
      path,
      JSON_VALUE.parse(JSON.parse(decryptResponse(SSECURITY, nonce, data))),
    );
    return plain(
      200,
      Buffer.from(rc4Drop1024(key, new TextEncoder().encode(JSON.stringify(reply)))).toString(
        'base64',
      ),
    );
  }

  private handle(path: string, data: JsonValue): Record<string, JsonValue> {
    if (path.startsWith('/home/rpc/')) {
      this.rpcs.push({ path, data });
      return { code: 0, message: 'ok', result: ['ok'] };
    }
    switch (path) {
      case '/home/device_list':
        return { code: 0, message: 'ok', result: { list: this.devices } };
      case '/v2/homeroom/gethome':
        return { code: 0, message: 'ok', result: this.homes };
      case '/miotspec/prop/get':
        return { code: 0, result: this.readProperties(data) };
      case '/miotspec/prop/set':
        return { code: 0, result: this.writeProperties(data) };
      case '/miotspec/action':
        this.actions.push(data);
        return { code: 0, result: { code: 0, out: [7] } };
      case '/common/app/get/eventlist':
        return { code: 0, result: 'ok', data: { thirdPartPlayUnits: this.events(data) } };
      default:
        return { code: -2, message: `no route ${path}` };
    }
  }

  private params(data: JsonValue): z.infer<typeof ADDRESS>[] {
    return z.object({ params: z.array(ADDRESS) }).parse(data).params;
  }

  private readProperties(data: JsonValue): JsonValue {
    return this.params(data).map(({ did, siid, piid }) => {
      const value = this.cloudProperties.get(`${did}/${String(siid)}.${String(piid)}`);
      return value === undefined
        ? { did, siid, piid, code: -704042011 }
        : { did, siid, piid, code: 0, value };
    });
  }

  private writeProperties(data: JsonValue): JsonValue {
    return this.params(data).map(({ did, siid, piid, value }) => {
      this.cloudProperties.set(`${did}/${String(siid)}.${String(piid)}`, value ?? null);
      return { did, siid, piid, code: 0 };
    });
  }

  private events(data: JsonValue): JsonValue {
    const query = z
      .object({ beginTime: z.number(), endTime: z.number(), region: z.string() })
      .parse(data);
    return this.cameraUnits
      .filter(
        (unit) =>
          unit.createTime >= query.beginTime &&
          unit.createTime <= query.endTime &&
          query.region === 'DE',
      )
      .map((unit) => ({ ...unit, isAlarm: true }))
      .reverse();
  }
}
