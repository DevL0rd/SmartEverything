import type { AudioChange } from '@smarteverything/domain';
import { NodeFailureError } from '../../node-failure';
import { groupStreams, type PulseDevice, type PulseSnapshot } from './pulse-parse';

export type PulseCommand = readonly string[];

type Kind = 'output' | 'input';

const DEFAULT_DEVICE: Readonly<Record<Kind, string>> = {
  output: '@DEFAULT_SINK@',
  input: '@DEFAULT_SOURCE@',
};

const NOUN: Readonly<Record<Kind, string>> = { output: 'sink', input: 'source' };

function percent(level: number): string {
  return `${String(Math.round(level))}%`;
}

function devicesOf(snapshot: PulseSnapshot, kind: Kind): readonly PulseDevice[] {
  return kind === 'output' ? snapshot.sinks : snapshot.sources;
}

function resolveDevice(snapshot: PulseSnapshot, kind: Kind, reference: string): string {
  const wanted = reference.toLowerCase();
  const devices = devicesOf(snapshot, kind);
  const match =
    devices.find((device) => device.name === reference) ??
    devices.find((device) => device.name.toLowerCase() === wanted) ??
    devices.find((device) => device.description.toLowerCase() === wanted);
  if (match === undefined) {
    throw new NodeFailureError('not_found', `No ${kind} device matches "${reference}".`);
  }
  return match.name;
}

function deviceOf(snapshot: PulseSnapshot, kind: Kind, reference: string | undefined): string {
  return reference === undefined ? DEFAULT_DEVICE[kind] : resolveDevice(snapshot, kind, reference);
}

function streamsOf(snapshot: PulseSnapshot, app: string): readonly string[] {
  const streams = groupStreams(snapshot.sinkInputs, app);
  if (streams.length === 0) {
    throw new NodeFailureError('not_found', `No app named "${app}" is playing sound.`);
  }
  return streams.map((stream) => String(stream.index));
}

export function pulseCommands(
  change: AudioChange,
  snapshot: PulseSnapshot,
): readonly PulseCommand[] {
  switch (change.action) {
    case 'volume':
      return [
        [
          `set-${NOUN[change.kind]}-volume`,
          deviceOf(snapshot, change.kind, change.device),
          percent(change.level),
        ],
      ];
    case 'mute':
      return [
        [
          `set-${NOUN[change.kind]}-mute`,
          deviceOf(snapshot, change.kind, change.device),
          change.muted ? '1' : '0',
        ],
      ];
    case 'default':
      return [
        [`set-default-${NOUN[change.kind]}`, resolveDevice(snapshot, change.kind, change.device)],
      ];
    case 'app_volume':
      return streamsOf(snapshot, change.app).map((id) => [
        'set-sink-input-volume',
        id,
        percent(change.level),
      ]);
    case 'app_mute':
      return streamsOf(snapshot, change.app).map((id) => [
        'set-sink-input-mute',
        id,
        change.muted ? '1' : '0',
      ]);
    case 'app_output': {
      const sink = resolveDevice(snapshot, 'output', change.output);
      return streamsOf(snapshot, change.app).map((id) => ['move-sink-input', id, sink]);
    }
  }
}
