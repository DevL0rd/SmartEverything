import { z } from 'zod';
import { PAIRING_CODE, type PairingQr } from './api/access';
import { HUB_PAIRING_CANDIDATE_URL } from './hub-pairing';
import { HUB_ENDPOINT, HUB_IDENTITY } from './hub-connections';

export const PAIRING_INVITATION_MAX_LENGTH = 4096;
const PAYLOAD = z
  .strictObject({
    url: z.url({ protocol: /^https$/ }),
    code: PAIRING_CODE,
    identity: HUB_IDENTITY,
    endpoints: z.array(HUB_ENDPOINT).min(1).max(2),
  })
  .refine((value) => value.endpoints.some((endpoint) => endpoint.url === value.url));
export type PairingInvitation = z.infer<typeof PAYLOAD>;
export type PairingInvitationParse =
  | { readonly ok: true; readonly invitation: PairingInvitation }
  | { readonly ok: false; readonly problem: string };

function encoded(payload: PairingInvitation): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');
}
function decoded(text: string): unknown {
  const base64 = text.replace(/-/gu, '+').replace(/_/gu, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const value: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(binary, (letter) => letter.charCodeAt(0)),
    ),
  );
  return value;
}
function exactOrigin(value: string): string | null {
  const url = new URL(value);
  return url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    url.pathname === '/'
    ? url.origin
    : null;
}
function matchesRoute(url: URL, payload: PairingInvitation): boolean {
  if (url.username !== '' || url.password !== '' || url.search !== '') return false;
  if (url.protocol === 'smarteverything:') return url.host === 'pair' && url.pathname === '';
  return (
    url.protocol === 'https:' &&
    url.pathname === '/pair' &&
    payload.endpoints.some(
      (endpoint) => endpoint.kind === 'remote' && exactOrigin(endpoint.url) === url.origin,
    )
  );
}
function validEndpoints(payload: PairingInvitation): boolean {
  return payload.endpoints.every(
    (endpoint) => exactOrigin(endpoint.url) !== null && endpoint.kind !== 'loopback',
  );
}
function boundedInvitation(text: string): boolean {
  return text.length <= PAIRING_INVITATION_MAX_LENGTH && URL.canParse(text);
}
export function parsePairingInvitation(text: string): PairingInvitationParse {
  const refused = { ok: false, problem: 'That is not a SmartEverything invitation' } as const;
  if (!boundedInvitation(text)) return refused;
  try {
    const url = new URL(text);
    const fragment = /^#invite=([A-Za-z0-9_-]+)$/u.exec(url.hash);
    const code = fragment === null ? undefined : fragment[1];
    if (code === undefined) return refused;
    const payload = PAYLOAD.safeParse(decoded(code));
    if (!payload.success || !matchesRoute(url, payload.data) || encoded(payload.data) !== code)
      return refused;
    if (!validEndpoints(payload.data)) return refused;
    return { ok: true, invitation: payload.data };
  } catch (error) {
    if (error instanceof Error) return refused;
    throw error;
  }
}
function invitationRoute(qr: PairingInvitation, https: boolean): string | null {
  if (!https) return 'smarteverything://pair';
  const remote = qr.endpoints.find((endpoint) => endpoint.kind === 'remote');
  if (remote === undefined) return null;
  const origin = exactOrigin(remote.url);
  return origin === null ? null : `${origin}/pair`;
}
function minimalInvitation(qr: PairingQr): PairingInvitation | null {
  const remote = qr.endpoints.find((endpoint) => endpoint.kind === 'remote');
  const lan = qr.endpoints.find(
    (endpoint) =>
      endpoint.kind === 'lan' && HUB_PAIRING_CANDIDATE_URL.safeParse(endpoint.url).success,
  );
  const endpoints = [remote, lan].filter((endpoint) => endpoint !== undefined);
  const url = remote?.url ?? lan?.url;
  const parsed = PAYLOAD.safeParse({ url, code: qr.code, identity: qr.identity, endpoints });
  return parsed.success ? parsed.data : null;
}
export function pairingInvitationText(qr: PairingQr, https = false): string | null {
  const payload = minimalInvitation(qr);
  if (payload === null) return null;
  const route = invitationRoute(payload, https);
  if (route === null) return null;
  const text = `${route}#invite=${encoded(payload)}`;
  return text.length <= PAIRING_INVITATION_MAX_LENGTH && parsePairingInvitation(text).ok
    ? text
    : null;
}
