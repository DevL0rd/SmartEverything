type Listener = () => void;

const listeners = new Set<Listener>();

export function hubAnswered(): void {
  for (const listener of [...listeners]) listener();
}

export function onHubAnswered(listener: Listener): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}
