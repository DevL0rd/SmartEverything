import { createHash, randomBytes } from 'node:crypto';

export interface Credentials {
  readonly user: string;
  readonly password: string;
}

export function basicHeader(credentials: Credentials): string {
  return `Basic ${Buffer.from(`${credentials.user}:${credentials.password}`).toString('base64')}`;
}

interface DigestChallenge {
  readonly realm: string;
  readonly nonce: string;
  readonly opaque: string | null;
  readonly algorithm: 'MD5' | 'SHA-256';
  readonly qop: boolean;
}

const PARAMETER = /(\w+)=(?:"([^"]*)"|([^\s,]+))/gu;

function parameters(text: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const match of text.matchAll(PARAMETER)) {
    const [, key, quoted, bare] = match;
    if (key !== undefined) found.set(key.toLowerCase(), quoted ?? bare ?? '');
  }
  return found;
}

export function authenticationScheme(challenge: string): 'basic' | 'digest' | null {
  const word = challenge.trim().split(/\s+/u)[0]?.toLowerCase();
  return word === 'basic' || word === 'digest' ? word : null;
}

function digestChallenge(challenge: string): DigestChallenge | null {
  const values = parameters(challenge);
  const realm = values.get('realm');
  const nonce = values.get('nonce');
  if (realm === undefined || nonce === undefined) return null;
  const algorithm =
    (values.get('algorithm') ?? 'MD5').toUpperCase() === 'SHA-256' ? 'SHA-256' : 'MD5';
  return {
    realm,
    nonce,
    opaque: values.get('opaque') ?? null,
    algorithm,
    qop: (values.get('qop') ?? '').split(',').some((option) => option.trim() === 'auth'),
  };
}

function hash(algorithm: DigestChallenge['algorithm'], text: string): string {
  return createHash(algorithm === 'MD5' ? 'md5' : 'sha256')
    .update(text)
    .digest('hex');
}

export interface DigestRequest {
  readonly method: string;
  readonly path: string;
  readonly credentials: Credentials;
  readonly count: number;
  readonly clientNonce?: string;
}

export function digestHeader(challenge: string, request: DigestRequest): string | null {
  const parsed = digestChallenge(challenge);
  if (parsed === null) return null;
  const { credentials, path } = request;
  const clientNonce = request.clientNonce ?? randomBytes(8).toString('hex');
  const count = request.count.toString(16).padStart(8, '0');
  const first = hash(
    parsed.algorithm,
    `${credentials.user}:${parsed.realm}:${credentials.password}`,
  );
  const second = hash(parsed.algorithm, `${request.method}:${path}`);
  const response = parsed.qop
    ? hash(parsed.algorithm, `${first}:${parsed.nonce}:${count}:${clientNonce}:auth:${second}`)
    : hash(parsed.algorithm, `${first}:${parsed.nonce}:${second}`);
  const fields = [
    `username="${credentials.user}"`,
    `realm="${parsed.realm}"`,
    `nonce="${parsed.nonce}"`,
    `uri="${path}"`,
    `algorithm=${parsed.algorithm}`,
    `response="${response}"`,
    ...(parsed.qop ? [`qop=auth`, `nc=${count}`, `cnonce="${clientNonce}"`] : []),
    ...(parsed.opaque === null ? [] : [`opaque="${parsed.opaque}"`]),
  ];
  return `Digest ${fields.join(', ')}`;
}
