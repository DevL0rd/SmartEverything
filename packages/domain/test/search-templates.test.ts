import { describe, expect, it } from 'vitest';
import {
  buildSearchIndex,
  presentDevice,
  typedNumberEntries,
  type SearchDevice,
  type SearchSources,
} from '../src';

const conditioner: SearchDevice = {
  id: 'conditioner',
  name: 'Air conditioner',
  room: 'Bedroom',
  kind: 'air_conditioner',
  model: 'Model',
  online: true,
  favourite: false,
  capabilities: [
    {
      key: 'target_temperature',
      label: 'Target temperature',
      access: 'read_write',
      value: { kind: 'number', min: 16, max: 30, step: 0.5, unit: '°C' },
    },
  ],
  state: {},
};

const sources: SearchSources = {
  devices: [conditioner],
  rooms: [],
  pages: [],
  settings: [],
  scenes: [],
  automations: [],
  irRemotes: [],
  cameras: [],
};

describe('number templates', () => {
  it('hold the presentation the device already computed', () => {
    const [template] = buildSearchIndex(sources).numbers;
    const shared = presentDevice(conditioner).capabilities.find(
      (presented) => presented.capability.key === 'target_temperature',
    );
    expect(template?.presented).toBe(shared);
  });

  it('title typed values with the presented label', () => {
    const index = buildSearchIndex(sources);
    const [typed] = typedNumberEntries(index, 21.5);
    expect(typed?.title).toBe(
      `${index.numbers[0]?.presented.label ?? ''} 21.5°C — Air conditioner`,
    );
  });
});
