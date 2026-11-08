import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '../../../src/index';
import { REMOTE_MODELS } from '../../../src/devices/remotes';

const KINDS = ['ac', 'fan', 'light', 'speaker', 'projector', 'settop', 'tv', 'other'];

describe('infrared remote models', () => {
  it('covers every infrared remote kind with its default id', () => {
    expect(REMOTE_MODELS.map((spec) => spec.id)).toStrictEqual(
      KINDS.map((kind) => `dev.remote.${kind}`),
    );
  });

  it.each(REMOTE_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s passes every authoring check, sends with a shot and goes dark off and offline',
    (_id, spec) => {
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(spec.family).toBe('ir_remote');
      expect(spec.shots?.map((shot) => shot.id)).toStrictEqual(['sending']);
      expect(spec.states?.['offline']).toStrictEqual({ online: false });
      expect(spec.states?.['off']).toMatchObject({ power: false });
      expect(spec.states?.['sending']).toMatchObject({ mode: 'sending' });
    },
  );
});
