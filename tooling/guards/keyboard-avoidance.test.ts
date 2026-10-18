import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder, repositoryRoot } from './repository-files';

const app = join(repositoryRoot, 'apps', 'app');
const sources = [...filesUnder(join(app, 'src')), ...filesUnder(join(app, 'app'))].filter((file) =>
  /\.tsx?$/.test(file),
);
const reactNativeImport = /import\s*\{([^}]*)\}\s*from\s*'react-native';/g;

describe('keyboard avoidance', () => {
  it('never uses the core KeyboardAvoidingView, which does not follow the keyboard on an edge-to-edge window', () => {
    const offenders = sources.filter((file) =>
      [...readFileSync(file, 'utf8').matchAll(reactNativeImport)].some((match) =>
        /\bKeyboardAvoidingView\b/.test(match[1] ?? ''),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('mounts the keyboard provider translucent so the window insets stay with the app', () => {
    const layout = readFileSync(join(app, 'app', '_layout.tsx'), 'utf8');
    expect(layout).toMatch(/<KeyboardProvider\s+statusBarTranslucent\s+navigationBarTranslucent>/);
  });
});
