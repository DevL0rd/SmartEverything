import type { TargetState } from '@smarteverything/domain';

export const BAND_GAP = 8;

export function colourShown(state: TargetState): boolean {
  return (state.support.color ?? 0) + (state.support.color_temperature ?? 0) > 0;
}

export function bandButtons(lights: boolean, state: TargetState): number {
  return lights && colourShown(state) ? 2 : 1;
}

export function bandButtonsWidth(buttons: number, controlH: number): number {
  return buttons * (controlH + BAND_GAP);
}

export function moreFreed(plan: { readonly shown: number; readonly hidden: number }): {
  readonly shown: number;
  readonly hidden: number;
} {
  return plan.hidden > 0 ? { shown: plan.shown + 1, hidden: plan.hidden - 1 } : plan;
}
