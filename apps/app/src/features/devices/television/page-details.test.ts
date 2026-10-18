import { describe, expect, it } from 'vitest';
import { deviceModelOf } from '../model/device-model';
import { heroReadingOf, readingsOf } from '../model/readings';
import { hasRemote } from '../remote/remote-section';
import { adjustableModes } from './picture-sound';
import { televisionFixture } from '../../../store/television-fixture';

describe('television page details', () => {
  it('does not repeat under the remote what the stage and remote already show', () => {
    const { device, values } = televisionFixture('livingRoom', true, { power: true });
    const model = deviceModelOf(device);
    const readings = readingsOf(model, values, heroReadingOf(model, values));
    const keys = readings.map((reading) => reading.key);
    expect(keys).not.toContain('volume');
    expect(keys).not.toContain('mute');
    expect(keys).not.toContain('input_source');
    expect(keys).not.toContain('power');
  });

  it('leaves remote keys to the television remote, not the generic remote section', () => {
    const { device } = televisionFixture('livingRoom', true);
    expect(hasRemote(device)).toBe(false);
  });

  it('offers picture and sound modes only when the TV reports a list to choose from', () => {
    const { device } = televisionFixture('livingRoom', true, { power: true });
    expect(adjustableModes(device)).toEqual([]);
  });
});
