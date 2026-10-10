import {
  TALK_PATH,
  TALK_SERVER_MESSAGE,
  audioFrameOf,
  packetOfFrame,
  talkProtocols,
  type TalkClientMessage,
  type TalkServerMessage,
} from '@smarteverything/domain';
import { jsonText } from '../../../../format/json-text';
import type { TalkConnection } from '../engine-state';

export interface TalkSocketHandlers {
  readonly onOpen: () => void;
  readonly onMessage: (message: TalkServerMessage) => void;
  readonly onAudio: (packet: Uint8Array) => void;
  readonly onUnreadable: (reason: string) => void;
  readonly onClose: (code: number, reason: string) => void;
}

export interface TalkSocket {
  readonly send: (message: TalkClientMessage) => void;
  readonly sendAudio: (packet: Uint8Array) => void;
  readonly close: () => void;
}

function socketUrl(connection: TalkConnection): string {
  return `${connection.url.replace(/\/$/, '').replace(/^http/, 'ws')}${TALK_PATH}`;
}

function readText(text: string, handlers: TalkSocketHandlers): void {
  const read = jsonText(text);
  const parsed = read.ok ? TALK_SERVER_MESSAGE.safeParse(read.value) : null;
  if (parsed?.success === true) {
    handlers.onMessage(parsed.data);
    return;
  }
  handlers.onUnreadable(
    `the server sent a talk message this app cannot read: ${text.slice(0, 120)}`,
  );
}

export function openTalkSocket(
  connection: TalkConnection,
  handlers: TalkSocketHandlers,
): TalkSocket {
  const socket = new WebSocket(socketUrl(connection), [...talkProtocols(connection.token)]);
  socket.binaryType = 'arraybuffer';
  socket.addEventListener('open', handlers.onOpen);
  socket.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (typeof event.data === 'string') {
      readText(event.data, handlers);
    } else if (event.data instanceof ArrayBuffer) {
      handlers.onAudio(packetOfFrame(new Uint8Array(event.data)));
    }
  });
  socket.addEventListener('close', (event) => {
    handlers.onClose(event.code, event.reason);
  });
  return {
    send: (message): void => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
    sendAudio: (packet): void => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(audioFrameOf(packet));
      }
    },
    close: (): void => {
      socket.close(1000, 'talk stopped');
    },
  };
}
