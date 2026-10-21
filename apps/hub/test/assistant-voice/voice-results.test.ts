import { describe, expect, it } from 'vitest';
import { VOICE_RESULT_GUARD_CHARS, voiceResponseOf } from '../../src/assistant-voice/voice-results';
import { captureLogs } from '../support/logs';

describe('the voice tool results', () => {
  it('give device_find as a summary of id, name, room, family, online and capability keys', () => {
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
    expect(voiceResponseOf('device_find', {}, response)).toEqual({
      devices: [
        {
          id: 'd1',
          name: 'Lamp',
          family: 'light',
          online: true,
          room: 'Kitchen',
          capabilities: ['power', 'brightness'],
        },
      ],
    });
  });

  it('keep a false value that matters and the options a control needs in device_read', () => {
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
    expect(voiceResponseOf('device_read', {}, response)).toEqual({
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

  it('shortens home_read when it is reached through tool_call', () => {
    const response = { homes: [{ name: 'Home', latitude: 1, longitude: 2, rooms: 3 }] };
    expect(voiceResponseOf('tool_call', { name: 'home_read' }, response)).toEqual({
      homes: [{ name: 'Home', rooms: 3 }],
    });
  });

  it('leaves other tools and errors untouched', () => {
    const other = { a: null, b: [] };
    expect(voiceResponseOf('weather_read', {}, other)).toBe(other);
    const failed = { error: 'no', devices: [] };
    expect(voiceResponseOf('device_find', {}, failed)).toBe(failed);
  });

  it('stop an oversized result as a last resort, say so to the model and warn with the tool and size', () => {
    const logs = captureLogs();
    const result = voiceResponseOf(
      'tool_call',
      { name: 'some_plugin__dump' },
      { rows: 'x'.repeat(60_000) },
    );
    expect(typeof result['over_guard']).toBe('string');
    expect(String(result['start'])).toHaveLength(VOICE_RESULT_GUARD_CHARS);
    expect(JSON.stringify(result).length).toBeLessThan(VOICE_RESULT_GUARD_CHARS + 400);
    const warning = logs.records.find((record) => record.event === 'voice.result_over_guard');
    expect(warning?.level).toBe('warn');
    expect(warning?.payload).toMatchObject({ tool: 'some_plugin__dump', chars: 60_011 });
    expect(voiceResponseOf('tool_call', {}, { ok: true })).toEqual({ ok: true });
  });
});
