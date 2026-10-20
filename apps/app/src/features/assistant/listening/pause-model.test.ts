import { AUTOMATIC_PAUSE_MS, DEFAULT_PAUSE_MS, PAUSE_CHOICES_MS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { PAUSE_OPTIONS, pauseHint, pauseOfValue } from './pause-model';

describe('the end-of-speech pause choices', () => {
  it('offers every pause the hub accepts, in milliseconds or seconds', () => {
    expect(PAUSE_OPTIONS.map((option) => option.value)).toEqual(PAUSE_CHOICES_MS.map(String));
    expect(PAUSE_OPTIONS.map((option) => option.label)).toEqual([
      'Automatic',
      '200 ms',
      '320 ms',
      '640 ms',
      '1 s',
      '2.5 s',
    ]);
  });

  it('turns a chosen value back into the pause', () => {
    expect(pauseOfValue('640')).toBe(640);
    expect(() => pauseOfValue('500')).toThrow('500');
  });

  it('preselects Automatic, the default', () => {
    expect(DEFAULT_PAUSE_MS).toBe(AUTOMATIC_PAUSE_MS);
    expect(PAUSE_OPTIONS[0]?.value).toBe(String(DEFAULT_PAUSE_MS));
  });

  it('describes automatic, quick, balanced and patient pauses differently', () => {
    const hints = PAUSE_CHOICES_MS.map(pauseHint);
    expect(new Set(hints).size).toBe(4);
    expect(hints[1]).toBe(hints[2]);
    expect(hints[4]).toBe(hints[5]);
  });
});
