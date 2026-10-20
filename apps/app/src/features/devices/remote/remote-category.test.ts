import { describe, expect, it } from 'vitest';
import {
  categoryOfLearned,
  categoryOfDeviceRemote,
  CATEGORY_LOOKS,
  missingSuggestions,
  REMOTE_CATEGORIES,
  SUGGESTED_BUTTONS,
} from './remote-category';
import { roleOf } from '@smarteverything/domain';

describe('categoryOfLearned', () => {
  it('maps every category the add-a-remote sheet stores back to itself', () => {
    for (const category of REMOTE_CATEGORIES) {
      expect(categoryOfLearned(CATEGORY_LOOKS[category].stored)).toBe(category);
    }
  });

  it('ignores case and spacing and sends unknown names to other', () => {
    expect(categoryOfLearned('  Air Conditioner ')).toBe('ac');
    expect(categoryOfLearned('dvd player')).toBe('other');
  });
});

describe('categoryOfDeviceRemote', () => {
  it('reads the category from the remote name first', () => {
    expect(categoryOfDeviceRemote('Living room AC', [])).toBe('ac');
    expect(categoryOfDeviceRemote('Bedroom fan', [])).toBe('fan');
    expect(categoryOfDeviceRemote('Desk lamp', [])).toBe('light');
    expect(categoryOfDeviceRemote('Soundbar', [])).toBe('speaker');
    expect(categoryOfDeviceRemote('Projector', [])).toBe('projector');
    expect(categoryOfDeviceRemote('Cable box', [])).toBe('settop');
    expect(categoryOfDeviceRemote('Hall TV', [])).toBe('tv');
  });

  it('falls back to the keys the remote has', () => {
    expect(categoryOfDeviceRemote('Remote', ['Power', 'Temp up'])).toBe('ac');
    expect(categoryOfDeviceRemote('Remote', ['Power', 'Vol up'])).toBe('tv');
    expect(categoryOfDeviceRemote('Remote', ['Power', 'Speed up'])).toBe('fan');
    expect(categoryOfDeviceRemote('Remote', ['Power', 'Netflix'])).toBe('other');
  });
});

describe('suggested buttons', () => {
  it('only suggests names the controls can read back', () => {
    for (const names of Object.values(SUGGESTED_BUTTONS)) {
      for (const name of names) {
        expect(roleOf(name)).toBeDefined();
      }
    }
  });

  it('leaves out the buttons already learned, ignoring case', () => {
    expect(missingSuggestions('light', ['power', ' Dimmer '])).toEqual(['Brighter']);
    expect(missingSuggestions('light', ['Power', 'Brighter', 'Dimmer'])).toEqual([]);
  });
});
