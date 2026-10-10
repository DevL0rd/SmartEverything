import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applicationRoutes as routes,
  applicationSource as appSource,
  filesUnder,
  insideApp,
  repositoryRoot as root,
} from './repository-files';

const PLATFORM_SUFFIX = /\.(ios|android|web|native)\.tsx?$/;

const CAPABILITY_FILES: readonly string[] = ['src/device.ts'];

const PLATFORM_FILES: readonly string[] = [
  'src/features/cameras/player/rtc.web.ts',
  'src/features/cameras/player/video-surface.web.tsx',
  'src/features/assistant/call/engine/engine.web.ts',
];

const sourceFiles = [...filesUnder(appSource), ...filesUnder(routes)];

describe('one product on every platform', () => {
  it('has one product, a desktop shell around it and the home hub service', () => {
    expect(readdirSync(join(root, 'apps')).sort()).toStrictEqual(['app', 'desktop', 'hub']);
  });

  it('keeps product screens out of the desktop shell', () => {
    const shell = filesUnder(join(root, 'apps', 'desktop', 'src'));
    expect(shell.filter((file) => file.endsWith('.tsx'))).toStrictEqual([]);
  });

  it('has one router tree, not one per platform', () => {
    expect(filesUnder(routes).filter((file) => PLATFORM_SUFFIX.test(file))).toStrictEqual([]);
  });

  it('splits a file by platform only for a named native capability', () => {
    const split = sourceFiles.filter((file) => PLATFORM_SUFFIX.test(file)).map(insideApp);
    expect([...split].sort()).toStrictEqual([...PLATFORM_FILES].sort());
  });

  it('gives every platform file a counterpart that runs everywhere else', () => {
    for (const file of PLATFORM_FILES) {
      const everywhere = file.replace(PLATFORM_SUFFIX, (suffix) => suffix.replace(/^\.\w+/, ''));
      expect(existsSync(join(root, 'apps', 'app', everywhere))).toBe(true);
    }
  });

  it('forks on the platform only where the device itself differs', () => {
    const forking = sourceFiles
      .filter((file) => /\bPlatform\.OS\b/.test(readFileSync(file, 'utf8')))
      .map(insideApp);

    expect([...forking].sort()).toStrictEqual([...CAPABILITY_FILES].sort());
  });

  it('keeps every screen in the one router tree', () => {
    const screens = filesUnder(routes).map(insideApp);
    expect(screens.every((file) => file.startsWith('app/'))).toBe(true);
    expect(screens.length).toBeGreaterThan(0);
  });
});
