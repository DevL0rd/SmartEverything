import {
  FTMS_CONTROL_POINT,
  FTMS_MACHINE_STATUS,
  FTMS_SERVICE,
  FTMS_TRAINING_STATUS,
  FTMS_TREADMILL_DATA,
  FtmsFrameError,
  SUPPLEMENT_NOTIFY,
  VendorFrameError,
  WILINK_NOTIFY,
  WilinkFrameError,
  decodeSupplement,
  decodeWilink,
  hexToBytes,
  parseControlResponse,
  parseMachineStatus,
  parseTrainingStatus,
  parseTreadmillData,
  splitWilink,
  type ControlResponse,
  type PadRecord,
  type SupplementDecoded,
  type UnknownByte,
} from '@smarteverything/ble';
import type {
  MachineStatus,
  PadPreferences,
  TreadmillFamily,
  TreadmillFrame,
  TreadmillReading,
} from '@smarteverything/domain';

export type Decoded =
  | {
      readonly kind: 'reading';
      readonly at: string;
      readonly reading: TreadmillReading;
      readonly unknown: readonly UnknownByte[];
    }
  | { readonly kind: 'machine_status'; readonly at: string; readonly status: MachineStatus }
  | ({ readonly kind: 'control_response'; readonly at: string } & ControlResponse)
  | { readonly kind: 'preferences'; readonly at: string; readonly preferences: PadPreferences }
  | { readonly kind: 'record'; readonly at: string; readonly record: PadRecord }
  | { readonly kind: 'supplement'; readonly at: string; readonly decoded: SupplementDecoded }
  | {
      readonly kind: 'unreadable';
      readonly at: string;
      readonly characteristic: string;
      readonly hex: string;
      readonly reason: string;
    };

function unreadable(frame: TreadmillFrame, cause: Error): Decoded {
  return {
    kind: 'unreadable',
    at: frame.at,
    characteristic: frame.characteristic,
    hex: frame.hex,
    reason: cause.message,
  };
}

function isFrameError(cause: unknown): cause is Error {
  return (
    cause instanceof WilinkFrameError ||
    cause instanceof FtmsFrameError ||
    cause instanceof VendorFrameError
  );
}

export class FrameDecoder {
  private buffer: Uint8Array = new Uint8Array(0);

  constructor(readonly family: TreadmillFamily) {}

  decode(frame: TreadmillFrame): Decoded[] {
    try {
      return this.route(frame);
    } catch (cause) {
      if (isFrameError(cause)) {
        return [unreadable(frame, cause)];
      }
      throw cause;
    }
  }

  private route(frame: TreadmillFrame): Decoded[] {
    const bytes = hexToBytes(frame.hex);
    switch (frame.characteristic) {
      case WILINK_NOTIFY:
        return this.wilink(frame, bytes);
      case FTMS_TREADMILL_DATA:
        return [{ kind: 'reading', at: frame.at, reading: parseTreadmillData(bytes), unknown: [] }];
      case FTMS_MACHINE_STATUS:
        return [{ kind: 'machine_status', at: frame.at, status: parseMachineStatus(bytes) }];
      case FTMS_CONTROL_POINT:
        return [{ kind: 'control_response', at: frame.at, ...parseControlResponse(bytes) }];
      case FTMS_TRAINING_STATUS:
        return [
          {
            kind: 'reading',
            at: frame.at,
            reading: { trainingStatus: parseTrainingStatus(bytes) },
            unknown: [],
          },
        ];
      case SUPPLEMENT_NOTIFY:
        return [{ kind: 'supplement', at: frame.at, decoded: decodeSupplement(bytes) }];
      default:
        return [
          unreadable(
            frame,
            new Error(
              `Expected a frame from fe01, ${FTMS_SERVICE} characteristics or the supplement notifier, received ${frame.characteristic}.`,
            ),
          ),
        ];
    }
  }

  private wilink(frame: TreadmillFrame, bytes: Uint8Array): Decoded[] {
    const joined = new Uint8Array(this.buffer.length + bytes.length);
    joined.set(this.buffer);
    joined.set(bytes, this.buffer.length);
    const split = splitWilink(joined);
    this.buffer = split.rest;
    const lost: Decoded[] =
      split.dropped > 0
        ? [
            unreadable(
              frame,
              new WilinkFrameError(
                `${String(split.dropped)} bytes did not form a WiLink frame with a matching checksum.`,
              ),
            ),
          ]
        : [];
    const frames = split.frames.map((piece): Decoded => {
      const decoded = decodeWilink(piece);
      switch (decoded.kind) {
        case 'status':
          return {
            kind: 'reading',
            at: frame.at,
            reading: decoded.reading,
            unknown: decoded.unknown,
          };
        case 'preferences':
          return { kind: 'preferences', at: frame.at, preferences: decoded.preferences };
        case 'record':
          return { kind: 'record', at: frame.at, record: decoded.record };
      }
    });
    return [...lost, ...frames];
  }
}
