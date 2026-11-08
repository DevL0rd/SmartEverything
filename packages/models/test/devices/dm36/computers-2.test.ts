import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '../../../src/index';
import { COMPUTER_2_MODELS } from '../../../src/devices/computers-2';

describe('computers-2 models', () => {
  it.each(COMPUTER_2_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s passes every authoring check and shows an offline state',
    (_id, spec) => {
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(spec.states?.['offline']).toStrictEqual({ online: false });
    },
  );
});
