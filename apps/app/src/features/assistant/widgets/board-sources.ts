import type { WidgetDefinition } from '../../../components/widget-board';
import { APP_PLUGINS, currentPluginWidgetType } from '../../../plugins/registry';
import { CAMERA_WIDGETS } from '../../cameras';
import { CLIMATE_WIDGETS } from '../../climate';
import { FITNESS_WIDGETS } from '../../fitness';
import { HOME_WIDGETS } from '../../home';
import { PHONE_WIDGET } from '../../phone';
import { TALK_WIDGETS } from '../../talk';
import { STRESS_WIDGET, WATCH_WIDGET, WATCH_WORKOUT_WIDGET } from '../../watches';

export class MissingWidgetError extends Error {
  override readonly name = 'MissingWidgetError';

  constructor(readonly type: string) {
    super(`The board widget ${type} is not in its catalogue any more.`);
  }
}

export function definitionIn(
  catalogue: readonly WidgetDefinition[],
  type: string,
): WidgetDefinition {
  const current = currentPluginWidgetType(type);
  const found = catalogue.find((definition) => definition.type === current);
  if (found === undefined) {
    throw new MissingWidgetError(type);
  }
  return found;
}

const FITNESS_TYPES: ReadonlySet<string> = new Set(FITNESS_WIDGETS.map((widget) => widget.type));

export function isFitnessBoard(type: string): boolean {
  return FITNESS_TYPES.has(type);
}

export const BOARD_CATALOGUE: readonly WidgetDefinition[] = [
  ...HOME_WIDGETS,
  ...FITNESS_WIDGETS,
  ...CAMERA_WIDGETS,
  ...CLIMATE_WIDGETS,
  ...TALK_WIDGETS,
  PHONE_WIDGET,
  WATCH_WIDGET,
  STRESS_WIDGET,
  WATCH_WORKOUT_WIDGET,
  ...APP_PLUGINS.filter((plugin) => plugin.home === undefined).flatMap((plugin) => plugin.widgets),
];
