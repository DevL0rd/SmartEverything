import { describe, expect, it } from 'vitest';
import { answerPermission } from '../src/session-guards.js';

const START = 'app://smarteverything/';

describe('session permission guards', () => {
  it('grants the screen share request getDisplayMedia raises, which names no media type', () => {
    expect(answerPermission('media', { requestingUrl: START }, START)).toBe(true);
    expect(answerPermission('media', { requestingUrl: START, mediaTypes: [] }, START)).toBe(true);
  });

  it('grants the microphone and camera to the app and nothing to another page', () => {
    expect(
      answerPermission('media', { requestingUrl: START, mediaTypes: ['audio', 'video'] }, START),
    ).toBe(true);
    expect(
      answerPermission('media', { requestingUrl: 'https://evil.example', mediaTypes: [] }, START),
    ).toBe(false);
  });

  it('refuses a permission the app never uses', () => {
    expect(answerPermission('geolocation', { requestingUrl: START }, START)).toBe(false);
  });
});
