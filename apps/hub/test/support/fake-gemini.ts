import { LiveServerMessage, type LiveCallbacks, type LiveConnectConfig } from '@google/genai';
import { Gemini, type LiveConnect } from '../../src/assistant-voice/gemini';

export interface Socket {
  readonly config: LiveConnectConfig;
  readonly callbacks: LiveCallbacks;
  readonly sent: string[];
}

function message(fields: Partial<LiveServerMessage>): LiveServerMessage {
  return Object.assign(new LiveServerMessage(), fields);
}

export const say = message({
  serverContent: {
    modelTurn: {
      parts: [
        { inlineData: { data: Buffer.alloc(320).toString('base64'), mimeType: 'audio/pcm' } },
      ],
    },
  },
});
export const done = message({ serverContent: { turnComplete: true } });
export const heard = (text: string): LiveServerMessage =>
  message({ serverContent: { inputTranscription: { text } } });
export const said = (text: string): LiveServerMessage =>
  message({ serverContent: { outputTranscription: { text } } });
export const saved = (handle: string | null): LiveServerMessage =>
  message({
    sessionResumptionUpdate:
      handle === null ? { resumable: false } : { resumable: true, newHandle: handle },
  });
export const goAway = (timeLeft: string): LiveServerMessage => message({ goAway: { timeLeft } });
export const toolCall = (id: string, name: string): LiveServerMessage =>
  message({ toolCall: { functionCalls: [{ id, name, args: {} }] } });

export function drop(socket: Socket, code: number, reason: string): void {
  socket.callbacks.onclose?.(new CloseEvent('close', { code, reason, wasClean: true }));
}

export function fakeGemini(sockets: Socket[]): Gemini {
  const connect: LiveConnect = (_key, params) => {
    const socket: Socket = { config: params.config ?? {}, callbacks: params.callbacks, sent: [] };
    sockets.push(socket);
    return Promise.resolve({
      sendRealtimeInput: (input): void => {
        socket.sent.push(`realtime ${Object.keys(input).join(',')}`);
      },
      sendClientContent: (content): void => {
        socket.sent.push(`text ${JSON.stringify(content)}`);
      },
      sendToolResponse: (response): void => {
        socket.sent.push(`tool ${JSON.stringify(response)}`);
      },
      close: (): void => {
        queueMicrotask(() => {
          drop(socket, 1000, '');
        });
      },
    });
  };
  return new Gemini(() => 'test-key', connect);
}

export function socketAt(sockets: readonly Socket[], index: number): Socket {
  const socket = sockets[index];
  if (socket === undefined) {
    throw new Error('the fake Gemini socket was not opened');
  }
  return socket;
}
