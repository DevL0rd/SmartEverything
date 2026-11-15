import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { LockedPin } from '../../store/repositories/photo-locked';

const SALT_BYTES = 16;
const KEY_BYTES = 64;

function derive(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, KEY_BYTES, (failure, key) => {
      if (failure === null) resolve(key);
      else reject(failure);
    });
  });
}

export async function hashPin(pin: string): Promise<LockedPin> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(pin, salt);
  return { hash: key.toString('hex'), salt: salt.toString('hex') };
}

export async function pinMatches(stored: LockedPin, pin: string): Promise<boolean> {
  const derived = await derive(pin, Buffer.from(stored.salt, 'hex'));
  return timingSafeEqual(Buffer.from(stored.hash, 'hex'), derived);
}
