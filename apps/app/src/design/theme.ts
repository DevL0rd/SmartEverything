import { useSyncExternalStore } from 'react';
import { Dimensions } from 'react-native';
import { Uniwind } from 'uniwind';
import { CLIENT_PREFS, type AppearancePref } from '@smarteverything/domain';
import { withAlpha } from './colour';
import { idiomNow, onIdiomChange } from './platform';
import { widthClassOf } from './size-class';
import {
  ACCENTS,
  CORNER_SCALE,
  GUTTER,
  PRIMARY_CONTAINER_ALPHA,
  RADII,
  SEMANTIC_SIZES,
  SURFACE_1,
  TRANSLUCENT_ALPHA,
  TYPE_SCALE,
  type Corners,
  type Idiom,
  type ThemeName,
} from './tokens';

export type ThemeSettings = AppearancePref;

const DEFAULT_THEME_SETTINGS: ThemeSettings = CLIENT_PREFS.appearance.defaultValue;

type Variables = Record<string, string | number>;

const THEMES: readonly ThemeName[] = ['dark', 'light'];

function colourVariables(settings: ThemeSettings, theme: ThemeName): Variables {
  const accent = ACCENTS[settings.accent][theme];
  const surface =
    settings.surface === 'translucent'
      ? withAlpha(SURFACE_1[theme], TRANSLUCENT_ALPHA)
      : SURFACE_1[theme];
  return {
    '--color-primary': accent.primary,
    '--color-on-primary': accent.onPrimary,
    '--color-primary-container': withAlpha(accent.primary, PRIMARY_CONTAINER_ALPHA[theme]),
    '--color-on-primary-container': accent.primary,
    '--color-focus': accent.primary,
    '--color-surface-1': surface,
  };
}

function typeVariables(idiom: Idiom): Variables {
  const variables: Variables = {};
  for (const [role, [size, line]] of Object.entries(TYPE_SCALE[idiom])) {
    variables[`--text-${role}`] = size;
    variables[`--text-${role}--line-height`] = line;
  }
  return variables;
}

function sizeVariables(settings: ThemeSettings, idiom: Idiom, width: number): Variables {
  const sizes = SEMANTIC_SIZES[idiom][settings.density];
  return {
    '--spacing-touch-min': sizes.touchMin,
    '--spacing-control-h': sizes.controlH,
    '--spacing-row-h': sizes.rowH,
    '--spacing-row-h-2': sizes.rowH2,
    '--spacing-gutter': GUTTER[widthClassOf(width)] - sizes.gutterShrink,
    '--spacing-grid-gap': sizes.gridGap,
    '--spacing-section-gap': sizes.sectionGap,
    '--spacing-card-pad': sizes.cardPad,
    '--spacing-row-unit': sizes.rowUnit,
  };
}

function radiusVariables(corners: Corners): Variables {
  const scale = CORNER_SCALE[corners];
  const variables: Variables = {};
  for (const [name, radius] of Object.entries(RADII)) {
    variables[`--radius-${name}`] = Math.round(radius * scale);
  }
  return variables;
}

export interface AppliedTheme {
  readonly settings: ThemeSettings;
  readonly idiom: Idiom;
}

let applied: AppliedTheme = { settings: DEFAULT_THEME_SETTINGS, idiom: idiomNow() };
const listeners = new Set<() => void>();

const written = new Map<ThemeName, Variables>();
let writtenFor: readonly string[] = Uniwind.themes;

function changedVariables(theme: ThemeName, next: Variables): Variables {
  if (writtenFor !== Uniwind.themes) {
    written.clear();
    writtenFor = Uniwind.themes;
  }
  const previous = written.get(theme);
  written.set(theme, next);
  if (previous === undefined) {
    return next;
  }
  return Object.fromEntries(
    Object.entries(next).filter(([name, value]) => previous[name] !== value),
  );
}

function write(): void {
  const { width } = Dimensions.get('window');
  const shared: Variables = {
    ...typeVariables(applied.idiom),
    ...sizeVariables(applied.settings, applied.idiom, width),
    ...radiusVariables(applied.settings.corners),
  };
  for (const theme of THEMES) {
    const changed = changedVariables(theme, {
      ...shared,
      ...colourVariables(applied.settings, theme),
    });
    if (Object.keys(changed).length > 0) {
      Uniwind.updateCSSVariables(theme, changed);
    }
  }
}

function publish(next: AppliedTheme): void {
  applied = next;
  write();
  for (const listener of listeners) {
    listener();
  }
}

export function applyTheme(settings: ThemeSettings): void {
  if (settings.theme !== applied.settings.theme) {
    Uniwind.setTheme(settings.theme);
  }
  publish({ ...applied, settings });
}

let widthClass = widthClassOf(Dimensions.get('window').width);

export function startTheme(): () => void {
  Uniwind.setTheme(applied.settings.theme);
  write();
  const idiom = onIdiomChange(() => {
    publish({ ...applied, idiom: idiomNow() });
  });
  const dimensions = Dimensions.addEventListener('change', ({ window }) => {
    const next = widthClassOf(window.width);
    if (next !== widthClass) {
      widthClass = next;
      write();
    }
  });
  return (): void => {
    idiom();
    dimensions.remove();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

function snapshot(): AppliedTheme {
  return applied;
}

export function useAppliedTheme(): AppliedTheme {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
