import {
  ASSISTANT_VOICE_PATH,
  ASSISTANT_VOICE_SERVER_MESSAGE,
  assistantVoiceProtocols,
  audioFrameOf,
  packetOfFrame,
  type AssistantVoiceClientMessage,
  type AssistantVoiceServerMessage,
} from '@smarteverything/domain';
import { jsonText } from '../../../../../format/json-text';
import type { CallConnection } from '../call-engine';

export interface CallSocketHandlers {
  readonly onMessage: (message: AssistantVoiceServerMessage) => void;
  readonly onAudio: (packet: Uint8Array) => void;
  readonly onUnreadable: (reason: string) => void;
  readonly onClose: (code: number, reason: string) => void;
}

export interface CallSocket {
  readonly send: (message: AssistantVoiceClientMessage) => void;
  readonly sendAudio: (packet: Uint8Array) => void;
  readonly close: () => void;
}

function socketUrl(connection: CallConnection): string {
  return `${connection.url.replace(/\/$/, '').replace(/^http/, 'ws')}${ASSISTANT_VOICE_PATH}`;
}

function readText(text: string, handlers: CallSocketHandlers): void {
  const read = jsonText(text);
  const parsed = read.ok ? ASSISTANT_VOICE_SERVER_MESSAGE.safeParse(read.value) : null;
  if (parsed?.success === true) {
    handlers.onMessage(parsed.data);
    return;
  }
  handlers.onUnreadable(
    `the server sent a call message this app cannot read: ${text.slice(0, 120)}`,
  );
}

export function openCallSocket(
  connection: CallConnection,
  handlers: CallSocketHandlers,
): CallSocket {
  const socket = new WebSocket(socketUrl(connection), [
    ...assistantVoiceProtocols(connection.token),
  ]);
  socket.binaryType = 'arraybuffer';
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
      socket.close(1000, 'call ended');
    },
  };
}
