import {
  CONDOR,
  CondorAssembler,
  CondorFramingError,
  SonicareFrameError,
  MESSAGE,
  RECORD_COMPLETE,
  RECORD_PARTIAL,
  STATUS_NAMES,
  STATUS_OK,
  decodeClassic,
  decodeStoredRecord,
  hexToBytes,
  jsonOfIndication,
  parseChangeInd,
  parseGenericResp,
  portDelta,
  portOfProps,
  sensorDelta,
  shortOf,
  SENSOR_PORT,
  KEY,
  type BrushDelta,
  type CondorMessage,
  type StoredRecord,
} from '@smarteverything/ble';
import type { BrushFrame } from '@smarteverything/domain';
import { ZodError } from 'zod';

export interface Unreadable {
  readonly kind: 'unreadable';
  readonly characteristic: string;
  readonly hex: string;
  readonly reason: string;
}

export type Decoded =
  | { readonly kind: 'delta'; readonly delta: BrushDelta; readonly at: string }
  | { readonly kind: 'record'; readonly record: StoredRecord; readonly at: string }
  | { readonly kind: 'ended'; readonly sessionId: number; readonly at: string }
  | { readonly kind: 'refused'; readonly status: string; readonly at: string }
  | Unreadable;

function isFrameError(cause: unknown): cause is Error {
  return (
    cause instanceof SonicareFrameError ||
    cause instanceof CondorFramingError ||
    cause instanceof ZodError ||
    cause instanceof SyntaxError
  );
}

interface Transfer {
  readonly sessionId: number;
  readonly chunks: Uint8Array[];
}

export class BrushDecoder {
  private readonly assembler = new CondorAssembler();
  private transfer: Transfer | null = null;

  constructor(private readonly kids: boolean) {}

  reset(): void {
    this.assembler.reset();
    this.transfer = null;
  }

  get transferring(): boolean {
    return this.transfer !== null;
  }

  decode(frame: BrushFrame): Decoded[] {
    try {
      return this.route(frame);
    } catch (cause) {
      if (!isFrameError(cause)) {
        throw cause;
      }
      return [
        {
          kind: 'unreadable',
          characteristic: frame.characteristic,
          hex: frame.hex,
          reason: cause.message,
        },
      ];
    }
  }

  private route(frame: BrushFrame): Decoded[] {
    const bytes = hexToBytes(frame.hex);
    if (frame.characteristic === CONDOR.tx) {
      return this.assembler
        .push(bytes)
        .messages.flatMap((message) => this.message(message, frame.at));
    }
    const key = shortOf(frame.characteristic);
    if (this.kids && key === KEY.recordData) {
      return this.kidsRecord(bytes, frame.at);
    }
    return this.classic(decodeClassic(frame.characteristic, bytes), frame.at);
  }

  private classic(delta: BrushDelta, at: string): Decoded[] {
    const record = this.assemble(delta, at);
    return [{ kind: 'delta', delta, at }, ...record];
  }

  private assemble(delta: BrushDelta, at: string): Decoded[] {
    if (delta.transfer !== undefined) {
      this.transfer = { sessionId: delta.transfer.sessionId, chunks: [] };
      return [];
    }
    if (delta.recordChunk !== undefined) {
      this.transfer?.chunks.push(delta.recordChunk);
      return [];
    }
    if (delta.recordStatus === undefined || this.transfer === null) {
      return [];
    }
    const { chunks, sessionId } = this.transfer;
    this.transfer = null;
    const first = chunks[0];
    const complete =
      delta.recordStatus === RECORD_COMPLETE || delta.recordStatus === RECORD_PARTIAL;
    const record = complete && first !== undefined ? decodeStoredRecord(first, 'notified') : null;
    return record === null ? [{ kind: 'ended', sessionId, at }] : [{ kind: 'record', record, at }];
  }

  private kidsRecord(bytes: Uint8Array, at: string): Decoded[] {
    const record = decodeStoredRecord(bytes, 'read');
    return record === null ? [] : [{ kind: 'record', record, at }];
  }

  private message(message: CondorMessage, at: string): Decoded[] {
    if (message.type === MESSAGE.changeInd) {
      return this.indication(message, at);
    }
    if (message.type !== MESSAGE.genericResp) {
      return [];
    }
    const answer = parseGenericResp(message.body);
    if (answer.status !== STATUS_OK) {
      return [
        { kind: 'refused', status: STATUS_NAMES[answer.status] ?? String(answer.status), at },
      ];
    }
    const port = portOfProps(answer.json);
    return port === null ? [] : [{ kind: 'delta', delta: portDelta(port, answer.json), at }];
  }

  private indication(message: CondorMessage, at: string): Decoded[] {
    const indication = parseChangeInd(message.body);
    const delta =
      indication.port === SENSOR_PORT
        ? sensorDelta(indication.body)
        : portDelta(indication.port, jsonOfIndication(indication));
    return [{ kind: 'delta', delta, at }];
  }
}
