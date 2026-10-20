import type { AppViewRequest } from '@smarteverything/domain';

type Listener = (request: AppViewRequest) => void;

const listeners = new Set<Listener>();

export function onAppView(listener: Listener): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

export function deliverAppView(request: AppViewRequest): number {
  for (const listener of listeners) {
    listener(request);
  }
  return listeners.size;
}
