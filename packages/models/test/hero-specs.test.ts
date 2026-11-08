import { AIR_BANDS, MODEL_SPEC, type ModelSpec } from '@smarteverything/domain';
import { SAMSUNG_S95B_65_MODEL } from '@smarteverything/smartthings';
import {
  MIJIA_EVAPORATIVE_HUMIDIFIER_PRO_MODEL,
  MIJIA_WASHER_DRYER_F29GL_MODEL,
  XIAOMI_AIR_PURIFIER_4_PRO_MODEL,
  XIAOMI_SMART_TOWER_FAN_2_MODEL,
} from '@smarteverything/xiaomi';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring } from '../src/index';

const HEROES: readonly ModelSpec[] = [
  XIAOMI_SMART_TOWER_FAN_2_MODEL,
  XIAOMI_AIR_PURIFIER_4_PRO_MODEL,
  MIJIA_EVAPORATIVE_HUMIDIFIER_PRO_MODEL,
  MIJIA_WASHER_DRYER_F29GL_MODEL,
  SAMSUNG_S95B_65_MODEL,
];

function channel(spec: ModelSpec, id: string): NonNullable<ModelSpec['channels']>[number] {
  const found = spec.channels?.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no channel ${id}`);
  return found;
}

function enumTable(spec: ModelSpec, id: string): Readonly<Record<string, unknown>> {
  const { map } = channel(spec, id);
  if (map.type !== 'enum') throw new Error(`${id} is not an enum map`);
  return map.table;
}

function threshold(spec: ModelSpec, id: string): number {
  const { map } = channel(spec, id);
  if (map.type !== 'linear') throw new Error(`${id} is not a linear map`);
  return map.in[1];
}

describe('the hero specs of the fan, purifier, humidifier, washer-dryer and TV', () => {
  it.each(HEROES.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly and passes every authoring check',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
    },
  );

  it('are all in the registry', () => {
    const ids = new Set(MODEL_REGISTRY.map((spec) => spec.id));

    expect(HEROES.filter((spec) => !ids.has(spec.id))).toStrictEqual([]);
  });
});

describe('rich states', () => {
  it('tints the purifier outlet ring, strip and halo light for every air quality band', () => {
    for (const id of ['ringBand', 'stripBand', 'lightBand']) {
      expect(Object.keys(enumTable(XIAOMI_AIR_PURIFIER_4_PRO_MODEL, id))).toStrictEqual([
        ...AIR_BANDS,
      ]);
    }
    const { autoGood, boostPoor } = XIAOMI_AIR_PURIFIER_4_PRO_MODEL.states ?? {};

    expect(autoGood?.['airQuality']).toBe('good');
    expect(boostPoor?.['airQuality']).toBe('poor');
  });

  it('raises the humidifier water through the tank window by the water level', () => {
    const rise = channel(MIJIA_EVAPORATIVE_HUMIDIFIER_PRO_MODEL, 'waterRise');

    expect(rise).toMatchObject({ target: 'water', property: 'translate', source: 'waterLevel' });
    expect(enumTable(MIJIA_EVAPORATIVE_HUMIDIFIER_PRO_MODEL, 'refillRing')).toStrictEqual({
      true: '#F2C14E',
    });
  });

  it('lights one washer progress segment per eighteenth of the cycle', () => {
    const shown = (progress: number): number =>
      Array.from({ length: 18 }, (_, index) =>
        threshold(MIJIA_WASHER_DRYER_F29GL_MODEL, `arcShow${String(index + 1)}`),
      ).filter((at) => at <= progress).length;

    expect([0, 0.3, 0.5, 0.9, 1].map(shown)).toStrictEqual([0, 5, 9, 16, 18]);
  });

  it('no longer paints the drying drum brown', () => {
    const targets = (MIJIA_WASHER_DRYER_F29GL_MODEL.channels ?? [])
      .filter((entry) => entry.property === 'colour')
      .map((entry) => entry.target);

    expect(targets).not.toContain('drum');
  });

  it('gives the TV a distinct playing picture and a glare band that shows when off', () => {
    const playing = (SAMSUNG_S95B_65_MODEL.channels ?? []).filter(
      (entry) => entry.source === 'playing',
    );
    const parts = SAMSUNG_S95B_65_MODEL.parts.map((part) => part.id);

    expect(playing.map((entry) => entry.property)).toContain('translate');
    expect(playing.map((entry) => entry.property)).toContain('colour');
    expect(parts).toContain('glare');
  });
});
