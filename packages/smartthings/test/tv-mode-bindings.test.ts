import { describe, expect, it } from 'vitest';
import { CAPABILITY_DEFINITION } from '../src/definition-schema';
import { rawFromDefinition, rawFromStatus } from '../src/raw-bindings';
import { refineRawBinding, validateRawWrite } from '../src/raw-refinement';
import { refineTvModeBinding } from '../src/tv-mode-bindings';
import { statusOf } from './helpers';

const STATUS = statusOf({
  'custom.picturemode': {
    pictureMode: 'Optimised',
    supportedPictureModes: ['EyeComfort', 'Optimised'],
    supportedPictureModesMap: [
      { id: 'modeGen_589826', name: 'EyeComfort' },
      { id: 'modeIntelligent', name: 'Optimised' },
    ],
  },
  'custom.soundmode': {
    soundMode: 'Amplify',
    supportedSoundModes: ['Amplify', 'Standard', 'Game'],
  },
  'samsungvd.lightControl': { selectedMode: 'Movie', supportedModes: ['Movie', 'Game'] },
  'samsungvd.deviceCategory': { category: 'monitor' },
});

function refined(
  capability: string,
  attribute: string,
  status = STATUS,
): ReturnType<typeof refineRawBinding> {
  const context = {
    component: 'main',
    capability,
    status,
    coveredAttributes: new Set<string>(),
    coveredCommands: new Set<string>(),
  };
  const binding = rawFromStatus(context).find((entry) => entry.sources[0]?.attribute === attribute);
  if (binding === undefined) throw new Error(`no ${capability}.${attribute}`);
  return refineRawBinding(binding, status);
}

describe('picture, sound and light sync as lists', () => {
  it('offers the modes the television reports and writes the mode name', () => {
    const picture = refined('custom.picturemode', 'pictureMode');
    expect(picture.capability).toMatchObject({
      key: 'raw:custom.picturemode.picture_mode',
      access: 'read_write',
      value: { kind: 'enum', options: ['EyeComfort', 'Optimised'] },
    });
    expect(picture.write?.('EyeComfort')).toEqual([
      {
        component: 'main',
        capability: 'custom.picturemode',
        command: 'setPictureMode',
        arguments: ['EyeComfort'],
      },
    ]);
  });

  it('does the same for sound and for the monitor light sync', () => {
    const sound = refined('custom.soundmode', 'soundMode');
    expect(sound.capability.value).toEqual({
      kind: 'enum',
      options: ['Amplify', 'Standard', 'Game'],
    });
    expect(sound.write?.('Game')).toEqual([
      {
        component: 'main',
        capability: 'custom.soundmode',
        command: 'setSoundMode',
        arguments: ['Game'],
      },
    ]);
    const light = refined('samsungvd.lightControl', 'selectedMode');
    expect(light.capability.value).toEqual({ kind: 'enum', options: ['Movie', 'Game'] });
    expect(light.write?.('Movie')).toEqual([
      {
        component: 'main',
        capability: 'samsungvd.lightControl',
        command: 'setLightControlMode',
        arguments: ['Movie'],
      },
    ]);
  });

  it('refuses a mode the television does not support', () => {
    const picture = refined('custom.picturemode', 'pictureMode');
    expect(() => {
      validateRawWrite(picture, STATUS, 'Vivid');
    }).toThrow(/not one of the settings/);
    expect(() => {
      validateRawWrite(picture, STATUS, 'Optimised');
    }).not.toThrow();
  });

  it('refuses a mode that is not text', () => {
    const picture = refined('custom.picturemode', 'pictureMode');
    expect(() => picture.write?.(3)).toThrow('expected text');
  });

  it('stays read-only when the television reports no modes', () => {
    const bare = statusOf({ 'custom.picturemode': { pictureMode: 'Optimised' } });
    const picture = refined('custom.picturemode', 'pictureMode', bare);
    expect(picture.capability.access).toBe('read');
    expect(picture.write).toBeNull();
  });

  it('leaves every other attribute alone', () => {
    const category = refined('samsungvd.deviceCategory', 'category');
    expect(category.capability.access).toBe('read');
    expect(category.write).toBeNull();
    const definition = CAPABILITY_DEFINITION.parse({
      id: 'custom.picturemode',
      version: 1,
      status: 'live',
      name: 'Picture mode',
      attributes: {},
      commands: { setPictureMode: { name: 'setPictureMode', arguments: [] } },
    });
    const [action] = rawFromDefinition(
      {
        component: 'main',
        capability: 'custom.picturemode',
        status: STATUS,
        coveredAttributes: new Set(),
        coveredCommands: new Set(),
      },
      definition,
    );
    if (action === undefined) throw new Error('no action');
    expect(refineTvModeBinding(action, STATUS)).toBe(action);
    expect(refineTvModeBinding({ ...action, sources: [] }, STATUS).sources).toEqual([]);
  });
});
