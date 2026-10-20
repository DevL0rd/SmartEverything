import { CAMERA_NOTIFICATION_KINDS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  CAMERA_NOTIFICATION_ICONS,
  FOLLOW_DEFAULT,
  clockOptions,
  cooldownOptions,
  quietFromValue,
  quietOptions,
  quietValue,
} from './camera-notification-options';

describe('camera notification options', () => {
  it('gives every kind an icon', () => {
    expect(Object.keys(CAMERA_NOTIFICATION_ICONS).sort()).toEqual(
      [...CAMERA_NOTIFICATION_KINDS].sort(),
    );
  });

  it('offers following the default only where a camera can override it', () => {
    expect(cooldownOptions(true)[0]?.value).toBe(FOLLOW_DEFAULT);
    expect(cooldownOptions(false).map((option) => option.value)).not.toContain(FOLLOW_DEFAULT);
    expect(cooldownOptions(false).map((option) => option.label)).toContain('2 minutes');
    expect(cooldownOptions(false).map((option) => option.label)).toContain('No limit');
  });

  it('lists every half hour of the day once', () => {
    const clocks = clockOptions().map((option) => option.value);
    expect(clocks).toHaveLength(48);
    expect(clocks[0]).toBe('00:00');
    expect(clocks[47]).toBe('23:30');
    expect(new Set(clocks).size).toBe(48);
  });

  it('keeps a quiet window the AI set in the list so the row can show it', () => {
    const custom = { from: '20:15', to: '05:45' };
    expect(quietOptions(null).map((option) => option.value)).not.toContain(quietValue(custom));
    expect(quietOptions(custom).map((option) => option.value)).toContain(quietValue(custom));
    expect(quietFromValue(quietValue(custom))).toEqual(custom);
  });
});
