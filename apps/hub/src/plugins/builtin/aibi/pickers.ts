import { type PluginOption } from '@smarteverything/domain';
import type { PluginContext, PluginOptionProvider, PluginStop } from '../contract';
import { enabledActions, type Abilities } from './catalogue';
import type { AibiSettings } from './settings';
import { optionPage } from '../automation-kit-pages';

type PickerContext = Pick<PluginContext<AibiSettings>, 'settings' | 'settingsChanged' | 'options'>;

export const ACTION_PICKER = 'actions';

const PREFIX = /^(ability|behavior|function|interact|voice|mood)_/;

const TRAILING_DIGITS = /\d+$/;

export function labelOf(id: string): string {
  const words = id.replace(PREFIX, '').replace(TRAILING_DIGITS, '').replaceAll('_', ' ').trim();
  return `${words.slice(0, 1).toLocaleUpperCase()}${words.slice(1)}`;
}

export function actionOptions(abilities: Abilities): readonly PluginOption[] {
  return enabledActions(abilities).map((action) => ({
    id: action.id,
    label: labelOf(action.id),
    detail: action.description === '' ? null : action.description,
    color: null,
    image: null,
  }));
}

export function actionPicker(abilities: () => Abilities): PluginOptionProvider {
  return (query) => Promise.resolve(optionPage(actionOptions(abilities()), query));
}

export async function startWithPickers<C extends PickerContext>(
  ctx: C,
  start: (ctx: C) => Promise<PluginStop>,
): Promise<PluginStop> {
  let current = ctx.settings;
  const unwatch = ctx.settingsChanged((settings): void => {
    current = settings;
  });
  const unregister = ctx.options.register(
    ACTION_PICKER,
    actionPicker(() => current),
  );
  const release = (): void => {
    unregister();
    unwatch();
  };
  try {
    const stop = await start(ctx);
    return async () => {
      release();
      await stop();
    };
  } catch (cause) {
    release();
    throw cause;
  }
}
