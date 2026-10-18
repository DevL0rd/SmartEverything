import { TRANSCRIPT_PAUSE_REASONS, type ListeningSource } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { pauseNote } from './pause-note';

function source(writing: ListeningSource['writing']): ListeningSource {
  return {
    key: 'phone-1',
    kind: 'phone',
    name: 'Phone',
    profileId: null,
    wake: true,
    transcribe: true,
    state: 'listening',
    writing,
    sensitivity: null,
    changeable: true,
    claims: [],
  };
}

describe('pauseNote', () => {
  it('says nothing while writing down is on or off', () => {
    expect(pauseNote(source({ state: 'on' }))).toBeNull();
    expect(pauseNote(source({ state: 'off' }))).toBeNull();
  });

  it('names a missing transcription key', () => {
    expect(pauseNote(source({ state: 'paused', reason: 'no_openrouter_key' }))).toBe(
      'Writing down paused · no transcription key',
    );
  });

  it('names the daily limit', () => {
    expect(pauseNote(source({ state: 'paused', reason: 'cap_reached' }))).toBe(
      'Writing down paused · daily limit reached',
    );
  });

  it('stays quiet for pauses the source already explains itself', () => {
    const quiet = TRANSCRIPT_PAUSE_REASONS.filter(
      (reason) => reason !== 'no_openrouter_key' && reason !== 'cap_reached',
    );
    expect(quiet).toEqual(['privacy', 'offline', 'in_call']);
    for (const reason of quiet) {
      expect(pauseNote(source({ state: 'paused', reason }))).toBeNull();
    }
  });
});
