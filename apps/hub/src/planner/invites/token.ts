import { createHmac, randomBytes } from 'node:crypto';
import type { SecretStore } from '../../secrets/store';
import { hashGuestToken } from '../guests/guest-list';

const KEY_REFERENCE = 'planner.invite_key';
const KEY_BYTES = 32;

export type InviteKeys = Pick<SecretStore, 'apiKey' | 'saveApiKey'>;

export async function ensureInviteKey(secrets: InviteKeys): Promise<void> {
  if (secrets.apiKey(KEY_REFERENCE) !== null) return;
  await secrets.saveApiKey(KEY_REFERENCE, randomBytes(KEY_BYTES).toString('hex'));
}

export function inviteKeyOf(secrets: Pick<SecretStore, 'apiKey'>): Buffer {
  const stored = secrets.apiKey(KEY_REFERENCE);
  if (stored === null) throw new Error('The invitation key was not stored before the hub started.');
  return Buffer.from(stored, 'hex');
}

export function inviteToken(key: Uint8Array, guestId: string): string {
  return createHmac('sha256', key).update(`rsvp:${guestId}`).digest('base64url');
}

export function inviteTokenHash(key: Uint8Array, guestId: string): string {
  return hashGuestToken(inviteToken(key, guestId));
}
