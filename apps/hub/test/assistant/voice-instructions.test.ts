import { describe, expect, it } from 'vitest';
import { DEFAULT_RESPONSE_STYLE } from '@smarteverything/domain';
import { PLAY } from '../../src/assistant/personality';
import { ROBOT_ENDING } from '../../src/plugins/builtin/aibi/place-instructions';
import {
  conversationNote,
  liveInstructions,
  STAYS_OPEN_ENDING,
  type Persona,
  type VoiceNote,
} from '../../src/assistant-voice/instructions';

const PERSONA: Persona = {
  names: ['Coordinator', 'Coco'],
  home: 'Home',
  style: undefined,
  instructions: '',
  place: null,
  unavailable: null,
  toolIndex: 'get_weather: The weather now.',
  catalogue: 'fan_boost(speed: integer): Boosts the fan.',
};

const NOTE: VoiceNote = {
  person: 'Sam',
  role: 'owner',
  device: 'the phone',
  screenRule: null,
  timeZone: 'Europe/Berlin',
  now: new Date('2026-10-10T08:00:00.000Z'),
  place: 'You are in the kitchen.',
  recentSpeech: 'Heard just before: is the fan on?',
  history: ['Summary of the earlier part: lights are off.', 'Sam: and the fan?'],
  since: 'start',
  starting: true,
};

describe('voice instructions', () => {
  it('list every tool, then the guide and plugin tools', () => {
    const text = liveInstructions(PERSONA);
    expect(text).toContain('get_weather: The weather now.');
    expect(text).toContain('Tool guide');
    expect(text).toContain('fan_boost(speed: integer): Boosts the fan.');
    expect(text.indexOf('get_weather')).toBeLessThan(text.indexOf('Tool guide'));
    expect(text.indexOf('Tool guide')).toBeLessThan(text.indexOf('fan_boost'));
    expect(text).not.toContain('find_tools');
  });

  it('keep the person, time, place, recent speech and chat out of the held instruction', () => {
    const text = liveInstructions({ ...PERSONA, place: NOTE.place });
    for (const volatile of ['Sam is', 'Local time', 'kitchen', 'is the fan on', 'and the fan?']) {
      expect(text).not.toContain(volatile);
    }
  });
});

describe('the conversation note', () => {
  it('carries the person, device, time, place, recent speech and the whole chat at a fresh start', () => {
    const text = conversationNote(NOTE);
    expect(text).toContain('Sam is the owner of the home, talking through the phone.');
    expect(text).toContain('Local time: Saturday, October 10, 2026 at 10:00 AM (Europe/Berlin)');
    expect(text).toContain('You are in the kitchen.');
    expect(text).toContain('Heard just before: is the fan on?');
    expect(text).toContain('This chat so far (calls are speech-to-text):');
    expect(text).toContain('Summary of the earlier part: lights are off.');
    expect(text.indexOf('Local time')).toBeLessThan(text.indexOf('Sam: and the fan?'));
    expect(text).toMatch(
      /New conversation\. Earlier conversations in your memory may be out of date/,
    );
  });

  it('names only what is new since the held session last talked', () => {
    const text = conversationNote({ ...NOTE, since: 'last_talk', history: ['Sam: new text'] });
    expect(text).toContain(
      'New in this chat since you last talked (calls are speech-to-text):\nSam: new text',
    );
    expect(text).not.toContain('This chat so far');
  });

  it('leaves out the new-conversation marker when a call renews its connection', () => {
    expect(conversationNote({ ...NOTE, starting: false })).not.toContain('New conversation');
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

const SUPPRESSIVE = [
  /no small talk/iu,
  /never (role-?play|joke|play)/iu,
  /stay on (task|topic)/iu,
  /only (talk|answer) about the home/iu,
  /tone (and presentation )?only/iu,
  /when appropriate/iu,
  /short spoken sentences/iu,
];

describe('the voice personality', () => {
  it('opens with the personality and the play permission, before the call manner and tools', () => {
    const text = liveInstructions(PERSONA);
    const personality = text.indexOf('Your personality, which you keep in every reply:');
    expect(personality).toBeGreaterThan(0);
    expect(personality).toBeLessThan(text.indexOf(PLAY));
    expect(text.indexOf(PLAY)).toBeLessThan(text.indexOf('This is a live voice call'));
    expect(text.indexOf(PLAY)).toBeLessThan(text.indexOf('Tools are how you see'));
    expect(text).toContain('20 questions');
  });

  it('is warm, witty and playful when no personality is set', () => {
    expect(liveInstructions(PERSONA)).toContain('Warm, witty and playful');
    const empty = { ...DEFAULT_RESPONSE_STYLE, personality: 'custom' as const };
    expect(liveInstructions({ ...PERSONA, style: empty })).toContain('Warm, witty and playful');
  });

  it('uses the chosen preset, custom text and owner instructions', () => {
    const wry = { ...DEFAULT_RESPONSE_STYLE, personality: 'wry' as const };
    expect(liveInstructions({ ...PERSONA, style: wry })).toContain('Wry: dry, deadpan humour');
    const custom = {
      ...DEFAULT_RESPONSE_STYLE,
      personality: 'custom' as const,
      custom_personality: 'A cheeky pirate.',
    };
    const text = liveInstructions({ ...PERSONA, style: custom, instructions: 'Call me captain.' });
    expect(text).toContain('A cheeky pirate.');
    expect(text).toContain('Owner instructions:\nCall me captain.');
  });

  it('lets a plugin place give its own character', () => {
    expect(liveInstructions(PERSONA)).not.toContain('another character');
    expect(liveInstructions({ ...PERSONA, place: 'You are a robot.' })).toContain('play that one');
  });

  it('never treats a game in progress as a natural end', () => {
    expect(liveInstructions(PERSONA)).toContain(
      'A game, story or chat in progress is never a natural end.',
    );
  });

  it('carries no wording that suppresses play, for every ending', () => {
    for (const ending of [undefined, STAYS_OPEN_ENDING, ROBOT_ENDING]) {
      const text = liveInstructions(ending === undefined ? PERSONA : { ...PERSONA, ending });
      SUPPRESSIVE.forEach((phrase) => {
        expect(text).not.toMatch(phrase);
      });
    }
  });
});
