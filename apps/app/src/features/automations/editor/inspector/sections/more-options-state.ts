import { usePausable } from '../../../../../design/external-store';

let open = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): boolean {
  return open;
}

export function setMoreOptionsOpen(next: boolean): void {
  if (next === open) return;
  open = next;
  for (const listener of listeners) listener();
}

export function useMoreOptionsOpen(): boolean {
  return usePausable(subscribe, snapshot);
}
