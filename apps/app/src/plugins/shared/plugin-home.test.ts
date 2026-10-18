import { describe, expect, it } from 'vitest';
import { homeWhenDeviceOf } from './plugin-home';

const home = homeWhenDeviceOf('router', [{ type: 'router-internet' }, { type: 'router-people' }]);

describe('homeWhenDeviceOf', () => {
  it('offers the plugin widgets when a device of its kind exists', () => {
    expect(home([{ kind: 'light' }, { kind: 'router' }])).toEqual([
      'router-internet',
      'router-people',
    ]);
  });

  it('offers nothing when no device of its kind exists', () => {
    expect(home([{ kind: 'light' }])).toEqual([]);
  });
});
