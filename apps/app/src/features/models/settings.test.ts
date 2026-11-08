import { describe, expect, it } from 'vitest';
import type { DeviceModels } from '@smarteverything/domain';
import {
  MODEL_PAGE,
  MODEL_PAGE_WORDS,
  ModelFileError,
  activeScopeOf,
  type CatalogueTitles,
  finishInput,
  finishLabel,
  modelPageItem,
  pickerRows,
  shownFinish,
  uploadKindOf,
} from './settings';

const HASH = 'a'.repeat(64);

function models(patch: Partial<DeviceModels['model']> = {}): DeviceModels {
  return {
    device_id: 'lamp-1',
    model: {
      id: 'dev.light.bulb',
      asset_hash: null,
      source: 'plugin-identity',
      finish: null,
      extras: [],
      ...patch,
    },
    params: {},
    identity: { brand: 'WiZ', model_string: 'bulb', hardware_model: null },
    candidates: [
      { id: 'dev.light.bulb', title: 'Bulb', category: 'lights' },
      { id: 'dev.light.globe', title: 'Globe', category: 'lights' },
    ],
    finishes: ['warmWhite', 'matte-black'],
    default_finish: 'warmWhite',
    overrides: [],
    issues: [],
  };
}

const TITLES: CatalogueTitles = {
  titleOf: (id) => (id === 'dev.light.strip' ? { title: 'Strip', category: 'lights' } : null),
};

describe('model and look page model', () => {
  it('marks the provided model first and the drawn model as chosen', () => {
    const rows = pickerRows(
      models({ id: 'dev.light.globe', source: 'device-override' }),
      'dev.light.bulb',
      TITLES,
    );
    expect(rows.map((row) => [row.id, row.provided, row.chosen])).toEqual([
      ['dev.light.bulb', true, false],
      ['dev.light.globe', false, true],
    ]);
  });

  it('adds the provided model when the candidates do not list it', () => {
    const rows = pickerRows(models(), 'dev.light.strip', TITLES);
    expect(rows[0]).toEqual({
      id: 'dev.light.strip',
      title: 'Strip',
      category: 'lights',
      provided: true,
      chosen: false,
    });
    expect(rows).toHaveLength(3);
  });

  it('chooses no catalogue row while an uploaded model is drawn', () => {
    const rows = pickerRows(
      models({ id: null, asset_hash: HASH, source: 'device-override' }),
      null,
      TITLES,
    );
    expect(rows.some((row) => row.chosen)).toBe(false);
  });

  it('names the override scope only for overrides', () => {
    expect(activeScopeOf('device-override')).toBe('device');
    expect(activeScopeOf('identity-override')).toBe('identity');
    expect(activeScopeOf('family-override')).toBe('family');
    expect(activeScopeOf('plugin-identity')).toBeNull();
    expect(activeScopeOf('none')).toBeNull();
  });

  it('keeps the drawn model when a finish is picked', () => {
    expect(finishInput(models(), 'identity', 'matte-black')).toEqual({
      scope: 'identity',
      model_id: 'dev.light.bulb',
      finish: 'matte-black',
    });
    expect(finishInput(models({ id: null, asset_hash: HASH }), 'device', 'warmWhite')).toEqual({
      scope: 'device',
      asset_hash: HASH,
      finish: 'warmWhite',
    });
    expect(finishInput(models({ id: null, source: 'none' }), 'device', 'warmWhite')).toBeNull();
  });

  it('shows the chosen finish, else the standard one, with readable labels', () => {
    expect(shownFinish(models())).toBe('warmWhite');
    expect(shownFinish(models({ finish: 'matte-black' }))).toBe('matte-black');
    expect(finishLabel('warmWhite')).toBe('Warm white');
    expect(finishLabel('matte-black')).toBe('Matte black');
  });

  it('tells a GLB from a spec file and refuses anything else', () => {
    expect(uploadKindOf('chair.bin', new Uint8Array([0x67, 0x6c, 0x54, 0x46]))).toBe('glb');
    expect(uploadKindOf('Lamp.JSON', new Uint8Array([0x7b]))).toBe('spec');
    expect(() => uploadKindOf('photo.png', new Uint8Array([0x89, 0x50]))).toThrow(ModelFileError);
  });

  it('links the search entry with its synonyms to the device sub-page', () => {
    const item = modelPageItem('lamp-1');
    expect(item.link).toEqual({
      pathname: '/device/[deviceId]/settings/[page]',
      params: { deviceId: 'lamp-1', page: MODEL_PAGE },
    });
    for (const word of ['3D model', 'look', 'appearance', 'finish', 'colour', 'upload']) {
      expect(MODEL_PAGE_WORDS).toContain(word);
    }
  });
});
