import { describe, expect, it } from 'vitest';
import { actionPhrase } from '../../src/ai-tools/action-phrases';
import type { HubTool } from '../../src/ai-tools/hub-tool';

function tool(title: string, readOnlyHint = false): HubTool {
  return {
    name: 'x',
    title,
    description: title,
    inputSchema: {},
    annotations: { readOnlyHint, destructiveHint: false, openWorldHint: false },
    origin: { kind: 'se' },
    humanOnly: false,
  };
}

const CONTROL = tool('Control devices');

describe('action phrases', () => {
  it('describe an on/off change of named devices', () => {
    const args = { deviceIds: ['a'], capability: 'power', value: true };
    expect(actionPhrase(CONTROL, args, 'the lamp')).toBe('Turned on the lamp');
  });

  it('describe a change aimed at a room, families or a search when no device is named', () => {
    const rooms = { rooms: ['Office'], capability: 'power', value: false };
    expect(actionPhrase(CONTROL, rooms, null)).toBe('Turned off the devices in Office');
    const lights = { rooms: ['Office'], families: ['light'], capability: 'power', value: true };
    expect(actionPhrase(CONTROL, lights, null)).toBe('Turned on the light devices in Office');
    const families = { families: ['air_purifier'], capability: 'power', value: true };
    expect(actionPhrase(CONTROL, families, null)).toBe('Turned on the air purifier devices');
    const search = { search: 'desk', capability: 'power', value: true };
    expect(actionPhrase(CONTROL, search, null)).toBe('Turned on the devices matching desk');
  });

  it('describe a group target with a percent scale', () => {
    const args = { group: 'Downstairs', capability: 'brightness', value: 30, scale: 'percent' };
    expect(actionPhrase(CONTROL, args, null)).toBe(
      'Set the brightness of the group Downstairs to 30 percent',
    );
  });

  it('describe a null value as running an action and a boolean on a plain capability as on or off', () => {
    expect(actionPhrase(CONTROL, { capability: 'identify', value: null }, 'the lamp')).toBe(
      'Ran identify on the lamp',
    );
    expect(actionPhrase(CONTROL, { capability: 'eco', value: true }, 'the lamp')).toBe(
      'Set the eco of the lamp to on',
    );
  });

  it('name a lookup by what it looked up, without its verb', () => {
    expect(actionPhrase(tool('Find devices', true), {}, null)).toBe('Looked up devices');
    expect(actionPhrase(tool('Search everything', true), {}, null)).toBe('Looked up everything');
    expect(actionPhrase(tool('Get a device', true), {}, null)).toBe('Looked up a device');
  });

  it('say nothing for a tool that changes nothing nameable', () => {
    expect(actionPhrase(tool('Run a scene'), { sceneId: 's' }, null)).toBeNull();
  });
});
