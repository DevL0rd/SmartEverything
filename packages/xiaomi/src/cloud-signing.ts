import type { XIAOMI_REGIONS } from '@smarteverything/domain';
import { bytesToUtf8, digest, utf8ToBytes } from './bytes';
import { rc4Drop1024 } from './rc4';

export type XiaomiRegion = (typeof XIAOMI_REGIONS)[number];

export type HttpMethod = 'GET' | 'POST';

export interface SignedRequest {
  readonly method: HttpMethod;
  readonly path: string;
  readonly data: string;
  readonly ssecurity: string;
  readonly nonce: Uint8Array;
}

export type FormFields = readonly (readonly [string, string])[];

const NONCE_RANDOM_LENGTH = 8;
const MILLISECONDS_PER_MINUTE = 60_000;

export function regionalHost(region: XiaomiRegion, host: string): string {
  return region === 'cn' ? `https://${host}` : `https://${region}.${host}`;
}

export function apiBaseUrl(region: XiaomiRegion): string {
  return `${regionalHost(region, 'api.io.mi.com')}/app`;
}

export function createNonce(random: Uint8Array, nowMs: number): Uint8Array {
  const nonce = new Uint8Array(NONCE_RANDOM_LENGTH + 4);
  nonce.set(random);
  new DataView(nonce.buffer).setUint32(
    NONCE_RANDOM_LENGTH,
    Math.floor(nowMs / MILLISECONDS_PER_MINUTE),
  );
  return nonce;
}

export function signedNonce(ssecurity: string, nonce: Uint8Array): Uint8Array {
  return digest('sha256', Uint8Array.fromBase64(ssecurity), nonce);
}

export function signFields(
  request: Pick<SignedRequest, 'method' | 'path'>,
  fields: FormFields,
  key: Uint8Array,
): string {
  const parts = [
    request.method,
    request.path,
    ...fields.map(([name, value]) => `${name}=${value}`),
  ];
  return digest('sha1', utf8ToBytes([...parts, key.toBase64()].join('&'))).toBase64();
}

function encrypt(key: Uint8Array, text: string): string {
  return rc4Drop1024(key, utf8ToBytes(text)).toBase64();
}

export function encryptRequest(request: SignedRequest): FormFields {
  const key = signedNonce(request.ssecurity, request.nonce);
  const hash = signFields(request, [['data', request.data]], key);
  const encrypted: FormFields = [
    ['data', encrypt(key, request.data)],
    ['rc4_hash__', encrypt(key, hash)],
  ];
  return [
    ...encrypted,
    ['signature', signFields(request, encrypted, key)],
    ['_nonce', request.nonce.toBase64()],
  ];
}

export function decryptResponse(ssecurity: string, nonce: Uint8Array, body: string): string {
  return bytesToUtf8(rc4Drop1024(signedNonce(ssecurity, nonce), Uint8Array.fromBase64(body)));
}
