import { X509Certificate } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generate } from 'selfsigned';
import { AIBI_HOST } from './host-name';

export interface TlsPair {
  readonly key: string;
  readonly cert: string;
  readonly created: boolean;
}

const KEY_FILE = 'tls.key';
const CERT_FILE = 'tls.crt';
const KEY_BITS = 2048;
const VALID_DAYS = 3650;
const DAY_MS = 86_400_000;
const PRIVATE_MODE = 0o600;
const FOLDER_MODE = 0o700;
const DNS_NAME = 2;

function missing(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (cause) {
    if (missing(cause)) {
      return '';
    }
    throw cause;
  }
}

async function write(path: string, text: string): Promise<void> {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, text, { mode: PRIVATE_MODE });
  await rename(temporary, path);
}

function matches(cert: string): boolean {
  try {
    return new X509Certificate(cert).checkHost(AIBI_HOST) !== undefined;
  } catch (cause) {
    if (cause instanceof Error) {
      return false;
    }
    throw cause;
  }
}

async function created(): Promise<{ readonly key: string; readonly cert: string }> {
  const now = Date.now();
  const pems = await generate([{ name: 'commonName', value: AIBI_HOST }], {
    keySize: KEY_BITS,
    algorithm: 'sha256',
    notBeforeDate: new Date(now - DAY_MS),
    notAfterDate: new Date(now + VALID_DAYS * DAY_MS),
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames: [{ type: DNS_NAME, value: AIBI_HOST }] },
    ],
  });
  return { key: pems.private, cert: pems.cert };
}

export async function tlsPair(folder: string): Promise<TlsPair> {
  const keyFile = join(folder, KEY_FILE);
  const certFile = join(folder, CERT_FILE);
  const [key, cert] = await Promise.all([readOptional(keyFile), readOptional(certFile)]);
  if (key !== '' && cert !== '' && matches(cert)) {
    return { key, cert, created: false };
  }
  await mkdir(folder, { recursive: true, mode: FOLDER_MODE });
  const pair = await created();
  await write(keyFile, pair.key);
  await write(certFile, pair.cert);
  return { ...pair, created: true };
}
