import { describe, expect, it } from 'vitest';
import { OVERLAY_LEVELS_PORT_MESSAGE } from '@smarteverything/domain';
import {
  relayOverlayLevels,
  type MessageEventLike,
  type MessageTarget,
} from '../src/overlay/levels-relay.js';

interface FakeTarget extends MessageTarget {
  send(event: MessageEventLike): void;
}

function target(): FakeTarget {
  let listener: ((event: MessageEventLike) => void) | null = null;
  return {
    addEventListener: (_type: 'message', next: (event: MessageEventLike) => void): void => {
      listener = next;
    },
    send: (event: MessageEventLike): void => {
      listener?.(event);
    },
  };
}

const SELF = { name: 'window' };

describe('overlay levels relay', () => {
  it('forwards the port the page transfers to itself', () => {
    const fake = target();
    const forwarded: MessagePort[] = [];
    relayOverlayLevels(fake, SELF, (port) => {
      forwarded.push(port);
    });
    const { port2 } = new MessageChannel();
    fake.send({ source: SELF, data: OVERLAY_LEVELS_PORT_MESSAGE, ports: [port2] });
    expect(forwarded).toEqual([port2]);
    port2.close();
  });

  it('ignores other senders, other messages and messages without a port', () => {
    const fake = target();
    const forwarded: MessagePort[] = [];
    relayOverlayLevels(fake, SELF, (port) => {
      forwarded.push(port);
    });
    const { port1, port2 } = new MessageChannel();
    fake.send({ source: { name: 'frame' }, data: OVERLAY_LEVELS_PORT_MESSAGE, ports: [port2] });
    fake.send({ source: SELF, data: 'something else', ports: [port2] });
    fake.send({ source: SELF, data: OVERLAY_LEVELS_PORT_MESSAGE, ports: [] });
    expect(forwarded).toEqual([]);
    port1.close();
    port2.close();
  });
});
