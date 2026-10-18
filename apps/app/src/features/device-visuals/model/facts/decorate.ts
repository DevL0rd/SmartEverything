import type { VisualState } from '../../types';
import type { Lookup } from '../lookup';

export type Decorate = (base: VisualState, lookup: Lookup) => VisualState;
