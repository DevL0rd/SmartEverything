import {
  appendTo,
  type AudioApp,
  type AudioDevice,
  type AudioState,
} from '@smarteverything/domain';
import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';
import { messageOf } from '@smarteverything/logging';

const UNCONNECTED = 4_294_967_295;
const PERCENT = /(\d+)%/;
const MAX_VOLUME = 150;
const UNKNOWN_APP = 'Unknown app';
const PEAK_DETECT = 'Peak detect';

const PROPERTIES = z.record(z.string(), z.unknown());

const VOLUME = z.record(z.string(), z.object({ value_percent: z.string() }));

const DEVICE = z.object({
  index: z.number(),
  name: z.string(),
  description: z.string(),
  mute: z.boolean(),
  volume: VOLUME,
  ports: z.array(z.object({ name: z.string(), availability: z.string() })).optional(),
  active_port: z.string().nullable().optional(),
  monitor_of_sink: z.string().nullable().optional(),
  properties: PROPERTIES,
});

const STREAM = z.object({
  index: z.number(),
  mute: z.boolean(),
  volume: VOLUME,
  properties: PROPERTIES,
  sink: z.number().optional(),
  source: z.number().optional(),
});

const INFO = z.object({ default_sink_name: z.string(), default_source_name: z.string() });

export type PulseDevice = z.infer<typeof DEVICE>;

export type PulseStream = z.infer<typeof STREAM>;

export type PulseInfo = z.infer<typeof INFO>;

export interface PulseSnapshot {
  readonly info: PulseInfo;
  readonly sinks: readonly PulseDevice[];
  readonly sources: readonly PulseDevice[];
  readonly sinkInputs: readonly PulseStream[];
  readonly sourceOutputs: readonly PulseStream[];
}

export interface MasterReading {
  readonly volume: number;
  readonly muted: boolean;
}

function parsed<T>(schema: z.ZodType<T>, text: string, what: string): T {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    throw new NodeFailureError(
      'failed',
      `pactl returned ${what} that is not JSON: ${messageOf(cause)}`,
    );
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new NodeFailureError(
      'failed',
      `pactl returned ${what} in a shape we do not know: ${result.error.message.slice(0, 200)}`,
    );
  }
  return result.data;
}

export function parseInfo(text: string): PulseInfo {
  return parsed(INFO, text, 'server info');
}

export function parseDevices(text: string, what: string): readonly PulseDevice[] {
  return parsed(z.array(DEVICE), text, what);
}

export function parseStreams(text: string, what: string): readonly PulseStream[] {
  return parsed(z.array(STREAM), text, what);
}

function volumePercent(volume: z.infer<typeof VOLUME>): number {
  const levels = Object.values(volume).map((channel) => {
    const percent = PERCENT.exec(channel.value_percent)?.[1];
    return percent === undefined ? 0 : Number(percent);
  });
  return Math.min(MAX_VOLUME, Math.max(0, ...levels));
}

function text(properties: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = properties[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function isUsable(device: PulseDevice): boolean {
  return !device.name.endsWith('.monitor') && (device.monitor_of_sink ?? null) === null;
}

function isAvailable(device: PulseDevice): boolean {
  const port = device.ports?.find((candidate) => candidate.name === device.active_port);
  return port?.availability !== 'not available';
}

function isHdmi(device: PulseDevice): boolean {
  return (
    device.name.includes('hdmi') || usesPort(device, 'hdmi') || usesPort(device, 'displayport')
  );
}

function usesPort(device: PulseDevice, word: string): boolean {
  return device.active_port?.includes(word) === true;
}

function physicalKind(device: PulseDevice): AudioDevice['kind'] | null {
  const form = text(device.properties, 'device.form_factor');
  if (form === 'headset' || form === 'hands-free') {
    return 'headset';
  }
  if (form === 'headphone' || usesPort(device, 'headphones')) {
    return 'headphones';
  }
  return text(device.properties, 'device.bus') === 'bluetooth' ? 'bluetooth' : null;
}

function deviceKind(device: PulseDevice, input: boolean): AudioDevice['kind'] {
  if (isHdmi(device)) {
    return 'hdmi';
  }
  const physical = physicalKind(device);
  if (physical !== null) {
    return physical;
  }
  if (input) {
    return 'microphone';
  }
  if (text(device.properties, 'device.form_factor') === 'speaker' || usesPort(device, 'speaker')) {
    return 'speakers';
  }
  return text(device.properties, 'device.bus') === 'usb' ? 'usb' : 'other';
}

function appKey(properties: Readonly<Record<string, unknown>>): string {
  return (
    text(properties, 'application.name') ??
    text(properties, 'application.process.binary') ??
    text(properties, 'media.name') ??
    UNKNOWN_APP
  );
}

function byName(left: string, right: string): number {
  return left.localeCompare(right);
}

function usedBy(streams: readonly PulseStream[], index: number, side: 'sink' | 'source'): string[] {
  const names = streams
    .filter((stream) => stream[side] === index)
    .filter((stream) => text(stream.properties, 'media.name') !== PEAK_DETECT)
    .map((stream) => appKey(stream.properties));
  return [...new Set(names)].toSorted(byName);
}

function audioDevice(
  device: PulseDevice,
  defaultName: string,
  streams: readonly PulseStream[],
  input: boolean,
): AudioDevice {
  return {
    id: device.name,
    name: device.description,
    kind: deviceKind(device, input),
    isDefault: device.name === defaultName,
    available: isAvailable(device),
    volume: volumePercent(device.volume),
    muted: device.mute,
    maxVolume: MAX_VOLUME,
    batteryPercent: null,
    usedBy: usedBy(streams, device.index, input ? 'source' : 'sink'),
  };
}

function groupApps(streams: readonly PulseStream[], sinks: readonly PulseDevice[]): AudioApp[] {
  const groups = new Map<string, PulseStream[]>();
  for (const stream of streams) {
    if (stream.sink === UNCONNECTED) {
      continue;
    }
    const key = appKey(stream.properties);
    appendTo(groups, key, stream);
  }
  return [...groups]
    .toSorted(([left], [right]) => byName(left, right))
    .map(([key, members]) => {
      const first = members[0];
      const sink = sinks.find((candidate) => candidate.index === first?.sink);
      return {
        streamId: key,
        app: key,
        icon:
          members
            .map((member) => text(member.properties, 'application.icon_name'))
            .find((icon) => icon !== null) ?? null,
        volume: Math.max(...members.map((member) => volumePercent(member.volume))),
        muted: members.every((member) => member.mute),
        outputId: sink?.name ?? null,
      };
    });
}

export function groupStreams(streams: readonly PulseStream[], reference: string): PulseStream[] {
  const wanted = reference.toLowerCase();
  return streams.filter((stream) => {
    const key = appKey(stream.properties).toLowerCase();
    return stream.sink !== UNCONNECTED && key === wanted;
  });
}

export function buildAudioState(snapshot: PulseSnapshot): AudioState {
  return {
    outputs: snapshot.sinks
      .filter(isUsable)
      .map((sink) =>
        audioDevice(sink, snapshot.info.default_sink_name, snapshot.sinkInputs, false),
      ),
    inputs: snapshot.sources
      .filter(isUsable)
      .map((source) =>
        audioDevice(source, snapshot.info.default_source_name, snapshot.sourceOutputs, true),
      ),
    apps: groupApps(snapshot.sinkInputs, snapshot.sinks),
  };
}

export function masterReading(
  info: PulseInfo,
  sinks: readonly PulseDevice[],
): MasterReading | null {
  const sink = sinks.find((candidate) => candidate.name === info.default_sink_name);
  return sink === undefined ? null : { volume: volumePercent(sink.volume), muted: sink.mute };
}
