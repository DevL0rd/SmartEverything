import { describe, expect, it } from 'vitest';
import type { JsonValue } from '@smarteverything/domain';
import { vacuumDevice, vacuumPresentation } from '../sections/settings-fixture';
import { UNREADABLE_FACT, aboutFactsOf, softwareVersionOf } from './about-facts';

const device = vacuumDevice();
const presentation = vacuumPresentation(device);

function factsWith(values: Readonly<Record<string, JsonValue>>): readonly [string, string][] {
  return aboutFactsOf({
    presentation,
    read: (key) => values[key],
    deviceModel: device.model,
  }).map((fact) => [fact.title, fact.text]);
}

describe('softwareVersionOf', () => {
  it('reads the base version out of the JSON the robot reports', () => {
    expect(softwareVersionOf('{"base_version":"0.1.0.63"}')).toBe('0.1.0.63');
  });

  it('keeps a plain version and reports nothing for an empty one', () => {
    expect(softwareVersionOf('4.3.3_0093')).toBe('4.3.3_0093');
    expect(softwareVersionOf('')).toBeNull();
    expect(softwareVersionOf(undefined)).toBeNull();
  });

  it('fails loudly on JSON without a base version', () => {
    expect(() => softwareVersionOf('{"other":1}')).toThrow(/base_version/u);
    expect(() => softwareVersionOf('{broken')).toThrow(/base_version/u);
  });
});

describe('aboutFactsOf', () => {
  it('shows the parsed version, the model and the full serial, and hides empty rows', () => {
    expect(
      factsWith({
        'raw:2.1': '{"base_version":"0.1.0.63"}',
        firmware: '',
        'raw:1.2': '',
        'raw:1.5': '00232201000000268A03169',
      }),
    ).toStrictEqual([
      ['Robot software', '0.1.0.63'],
      ['Model', 'xiaomi.vacuum.pv11gl'],
      ['Serial number', '00232201000000268A03169'],
    ]);
  });

  it('shows a firmware row only when it differs from the robot software', () => {
    expect(factsWith({ 'raw:2.1': '1.2', firmware: '1.2' }).map(([title]) => title)).toStrictEqual([
      'Robot software',
      'Model',
    ]);
    expect(factsWith({ firmware: '4.1.0' })).toContainEqual(['Firmware', '4.1.0']);
  });

  it('says the version is not readable instead of showing raw JSON', () => {
    expect(factsWith({ 'raw:2.1': '{"x":1}' })).toContainEqual(['Robot software', UNREADABLE_FACT]);
  });
});
