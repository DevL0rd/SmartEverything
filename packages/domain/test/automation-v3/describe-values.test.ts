import { describe, expect, it } from 'vitest';
import { plainStep, type WireScope } from '../../src/automation-v3/describe-wire';
import { portText } from '../../src/automation-v3/describe-values';

const NAMES: Readonly<Record<string, string>> = {
  'device:d1': 'Presence Sensor',
  'device:d2': 'Desk Lamp',
  'device:d3': 'Hall Light',
  'room:r1': 'Dining room',
};

const names = (kind: string, id: string): string | undefined => NAMES[`${kind}:${id}`];

const scope: WireScope = {
  step: () => undefined,
  variable: () => undefined,
  input: () => undefined,
  trigger: plainStep('Dining Room Switch'),
};

const text = (port: Parameters<typeof portText>[0]): string =>
  portText(port, undefined, names, scope);

describe('portText for untyped values', () => {
  it('names a device id and a room id', () => {
    expect(text({ lit: 'd1' })).toBe('Presence Sensor');
    expect(text({ lit: 'r1' })).toBe('Dining room');
  });

  it('names a target record in words', () => {
    expect(text({ lit: { room: 'r1', families: ['light'] } })).toBe('light in Dining room');
  });

  it('joins a list of ids with a count of the rest', () => {
    expect(text({ lit: ['d1', 'd2'] })).toBe('Presence Sensor, Desk Lamp');
    expect(text({ lit: ['d1', 'd2', 'd3'] })).toBe('Presence Sensor, Desk Lamp, Hall Light');
    expect(text({ lit: ['d1', 'd2', 'd3', 'x'] })).toBe('Presence Sensor, Desk Lamp, +2');
  });

  it('keeps plain numbers and text and spells other records out', () => {
    expect(text({ lit: 5 })).toBe('5');
    expect(text({ lit: 'hello' })).toBe('hello');
    expect(text({ lit: { minLevel: 3 } })).toBe('Min level: 3');
  });
});

describe('portText for wires', () => {
  it('names the source step and its output', () => {
    expect(text({ wire: { from: 'trigger', port: 'press' } })).toBe('Dining Room Switch › Press');
    expect(text({ wire: { from: 'vars', port: 'level' } })).toBe('Level (variable)');
    expect(text({ wire: { from: 'inputs', port: 'lights' } })).toBe('Lights (input)');
    expect(text({ wire: { from: 'home', port: 'timeZone' } })).toBe('Home › Time zone');
    expect(text({ wire: { from: 'gone', port: 'value' } })).toBe('Gone › Value');
  });
});
