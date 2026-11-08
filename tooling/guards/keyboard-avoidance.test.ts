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

  it('never uses a keyboard avoiding view that caches its frame; screens lift through KeyboardViewport', () => {
    const offenders = sources.filter((file) => {
      const text = readFileSync(file, 'utf8');
      return (
        /from\s*'react-native-keyboard-controller'/.test(text) &&
        /\bKeyboardAvoidingView\b/.test(text)
      );
    });
    expect(offenders).toEqual([]);
  });

  it('wraps the app and every overlay window in a keyboard root', () => {
    expect(readFileSync(join(app, 'app', '_layout.tsx'), 'utf8')).toMatch(/<KeyboardRoot>/);
    expect(readFileSync(join(app, 'src', 'components', 'overlay.tsx'), 'utf8')).toMatch(
      /<KeyboardRoot>\s*<KeyboardViewport/,
    );
  });

  it('mounts the keyboard provider translucent around every host that can open an overlay', () => {
    const root = readFileSync(join(app, 'src', 'features', 'root', 'app-root.tsx'), 'utf8');
    const provider = root.indexOf(
      '<KeyboardProvider statusBarTranslucent navigationBarTranslucent>',
    );
    const end = root.indexOf('</KeyboardProvider>');
    expect(provider).toBeGreaterThan(-1);
    for (const host of ['<HomeHost>', '<Toasts />', '<ConfirmHost />']) {
      const at = root.indexOf(host);
      expect(at).toBeGreaterThan(provider);
      expect(at).toBeLessThan(end);
    }
    expect(readFileSync(join(app, 'app', '_layout.tsx'), 'utf8')).not.toMatch(/KeyboardProvider/);
  });
});
