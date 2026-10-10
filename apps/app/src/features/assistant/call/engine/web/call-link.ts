import type {
  AssistantVoiceClientMessage,
  AssistantVoiceServerMessage,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { callActive, callState, changeCall } from '../../call-state';
import type { CallRequest } from '../call-engine';
import { openCallSocket, type CallSocket } from './call-socket';
import { Reconnect } from './reconnect';

const log = new Logger('app.assistant-call');

export const CONNECTION_DROPPED = 'The connection to your home dropped.';

export interface LinkPorts {
  readonly request: () => CallRequest | null;
  readonly message: (message: AssistantVoiceServerMessage) => void;
  readonly audio: (packet: Uint8Array) => void;
  readonly lost: (reason: string) => void;
}

export class CallLink {
  private socket: CallSocket | null = null;
  private generation = 0;
  private resuming = false;
  private announced = false;
  private readonly reconnect = new Reconnect(
    () => {
      this.resuming = true;
      this.open();
    },
    () => {
      this.ports.lost(CONNECTION_DROPPED);
    },
  );

  constructor(private readonly ports: LinkPorts) {}

  get isOpen(): boolean {
    return this.socket?.isOpen() === true;
  }

  open(): void {
    const request = this.ports.request();
    if (request === null) {
      return;
    }
    const generation = (this.generation += 1);
    const current = (): boolean => generation === this.generation;
    this.socket = openCallSocket(request.connection, {
      onMessage: (message) => {
        if (current()) {
          this.ports.message(message);
        }
      },
      onAudio: (packet) => {
        if (current()) {
          this.ports.audio(packet);
        }
      },
      onUnreadable: (reason) => {
        log.warn('call.unreadable', { reason });
      },
      onClose: (code, reason) => {
        if (current()) {
          this.closed(code, reason);
        }
      },
    });
  }

  send(message: AssistantVoiceClientMessage): void {
    this.socket?.send(message);
  }

  sendAudio(packet: Uint8Array): void {
    this.socket?.sendAudio(packet);
  }

  sendPicture(bytes: Uint8Array): void {
    this.socket?.sendPicture(bytes);
  }

  get hasAnnounced(): boolean {
    return this.announced;
  }

  markAnnounced(): void {
    this.announced = true;
  }

  resume(): boolean {
    const { callId } = callState.get();
    if (!this.resuming) {
      return false;
    }
    if (callId !== null) {
      this.send({ type: 'call_resume', callId });
    }
    return true;
  }

  confirmed(): boolean {
    if (!this.resuming) {
      return false;
    }
    this.resuming = false;
    this.reconnect.cancel();
    return true;
  }

  close(): void {
    this.reconnect.cancel();
    this.resuming = false;
    this.announced = false;
    this.generation += 1;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private closed(code: number, reason: string): void {
    if (!callActive(callState.get())) {
      return;
    }
    log.warn('call.socket_closed', { code, reason });
    if (this.reconnect.running) {
      this.reconnect.failed();
    } else if (this.announced && callState.get().capabilities?.resume === true) {
      changeCall(() => ({ phase: 'reconnecting' }));
      this.reconnect.begin();
    } else {
      this.ports.lost(reason === '' ? CONNECTION_DROPPED : reason);
    }
  }
}
