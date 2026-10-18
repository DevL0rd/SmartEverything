import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReachRules } from '../../src/reach/reach-rules';
import { TranscriptSettingsStore } from '../../src/transcripts/transcript-settings';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

beforeEach(async () => {
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

describe('settings key/value store', () => {
  it('round-trips a value and replaces it on save', () => {
    const { settingsKv } = opened.store;
    expect(settingsKv.read('any.key')).toBeNull();
    settingsKv.save('any.key', { a: 1 });
    settingsKv.save('any.key', { b: [2] });
    expect(settingsKv.read('any.key')).toEqual({ b: [2] });
  });

  it('keeps reach quiet hours under their unchanged key', () => {
    const { store } = opened;
    const profileId = store.profiles.first().id;
    const rules = new ReachRules(store, () => new Date());
    rules.save(profileId, { quiet: { from: '22:00', to: '07:00', urgent: false } });
    expect(store.settingsKv.read('reach.quiet')).toEqual({
      people: { [profileId]: { from: '22:00', to: '07:00', urgent: false } },
    });
  });

  it('keeps transcript settings under their unchanged key', () => {
    const { store } = opened;
    const saved = new TranscriptSettingsStore(store).save({});
    expect(store.settingsKv.read('transcripts.settings')).toEqual(saved);
  });
});
