import { describe, expect, it } from 'vitest';
import { MCP_TOOLS, MCP_TOOL_LINES } from '@smarteverything/domain';
import { toolLine } from './tool-text';

describe('tool text', () => {
  it('shows the catalogue line of a tool as its row line', () => {
    const home = MCP_TOOLS.find((entry) => entry.name === 'get_home');
    expect(home).toBeDefined();
    if (home !== undefined) {
      expect(toolLine(home)).toBe('Rooms, devices, people and providers');
    }
  });

  it('titles tools the way a person says them', () => {
    const titles = Object.fromEntries(MCP_TOOLS.map((entry) => [entry.name, entry.title]));
    expect(titles).toMatchObject({
      get_home: 'See the home',
      read_phone: 'Read a phone',
      read_usage: 'Read AI costs',
      notify_person: 'Message someone',
      speak: 'Say something',
      get_weather: 'Weather',
      get_device: 'Read a device',
      get_settings: 'Read settings',
    });
  });

  it('gives every served tool a title and a short whole line without a cut mark', () => {
    for (const entry of MCP_TOOLS) {
      expect(entry.title.length, entry.name).toBeGreaterThan(0);
      expect(toolLine(entry), entry.name).toBe(MCP_TOOL_LINES[entry.name]);
      expect(toolLine(entry).length, entry.name).toBeGreaterThan(0);
      expect(toolLine(entry).length, entry.name).toBeLessThanOrEqual(60);
      expect(toolLine(entry), entry.name).not.toMatch(/…|\.\.\.|[;:(]/u);
    }
  });
});
