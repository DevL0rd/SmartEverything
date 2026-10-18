import type { AudioApp, AudioDevice } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { SelectOption } from '../../../components/select';
import type { Tone } from '../../../components/tone';

const NORMAL_MAX = 100;

const KIND_LABEL: Readonly<Record<AudioDevice['kind'], string>> = {
  speakers: 'Speakers',
  headphones: 'Headphones',
  headset: 'Headset',
  microphone: 'Microphone',
  hdmi: 'Screen or TV',
  bluetooth: 'Bluetooth',
  usb: 'USB',
  other: '',
};

const KIND_ICON: Readonly<Record<AudioDevice['kind'], IconName>> = {
  speakers: 'speaker',
  headphones: 'volume',
  headset: 'volume',
  microphone: 'mic',
  hdmi: 'tv',
  bluetooth: 'bluetooth',
  usb: 'usb',
  other: 'speaker',
};

export function sliderMax(device: Pick<AudioDevice, 'maxVolume'>, over: boolean): number {
  return over ? device.maxVolume : NORMAL_MAX;
}

export function deviceIcon(device: Pick<AudioDevice, 'kind'>): IconName {
  return KIND_ICON[device.kind];
}

export interface DeviceNote {
  readonly text: string;
  readonly tone: Tone;
}

export function deviceNote(device: AudioDevice): DeviceNote {
  if (!device.available) return { text: 'Unplugged', tone: 'variant' };
  if (device.usedBy.length > 0) {
    return { text: `In use by ${device.usedBy.join(', ')}`, tone: 'info' };
  }
  return { text: KIND_LABEL[device.kind], tone: 'variant' };
}

export function masterOf(outputs: readonly AudioDevice[]): AudioDevice | null {
  return outputs.find((device) => device.isDefault) ?? null;
}

export function outputOptions(outputs: readonly AudioDevice[]): readonly SelectOption<string>[] {
  return outputs
    .filter((device) => device.available)
    .map((device) => ({ value: device.id, label: device.name }));
}

export function appOutputId(app: AudioApp, outputs: readonly AudioDevice[]): string | null {
  return app.outputId ?? masterOf(outputs)?.id ?? null;
}

export function appOutputName(app: AudioApp, outputs: readonly AudioDevice[]): string {
  const id = appOutputId(app, outputs);
  return outputs.find((device) => device.id === id)?.name ?? 'Default output';
}
