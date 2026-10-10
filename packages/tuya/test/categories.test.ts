import { describe, expect, it } from 'vitest';
import { IR_REMOTE_CATEGORY_PREFIX, kindOf } from '../src';

const CATEGORIES_BY_KIND: Readonly<Record<string, readonly string[]>> = {
  light: ['dj', 'dd', 'xdd', 'fwd', 'dc', 'tgq', 'tgkg', 'tyndj', 'gyd', 'sxd', 'dsd', 'fsd'],
  cover: ['cl', 'clkg', 'ckmkzq', 'mc', 'jdcljqr'],
  switch: ['kg', 'tdq', 'cjkg', 'dlq', 'ckqdkg'],
  plug: ['cz', 'pc'],
  air_purifier: ['kj'],
  humidifier: ['jsq', 'xxj'],
  dehumidifier: ['cs'],
  air_conditioner: ['kt', 'ktkzq'],
  heater: ['qn', 'rs', 'bgl', 'dr'],
  fan: ['fs', 'fskg'],
  thermostat: ['wk', 'wkf'],
  sensor: [
    'wsdcg',
    'mcs',
    'pir',
    'sj',
    'ywbj',
    'rqbj',
    'jwbj',
    'cobj',
    'co2bj',
    'hjjcy',
    'ldcg',
    'zd',
    'hps',
    'ylcg',
    'qxj',
    'ywcgq',
    'pm2.5',
    'voc',
    'zndb',
    'wxkg',
    'sos',
  ],
  camera: ['sp'],
  lock: ['ms', 'jtmspro', 'jtmsbh', 'gyms', 'videolock'],
  vacuum: ['sd'],
  ir_blaster: ['wnykq'],
  gateway: ['wg2', 'wg', 'wfcon'],
  appliance: ['bh', 'cwwsq', 'cwysj', 'msp', 'kfj', 'mzj', 'ggq', 'sgbj'],
};

describe('device kinds from Tuya categories', () => {
  it('maps every known category to its kind', () => {
    for (const [kind, categories] of Object.entries(CATEGORIES_BY_KIND)) {
      expect(categories.map(kindOf)).toStrictEqual(categories.map(() => kind));
    }
    expect(Object.values(CATEGORIES_BY_KIND).flat()).toHaveLength(78);
  });

  it('treats every infrared virtual remote category as a remote', () => {
    expect(IR_REMOTE_CATEGORY_PREFIX).toBe('infrared_');
    expect(kindOf('infrared_tv')).toBe('ir_remote');
    expect(kindOf('infrared_ac')).toBe('ir_remote');
  });

  it('calls an unknown category other, never a guess', () => {
    expect(kindOf('xyz')).toBe('other');
    expect(kindOf('constructor')).toBe('other');
    expect(kindOf('toString')).toBe('other');
  });
});
