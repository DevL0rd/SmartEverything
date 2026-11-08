import { NODE_REGISTRY } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { resolveOptions } from '../../../hosts/option-sources';
import { deviceScopeOf } from './device-scope';
import { deviceFixture } from '../../../../../store/device-fixture';

const kindInputs = (id: string): readonly string[] =>
  (NODE_REGISTRY.get(id)?.inputs ?? []).map((decl) => decl.name);

describe('deviceScopeOf', () => {
  it('uses the target port for a node that has one', () => {
    const names = kindInputs('device.set');
    expect(deviceScopeOf(names, { target: { lit: { device: 'plug' } } })).toEqual({
      target: ['plug'],
      wholeHome: false,
    });
    expect(deviceScopeOf(names, {})).toEqual({ target: [], wholeHome: false });
  });

  it('scopes tv.control to its TV', () => {
    expect(deviceScopeOf(kindInputs('tv.control'), { tv: { lit: 'living' } })).toEqual({
      target: ['living'],
      wholeHome: false,
    });
    expect(deviceScopeOf(kindInputs('tv.control'), {})).toEqual({ target: [], wholeHome: false });
  });

  it('scopes camera.move to its camera and camera.set to its target or every camera', () => {
    expect(deviceScopeOf(kindInputs('camera.move'), { camera: { lit: 'porch' } })).toEqual({
      target: ['porch'],
      wholeHome: false,
    });
    expect(deviceScopeOf(kindInputs('camera.set'), { everyCamera: { lit: true } })).toEqual({
      target: [],
      wholeHome: true,
    });
    expect(deviceScopeOf(kindInputs('camera.set'), {})).toEqual({ target: [], wholeHome: false });
  });

  it('scopes device.query to its room, rooms and group', () => {
    const names = kindInputs('device.query');
    expect(
      deviceScopeOf(names, {
        room: { lit: 'hall' },
        rooms: { lit: ['kitchen', 'bath'] },
        group: { lit: 'lights' },
      }),
    ).toEqual({ target: ['hall', 'kitchen', 'bath', 'lights'], wholeHome: true });
  });

  it('means the whole home for device.query when nothing is scoped', () => {
    expect(deviceScopeOf(kindInputs('device.query'), {})).toEqual({ target: [], wholeHome: true });
  });

  it('lets the device.query control picker list controls of the scoped devices', () => {
    const plug = deviceFixture(0, { id: 'plug', room_id: 'hall' });
    const sensor = deviceFixture(3, { id: 'sensor', room_id: 'kitchen' });
    const home = {
      devices: [plug, sensor],
      rooms: [
        { id: 'hall', name: 'Hall' },
        { id: 'kitchen', name: 'Kitchen' },
      ],
      groups: [],
      scenes: [],
      people: [],
      chats: [],
      channels: [],
      values: [],
      automations: [],
      timeZones: null,
    };
    const query = (ports: Parameters<typeof deviceScopeOf>[1]): readonly string[] => {
      const scope = deviceScopeOf(kindInputs('device.query'), ports);
      const result = resolveOptions(
        'device.controls',
        { values: {}, target: scope.target, wholeHome: scope.wholeHome, search: '' },
        home,
        { status: 'idle' },
      );
      expect(result.status).toBe('ready');
      return result.status === 'ready' ? result.options.map((option) => option.id) : [];
    };
    const everywhere = query({});
    const hallOnly = query({ room: { lit: 'hall' } });
    expect(everywhere.length).toBeGreaterThan(0);
    expect(hallOnly).toContain('power');
    expect(everywhere).toEqual(expect.arrayContaining([...hallOnly]));
    expect(everywhere.length).toBeGreaterThan(hallOnly.length);
  });
});
