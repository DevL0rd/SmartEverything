import { createContext, use, type ReactNode } from 'react';
import { ScopedTheme } from 'uniwind';
import { ColourPalette } from './colour-palette';
import type { ThemeName } from './tokens';

const ScopedThemeName = createContext<ThemeName | null>(null);

export function useScopedTheme(): ThemeName | null {
  return use(ScopedThemeName);
}

export function ThemeScope({
  theme,
  children,
}: {
  readonly theme: ThemeName;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <ScopedThemeName value={theme}>
      <ScopedTheme theme={theme}>
        <ColourPalette>{children}</ColourPalette>
      </ScopedTheme>
    </ScopedThemeName>
  );
}
