import { describe, expect, it } from 'vitest';
import { draftGreeting, greetingOf, helperIntroOf, introSuggestionsOf } from './chat-intro';

describe('draft greeting', () => {
  it('follows the hour of the day', () => {
    expect(greetingOf(3)).toBe('Good night');
    expect(greetingOf(8)).toBe('Good morning');
    expect(greetingOf(13)).toBe('Good afternoon');
    expect(greetingOf(19)).toBe('Good evening');
    expect(greetingOf(23)).toBe('Good night');
  });

  it('greets the person by first name', () => {
    expect(draftGreeting(19, 'Alex Morgan')).toBe('Good evening, Alex');
    expect(draftGreeting(19, null)).toBe('Good evening');
  });
});

describe('intro suggestions', () => {
  it('asks about what the home actually has', () => {
    expect(introSuggestionsOf({ hasClimate: true, hasHealth: true, hasCameras: true })).toEqual([
      'What’s the air like at home?',
      'Log my dinner',
      'Turn off the lights in 10 minutes',
      'Is anyone in the living room?',
    ]);
  });

  it('offers general starts when the home has none of them', () => {
    expect(introSuggestionsOf({ hasClimate: false, hasHealth: false, hasCameras: false })).toEqual([
      'What’s on at home right now?',
      'Make a bedtime routine',
      'Turn off the lights in 10 minutes',
      'What can you do for me?',
    ]);
  });
});

describe('helper intro', () => {
  it('names the helper and carries its task as the goal', () => {
    expect(
      helperIntroOf({ kind: 'subagent', helper_name: 'Researcher', title: 'Compare three bulbs' }),
    ).toEqual({ name: 'Researcher', goal: 'Compare three bulbs' });
  });

  it('uses the title as the name of a helper without a display name', () => {
    expect(
      helperIntroOf({ kind: 'subagent', helper_name: null, title: 'Review the diff' }),
    ).toEqual({ name: 'Review the diff', goal: null });
  });

  it('gives no helper intro for an ordinary chat', () => {
    expect(helperIntroOf({ kind: 'chat', helper_name: null, title: 'Kitchen lights' })).toBeNull();
  });
});
