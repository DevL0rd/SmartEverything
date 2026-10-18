import { describe, expect, it } from 'vitest';
import { voiceResponseOf } from '../../src/assistant-voice/voice-results';

describe('the voice tool results', () => {
  it('drop provider internals and empty fields from find_devices but keep ids and capability keys', () => {
    const response = {
      devices: [
        {
          id: 'd1',
          name: 'Lamp',
          family: 'light',
          kind: 'bulb',
          provider: 'tuya',
          model: 'x1',
          manufacturer: null,
          online: true,
          room_id: 'r1',
          room: 'Kitchen',
          favourite: false,
          hidden: false,
          capabilities: ['power', 'brightness'],
        },
      ],
    };
    expect(voiceResponseOf('find_devices', {}, response)).toEqual({
      devices: [
        {
          id: 'd1',
          name: 'Lamp',
          family: 'light',
          kind: 'bulb',
          online: true,
          room: 'Kitchen',
          capabilities: ['power', 'brightness'],
        },
      ],
    });
  });

  it('keep a false value that matters and the options a control needs in get_device', () => {
    const response = {
      device: { id: 'd1', name: 'Lamp', details: { ip: '10.0.0.2' }, updated_at: 't' },
      capabilities: [
        {
          key: 'power',
          label: 'Power',
          role: 'switch',
          group: 'Main',
          tier: 'primary',
          access: 'readwrite',
          writable: true,
          value_type: 'boolean',
          options: [],
          unit: null,
          value: false,
          shown_as: 'Off',
          observed_at: 't',
        },
      ],
    };
    expect(voiceResponseOf('get_device', {}, response)).toEqual({
      device: { id: 'd1', name: 'Lamp' },
      capabilities: [
        {
          key: 'power',
          label: 'Power',
          role: 'switch',
          writable: true,
          value_type: 'boolean',
          value: false,
          shown_as: 'Off',
        },
      ],
    });
  });

  it('shortens get_home when it is reached through call_tool', () => {
    const response = { homes: [{ name: 'Home', latitude: 1, longitude: 2, rooms: 3 }] };
    expect(voiceResponseOf('call_tool', { name: 'get_home' }, response)).toEqual({
      homes: [{ name: 'Home', rooms: 3 }],
    });
  });

  it('leaves other tools and errors untouched', () => {
    const other = { a: null, b: [] };
    expect(voiceResponseOf('get_weather', {}, other)).toBe(other);
    const failed = { error: 'no', devices: [] };
    expect(voiceResponseOf('find_devices', {}, failed)).toBe(failed);
  });
});
