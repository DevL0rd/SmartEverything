import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const SECRET_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{20,}/u,
  /AIza[0-9A-Za-z_-]{35}/u,
  /AKIA[0-9A-Z]{16}/u,
  /gh[pousr]_[A-Za-z0-9]{36}/u,
  /xox[baprs]-[A-Za-z0-9-]{10,}/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\bBearer [A-Za-z0-9._-]{24,}/u,
];

const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)/iu;
const MINIMUM_SECRET_LENGTH = 8;
const KEYS_FOLDER = join('system', 'keys');

export interface Leak {
  readonly file: string;
  readonly what: string;
}

export function environmentSecrets(
  environment: Readonly<Record<string, string | undefined>>,
): string[] {
  return Object.entries(environment)
    .filter(
      (entry): entry is [string, string] =>
        SECRET_NAME.test(entry[0]) && (entry[1]?.length ?? 0) >= MINIMUM_SECRET_LENGTH,
    )
    .map((entry) => entry[1]);
}

export function textLeaks(text: string, forbidden: readonly string[]): string[] {
  const found: string[] = [];
  for (const value of forbidden)
    if (value !== '' && text.includes(value)) found.push('a forbidden value');
  for (const pattern of SECRET_PATTERNS) if (pattern.test(text)) found.push(pattern.source);
  return found;
}

async function scanFile(path: string, forbidden: readonly string[]): Promise<string[]> {
  const found = new Set<string>();
  const overlap = Math.max(256, ...forbidden.map((value) => value.length));
  let carry = '';
  for await (const chunk of createReadStream(path, {
    encoding: 'latin1',
    highWaterMark: 1 << 20,
  })) {
    const text = carry + String(chunk);
    for (const hit of textLeaks(text, forbidden)) found.add(hit);
    carry = text.slice(-overlap);
  }
  return [...found];
}

async function filesIn(folder: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) out.push(...(await filesIn(path)));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

export async function scanFolder(
  base: string,
  data: string,
  forbidden: readonly string[],
  skip: readonly string[] = [],
): Promise<Leak[]> {
  const leaks: Leak[] = [];
  for (const file of await filesIn(base)) {
    const inData = relative(data, file);
    if (!inData.startsWith('..') && inData.startsWith(KEYS_FOLDER)) continue;
    if (skip.some((prefix) => file.startsWith(prefix))) continue;
    for (const what of await scanFile(file, forbidden))
      leaks.push({ file: relative(base, file), what });
  }
  return leaks;
}

export function redact(text: string, secrets: readonly string[]): string {
  return secrets.reduce(
    (out, secret) => (secret === '' ? out : out.split(secret).join('[redacted]')),
    text,
  );
}
