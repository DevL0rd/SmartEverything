import {
  APPEARANCE_PREF,
  type ClientPrefRead,
  APPEARANCE_PREF_CHOICES,
  type AppearancePref,
} from '@smarteverything/domain';
import { PREFS, prefOf, prefValueOf, savePref } from '../../../store/prefs';
import type { StoreState } from '../../../store/state';
import type { SettingContext, SelectSetting } from '../../../settings/types';

export const appearanceOf = (state: StoreState): AppearancePref =>
  prefValueOf(state, PREFS.appearance);

export const appearanceRead = (state: StoreState): ClientPrefRead<AppearancePref> =>
  prefOf(state, PREFS.appearance);

function saveAppearance(
  change: Partial<Readonly<Record<keyof AppearancePref, string>>>,
  context: SettingContext,
): Promise<void> {
  const next = APPEARANCE_PREF.parse({ ...appearanceOf(context.state), ...change });
  savePref(context.store, PREFS.appearance, next);
  return Promise.resolve();
}

type ChoiceKey = Exclude<keyof AppearancePref, 'theme' | 'accent'>;

interface ChoiceSpec<K extends ChoiceKey> {
  readonly key: K;
  readonly title: string;
  readonly section: string;
  readonly description?: string;
  readonly keywords: readonly string[];
  readonly labels: Readonly<Record<AppearancePref[K], string>>;
}

export function appearanceChoice<K extends ChoiceKey>(spec: ChoiceSpec<K>): SelectSetting {
  const choices: readonly AppearancePref[K][] = APPEARANCE_PREF_CHOICES[spec.key];
  return {
    id: `appearance.${spec.key}`,
    page: 'appearance',
    section: spec.section,
    title: spec.title,
    ...(spec.description === undefined ? {} : { description: spec.description }),
    keywords: spec.keywords,
    scope: 'client',
    control: 'select',
    inline: true,
    options: choices.map((choice) => ({ value: choice, label: spec.labels[choice] })),
    read: (state) => appearanceOf(state)[spec.key],
    write: (value, context) => saveAppearance({ [spec.key]: value }, context),
  };
}
