import { hmac } from '@noble/hashes/hmac.js';
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

export const PAIRING_NONCE = z.string().regex(/^[0-9a-f]{32}$/);

export const PAIRING_PROOF = z.string().regex(/^[0-9a-f]{64}$/);

export type PairingProofSide = 'client' | 'hub';

export function pairingProof(
  codeHash: string,
  side: PairingProofSide,
  certificateSha256: string,
  nonce: string,
): string {
  return bytesToHex(
    hmac(sha256, utf8ToBytes(codeHash), utf8ToBytes(`${side}:${certificateSha256}:${nonce}`)),
  );
}

export const PAIRING_QR = z.strictObject({
  url: z.url({ protocol: /^https$/ }),
  code: PAIRING_CODE,
  identity: HUB_IDENTITY,
  endpoints: z.array(HUB_ENDPOINT).min(1).max(32),
});

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

export const CAMERA_QUALITIES = ['full', 'tile'] as const;

export type CameraQuality = (typeof CAMERA_QUALITIES)[number];

export const CAMERA_QUALITY = z.enum(CAMERA_QUALITIES);

export const THUMBNAIL_WIDTH = 480;

export const SIGNED_IMAGE_LINK = SIGNED_LINK.extend({ size: MEDIA_SIZE });

export type SignedImageLink = z.infer<typeof SIGNED_IMAGE_LINK>;

export const MEDIA_PATHS = {
  recording: '/media/recordings/:recordingId',
  cameraStream: '/media/cameras/:deviceId/mse',
  cameraSnapshot: '/media/cameras/:deviceId/snapshot',
  talkMessage: '/media/talk/:messageId',
  assistantAttachment: '/media/assistant/:attachmentId',
  computerDownload: '/media/computers/:deviceId/downloads/:ticketId',
  machineUpdate: '/media/machine-updates/:file',
  live: '/live',
  publicUrlProbe: '/.well-known/smarteverything/:nonce',
} as const;
