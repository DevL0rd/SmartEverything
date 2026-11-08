import { createCipheriv } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { JSON_VALUE } from '@smarteverything/domain';
import {
  decryptResponse,
  mapKey,
  pv11glCatalog,
  rc4Drop1024,
  signFields,
  signedNonce,
} from '@smarteverything/xiaomi';
import { z } from 'zod';
import { SSECURITY, USER_ID, type FakeAccount } from '../xiaomi/fake-account';
import { plain, type FakeRequest, type Route } from '../xiaomi/fake-http';
import { readVacuumFixture, vacuumObjectName, type VacuumIdentity } from './fake-vacuum';

const MAP_IV = Uint8Array.from(Buffer.from('ABCDEF1234123412', 'latin1'));
const API_HOST = 'de.api.io.mi.com';
const STORAGE_HOST = 'fds.vacuum.test';
const PRO_PATH = '/v2/home/get_interim_file_url_pro';
const PLAIN_PATH = '/v2/home/get_interim_file_url';
const NULL_FILE = 'This is a null file';
const REQUEST = z.object({ obj_name: z.string() });
const SLOTS = [
  { slot: 0, fixture: 'maps/pv11gl-current.json' },
  { slot: 3, fixture: 'maps/pv11gl-saved.json' },
  { slot: 8, fixture: 'maps/pv11gl-backup.json' },
] as const;

export interface UrlRequest {
  readonly path: string;
  readonly objName: string;
}

export function sealVacuumMap(document: unknown, model: string, did: string): Uint8Array {
  const cipher = createCipheriv('aes-128-cbc', mapKey(model, did), MAP_IV);
  const body = Buffer.concat([
    cipher.update(deflateSync(Buffer.from(JSON.stringify(document)))),
    cipher.final(),
  ]);
  return Buffer.from(JSON.stringify({ version: 2, data: body.toString('base64') }));
}

export class FakeVacuumCloud {
  readonly urlRequests: UrlRequest[] = [];
  readonly downloads: string[] = [];
  readonly objects = new Map<string, Uint8Array>();
  proUnavailable = false;
  private readonly model = pv11glCatalog().model;

  constructor(
    private readonly account: FakeAccount,
    private readonly identity: VacuumIdentity,
  ) {
    for (const { slot, fixture } of SLOTS) {
      this.setMap(vacuumObjectName(identity, slot), readVacuumFixture(fixture, z.unknown()));
    }
  }

  readonly route: Route = (request) => {
    if (request.url.host === STORAGE_HOST) {
      return this.download(request);
    }
    if (request.url.host === API_HOST) {
      const path = request.url.pathname.replace(/^\/app/, '');
      return [PRO_PATH, PLAIN_PATH].includes(path) ? this.api(path, request) : null;
    }
    return null;
  };

  setMap(objName: string, document: unknown): void {
    this.objects.set(objName, sealVacuumMap(document, this.model, this.identity.did));
  }

  setNullFile(objName: string): void {
    this.objects.set(objName, Buffer.from(NULL_FILE));
  }

  private download(request: FakeRequest): Response {
    const objName = decodeURIComponent(request.url.pathname.slice(1));
    const bytes = this.objects.get(objName);
    if (bytes === undefined) {
      return plain(404, 'not found');
    }
    this.downloads.push(objName);
    return new Response(bytes, { status: 200 });
  }

  private api(path: string, request: FakeRequest): Response {
    if (
      request.cookies.get('serviceToken') !== this.account.serviceToken ||
      request.cookies.get('userId') !== USER_ID
    ) {
      return plain(401, 'unauthorized');
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
    const { obj_name: objName } = REQUEST.parse(
      JSON_VALUE.parse(JSON.parse(decryptResponse(SSECURITY, nonce, data))),
    );
    this.urlRequests.push({ path, objName });
    return plain(
      200,
      Buffer.from(
        rc4Drop1024(key, new TextEncoder().encode(JSON.stringify(this.reply(path, objName)))),
      ).toString('base64'),
    );
  }

  private reply(path: string, objName: string): Record<string, unknown> {
    if (path === PRO_PATH && this.proUnavailable) {
      return { code: -6, message: 'invalid config for fds' };
    }
    if (!this.objects.has(objName)) {
      return { code: -8, message: 'invalid object name' };
    }
    const url = `https://${STORAGE_HOST}/${encodeURIComponent(objName)}?Signature=fake`;
    return { code: 0, message: 'ok', result: { url } };
  }
}
