import { Platform } from 'react-native';
import { Logger } from '@smarteverything/logging';
import {
  addAssistantDeviceListener,
  assistantAudioDevices,
  assistantCallCan,
  type AudioDevice as NativeAudioDevice,
} from '../../../../../../modules/health-connect';
import { rawErrorText } from '../../../../../format/errors';
import { callAudioDevices, type AudioDevice } from '../../audio-devices';

const log = new Logger('app.assistant-call');

const LEGACY_OUTPUTS =
  'This version of Android can only switch between the speaker and the phone earpiece.';

const FIRST_ROUTABLE_API = 31;

const EXTERNAL_KINDS: ReadonlySet<NativeAudioDevice['kind']> = new Set([
  'wired',
  'usb',
  'bluetooth',
  'hearing_aid',
]);

function viewOf(device: NativeAudioDevice): AudioDevice {
  return { id: device.id, label: device.name, connected: true };
}

function publish(devices: readonly NativeAudioDevice[]): void {
  const inputs = devices.filter((device) => device.direction === 'input');
  const outputs = devices.filter(
    (device) => device.direction === 'output' && EXTERNAL_KINDS.has(device.kind),
  );
  const headset = [...outputs, ...inputs.filter((device) => EXTERNAL_KINDS.has(device.kind))][0];
  callAudioDevices.set({
    inputs: inputs.map(viewOf),
    outputs: outputs.map(viewOf),
    headset: headset?.name ?? null,
    outputChoosable: Number(Platform.Version) >= FIRST_ROUTABLE_API ? null : LEGACY_OUTPUTS,
  });
}

function publishCurrent(): void {
  try {
    publish(assistantAudioDevices());
  } catch (error) {
    log.warn('call.devices_unreadable', { reason: rawErrorText(error) });
  }
}

export function watchNativeDevices(): () => void {
  if (!assistantCallCan('assistantAudioDevices')) {
    return () => undefined;
  }
  publishCurrent();
  const subscription = addAssistantDeviceListener(publish);
  return (): void => {
    subscription.remove();
  };
}
