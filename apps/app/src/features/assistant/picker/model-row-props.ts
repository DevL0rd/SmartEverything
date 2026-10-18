import type { ModelChoice } from './model-choice';

export interface ModelRowProps {
  readonly model: ModelChoice;
  readonly selected: boolean;
  readonly favourite: boolean;
  readonly onPick: (() => void) | null;
  readonly onFavourite: (() => void) | null;
}
