import { TALK_ICONS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { ICON_LABELS } from './channel-icon-labels';

describe('ICON_LABELS', () => {
  it('names every channel icon for screen readers', () => {
    expect(Object.keys(ICON_LABELS).sort()).toStrictEqual([...TALK_ICONS].sort());
  });

  it('uses a human label, never the raw icon id', () => {
    for (const icon of TALK_ICONS) {
      expect(ICON_LABELS[icon]).not.toBe(icon);
      expect(ICON_LABELS[icon]).toMatch(/^[A-Z]/);
    }
  });

  it('gives every icon a different label so the choices can be told apart', () => {
    expect(new Set(Object.values(ICON_LABELS)).size).toBe(TALK_ICONS.length);
  });
});
