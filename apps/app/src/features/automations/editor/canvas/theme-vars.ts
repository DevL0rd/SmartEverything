import type { CSSProperties } from 'react';

export const THEME_PREFIX = '--se-';

export function themeStyle(theme: Readonly<Record<string, string>>): CSSProperties {
  const style: Record<string, string> = {};
  for (const [name, value] of Object.entries(theme)) {
    if (name.startsWith(THEME_PREFIX)) style[name] = value;
  }
  return style;
}

export function themeIssues(theme: Readonly<Record<string, string>>): readonly string[] {
  return Object.keys(theme).filter((name) => !name.startsWith(THEME_PREFIX));
}
