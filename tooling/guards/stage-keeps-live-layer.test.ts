import { describe, expect, it } from 'vitest';
import {
  STAGE_NOT_REGISTERED,
  stageState,
  type StageFacts,
} from '../../apps/app/src/components/house-map/live-visibility/rules';

const focusedScreen: StageFacts = {
  onScreen: true,
  screenFocused: true,
  appForeground: true,
  modalCovered: false,
  stillReady: true,
};

describe('a stage scrolled in and out of view on a focused screen', () => {
  it('never unmounts its live layer, so its 3D core is not rebuilt on every scroll', () => {
    const steps: readonly boolean[] = [true, false, true, false, false, true, false, true];
    let state = STAGE_NOT_REGISTERED;
    const seen: { onScreen: boolean; live: boolean; mounted: boolean }[] = [];
    for (const onScreen of steps) {
      state = stageState(state, { ...focusedScreen, onScreen });
      seen.push({ onScreen, live: state.live, mounted: state.mounted });
    }
    expect(seen.every((step) => step.mounted)).toBe(true);
    expect(seen.map((step) => step.live)).toEqual(steps);
  });
});
