import { describe, expect, it } from 'vitest';
import {
  levelSeconds,
  pillViewOf,
  sentencesOf,
  spokenSentence,
  transcriptCopy,
  type PillFacts,
} from './voice-pill-model';

const IDLE: PillFacts = {
  linkState: 'ready',
  loading: false,
  failed: false,
  status: null,
  levelCount: 280,
  mine: false,
  played: false,
};

describe('voice pill view', () => {
  it('shows the clip length from its stored levels before it loads', () => {
    expect(levelSeconds(280)).toBe(14);
    const view = pillViewOf(IDLE);
    expect(view.time).toBe('0:14');
    expect(view.scrubbable).toBe(false);
  });

  it('marks an incoming clip unplayed until it is played on this device', () => {
    expect(pillViewOf(IDLE).unplayed).toBe(true);
    expect(pillViewOf({ ...IDLE, played: true }).unplayed).toBe(false);
    expect(pillViewOf({ ...IDLE, mine: true }).unplayed).toBe(false);
  });

  it('shows the speed chip only after the clip has played', () => {
    expect(pillViewOf(IDLE).speed).toBe(false);
    expect(pillViewOf({ ...IDLE, played: true }).speed).toBe(true);
  });

  it('shows the playback position once playing and allows scrubbing', () => {
    const view = pillViewOf({
      ...IDLE,
      played: true,
      status: { playing: true, duration: 14.2, currentTime: 5.1 },
    });
    expect(view).toMatchObject({ phase: 'ready', playing: true, time: '0:05', scrubbable: true });
    expect(view.duration).toBe(14.2);
  });

  it('shows no time when neither the player nor the levels know the length', () => {
    expect(pillViewOf({ ...IDLE, levelCount: 0 }).time).toBeNull();
  });

  it('loads while the link or the player is loading', () => {
    expect(pillViewOf({ ...IDLE, linkState: 'loading' }).phase).toBe('loading');
    expect(pillViewOf({ ...IDLE, loading: true }).phase).toBe('loading');
  });

  it('fails without playing, speed or scrubbing', () => {
    const view = pillViewOf({
      ...IDLE,
      failed: true,
      played: true,
      status: { playing: true, duration: 10, currentTime: 2 },
    });
    expect(view).toMatchObject({
      phase: 'failed',
      playing: false,
      speed: false,
      scrubbable: false,
    });
    expect(pillViewOf({ ...IDLE, linkState: 'failed' }).phase).toBe('failed');
  });
});

describe('transcript', () => {
  const text = 'I set the strip to 10 % for the night. The hob light stays off. Tell me!';

  it('splits sentences without losing text', () => {
    const sentences = sentencesOf(text);
    expect(sentences).toHaveLength(3);
    expect(sentences.join('')).toBe(text);
  });

  it('keeps text without an ending mark as one sentence', () => {
    expect(sentencesOf('no ending')).toStrictEqual(['no ending']);
  });

  it('highlights the sentence at the playback share by characters', () => {
    const sentences = sentencesOf(text);
    expect(spokenSentence(sentences, 0)).toBe(0);
    expect(spokenSentence(sentences, 0.6)).toBe(1);
    expect(spokenSentence(sentences, 1)).toBe(2);
    expect(spokenSentence(sentences, -1)).toBe(-1);
  });

  it('explains a missing or silent transcript', () => {
    expect(transcriptCopy(null)).toStrictEqual({
      text: 'Transcript is not available yet.',
      spoken: false,
    });
    expect(transcriptCopy('(no speech)').spoken).toBe(false);
    expect(transcriptCopy('Hello.')).toStrictEqual({ text: 'Hello.', spoken: true });
  });
});
