import { PrinterError } from '@smarteverything/domain';

const DEFAULT_PORTS: Readonly<Record<string, number>> = {
  'ipp:': 631,
  'ipps:': 631,
  'http:': 80,
  'https:': 443,
};
const SECURE_SCHEMES: ReadonlySet<string> = new Set(['ipps:', 'https:']);
const DEFAULT_PATH = '/ipp/print';
const FALLBACK_PATHS: readonly string[] = [DEFAULT_PATH, '/ipp'];

export interface PrinterAddress {
  readonly uri: string;
  readonly url: URL;
  readonly secure: boolean;
}

function refused(text: string): PrinterError {
  return new PrinterError(
    'unreachable',
    `"${text}" is not a printer address: expected ipp://host[:port]/path or ipps://host[:port]/path`,
    { received: text },
  );
}

function urlOf(text: string): URL {
  const trimmed = text.trim();
  const full = /^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed) ? trimmed : `ipp://${trimmed}`;
  if (!URL.canParse(full)) throw refused(text);
  const parsed = new URL(full);
  if (parsed.hostname === '' || DEFAULT_PORTS[parsed.protocol] === undefined) throw refused(text);
  return parsed;
}

function build(parsed: URL, host: string, port: number, path: string): PrinterAddress {
  const secure = SECURE_SCHEMES.has(parsed.protocol);
  return {
    uri: `${secure ? 'ipps' : 'ipp'}://${host}:${String(port)}${path}`,
    url: new URL(`${secure ? 'https' : 'http'}://${host}:${String(port)}${path}`),
    secure,
  };
}

export function portOf(url: URL): number {
  if (url.port !== '') return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

export function parseAddress(text: string): PrinterAddress {
  const parsed = urlOf(text);
  const port = parsed.port === '' ? (DEFAULT_PORTS[parsed.protocol] ?? 631) : Number(parsed.port);
  const path = parsed.pathname === '/' ? DEFAULT_PATH : parsed.pathname;
  return build(parsed, parsed.hostname, port, path);
}

export function candidatePaths(address: PrinterAddress): readonly PrinterAddress[] {
  const paths = [...new Set([address.url.pathname, ...FALLBACK_PATHS])];
  return paths.map((path) => build(address.url, address.url.hostname, portOf(address.url), path));
}

export function withHost(address: PrinterAddress, host: string, port: number): PrinterAddress {
  return build(address.url, host, port, address.url.pathname);
}
