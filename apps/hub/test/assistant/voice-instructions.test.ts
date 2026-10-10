import { describe, expect, it } from 'vitest';
import { liveInstructions, type Persona } from '../../src/assistant-voice/instructions';

const PERSONA: Persona = {
  names: ['Coordinator', 'Coco'],
  device: 'the phone',
  person: 'Sam',
  role: 'owner',
  home: 'Home',
  timeZone: 'Europe/Berlin',
  now: new Date('2026-10-10T08:00:00.000Z'),
  unavailable: null,
  catalogue: 'get_weather(): The weather now.',
  history: ['Summary of the earlier part: lights are off.', 'Sam: and the fan?'],
};

describe('voice instructions', () => {
  it('carry the catalogue, then the person and time, then the whole chat', () => {
    const text = liveInstructions(PERSONA);
    expect(text).toContain('get_weather(): The weather now.');
    expect(text).not.toContain('find_tools');
    expect(text.indexOf('get_weather')).toBeLessThan(text.indexOf('Local time'));
    expect(text.indexOf('Local time')).toBeLessThan(text.indexOf('Sam: and the fan?'));
    expect(text).toContain('Summary of the earlier part: lights are off.');
  });

  it('keep the stable part identical for different people and times', () => {
    const stable = (persona: Persona): string =>
      liveInstructions(persona).split('\n\nSam is')[0] ?? '';
    const other = { ...PERSONA, now: new Date('2026-10-11T20:00:00.000Z'), history: [] };
    expect(stable(other)).toBe(stable(PERSONA));
  });
});
