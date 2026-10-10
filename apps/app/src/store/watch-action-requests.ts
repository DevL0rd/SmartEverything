import type { WatchActionNotice } from '@smarteverything/domain';

type Listener = (notice: WatchActionNotice) => void;

const listeners = new Set<Listener>();

export function onWatchActionRequest(listener: Listener): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

export function deliverWatchActionRequest(notice: WatchActionNotice): number {
  for (const listener of listeners) {
    listener(notice);
  }
  return listeners.size;
}
