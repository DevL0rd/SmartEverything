import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '../../../src/index';
import { AUDIO_MODELS } from '../../../src/devices/audio';

describe('audio models', () => {
  it.each(AUDIO_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s passes every authoring check and moves its drivers or lights its LED',
    (_id, spec) => {
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(spec.channels?.some((channel) => channel.source === 'playing')).toBe(true);
      expect(spec.family).toBe('speaker');
    },
  );
});
