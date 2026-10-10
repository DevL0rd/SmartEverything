import { z } from 'zod';
import { PAIRING_CODE, PAIRING_QR } from '@smarteverything/domain';
import { jsonText } from '../format/json-text';

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]']);

export interface PairingTarget {
  readonly url: string;
  readonly code: string;
}

export type PairingInput =
  | { readonly ok: true; readonly target: PairingTarget }
  | { readonly ok: false; readonly problem: string };

export function serverUrlProblem(url: string, allowPlainHttp: boolean): string | null {
  const parsed = z.url({ protocol: /^https?$/ }).safeParse(url);
  if (!parsed.success) {
    return 'Enter an address that starts with https://';
  }
  const address = new URL(parsed.data);
  if (address.search !== '' || address.hash !== '') {
    return 'Remove everything after the address';
  }
  if (address.protocol === 'http:' && !allowPlainHttp && !LOOPBACK_HOSTS.has(address.hostname)) {
    return 'Use https:// for a server on another computer';
  }
  return null;
}

function normalServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export type ServerAddress =
  { readonly ok: true; readonly url: string } | { readonly ok: false; readonly problem: string };

export function serverAddressOf(typed: string, allowPlainHttp: boolean): ServerAddress {
  const trimmed = typed.trim();
  if (trimmed === '') {
    return { ok: false, problem: 'Enter your server address' };
  }
  const url = normalServerUrl(
    /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
  );
  const problem = serverUrlProblem(url, allowPlainHttp);
  if (problem !== null) {
    return { ok: false, problem };
  }
  const address = new URL(url);
  return { ok: true, url: normalServerUrl(`${address.origin}${address.pathname}`) };
}

export function normalPairingCode(code: string): string {
  const letters = code.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return letters.length === 8 ? `${letters.slice(0, 4)}-${letters.slice(4)}` : code.trim();
}

export function pairingFromTyped(url: string, code: string, allowPlainHttp: boolean): PairingInput {
  const address = normalServerUrl(url);
  const urlProblem = serverUrlProblem(address, allowPlainHttp);
  if (urlProblem !== null) {
    return { ok: false, problem: urlProblem };
  }
  const normal = normalPairingCode(code);
  if (!PAIRING_CODE.safeParse(normal).success) {
    return {
      ok: false,
      problem: 'Enter the 8-character code from your desktop',
    };
  }
  return { ok: true, target: { url: address, code: normal } };
}

export function pairingFromScan(text: string): PairingInput {
  const read = jsonText(text);
  const scanned = PAIRING_QR.safeParse(read.ok ? read.value : null);
  if (!scanned.success) {
    return {
      ok: false,
      problem: 'That is not a SmartEverything pairing code',
    };
  }
  return pairingFromTyped(scanned.data.url, scanned.data.code, false);
}

export function pairingQrText(target: PairingTarget): string {
  return JSON.stringify(PAIRING_QR.parse(target));
}
