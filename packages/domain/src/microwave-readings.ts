import { z } from 'zod';
import type { JsonValue } from './values';
import { MICROWAVE_DURATION, MICROWAVE_KEYS } from './microwave-core';

const CURRENT_RECIPE = z.object({
  menu: z.string().optional(),
  option: z.string().optional(),
  servingSize: z.string().optional(),
});
export const MICROWAVE_RECIPE_STAGE = z.object({
  numberOfStages: z.number().nonnegative().optional(),
  currentStage: z
    .object({
      stageNumber: z.number().int().nonnegative().optional(),
      mode: z.string().optional(),
      remainingTime: MICROWAVE_DURATION.optional(),
      operationTime: MICROWAVE_DURATION.optional(),
      completionTime: z.string().optional(),
      progress: z.number().int().min(0).max(100).optional(),
    })
    .optional(),
});
function recipeLabel(value: JsonValue): string {
  const recipe = CURRENT_RECIPE.parse(value);
  return recipe.menu === undefined || recipe.menu === ''
    ? 'No recipe selected'
    : [recipe.menu, recipe.option, recipe.servingSize]
        .filter((part) => part !== undefined && part !== '')
        .join(' · ');
}
function stageLabel(value: JsonValue): string {
  const stage = MICROWAVE_RECIPE_STAGE.parse(value);
  if (stage.currentStage === undefined) {
    return 'No active recipe stage';
  }
  const number = stage.currentStage.stageNumber;
  const remaining = stage.currentStage.remainingTime;
  return [
    number === undefined ? 'Current stage' : `Stage ${String(number)}`,
    remaining === undefined ? undefined : `${remaining} remaining`,
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
}
const READING_FORMATTERS: Readonly<Record<string, (value: JsonValue) => string>> = {
  'raw:samsungce.cook_recipe.cook_recipe': recipeLabel,
  'raw:samsungce.cook_recipe.stage_status': stageLabel,
};
export function microwaveReading(key: string, value: JsonValue): string | undefined {
  const format = READING_FORMATTERS[key];
  return format === undefined ? undefined : format(value);
}
export function microwaveRemaining(
  values: Readonly<Record<string, JsonValue | undefined>>,
): string | null {
  const state = values[MICROWAVE_KEYS.state];
  if (state !== 'running' && state !== 'paused') {
    return null;
  }
  const value = values['raw:samsungce.cook_recipe.stage_status'];
  if (value === undefined) {
    return null;
  }
  return MICROWAVE_RECIPE_STAGE.parse(value).currentStage?.remainingTime ?? null;
}
