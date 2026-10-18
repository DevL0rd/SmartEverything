import { inComponent, type RawBinding } from './bindings';
import { attributeValue, call, stringList, stringOf } from './mapper-kit';
import type { ComponentStatus } from './rest-schemas';

interface ModeSetting {
  readonly supported: string;
  readonly command: string;
}

const MODE_SETTINGS: Readonly<Record<string, ModeSetting>> = {
  'custom.picturemode.pictureMode': {
    supported: 'supportedPictureModes',
    command: 'setPictureMode',
  },
  'custom.soundmode.soundMode': { supported: 'supportedSoundModes', command: 'setSoundMode' },
  'samsungvd.lightControl.selectedMode': {
    supported: 'supportedModes',
    command: 'setLightControlMode',
  },
};

export const TV_MODE_OPTIONS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(MODE_SETTINGS).map(([source, setting]) => [source, setting.supported]),
);

export function refineTvModeBinding(binding: RawBinding, status: ComponentStatus): RawBinding {
  const source = binding.sources[0];
  const setting =
    source === undefined ? undefined : MODE_SETTINGS[`${source.capability}.${source.attribute}`];
  if (source === undefined || setting === undefined) {
    return binding;
  }
  if (stringList(attributeValue(status, source.capability, setting.supported)).length === 0) {
    return binding;
  }
  return {
    ...binding,
    capability: { ...binding.capability, access: 'read_write' },
    write: (value) =>
      inComponent(binding.component, [
        call(source.capability, setting.command, [stringOf(source.capability, value)]),
      ]),
  };
}
