import type { IncomingMessage } from 'node:http';
import {
  MEDIA_PATHS,
  SIGNED_IMAGE_LINK,
  SIGNED_LINK,
  type NativeHubResourceOpen,
} from '@smarteverything/domain';
import { HubTransportError } from './policy.js';

const MAX_LIFETIME_MS = 10 * 60 * 1000;
const REQUEST_HEADERS = [
  'range',
  'if-range',
  'if-none-match',
  'if-modified-since',
  'if-match',
  'if-unmodified-since',
] as const;
const RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'content-encoding',
  'accept-ranges',
  'etag',
  'last-modified',
] as const;
const PURPOSE_PATHS = {
  image: [MEDIA_PATHS.recording, MEDIA_PATHS.cameraSnapshot, MEDIA_PATHS.assistantAttachment],
  audio: [MEDIA_PATHS.talkMessage, MEDIA_PATHS.assistantAttachment],
  recording: [MEDIA_PATHS.recording],
  attachment: [MEDIA_PATHS.assistantAttachment],
} as const;

function validateIdentity(input: NativeHubResourceOpen, url: URL): void {
  if (
    url.href !== input.url ||
    url.origin !== input.binding.canonicalOrigin ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    input.scopeId !== input.binding.scopeId
  )
    throw new HubTransportError('Resource canonical identity or exact URL is invalid');
}
function validateExpiry(input: NativeHubResourceOpen, url: URL): void {
  const values = [...url.searchParams];
  const signed = (url.searchParams.has('size') ? SIGNED_IMAGE_LINK : SIGNED_LINK).parse(
    Object.fromEntries(values),
  );
  const expiry = signed.expires * 1000;
  if (
    new Set(values.map(([key]) => key)).size !== values.length ||
    Date.parse(input.expiresAt) !== expiry ||
    expiry <= Date.now() ||
    expiry > Date.now() + MAX_LIFETIME_MS
  )
    throw new HubTransportError('Resource signed expiry or exact query is invalid');
}
export function validateResource(input: NativeHubResourceOpen): void {
  const url = new URL(input.url);
  validateIdentity(input, url);
  validateExpiry(input, url);
  const allowed = PURPOSE_PATHS[input.purpose].some((template) => {
    const pattern = template.replace(/:[^/]+/g, '[A-Za-z0-9_-]+');
    return new RegExp(`^${pattern}$`).test(url.pathname);
  });
  const requiresSize =
    url.pathname.startsWith('/media/recordings/') || url.pathname.endsWith('/snapshot');
  if (!allowed || (requiresSize && !url.searchParams.has('size')))
    throw new HubTransportError('Resource purpose does not permit this signed media path');
}

function uniqueHeaders(request: IncomingMessage): void {
  const names = request.rawHeaders
    .filter((_value, index) => index % 2 === 0)
    .map((name) => name.toLowerCase());
  if (new Set(names).size !== names.length || names.length > 32)
    throw new HubTransportError('Resource request has duplicate or excessive headers');
}

function validateRequest(request: IncomingMessage, host: string, origin: string): void {
  const forbidden = [
    'content-length',
    'transfer-encoding',
    'authorization',
    'cookie',
    'upgrade',
    'expect',
    'proxy-authorization',
    'trailer',
    'te',
  ];
  if (
    !['GET', 'HEAD'].includes(request.method ?? '') ||
    request.headers.host !== host ||
    forbidden.some((name) => request.headers[name] !== undefined)
  )
    throw new HubTransportError('Resource request method, Host or body headers are refused');
  if (request.headers.origin !== undefined && request.headers.origin !== origin)
    throw new HubTransportError('Resource request origin is refused');
  const connection = request.headers.connection;
  if (connection !== undefined && !['close', 'keep-alive'].includes(connection.toLowerCase()))
    throw new HubTransportError('Resource connection header is refused');
}

function validateContext(request: IncomingMessage, origin: string): void {
  const browser = Object.keys(request.headers).some((name) => name.startsWith('sec-fetch-'));
  if (browser && request.headers.origin !== origin && request.headers.referer === undefined)
    throw new HubTransportError('Browser media requires its exact app origin or referrer');
}

export function resourceRequestHeaders(
  request: IncomingMessage,
  host: string,
  origin: string,
): Record<string, string> {
  uniqueHeaders(request);
  validateRequest(request, host, origin);
  validateContext(request, origin);
  const referrer = request.headers.referer;
  if (
    referrer !== undefined &&
    (!URL.canParse(referrer) ||
      `${new URL(referrer).protocol}//${new URL(referrer).host}` !== origin)
  )
    throw new HubTransportError('Resource request referrer is refused');
  if (['document', 'iframe'].includes(request.headers['sec-fetch-dest'] ?? ''))
    throw new HubTransportError('Resource grants cannot be navigated');
  return Object.fromEntries(
    REQUEST_HEADERS.flatMap((name) => {
      const value = request.headers[name];
      if (value === undefined) return [];
      if (typeof value !== 'string' || value.length > 2048)
        throw new HubTransportError('Resource representation header is invalid');
      return [[name, value]];
    }),
  );
}

export function resourceResponseHeaders(response: IncomingMessage): Record<string, string> {
  const nominated = new Set(
    (response.headers.connection ?? '')
      .toLowerCase()
      .split(',')
      .map((name) => name.trim()),
  );
  return Object.fromEntries(
    RESPONSE_HEADERS.flatMap((name) => {
      const value = response.headers[name];
      return typeof value === 'string' && !nominated.has(name) ? [[name, value]] : [];
    }),
  );
}
