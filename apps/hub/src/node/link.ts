import type { HubFrame, NodeFrame } from '@smarteverything/domain';

type Listener<T> = (frame: T) => void;

export interface Link<Outgoing, Incoming> {
  readonly send: (frame: Outgoing) => void;
  readonly onFrame: (listener: Listener<Incoming>) => () => void;
}

export type NodeLink = Link<NodeFrame, HubFrame>;

export type HubLink = Link<HubFrame, unknown>;

class Channel<T> {
  private readonly listeners = new Set<Listener<T>>();

  emit(frame: T): void {
    for (const listener of this.listeners) {
      listener(frame);
    }
  }

  listen(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }
}

export function localLinks(): { readonly node: NodeLink; readonly hub: HubLink } {
  const up = new Channel<unknown>();
  const down = new Channel<HubFrame>();
  return {
    node: {
      send: (frame): void => {
        up.emit(frame);
      },
      onFrame: (listener) => down.listen(listener),
    },
    hub: {
      send: (frame): void => {
        down.emit(frame);
      },
      onFrame: (listener) => up.listen(listener),
    },
  };
}
