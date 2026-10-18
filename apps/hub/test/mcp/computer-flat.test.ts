import { AUDIO_CHANGE } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { flatChange } from '../../src/extensions/mcp/tools/computer-flat';

const DEVICE = '7f3c1d2e-9a4b-4c5d-8e6f-0a1b2c3d4e5f';
const INPUT = flatChange(AUDIO_CHANGE.options);

describe('flat computer tool input', () => {
  it('applies the default kind only to the actions that define one', () => {
    expect(INPUT.parse({ deviceId: DEVICE, action: 'volume', level: 30 })).toMatchObject({
      change: { action: 'volume', kind: 'output', level: 30 },
    });
    expect(INPUT.parse({ deviceId: DEVICE, action: 'mute', muted: true })).toMatchObject({
      change: { action: 'mute', kind: 'output' },
    });
  });

  it('does not carry another action default into default, which must name its kind', () => {
    const result = INPUT.safeParse({ deviceId: DEVICE, action: 'default', device: 'USB mic' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('kind');
    expect(
      INPUT.parse({ deviceId: DEVICE, action: 'default', kind: 'input', device: 'USB mic' }),
    ).toMatchObject({ change: { action: 'default', kind: 'input', device: 'USB mic' } });
  });

  it('refuses a field the chosen action does not take', () => {
    expect(
      INPUT.safeParse({
        deviceId: DEVICE,
        action: 'app_mute',
        app: 'Spotify',
        muted: true,
        level: 3,
      }).success,
    ).toBe(false);
  });
});
