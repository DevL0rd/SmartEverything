import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { APP_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion, repositoryFile } from './versions';

const ICON_IMPORT = /from 'lucide-react-native\/icons\/([a-z0-9-]+)'/g;

const ROOT_VALUE_IMPORT = /^import (?!type\b)[^;]*from 'lucide-react-native';/m;

function appSourceFiles(): readonly string[] {
  return readdirSync(repositoryFile('apps/app/src'), { recursive: true })
    .map(String)
    .filter((file) => /\.tsx?$/.test(file) && !file.includes('.test.'))
    .map((file) => repositoryFile(`apps/app/src/${file}`));
}

function lucideImportingFiles(): readonly { readonly file: string; readonly text: string }[] {
  return appSourceFiles()
    .map((file) => ({ file, text: readFileSync(file, 'utf8') }))
    .filter(({ text }) => text.includes("'lucide-react-native"));
}

function iconFiles(): readonly string[] {
  return [
    ...new Set(
      lucideImportingFiles().flatMap(({ text }) =>
        [...text.matchAll(ICON_IMPORT)].map((found) => found[1] ?? ''),
      ),
    ),
  ];
}

describe('lucide-react-native contract', () => {
  it('rides on the react-native-svg version the Expo SDK pins', () => {
    expect(installedVersion('react-native-svg')).toBe(
      declaredVersion(APP_MANIFEST, 'react-native-svg'),
    );
  });

  it('is imported one icon at a time, because Metro ships every icon the package root names', () => {
    for (const { file, text } of lucideImportingFiles()) {
      expect(text, file).not.toMatch(ROOT_VALUE_IMPORT);
    }
    expect(iconFiles().length).toBeGreaterThan(0);
  });

  it('exports every per-icon path the app imports, for the require and the bundler conditions', () => {
    const resolveFromApp = createRequire(repositoryFile('apps/app/package.json'));
    for (const file of iconFiles()) {
      expect(resolveFromApp.resolve(`lucide-react-native/icons/${file}`)).toMatch(
        new RegExp(`dist/cjs/icons/${file}\\.js$`),
      );
      expect(
        existsSync(repositoryFile(`node_modules/lucide-react-native/dist/esm/icons/${file}.mjs`)),
      ).toBe(true);
    }
  });

  it('takes its colour as a prop resolved from the design tokens, because lucide draws with SVG strokes', () => {
    const icon = readFileSync(repositoryFile('apps/app/src/components/icon.tsx'), 'utf8');
    expect(icon).toContain('useColour(');
    expect(icon).not.toMatch(/color="#/);
  });
});
