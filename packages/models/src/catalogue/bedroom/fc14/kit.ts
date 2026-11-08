import type { ModelSpec, ModelSpecMaterial } from '@smarteverything/domain';
import { furniture, type FurnitureInput } from '../../living/fc06/kit';

export const MIRROR_MATERIAL: ModelSpecMaterial = {
  color: '#C3CDD3',
  metalness: 1,
  roughness: 0.08,
};

export const REST_STATES: NonNullable<ModelSpec['states']> = { rest: {} };

export interface BedroomExtras {
  readonly channels?: ModelSpec['channels'];
  readonly shots?: ModelSpec['shots'];
  readonly states?: ModelSpec['states'];
}

export function bedroomItem(input: FurnitureInput, extras: BedroomExtras = {}): ModelSpec {
  return {
    ...furniture(input),
    category: 'bedroom',
    states: extras.states ?? REST_STATES,
    ...(extras.channels === undefined ? {} : { channels: extras.channels }),
    ...(extras.shots === undefined ? {} : { shots: extras.shots }),
  };
}
