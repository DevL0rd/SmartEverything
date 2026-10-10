import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { installedVersion, repositoryFile } from './versions';
import { appDeclaredVersion } from './app-manifest';

function iconModule(): string {
  return readFileSync(repositoryFile('apps/app/src/ui/icon.tsx'), 'utf8');
}

function iconFiles(): readonly string[] {
  return [...iconModule().matchAll(/from 'lucide-react-native\/icons\/([a-z0-9-]+)'/g)].map(
    (found) => found[1] ?? '',
  );
}

describe('lucide-react-native contract', () => {
  it('is installed at exactly the version the app declares', () => {
    expect(installedVersion('lucide-react-native')).toBe(appDeclaredVersion('lucide-react-native'));
  });

  it('rides on the react-native-svg version the Expo SDK pins', () => {
    expect(installedVersion('react-native-svg')).toBe(appDeclaredVersion('react-native-svg'));
  });

  it('is imported one icon at a time, because Metro ships every icon the package root names', () => {
    expect(iconModule()).not.toContain("from 'lucide-react-native'");
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
    expect(iconModule()).toContain('useColour(tone)');
    expect(iconModule()).not.toMatch(/color="#/);
  });
});
