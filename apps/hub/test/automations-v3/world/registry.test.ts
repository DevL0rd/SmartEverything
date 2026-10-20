import { NODE_REGISTRY } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AGGREGATE_FUNCTION_IDS } from '../../../src/automations/world-v3/aggregate';
import { weatherOutputName } from '../../../src/automations/world-v3/weather';
import { readKindIds } from '../../../src/automations/world-v3/world-reads';
import { WEATHER_METRICS } from '@smarteverything/domain';
import { furnish, type Home } from './support';

let home: Home;

beforeEach(async () => {
  home = await furnish();
});

afterEach(async () => {
  await home.test.close();
});

describe('the world reads and the node registry', () => {
  it('answers every read kind of the registry', () => {
    const unanswered = readKindIds().filter((kind) => {
      try {
        home.read(kind);
        return false;
      } catch (cause) {
        return cause instanceof Error && cause.message.includes('is not something the home');
      }
    });
    expect(readKindIds()).toContain('device.get');
    expect(unanswered).toEqual([]);
  });

  it('refuses a kind that is not a read', () => {
    expect(() => home.read('device.set')).toThrow(/not something the home can be asked/);
  });

  it('lists the aggregate functions the node offers', () => {
    const fn = NODE_REGISTRY.get('device.aggregate')?.inputs.find((port) => port.name === 'fn');
    const options = fn?.type.t === 'choice' ? fn.type.options.map((option) => option.id) : [];
    expect([...AGGREGATE_FUNCTION_IDS]).toEqual(options);
  });

  it('names the weather outputs exactly as the node does', () => {
    const outputs = NODE_REGISTRY.get('weather.read')?.outputs.map((port) => port.name) ?? [];
    expect(outputs).toEqual([...WEATHER_METRICS.map(weatherOutputName), 'kind']);
  });

  it('fills the defaults the node declares', () => {
    home.write(home.lampA, 'power', true);
    expect(home.read('device.get', { device: { device: home.lampA.id } }).outputs['value']).toBe(
      true,
    );
  });
});
