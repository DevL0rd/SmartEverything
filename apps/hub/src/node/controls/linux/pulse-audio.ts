import type { AudioChange, AudioState, ComputerFeature } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { AudioControl, StopWatching } from '../session-controls';
import type { LineSubscriber } from './line-stream';
import type { ProgramProbe } from './program-probe';
import { pulseCommands } from './pulse-commands';
import {
  buildAudioState,
  masterReading,
  parseDevices,
  parseInfo,
  parseStreams,
  type MasterReading,
  type PulseSnapshot,
} from './pulse-parse';

const log = new Logger('hub.node-audio');

const PROGRAM = 'pactl';
const DEBOUNCE_MS = 50;
const EVENT = /^Event '\w+' on ([a-z-]+) #/;
const AUDIO_FEATURES: readonly ComputerFeature[] = ['audio', 'audio_apps', 'microphone'];

type Facility = 'info' | 'sinks' | 'sources' | 'sinkInputs' | 'sourceOutputs';

type Cache = Partial<PulseSnapshot>;

const ALL: readonly Facility[] = ['info', 'sinks', 'sources', 'sinkInputs', 'sourceOutputs'];

const FACILITY_OF_OBJECT: Readonly<Record<string, Facility>> = {
  server: 'info',
  sink: 'sinks',
  source: 'sources',
  'sink-input': 'sinkInputs',
  'source-output': 'sourceOutputs',
};

const LIST_ARGUMENTS: Readonly<Record<Facility, readonly string[]>> = {
  info: ['info'],
  sinks: ['list', 'sinks'],
  sources: ['list', 'sources'],
  sinkInputs: ['list', 'sink-inputs'],
  sourceOutputs: ['list', 'source-outputs'],
};

interface Observer {
  readonly facilities: ReadonlySet<Facility>;
  readonly run: (cache: Cache) => void;
}

export interface PulseAudioOptions {
  readonly run: RunProgram;
  readonly probe: ProgramProbe;
  readonly lines: LineSubscriber;
  readonly failed: (cause: unknown) => void;
}

function snapshotOf(cache: Cache): PulseSnapshot | undefined {
  const { info, sinks, sources, sinkInputs, sourceOutputs } = cache;
  if (
    info === undefined ||
    sinks === undefined ||
    sources === undefined ||
    sinkInputs === undefined ||
    sourceOutputs === undefined
  ) {
    return undefined;
  }
  return { info, sinks, sources, sinkInputs, sourceOutputs };
}

function merged(parts: readonly Cache[]): Cache {
  return parts.reduce<Cache>((all, part) => ({ ...all, ...part }), {});
}

export class PulseAudio implements AudioControl {
  private readonly observers = new Set<Observer>();
  private cache: Cache = {};
  private fresh = new Set<Facility>();
  private dirty = new Set<Facility>();
  private timer: NodeJS.Timeout | null = null;
  private stopStream: (() => void) | null = null;

  constructor(private readonly options: PulseAudioOptions) {}

  async features(): Promise<readonly ComputerFeature[]> {
    return (await this.options.probe(PROGRAM)) ? AUDIO_FEATURES : [];
  }

  async read(): Promise<AudioState> {
    await this.require();
    return buildAudioState(await this.loadAll());
  }

  async change(change: AudioChange): Promise<AudioState> {
    await this.require();
    const commands = pulseCommands(change, await this.loadAll());
    for (const command of commands) {
      await this.options.run(PROGRAM, command);
    }
    log.info('audio.change_applied', { action: change.action, commands: commands.length });
    return this.read();
  }

  watch(onChange: (state: AudioState) => void): StopWatching {
    return this.observe(
      ALL,
      (cache) => {
        const snapshot = snapshotOf(cache);
        return snapshot === undefined ? undefined : buildAudioState(snapshot);
      },
      onChange,
    );
  }

  watchMaster(onChange: (reading: MasterReading | null) => void): StopWatching {
    return this.observe(
      ['info', 'sinks'],
      (cache) =>
        cache.info === undefined || cache.sinks === undefined
          ? undefined
          : masterReading(cache.info, cache.sinks),
      onChange,
    );
  }

  private async require(): Promise<void> {
    if (!(await this.options.probe(PROGRAM))) {
      throw new NodeFailureError(
        'not_supported',
        "Sound control isn't available on this computer yet.",
      );
    }
  }

  private observe<T>(
    facilities: readonly Facility[],
    project: (cache: Cache) => T | undefined,
    onChange: (value: T) => void,
  ): StopWatching {
    let last: string | null = null;
    const observer: Observer = {
      facilities: new Set(facilities),
      run: (cache): void => {
        const value = project(cache);
        if (value === undefined) {
          return;
        }
        const serial = JSON.stringify(value);
        if (serial !== last) {
          last = serial;
          onChange(value);
        }
      },
    };
    this.observers.add(observer);
    this.began();
    return (): void => {
      this.observers.delete(observer);
      this.ended();
    };
  }

  private needed(): Set<Facility> {
    return new Set([...this.observers].flatMap((observer) => [...observer.facilities]));
  }

  private began(): void {
    if (this.stopStream === null) {
      this.stopStream = this.options.lines({
        program: PROGRAM,
        args: ['subscribe'],
        onLine: (line): void => {
          this.onEvent(line);
        },
        onFailure: this.options.failed,
      });
      log.debug('audio.watch_started');
    }
    this.reload(new Set([...this.needed()].filter((facility) => !this.fresh.has(facility))));
  }

  private ended(): void {
    if (this.observers.size === 0) {
      this.stopStream?.();
      this.stopStream = null;
      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.cache = {};
      this.fresh = new Set();
      this.dirty = new Set();
      log.debug('audio.watch_stopped');
      return;
    }
    const needed = this.needed();
    this.fresh = new Set([...this.fresh].filter((facility) => needed.has(facility)));
  }

  private onEvent(line: string): void {
    const object = EVENT.exec(line)?.[1];
    const facility = object === undefined ? undefined : FACILITY_OF_OBJECT[object];
    if (facility === undefined || !this.needed().has(facility)) {
      return;
    }
    this.dirty.add(facility);
    this.timer ??= setTimeout(() => {
      this.timer = null;
      const facilities = this.dirty;
      this.dirty = new Set();
      this.reload(facilities);
    }, DEBOUNCE_MS);
  }

  private reload(facilities: ReadonlySet<Facility>): void {
    if (facilities.size === 0) {
      return;
    }
    Promise.all([...facilities].map((facility) => this.load(facility))).then((loaded) => {
      this.cache = { ...this.cache, ...merged(loaded) };
      facilities.forEach((facility) => this.fresh.add(facility));
      this.observers.forEach((observer) => {
        if ([...facilities].some((facility) => observer.facilities.has(facility))) {
          observer.run(this.cache);
        }
      });
    }, this.options.failed);
  }

  private async loadAll(): Promise<PulseSnapshot> {
    const loaded = await Promise.all(ALL.map((facility) => this.load(facility)));
    const snapshot = snapshotOf(merged(loaded));
    if (snapshot === undefined) {
      throw new NodeFailureError('failed', 'pactl did not report every sound facility.');
    }
    return snapshot;
  }

  private async load(facility: Facility): Promise<Cache> {
    const text = await this.options.run(PROGRAM, ['-f', 'json', ...LIST_ARGUMENTS[facility]]);
    switch (facility) {
      case 'info':
        return { info: parseInfo(text) };
      case 'sinks':
        return { sinks: parseDevices(text, 'sinks') };
      case 'sources':
        return { sources: parseDevices(text, 'sources') };
      case 'sinkInputs':
        return { sinkInputs: parseStreams(text, 'sink inputs') };
      case 'sourceOutputs':
        return { sourceOutputs: parseStreams(text, 'source outputs') };
    }
  }
}
