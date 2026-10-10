import {
  APPEARANCE_PREF,
  APPEARANCE_PREF_CHOICES,
  type AppearancePref,
} from '@smarteverything/domain';
import { PREFS, savePref } from '../../../store/prefs';
import type { StoreState } from '../../../store/state';
import type { SettingContext, SelectSetting } from '../../../settings/types';

export function appearanceRead(state: StoreState): ReturnType<typeof PREFS.appearance.decode> {
  return PREFS.appearance.decode(
    state.tables.layouts.byId[PREFS.appearance.storageKey]?.layout ?? null,
  );
}

export function appearanceOf(state: StoreState): AppearancePref {
  const read = appearanceRead(state);
  return read.status === 'invalid' ? PREFS.appearance.defaultValue : read.value;
}

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
