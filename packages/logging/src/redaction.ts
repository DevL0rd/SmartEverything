import { REDACTED, type LogPayload } from './payload';

const SECRET_WORDS: ReadonlySet<string> = new Set([
  'password',
  'passwd',
  'passphrase',
  'secret',
  'token',
  'authorization',
  'cookie',
  'credential',
  'credentials',
  'apikey',
  'otp',
]);

const KEY_OWNERS: ReadonlySet<string> = new Set(['api', 'private', 'access', 'secret', 'signing']);

function wordsOf(name: string): readonly string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
}

export function isSecretName(name: string): boolean {
  const words = wordsOf(name);
  if (words.some((word) => SECRET_WORDS.has(word))) return true;
  if (words.length === 1 && words[0] === 'key') return true;
  return words.some((word, index) => word === 'key' && KEY_OWNERS.has(words[index - 1] ?? ''));
}

function redactedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactedValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([name, entry]) => [
      name,
      isSecretName(name) ? REDACTED : redactedValue(entry),
    ]),
  );
}

export function redactedPayload(payload: LogPayload): LogPayload {
  return Object.fromEntries(
    Object.entries(payload).map(([name, entry]) => [
      name,
      isSecretName(name) ? REDACTED : redactedValue(entry),
    ]),
  );
}
