import { ValueStore, useValue } from '../../../design/external-store';

export interface AudioDevice {
  readonly id: string;
  readonly label: string;
  readonly connected: boolean;
}

export interface CallAudioDevices {
  readonly inputs: readonly AudioDevice[];
  readonly outputs: readonly AudioDevice[];
  readonly headset: string | null;
  readonly outputChoosable: string | null;
}

const NO_AUDIO_DEVICES: CallAudioDevices = {
  inputs: [],
  outputs: [],
  headset: null,
  outputChoosable: null,
};

export const callAudioDevices = new ValueStore<CallAudioDevices>(NO_AUDIO_DEVICES);

export function useCallAudioDevices(): CallAudioDevices {
  return useValue(callAudioDevices);
}
