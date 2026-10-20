import {
  emptySupplementState,
  supplementStateOf,
  type ControlResponse,
  type PadRecord,
  type SupplementDecoded,
  type SupplementState,
  type UnknownByte,
} from '@smarteverything/ble';
import {
  initialMachine,
  stepMachine,
  type BeltState,
  type ControlResult,
  type MachineEvent,
  type MachineSettings,
  type MachineState,
  type PadPreferences,
  type SessionSample,
  type TreadmillFamily,
  type TreadmillFrame,
  type TreadmillIdentity,
  type TreadmillInput,
  type TreadmillReading,
} from '@smarteverything/domain';
import { FrameDecoder, type Decoded } from './decode';

export type Unreadable = Extract<Decoded, { readonly kind: 'unreadable' }>;

export type Timeline =
  | { readonly kind: 'event'; readonly event: MachineEvent }
  | {
      readonly kind: 'tick';
      readonly at: string;
      readonly sample: SessionSample;
      readonly beltKcal: number | null;
    };

export interface Snapshot {
  readonly at: string;
  readonly state: BeltState;
  readonly live: TreadmillReading;
}

export class BatchCollector {
  readonly timeline: Timeline[] = [];
  readonly snapshots: Snapshot[] = [];
  readonly records: PadRecord[] = [];
  readonly responses: ControlResponse[] = [];
  readonly unreadable: Unreadable[] = [];
  readonly unknown: UnknownByte[] = [];
  padChanged = false;
  identityChanged = false;
  faultChanged = false;
  controlChanged = false;

  markPad(): void {
    this.padChanged = true;
  }

  markIdentity(): void {
    this.identityChanged = true;
  }
}

export type BatchResult = BatchCollector;

export interface ControlReply {
  readonly result: ControlResult;
  readonly seq: number;
}

export interface RuntimeInit {
  readonly family: TreadmillFamily;
  readonly identity: TreadmillIdentity;
  readonly pad: PadPreferences;
}

function faultCodeOf(state: BeltState, errorCode: number | null): string | null {
  if (errorCode !== null && errorCode > 0) {
    return `E${String(errorCode).padStart(2, '0')}`;
  }
  return state === 'fault' ? 'E??' : null;
}

function tickOf(state: MachineState): Timeline[] {
  const open = state.open;
  if (open === null || (state.state !== 'running' && state.state !== 'paused')) {
    return [];
  }
  return [
    {
      kind: 'tick',
      at: open.lastAt,
      beltKcal: (state.live.energyKcal ?? 0) > 0 ? (state.live.energyKcal ?? null) : null,
      sample: {
        t: (Date.parse(open.lastAt) - Date.parse(open.startedAt)) / 1000,
        kmh: state.live.speedKmh ?? open.lastKmh,
        distanceM: open.lastDistanceM,
        steps: open.steps,
        incline: state.live.inclinePercent ?? null,
        state: state.state,
      },
    },
  ];
}

export class TreadmillRuntime {
  machine: MachineState = initialMachine();
  pad: PadPreferences;
  identity: TreadmillIdentity;
  supplement: SupplementState = emptySupplementState();
  fault: string | null = null;
  controlLost = false;
  lastStepAt: string | null = null;
  inclineStatusSeq = 0;
  settingsSeq = 0;
  replySeq = 0;
  readonly replies = new Map<number, ControlReply>();
  private replayExpected = false;
  readonly decoder: FrameDecoder;
  private readonly seenUnknown = new Set<string>();

  constructor(init: RuntimeInit) {
    this.decoder = new FrameDecoder(init.family);
    this.pad = init.pad;
    this.identity = init.identity;
  }

  linkInterrupted(): void {
    this.replayExpected = this.decoder.family !== 'wilink';
  }

  ingest(frames: readonly TreadmillFrame[], settings: MachineSettings): BatchResult {
    const collected = new BatchCollector();
    const faultBefore = this.fault;
    const controlBefore = this.controlLost;
    for (const frame of frames) {
      for (const item of this.decoder.decode(frame)) {
        this.apply(item, settings, collected);
      }
    }
    collected.faultChanged = this.fault !== faultBefore;
    collected.controlChanged = this.controlLost !== controlBefore;
    return collected;
  }

  private apply(item: Decoded, settings: MachineSettings, collected: BatchCollector): void {
    switch (item.kind) {
      case 'reading':
        this.noteSteps(item.at, item.reading.steps);
        this.step({ kind: 'reading', at: item.at, reading: item.reading }, settings, collected);
        this.noteUnknown(item.unknown, collected.unknown);
        return;
      case 'machine_status':
        if (this.replayExpected) {
          this.replayExpected = false;
          return;
        }
        this.inclineStatusSeq += item.status.kind === 'target_incline' ? 1 : 0;
        this.step(
          { kind: 'machine_status', at: item.at, status: item.status },
          settings,
          collected,
        );
        return;
      case 'preferences':
        this.pad = { ...this.pad, ...item.preferences };
        collected.markPad();
        return;
      case 'supplement':
        this.supplementFrame(item.decoded, collected);
        return;
      case 'record':
        collected.records.push(item.record);
        return;
      case 'control_response':
        collected.responses.push({ opcode: item.opcode, result: item.result });
        this.noteReply(item.opcode, item.result);
        return;
      case 'unreadable':
        collected.unreadable.push(item);
        return;
    }
  }

  private noteReply(opcode: number, result: ControlResult): void {
    this.replySeq += 1;
    this.replies.set(opcode, { result, seq: this.replySeq });
    this.controlLost = this.controlLost && result !== 'success';
  }

  private noteSteps(at: string, steps: number | undefined): void {
    if (steps !== undefined && steps > (this.machine.live.steps ?? 0)) {
      this.lastStepAt = at;
    }
  }

  private step(input: TreadmillInput, settings: MachineSettings, collected: BatchCollector): void {
    const moved = stepMachine(this.machine, input, settings);
    this.machine = moved.state;
    for (const event of moved.events) {
      collected.timeline.push({ kind: 'event', event });
      if (event.kind === 'control_lost') {
        this.controlLost = true;
      }
    }
    collected.timeline.push(...tickOf(moved.state));
    collected.snapshots.push({ at: input.at, state: moved.state.state, live: moved.state.live });
    this.fault = faultCodeOf(moved.state.state, this.supplement.errorCode);
  }

  private supplementFrame(decoded: SupplementDecoded, collected: BatchCollector): void {
    if (decoded.kind === 'properties' || decoded.kind === 'property_push') {
      this.supplement = supplementStateOf(decoded.properties, this.supplement);
      this.settingsSeq += 1;
      this.pad = { ...this.pad, ...this.supplement.preferences };
      this.identity = { ...this.identity, motorVersion: this.supplement.motorVersion };
      this.fault = faultCodeOf(this.machine.state, this.supplement.errorCode);
      collected.markPad();
      collected.markIdentity();
    } else if (decoded.kind === 'system') {
      this.identity = {
        ...this.identity,
        protocol: decoded.protocol,
        capabilityWord: decoded.capabilities,
        modelCode: decoded.model,
      };
      collected.markIdentity();
    } else if (decoded.kind === 'function_bitmap') {
      this.identity = { ...this.identity, functionBitmap: decoded.hex };
      collected.markIdentity();
    }
  }

  private noteUnknown(found: readonly UnknownByte[], into: UnknownByte[]): void {
    for (const byte of found) {
      const key = `${String(byte.index)}:${String(byte.value)}`;
      if (!this.seenUnknown.has(key)) {
        this.seenUnknown.add(key);
        into.push(byte);
      }
    }
  }
}
