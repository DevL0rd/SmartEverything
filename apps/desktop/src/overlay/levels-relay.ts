import { OVERLAY_LEVELS_PORT_MESSAGE } from '@smarteverything/domain';

export interface MessageEventLike {
  readonly source: unknown;
  readonly data: unknown;
  readonly ports: readonly MessagePort[];
}

export interface MessageTarget {
  addEventListener(type: 'message', listener: (event: MessageEventLike) => void): void;
}

export function relayOverlayLevels(
  target: MessageTarget,
  self: unknown,
  forward: (port: MessagePort) => void,
): void {
  target.addEventListener('message', (event) => {
    if (event.source !== self || event.data !== OVERLAY_LEVELS_PORT_MESSAGE) {
      return;
    }
    const [port] = event.ports;
    if (port !== undefined) {
      forward(port);
    }
  });
}
