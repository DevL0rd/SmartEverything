import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { installedVersion, repositoryFile } from './versions';
import { appDeclaredVersion } from './app-manifest';

describe('tailwindcss contract', () => {
  it('is installed at exactly the version the app declares', () => {
    expect(installedVersion('tailwindcss')).toBe(appDeclaredVersion('tailwindcss'));
  });

  it('stays on version 4, the only major Uniwind supports', () => {
    expect(installedVersion('tailwindcss').startsWith('4.')).toBe(true);
  });

  it('is imported from the css entry, which is where v4 is configured', () => {
    const css = readFileSync(repositoryFile('apps/app/global.css'), 'utf8');
    expect(css).toContain("@import 'tailwindcss'");
    expect(css).toContain("@import 'uniwind'");
  });

  it('keeps no javascript config, because v4 declares the theme in css', () => {
    expect(existsSync(repositoryFile('apps/app/tailwind.config.js'))).toBe(false);
  });
});
