import { createHash, verify, X509Certificate, type KeyObject } from 'node:crypto';

export const KEY_HOST = 'https://key.smartthings.com';

export const SIGNED_HEADERS = ['(request-target)', 'digest', 'date'] as const;

export const SIGNATURE_ALGORITHM = 'rsa-sha256';

export const DATE_SKEW_MS = 5 * 60 * 1000;

export class WebhookSignatureError extends Error {
  override readonly name = 'WebhookSignatureError';

  constructor(readonly reason: string) {
    super(`The SmartThings webhook request was refused: ${reason}.`);
  }
}

export interface SignatureParameters {
  readonly keyId: string;
  readonly signature: string;
  readonly headers: readonly string[];
  readonly algorithm: string;
}

export interface SignedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: Uint8Array;
}

const PARAMETER = /[a-zA-Z]+="[^"]*"/g;

const KEY_ID = /^\/[A-Za-z0-9._~\-/]+$/;

function parametersOf(authorization: string): ReadonlyMap<string, string> {
  if (!authorization.startsWith('Signature ')) {
    throw new WebhookSignatureError('the Authorization header is not an HTTP signature');
  }
  const entries = [...authorization.matchAll(PARAMETER)].map(([text]) => {
    const equals = text.indexOf('=');
    return [text.slice(0, equals), text.slice(equals + 2, -1)] as const;
  });
  return new Map(entries);
}

function required(parameters: ReadonlyMap<string, string>, name: string): string {
  const value = parameters.get(name) ?? '';
  if (value === '') {
    throw new WebhookSignatureError(`the signature has no ${name}`);
  }
  return value;
}

export function parseSignatureHeader(authorization: string | undefined): SignatureParameters {
  if (authorization === undefined) {
    throw new WebhookSignatureError('it carries no Authorization header');
  }
  const parameters = parametersOf(authorization);
  const keyId = required(parameters, 'keyId');
  const algorithm = required(parameters, 'algorithm').toLowerCase();
  const headers = required(parameters, 'headers').toLowerCase().split(' ');
  if (algorithm !== SIGNATURE_ALGORITHM) {
    throw new WebhookSignatureError(`the signature algorithm ${algorithm} is not rsa-sha256`);
  }
  const missing = SIGNED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new WebhookSignatureError(`the signature does not cover ${missing.join(', ')}`);
  }
  return { keyId, signature: required(parameters, 'signature'), headers, algorithm };
}

export function keyUrl(keyId: string): string {
  if (!KEY_ID.test(keyId) || keyId.split('/').includes('..')) {
    throw new WebhookSignatureError(`the key id ${JSON.stringify(keyId)} is not a key path`);
  }
  return `${KEY_HOST}${keyId}`;
}

export function publicKeyOf(certificate: string): KeyObject {
  try {
    return new X509Certificate(certificate).publicKey;
  } catch (cause) {
    throw new WebhookSignatureError(
      `the key server answered with something other than a certificate (${String(cause)})`,
    );
  }
}

function headerValue(request: SignedRequest, name: string): string {
  const value = request.headers[name];
  if (value === undefined) {
    throw new WebhookSignatureError(`the signed header ${name} is missing`);
  }
  return value;
}

export function signingString(request: SignedRequest, headers: readonly string[]): string {
  return headers
    .map((name) =>
      name === '(request-target)'
        ? `(request-target): ${request.method.toLowerCase()} ${request.path}`
        : `${name}: ${headerValue(request, name)}`,
    )
    .join('\n');
}

export function bodyDigest(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('base64');
}

export function checkDigest(header: string | undefined, body: Uint8Array): void {
  const match = /^sha-?256=(.+)$/i.exec(String(header));
  if (match === null) {
    throw new WebhookSignatureError('the Digest header is not a SHA-256 digest');
  }
  if (match[1] !== bodyDigest(body)) {
    throw new WebhookSignatureError('the Digest header does not match the body');
  }
}

export function checkDate(header: string | undefined, now: Date): void {
  const sent = Date.parse(String(header));
  if (Number.isNaN(sent)) {
    throw new WebhookSignatureError('the Date header is not a date');
  }
  if (Math.abs(now.getTime() - sent) > DATE_SKEW_MS) {
    throw new WebhookSignatureError(
      `the Date header is ${String(Math.round((now.getTime() - sent) / 1000))} seconds from now`,
    );
  }
}

export function verifySignedRequest(
  request: SignedRequest,
  signature: SignatureParameters,
  publicKey: KeyObject,
  now: Date,
): void {
  checkDigest(request.headers['digest'], request.body);
  checkDate(request.headers['date'], now);
  const data = Buffer.from(signingString(request, signature.headers));
  if (!verify('sha256', data, publicKey, Buffer.from(signature.signature, 'base64'))) {
    throw new WebhookSignatureError('the signature does not match the SmartThings key');
  }
}
