import { RESTART_EXIT_CODE } from '@smarteverything/domain';
import { Logger, background, messageOf } from '@smarteverything/logging';
import type { LogRecord } from '@smarteverything/logging';
import { systemClock } from '../../../clock';
import { serveChild, type ChildChannel } from '../../../plugins/isolation/child-serve';
import { startBundledWatchdog } from '../../../service/loop-watchdog/script';
import { earHostFor, isEarsFrame, type EarHostPort, type EarHosting } from '../ear-host';
import { localEarPipeline, type EarPipeline } from '../ear-pipeline';
import { EarRuntimeAbortedError } from '../runtime-lost';
import {
  EAR_CALL,
  EAR_COMMAND,
  EAR_EVENT,
  FRAME_INPUT,
  INIT_INPUT,
  LOCAL_AUDIO_INPUT,
  LOCAL_CLOSE_INPUT,
  LOCAL_OPEN_INPUT,
  PORT_INPUT,
} from './protocol';

const EAR_STALL_EXIT_MS = 15_000;

class EarChildNotInitialisedError extends Error {
  override readonly name = 'EarChildNotInitialisedError';

  constructor(request: string) {
    super(`The ear process was asked to ${request} before it was initialised`);
  }
}

class UnknownEarRequestError extends Error {
  override readonly name = 'UnknownEarRequestError';

  constructor(
    readonly kind: string,
    readonly requested: string,
  ) {
    super(`The ear process does not know the ${kind} ${requested}`);
  }
}

type Emit = ChildChannel['emit'];

export class EarChild {
  private hosting: EarHosting | null = null;
  private watching = false;
  private readonly ports = new Map<number, EarHostPort>();
  private readonly locals = new Map<number, EarPipeline>();
  private readonly log = new Logger('hub.node-ear');

  constructor(private readonly emitter: Emit) {}

  async call(name: string, payload: unknown): Promise<unknown> {
    switch (name) {
      case EAR_CALL.init:
        await this.init(payload);
        return null;
      case EAR_CALL.ping:
        return null;
      case EAR_CALL.portStop:
        await this.stopPort(PORT_INPUT.parse(payload).port);
        return null;
      case EAR_CALL.localOpen:
        await this.openLocal(payload);
        return null;
      case EAR_CALL.localClose:
        await this.closeLocal(LOCAL_CLOSE_INPUT.parse(payload).id);
        return null;
      default:
        throw new UnknownEarRequestError('call', name);
    }
  }

  event(name: string, payload: unknown): void {
    if (name === EAR_COMMAND.frame) {
      this.frame(payload);
    } else if (name === EAR_COMMAND.localAudio) {
      this.localAudio(payload);
    } else {
      throw new UnknownEarRequestError('event', name);
    }
  }

  private emit(name: string, payload: unknown, delivered?: () => void): void {
    this.emitter(name, payload, delivered);
  }

  private async init(payload: unknown): Promise<void> {
    const input = INIT_INPUT.parse(payload);
    Logger.configure({
      level: input.level,
      context: { platform: 'server', release: input.release },
      sink: (record) => {
        this.relayLog(record);
      },
    });
    this.watch(input.logPath, input.release);
    this.hosting ??= earHostFor({
      now: (): Date => new Date(),
      wakeDiagnosticsDirectory: input.wakeDiagnosticsDirectory,
      log: this.log,
      lost: (reason): void => {
        this.lost(reason);
      },
    });
    await this.hosting.load();
  }

  private watch(logPath: string, release: string): void {
    if (this.watching) {
      return;
    }
    this.watching = true;
    startBundledWatchdog({
      name: 'ear',
      logPath,
      release,
      exitAfterMs: EAR_STALL_EXIT_MS,
      log: this.log,
    });
  }

  private relayLog(record: LogRecord): void {
    this.emit(EAR_EVENT.log, {
      level: record.level,
      scope: record.scope,
      event: record.event,
      payload: record.payload,
      ...(record.failure === undefined ? {} : { failure: record.failure }),
    });
  }

  private lost(reason: string): void {
    this.log.error('ear.runtime_aborted', new EarRuntimeAbortedError(reason), {
      consequence: 'the speech runtime of this process cannot recover, so the ear process restarts',
    });
    this.emit(EAR_EVENT.lost, { reason }, () => {
      process.exit(RESTART_EXIT_CODE);
    });
  }

  private hosted(): EarHosting {
    if (this.hosting === null) {
      throw new EarChildNotInitialisedError('host ears');
    }
    return this.hosting;
  }

  private portFor(port: number): EarHostPort {
    const known = this.ports.get(port);
    if (known !== undefined) {
      return known;
    }
    const created = this.hosted().factory(
      (key, message) => {
        this.emit(EAR_EVENT.send, { port, key, message });
      },
      (id, heard) => {
        this.emit(EAR_EVENT.scored, { port, id, heard });
      },
      (id, reason) => {
        this.emit(EAR_EVENT.scoreFailed, { port, id, reason });
      },
    );
    this.ports.set(port, created);
    return created;
  }

  private frame(payload: unknown): void {
    const { port, frame } = FRAME_INPUT.parse(payload);
    if (!isEarsFrame(frame)) {
      throw new UnknownEarRequestError('frame', frame.type);
    }
    this.portFor(port).receive(frame);
  }

  private async stopPort(port: number): Promise<void> {
    const hosted = this.ports.get(port);
    this.ports.delete(port);
    await hosted?.stop();
  }

  private async openLocal(payload: unknown): Promise<void> {
    const { id, config } = LOCAL_OPEN_INPUT.parse(payload);
    await this.closeLocal(id);
    const pipeline = await localEarPipeline({
      clock: { now: systemClock.now, at: systemClock.at },
      log: this.log,
      lost: (reason): void => {
        this.lost(reason);
      },
    })(config, {
      claimed: (claim) => {
        this.emit(EAR_EVENT.localClaim, { id, ...claim });
      },
      segment: (segment) => {
        this.emit(EAR_EVENT.localSegment, { id, ...segment });
      },
      failed: (reason) => {
        this.emit(EAR_EVENT.localFailed, { id, reason });
      },
    });
    this.locals.set(id, pipeline);
  }

  private async closeLocal(id: number): Promise<void> {
    const pipeline = this.locals.get(id);
    this.locals.delete(id);
    await pipeline?.close();
  }

  private localAudio(payload: unknown): void {
    const { id, pcm } = LOCAL_AUDIO_INPUT.parse(payload);
    try {
      this.locals.get(id)?.hear(pcm);
    } catch (cause) {
      this.log.error('ear_process.local_hear_failed', cause);
      background(this.closeLocal(id), 'ear_process.local_close_failed');
      this.emit(EAR_EVENT.localFailed, { id, reason: messageOf(cause) });
    }
  }
}

export function serveEarProcess(): void {
  const output: { channel: ChildChannel | null } = { channel: null };
  const child = new EarChild((name, payload, delivered) => {
    output.channel?.emit(name, payload, delivered);
  });
  output.channel = serveChild({
    call: (name, payload) => child.call(name, payload),
    event: (name, payload) => {
      child.event(name, payload);
    },
  });
}
