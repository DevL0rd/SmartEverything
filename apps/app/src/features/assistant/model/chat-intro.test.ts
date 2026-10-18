import { describe, expect, it } from 'vitest';
import { draftGreeting, greetingOf } from './chat-intro';

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
