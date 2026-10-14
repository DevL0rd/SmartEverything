import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';
import { HUB_ENDPOINT, HUB_IDENTITY } from '../hub-connections';

export const CLIENT_TOKEN = z.string().regex(/^set_[0-9a-f]{64}$/);

export function createClientToken(): string {
  return `set_${bytesToHex(randomBytes(32))}`;
}

export function hashClientToken(token: string): string {
  return bytesToHex(sha256(utf8ToBytes(CLIENT_TOKEN.parse(token))));
}

const PAIRING_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const PAIRING_CODE = z.string().regex(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);

export function createPairingCode(): string {
  const letters = [...randomBytes(8)].map((byte) =>
    PAIRING_ALPHABET.charAt(byte % PAIRING_ALPHABET.length),
  );
  return `${letters.slice(0, 4).join('')}-${letters.slice(4).join('')}`;
}

export function hashPairingCode(code: string): string {
  return bytesToHex(sha256(utf8ToBytes(PAIRING_CODE.parse(code))));
}

export const LEGACY_PAIRING_QR = z.strictObject({
  url: z.url({ protocol: /^https$/ }),
  code: PAIRING_CODE,
});

export const PAIRING_QR = LEGACY_PAIRING_QR.extend({
  identity: HUB_IDENTITY.optional(),
  endpoints: z.array(HUB_ENDPOINT).min(1).max(32).optional(),
}).refine(
  (value) => (value.identity === undefined) === (value.endpoints === undefined),
  'Pairing identity and endpoint inventory must be supplied together',
);

export type PairingQr = z.infer<typeof PAIRING_QR>;

export const LIVE_PROTOCOL = 'smarteverything.live.v1';

export const BEARER_PROTOCOL_PREFIX = 'bearer.';

export function liveProtocols(token: string): readonly [string, string] {
  return [LIVE_PROTOCOL, `${BEARER_PROTOCOL_PREFIX}${CLIENT_TOKEN.parse(token)}`];
}

export const SIGNED_LINK = z.strictObject({
  expires: z.coerce.number().int().positive(),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});

export type SignedLink = z.infer<typeof SIGNED_LINK>;

export const MEDIA_SIZES = ['full', 'thumb'] as const;

export type MediaSize = (typeof MEDIA_SIZES)[number];

export const MEDIA_SIZE = z.enum(MEDIA_SIZES);

export const THUMBNAIL_WIDTH = 480;

export const SIGNED_IMAGE_LINK = SIGNED_LINK.extend({ size: MEDIA_SIZE });

export type SignedImageLink = z.infer<typeof SIGNED_IMAGE_LINK>;

export const MEDIA_PATHS = {
  recording: '/media/recordings/:recordingId',
  cameraStream: '/media/cameras/:deviceId/mse',
  cameraSnapshot: '/media/cameras/:deviceId/snapshot',
  talkMessage: '/media/talk/:messageId',
  assistantAttachment: '/media/assistant/:attachmentId',
  live: '/live',
  publicUrlProbe: '/.well-known/smarteverything/:nonce',
} as const;

export {
  PAIRING_INVITATION_MAX_LENGTH,
  parsePairingInvitation,
  pairingInvitationText,
} from '../pairing-invitation';
export type { PairingInvitation, PairingInvitationParse } from '../pairing-invitation';
