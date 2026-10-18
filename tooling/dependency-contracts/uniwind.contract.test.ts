import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { installedVersion, repositoryFile } from './versions';

function metroConfig(): string {
  return readFileSync(repositoryFile('apps/app/metro.config.js'), 'utf8');
}

describe('uniwind contract', () => {
  it('is paired with tailwind v4, which is the only major it supports', () => {
    expect(installedVersion('tailwindcss').startsWith('4.')).toBe(true);
  });

  it('is wired into metro, which is how class names reach native styles', () => {
    expect(metroConfig()).toContain('withUniwindConfig');
  });

  it('is given a relative css entry, because that path is what sets the scanned root', () => {
    expect(metroConfig()).toContain("cssEntryFile: './global.css'");
    expect(metroConfig()).not.toContain('cssEntryFile: path.resolve');
  });

  it('exports the config its wrapper returned, so nothing wraps it afterwards', () => {
    const wrapped = /const (\w+) = withUniwindConfig\(/.exec(metroConfig())?.[1];
    expect(wrapped).toBeDefined();
    expect(
      metroConfig()
        .trimEnd()
        .endsWith(`module.exports = ${wrapped ?? ''};`),
    ).toBe(true);
  });

  it('needs no babel preset, because the metro wrapper does its transform', () => {
    const babel = readFileSync(repositoryFile('apps/app/babel.config.js'), 'utf8');
    expect(babel).not.toContain('uniwind');
    expect(babel).not.toContain('nativewind');
  });

  it('declares its types before any statement, or the reference is ignored', () => {
    const reference = readFileSync(repositoryFile('apps/app/types/uniwind-env.d.ts'), 'utf8');
    const [first] = reference.trimStart().split('\n');
    expect(first).toBe('/// <reference types="uniwind/types" />');
  });

  it('adds className to the components the application actually renders', () => {
    const types = readFileSync(repositoryFile('node_modules/uniwind/types.d.ts'), 'utf8');
    for (const component of ['TextProps', 'ViewProps', 'PressableProps', 'TextInputProps']) {
      expect(types).toContain(`interface ${component}`);
    }
  });

  it('keeps no tailwind config file, because v4 declares the theme in css', () => {
    expect(existsSync(repositoryFile('apps/app/tailwind.config.js'))).toBe(false);
  });
});
