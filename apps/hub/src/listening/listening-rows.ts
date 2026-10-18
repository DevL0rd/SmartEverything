import {
  isPrivate,
  privacySwitchOf,
  type DeviceRow,
  type ListeningRuntimeState,
  type ListeningSource,
  type ListeningState,
  type ListeningWriting,
  type TranscriptPauseReason,
} from '@smarteverything/domain';
import type { ReachRules } from '../reach/reach-rules';
import type { Store } from '../store/store';
import type { DeviceListeningSwitches } from './listening-switches';

export type ListeningRowStore = Pick<
  Store,
  'cameras' | 'devices' | 'state' | 'talk' | 'computerNodes'
>;

export interface Runtime {
  readonly state: ListeningRuntimeState | null;
  readonly paused: TranscriptPauseReason | null;
}

export interface ListeningRowSources {
  readonly store: ListeningRowStore;
  readonly rules: Pick<ReachRules, 'cameras' | 'wakeOff'>;
  readonly switches: Pick<DeviceListeningSwitches, 'read'>;
  readonly cameraPaused: (cameraId: string) => TranscriptPauseReason | null;
  readonly runtime: (key: string) => Runtime;
}

export type BareSource = Omit<ListeningSource, 'claims'>;

export const NO_RUNTIME: Runtime = { state: null, paused: null };

function deviceName(device: DeviceRow): string {
  return device.display_name ?? device.name;
}

function stateOf(
  wanted: boolean,
  device: DeviceRow | undefined,
  runtime: Runtime,
  privacy: boolean,
): ListeningState {
  if (!wanted) return 'off';
  if (device?.online !== true) return 'offline';
  if (privacy) return 'privacy';
  return runtime.state ?? 'listening';
}

function writingOf(transcribe: boolean, paused: TranscriptPauseReason | null): ListeningWriting {
  if (!transcribe) return { state: 'off' };
  return paused === null ? { state: 'on' } : { state: 'paused', reason: paused };
}

function privateCamera(store: ListeningRowStore, device: DeviceRow): boolean {
  const privacy = privacySwitchOf(device);
  return privacy !== null && isPrivate(privacy, store.state.value(device.id, privacy.key));
}

export function cameraRows(sources: ListeningRowSources): BareSource[] {
  const { store, rules } = sources;
  const allowed = new Set(rules.cameras());
  const off = new Set(rules.wakeOff());
  return store.cameras.list().flatMap((camera) => {
    const device = store.devices.find(camera.device_id);
    if (device === undefined) return [];
    const wake = allowed.has(device.id) && !off.has(device.id);
    const runtime = sources.runtime(device.id);
    const paused = sources.cameraPaused(device.id);
    return [
      {
        key: device.id,
        kind: 'camera',
        name: deviceName(device),
        profileId: null,
        wake,
        transcribe: camera.transcribe,
        state: stateOf(wake || camera.transcribe, device, runtime, privateCamera(store, device)),
        writing: writingOf(camera.transcribe, paused),
        sensitivity: camera.wake_sensitivity,
        changeable: true,
      },
    ];
  });
}

export function deviceRows(sources: ListeningRowSources, kind: 'phone' | 'computer'): BareSource[] {
  const { store } = sources;
  return store.devices
    .list()
    .filter((device) => device.kind === kind)
    .map((device) => {
      const saved = sources.switches.read(device.id);
      const runtime = sources.runtime(device.id);
      return {
        key: device.id,
        kind,
        name: deviceName(device),
        profileId: personOfDevice(store, device),
        wake: saved.wake,
        transcribe: saved.transcribe,
        state: stateOf(saved.wake || saved.transcribe, device, runtime, false),
        writing: writingOf(saved.transcribe, runtime.paused),
        sensitivity: saved.sensitivity,
        ...(kind === 'phone' ? { power_mode: saved.powerMode } : {}),
        changeable: true,
      };
    });
}

export function personOfDevice(
  store: Pick<Store, 'computerNodes'>,
  device: Pick<DeviceRow, 'id' | 'kind' | 'details'>,
): string | null {
  if (device.kind === 'computer') return store.computerNodes.personOf(device.id);
  const profileId = device.details['profileId'];
  return typeof profileId === 'string' ? profileId : null;
}

export function walkieRows(
  store: ListeningRowStore,
  runtime: (key: string) => Runtime,
): BareSource[] {
  return store.talk.channels().map((channel) => ({
    key: channel.id,
    kind: 'walkie',
    name: channel.name,
    profileId: null,
    wake: channel.ai_listens,
    transcribe: channel.ai_listens,
    state: channel.ai_listens ? (runtime(channel.id).state ?? 'listening') : 'off',
    writing: { state: channel.ai_listens ? 'on' : 'off' },
    sensitivity: null,
    changeable: false,
  }));
}
