import type { RemoteEarNodeMessage } from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { SpeechSegment } from '../../../listening/speech-segment';
import type { EarClaim } from '../ear-pipeline';
import {
  EAR_EVENT,
  LOCAL_CLAIM_EVENT,
  LOCAL_FAILED_EVENT,
  LOCAL_SEGMENT_EVENT,
  LOG_EVENT,
  LOST_EVENT,
  SCORED_EVENT,
  SCORE_FAILED_EVENT,
  SEND_EVENT,
} from './protocol';
import { relayLog } from './relay-log';

export interface PortSink {
  readonly send: (key: string, message: RemoteEarNodeMessage) => void;
  readonly scored: (id: string, heard: boolean) => void;
  readonly scoreFailed: (id: string, reason: string) => void;
}

export interface LocalSink {
  readonly claimed: (claim: EarClaim) => void;
  readonly segment: (segment: SpeechSegment) => void;
  readonly failed: (reason: string) => void;
}

export interface EarProcessSinks {
  readonly ports: Map<number, PortSink>;
  readonly locals: Map<number, LocalSink>;
}

export class EarProcessEvents {
  readonly sinks: EarProcessSinks = { ports: new Map(), locals: new Map() };

  constructor(
    private readonly log: Logger,
    private readonly lost: (reason: string) => void,
  ) {}

  received(name: string, payload: unknown): void {
    try {
      this.dispatch(name, payload);
    } catch (cause) {
      this.log.warn('ear_process.event_invalid', { name, reason: messageOf(cause) });
    }
  }

  private dispatch(name: string, payload: unknown): void {
    switch (name) {
      case EAR_EVENT.send: {
        const event = SEND_EVENT.parse(payload);
        this.sinks.ports.get(event.port)?.send(event.key, event.message);
        return;
      }
      case EAR_EVENT.scored: {
        const event = SCORED_EVENT.parse(payload);
        this.sinks.ports.get(event.port)?.scored(event.id, event.heard);
        return;
      }
      case EAR_EVENT.scoreFailed: {
        const event = SCORE_FAILED_EVENT.parse(payload);
        this.sinks.ports.get(event.port)?.scoreFailed(event.id, event.reason);
        return;
      }
      case EAR_EVENT.log:
        relayLog(LOG_EVENT.parse(payload));
        return;
      case EAR_EVENT.lost:
        this.lost(LOST_EVENT.parse(payload).reason);
        return;
      default:
        this.dispatchLocal(name, payload);
    }
  }

  private dispatchLocal(name: string, payload: unknown): void {
    switch (name) {
      case EAR_EVENT.localClaim: {
        const { id, ...claim } = LOCAL_CLAIM_EVENT.parse(payload);
        this.sinks.locals.get(id)?.claimed(claim);
        return;
      }
      case EAR_EVENT.localSegment: {
        const { id, ...segment } = LOCAL_SEGMENT_EVENT.parse(payload);
        this.sinks.locals.get(id)?.segment(segment);
        return;
      }
      case EAR_EVENT.localFailed: {
        const event = LOCAL_FAILED_EVENT.parse(payload);
        this.sinks.locals.get(event.id)?.failed(event.reason);
        return;
      }
      default:
        this.log.warn('ear_process.event_unknown', { name });
    }
  }
}
