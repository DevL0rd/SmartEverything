import { DEFAULT_PAUSE_MS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EndOfSpeechPause } from '../../src/listening/end-of-speech-pause';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let pause: EndOfSpeechPause;

beforeEach(async () => {
  opened = await testStore();
  pause = new EndOfSpeechPause(opened.store);
});

afterEach(async () => {
  pause.close();
  await opened.close();
});

describe('the end-of-speech pause', () => {
  it('starts at the default and follows the saved setting', () => {
    expect(pause.ms()).toBe(DEFAULT_PAUSE_MS);
    opened.store.settings.setEndOfSpeechPause(1000);
    expect(pause.ms()).toBe(1000);
  });

  it('tells listeners once per real change', () => {
    const told: number[] = [];
    pause.onChange((ms) => told.push(ms));
    opened.store.settings.setEndOfSpeechPause(1000);
    opened.store.settings.setEndOfSpeechPause(1000);
    opened.store.settings.updateHome({ home_name: 'Flat' });
    expect(told).toEqual([1000]);
  });

  it('stops telling a listener that left', () => {
    const told: number[] = [];
    const leave = pause.onChange((ms) => told.push(ms));
    leave();
    opened.store.settings.setEndOfSpeechPause(320);
    expect(told).toEqual([]);
  });

  it('keeps the setting in the settings row the apps read', () => {
    opened.store.settings.setEndOfSpeechPause(2500);
    expect(opened.store.settings.read().end_of_speech_pause_ms).toBe(2500);
  });
});
