import { useSyncExternalStore } from 'react';
import { ValueStore } from '../design/external-store';

const layers = new ValueStore<readonly string[]>([]);

export function showToastLayer(id: string): void {
  layers.update((current) =>
    current.at(-1) === id ? current : [...current.filter((layer) => layer !== id), id],
  );
}

export function hideToastLayer(id: string): void {
  layers.update((current) =>
    current.includes(id) ? current.filter((layer) => layer !== id) : current,
  );
}

export function useActiveToastLayer(id: string | null): boolean {
  const active = (): boolean => (layers.get().at(-1) ?? null) === id;
  return useSyncExternalStore(layers.subscribe, active, active);
}
