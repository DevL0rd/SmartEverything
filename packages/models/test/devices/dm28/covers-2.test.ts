import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '../../../src/index';
import { COVER_2_MODELS } from '../../../src/devices/covers-2';

describe('covers-2 models', () => {
  it.each(COVER_2_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s passes every authoring check and shows an offline state',
    (_id, spec) => {
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(spec.states?.['offline']).toStrictEqual({ online: false });
    },
  );
});
