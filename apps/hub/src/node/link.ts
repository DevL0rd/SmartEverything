import type { HubFrame, NodeFrame } from '@smarteverything/domain';
import { Listeners } from '../listeners';

type Listener<T> = (frame: T) => void;

export interface Link<Outgoing, Incoming> {
  readonly send: (frame: Outgoing) => void;
  readonly onFrame: (listener: Listener<Incoming>) => () => void;
}

export type NodeLink = Link<NodeFrame, HubFrame>;

export type HubLink = Link<HubFrame, unknown>;

export function pipeLink<Outgoing, Incoming>(
  send: (frame: Outgoing) => void,
): { readonly link: Link<Outgoing, Incoming>; readonly deliver: (frame: Incoming) => void } {
  const incoming = new Listeners<Incoming>();
  return {
    link: {
      send,
      onFrame: (listener) => incoming.listen(listener),
    },
    deliver: (frame): void => {
      incoming.emit(frame);
    },
  };
}
