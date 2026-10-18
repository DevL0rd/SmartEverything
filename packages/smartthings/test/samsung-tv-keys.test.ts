import {
  TV_DIRECT_CODES,
  TV_KEYS as VOCABULARY,
  TV_SMARTTHINGS_PAD,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { TV_APP_NAMES, TV_APPS, TV_KEYS } from '../src/samsung-tv/catalogue';
import { mapperFor, viewOf } from './helpers';

describe('the keys a direct connection can send', () => {
  it('are all keys the television protocol knows', () => {
    const known: readonly string[] = TV_KEYS;
    for (const code of Object.values(TV_DIRECT_CODES)) {
      expect(known).toContain(code);
    }
  });
});

describe('the Samsung TV remote through SmartThings', () => {
  const [remote] = mapperFor('samsungvd.remoteControl').map(viewOf({}));
  if (remote === undefined) throw new Error('no remote');

  it('offers the whole remote vocabulary and sends the pad as cloud key names', () => {
    expect(remote.value).toEqual({ kind: 'enum', options: [...VOCABULARY] });
    for (const [key, sent] of Object.entries(TV_SMARTTHINGS_PAD)) {
      expect(remote.write?.(key)).toEqual([
        {
          capability: 'samsungvd.remoteControl',
          command: 'send',
          arguments: [sent, 'PRESS_AND_RELEASED'],
        },
      ]);
    }
  });

  it('refuses the keys the cloud cannot send', () => {
    expect(() => remote.write?.('vol_up')).toThrow('SmartThings cannot send this key');
    expect(() => remote.write?.('n3')).toThrow('SmartThings cannot send this key');
  });
});

describe('the app catalogue shared with the domain', () => {
  it('launches every app that has a launch id, first id first', () => {
    expect(TV_APP_NAMES).toContain('Netflix');
    expect(TV_APP_NAMES).not.toContain('Home screen');
    expect(TV_APPS.find((app) => app.name === 'Netflix')?.ids).toEqual([
      '3201907018807',
      '11101200001',
    ]);
    expect(TV_APPS.every((app) => app.ids.length > 0)).toBe(true);
  });
});
