import type { BodyFacts } from './profiles';

export interface CompositionInput extends BodyFacts {
  readonly weightKg: number;
  readonly impedanceLow: number;
  readonly impedanceHigh: number | null;
}

export interface Compartments {
  readonly lean: number;
  readonly fatPercent: number;
  readonly fatMass: number;
  readonly waterPercent: number;
  readonly bone: number;
  readonly muscle: number;
  readonly skeletal: number;
  readonly protein: number;
  readonly visceral: number;
  readonly bmr: number;
}
