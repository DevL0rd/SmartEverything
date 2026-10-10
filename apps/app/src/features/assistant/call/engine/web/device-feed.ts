import { Logger } from '@smarteverything/logging';
import { rawErrorText } from '../../../../../format/errors';
import { callAudioDevices, type AudioDevice } from '../../audio-devices';

const log = new Logger('app.assistant-call');

const SYSTEM_IDS: ReadonlySet<string> = new Set(['default', 'communications']);

const HEADSET = /headset|headphone|earbud|earphone|airpods|buds|hands-?free/i;

const SYSTEM_SPEAKER_ONLY = 'This browser plays the call through the system speaker.';

function devicesOf(
  all: readonly MediaDeviceInfo[],
  kind: MediaDeviceKind,
  name: string,
): AudioDevice[] {
  return all
    .filter((device) => device.kind === kind && !SYSTEM_IDS.has(device.deviceId))
    .map((device, index) => ({
      id: device.deviceId,
      label: device.label === '' ? `${name} ${String(index + 1)}` : device.label,
      connected: true,
    }));
}

function outputsChoosable(): boolean {
  return typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
}

export async function refreshDevices(): Promise<readonly string[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  const inputs = devicesOf(all, 'audioinput', 'Microphone');
  const outputs = devicesOf(all, 'audiooutput', 'Speaker');
  const headset = [...outputs, ...inputs].find((device) => HEADSET.test(device.label));
  callAudioDevices.set({
    inputs,
    outputs,
    headset: headset?.label ?? null,
    outputChoosable: outputsChoosable() ? null : SYSTEM_SPEAKER_ONLY,
  });
  return inputs.map((device) => device.id);
}

export function watchDevices(onInputs: (inputs: readonly string[]) => Promise<void>): void {
  if (typeof navigator === 'undefined' || !('mediaDevices' in navigator)) {
    return;
  }
  const refresh = (): void => {
    refreshDevices()
      .then(onInputs)
      .catch((error: unknown) => {
        log.warn('call.devices_unreadable', { reason: rawErrorText(error) });
      });
  };
  navigator.mediaDevices.addEventListener('devicechange', refresh);
  refresh();
}
