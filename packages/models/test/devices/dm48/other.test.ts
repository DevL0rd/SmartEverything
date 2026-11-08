import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '../../../src/index';
import { OTHER_MODELS } from '../../../src/devices/other';

describe('pool pump, litter box, aquarium and bed sensor models', () => {
  it.each(OTHER_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s passes every authoring check and shows an offline state',
    (_id, spec) => {
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(spec.states?.['offline']).toStrictEqual({ online: false });
    },
  );
});
