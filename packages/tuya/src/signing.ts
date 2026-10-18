import { hmacSha256Hex, sha256Hex } from './crypto';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export const SIGN_METHOD = 'HMAC-SHA256';

export interface CloudRequest {
  readonly method: HttpMethod;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly body: string;
  readonly signatureHeaders: Readonly<Record<string, string>>;
}

export interface SigningInput {
  readonly clientId: string;
  readonly secret: string;
  readonly accessToken: string | null;
  readonly t: number;
  readonly nonce: string;
  readonly request: CloudRequest;
}

export function contentSha256(body: string): string {
  return sha256Hex(body);
}

export function canonicalUrl(path: string, query: Readonly<Record<string, string>>): string {
  const pairs = Object.keys(query)
    .sort()
    .map((key) => `${key}=${String(query[key])}`);
  return pairs.length === 0 ? path : `${path}?${pairs.join('&')}`;
}

export function stringToSign(request: CloudRequest): string {
  const headers = Object.entries(request.signatureHeaders)
    .map(([name, value]) => `${name}:${value}\n`)
    .join('');
  return [
    request.method,
    contentSha256(request.body),
    headers,
    canonicalUrl(request.path, request.query),
  ].join('\n');
}

export function sign(input: SigningInput): string {
  const message = [
    input.clientId,
    input.accessToken ?? '',
    String(input.t),
    input.nonce,
    stringToSign(input.request),
  ].join('');
  return hmacSha256Hex(input.secret, message).toUpperCase();
}

export function signedHeaders(input: SigningInput): Readonly<Record<string, string>> {
  const names = Object.keys(input.request.signatureHeaders);
  return {
    ...input.request.signatureHeaders,
    ...(names.length === 0 ? {} : { 'Signature-Headers': names.join(':') }),
    ...(input.accessToken === null ? {} : { access_token: input.accessToken }),
    client_id: input.clientId,
    sign: sign(input),
    sign_method: SIGN_METHOD,
    t: String(input.t),
    nonce: input.nonce,
  };
}
