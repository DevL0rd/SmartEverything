import { describe, expect, it } from 'vitest';
import { ROBOT_ENDING } from '../../src/plugins/builtin/aibi/place-instructions';
import {
  liveInstructions,
  STAYS_OPEN_ENDING,
  type Persona,
} from '../../src/assistant-voice/instructions';

const PERSONA: Persona = {
  names: ['Coordinator', 'Coco'],
  device: 'the phone',
  person: 'Sam',
  role: 'owner',
  home: 'Home',
  timeZone: 'Europe/Berlin',
  now: new Date('2026-10-10T08:00:00.000Z'),
  place: null,
  unavailable: null,
  toolIndex: 'get_weather: The weather now.',
  catalogue: 'fan_boost(speed: integer): Boosts the fan.',
  history: ['Summary of the earlier part: lights are off.', 'Sam: and the fan?'],
};

describe('voice instructions', () => {
  it('list every tool, then the guide and plugin tools, then the person and time, then the whole chat', () => {
    const text = liveInstructions(PERSONA);
    expect(text).toContain('get_weather: The weather now.');
    expect(text).toContain('Tool guide');
    expect(text).toContain('fan_boost(speed: integer): Boosts the fan.');
    expect(text.indexOf('get_weather')).toBeLessThan(text.indexOf('Tool guide'));
    expect(text.indexOf('Tool guide')).toBeLessThan(text.indexOf('fan_boost'));
    expect(text).not.toContain('find_tools');
    expect(text.indexOf('fan_boost')).toBeLessThan(text.indexOf('Local time'));
    expect(text.indexOf('Local time')).toBeLessThan(text.indexOf('Sam: and the fan?'));
    expect(text).toContain('Summary of the earlier part: lights are off.');
  });

  it('keep the stable part identical for different people and times', () => {
    const stable = (persona: Persona): string =>
      liveInstructions(persona).split('\n\nSam is')[0] ?? '';
    const other = { ...PERSONA, now: new Date('2026-10-11T20:00:00.000Z'), history: [] };
    expect(stable(other)).toBe(stable(PERSONA));
  });

  it('ends only at a natural end and never right after an answer', () => {
    const text = liveInstructions(PERSONA);
    expect(text).toContain('only at a natural end');
    expect(text).toContain('Never end it right after answering');
    expect(text).toContain('When unsure, keep it open');
    expect(text).not.toContain('in that same turn right after speaking');
  });

  it('keeps stays-open and robot endings from ending after answers', () => {
    expect(liveInstructions({ ...PERSONA, ending: STAYS_OPEN_ENDING })).toContain(
      'Never end it right after answering',
    );
    expect(ROBOT_ENDING).toContain('never end right after answering');
    expect(ROBOT_ENDING).toContain('When unsure, keep it open');
  });
});
