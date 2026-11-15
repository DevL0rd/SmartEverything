import { useSyncExternalStore } from 'react';
import type { LockedUnlocked } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { ValueStore } from '../../../../design/external-store';
import { lockLockedFolder } from '../api';
import { msUntil } from './locked-model';

const session = new ValueStore<LockedUnlocked | null>(null);

let expiry: ReturnType<typeof setTimeout> | null = null;

function stopExpiry(): void {
  if (expiry !== null) clearTimeout(expiry);
  expiry = null;
}

export function openLockedSession(unlocked: LockedUnlocked): void {
  stopExpiry();
  session.set(unlocked);
  expiry = setTimeout(
    () => {
      expiry = null;
      session.set(null);
    },
    msUntil(unlocked.expiresAt, Date.now()),
  );
}

export function closeLockedSession(): void {
  const current = session.get();
  stopExpiry();
  if (current === null) return;
  session.set(null);
  background(lockLockedFolder(current.token), 'photos.locked.lock_failed');
}

export function forgetLockedSession(): void {
  stopExpiry();
  session.set(null);
}

export function lockedSession(): LockedUnlocked | null {
  return session.get();
}

export function subscribeLockedSession(listener: () => void): () => void {
  return session.subscribe(listener);
}

export function useLockedSession(): LockedUnlocked | null {
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}
