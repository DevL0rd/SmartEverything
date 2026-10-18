type Listener = (text: string) => void;

const listeners = new Set<Listener>();

export function onLocalCopy(listener: Listener): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

export function announceLocalCopy(text: string): void {
  for (const listener of listeners) {
    listener(text);
  }
}
