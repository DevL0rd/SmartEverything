import type { WatchConfig } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { configAfter } from './watch-shown';

const CONFIG: WatchConfig = {
  settings: [
    {
      key: 'wrist.raise',
      section: 'Display',
      label: 'Raise to wake',
      description: null,
      kind: 'switch',
      value: false,
    },
  ],
  alarms: [],
  faces: [
    { id: 'f1', name: 'Classic', active: true, removable: false },
    { id: 'f2', name: 'Sport', active: false, removable: true },
  ],
  goals: [],
  sports: [],
};

describe('watch changes shown at once', () => {
  it('switches a setting and ignores a value of the wrong kind', () => {
    expect(
      configAfter(CONFIG, { type: 'set_setting', key: 'wrist.raise', value: true })?.settings[0]
        ?.value,
    ).toBe(true);
    expect(
      configAfter(CONFIG, { type: 'set_setting', key: 'wrist.raise', value: 3 })?.settings[0]
        ?.value,
    ).toBe(false);
  });

  it('moves the active face and removes a face', () => {
    const set = configAfter(CONFIG, { type: 'set_watch_face', id: 'f2' });
    expect(set?.faces.map((face) => face.active)).toEqual([false, true]);
    const removed = configAfter(CONFIG, { type: 'delete_watch_face', id: 'f2' });
    expect(removed?.faces.map((face) => face.id)).toEqual(['f1']);
  });

  it('predicts nothing for actions only the watch can answer', () => {
    expect(configAfter(CONFIG, { type: 'refresh' })).toBeNull();
  });
});
