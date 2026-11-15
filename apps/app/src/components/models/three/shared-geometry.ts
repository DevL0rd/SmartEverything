import type { BufferGeometry } from 'three';

interface SharedGeometry {
  readonly geometry: BufferGeometry;
  users: number;
  pins: number;
}

const SHARED = new Map<string, SharedGeometry>();

function settle(key: string, entry: SharedGeometry): void {
  if (entry.users === 0 && entry.pins === 0) SHARED.delete(key);
}

export function acquireGeometry(key: string, make: () => BufferGeometry): BufferGeometry {
  const known = SHARED.get(key);
  const entry = known ?? { geometry: make(), users: 0, pins: 0 };
  if (known === undefined) SHARED.set(key, entry);
  entry.users += 1;
  return entry.geometry;
}

export function releaseGeometry(key: string): void {
  const entry = SHARED.get(key);
  if (entry === undefined || entry.users === 0) {
    throw new Error(`Model geometry ${key} has no user to release`);
  }
  entry.users -= 1;
  if (entry.users > 0) return;
  entry.geometry.dispose();
  settle(key, entry);
}

export function pinGeometriesInUse(): () => void {
  const pinned = [...SHARED].filter(([, entry]) => entry.users > 0);
  for (const [, entry] of pinned) entry.pins += 1;
  let held = true;
  return (): void => {
    if (!held) return;
    held = false;
    for (const [key, entry] of pinned) {
      entry.pins -= 1;
      settle(key, entry);
    }
  };
}
