import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_FILES_WITHOUT_BASE, PLATFORM_FORKS } from './platform-forks.allow';
import {
  applicationRoutes as routes,
  applicationSource as appSource,
  filesUnder,
  insideApp,
  repositoryRoot as root,
} from './repository-files';

const PLATFORM_SUFFIX = /\.(ios|android|web|native)(\.tsx?)$/;

type Sources = ReadonlyMap<string, string>;

const sourceFiles = [...filesUnder(appSource), ...filesUnder(routes)].filter(
  (file) => !/\.test\.tsx?$/.test(file),
);

const sources: Sources = new Map(sourceFiles.map((file) => [file, readFileSync(file, 'utf8')]));

function hasBase(file: string, all: Sources): boolean {
  const base = file.replace(PLATFORM_SUFFIX, '$2');
  const sibling = base.endsWith('.tsx')
    ? base.replace(/\.tsx$/, '.ts')
    : base.replace(/\.ts$/, '.tsx');
  return all.has(base) || all.has(sibling);
}

function isPlatformFile(file: string): boolean {
  return PLATFORM_SUFFIX.test(file);
}

function platformFilesNeedingBase(all: Sources): readonly string[] {
  return [...all.keys()]
    .filter(isPlatformFile)
    .filter((file) => !hasBase(file, all))
    .filter((file) => !(insideApp(file) in PLATFORM_FILES_WITHOUT_BASE));
}

function workspacesUnder(folder: string): readonly string[] {
  return readdirSync(join(root, folder), { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(root, folder, entry.name, 'package.json')),
    )
    .map((entry) => entry.name)
    .sort();
}

describe('one product on every platform', () => {
  it('has one product, a desktop shell around it and the home hub service', () => {
    expect(workspacesUnder('apps')).toStrictEqual(['app', 'desktop', 'hub']);
  });

  it('keeps product screens out of the desktop shell', () => {
    const shell = filesUnder(join(root, 'apps', 'desktop', 'src'));
    expect(shell.filter((file) => file.endsWith('.tsx'))).toStrictEqual([]);
  });

  it('has one router tree, not one per platform', () => {
    expect(filesUnder(routes).filter(isPlatformFile)).toStrictEqual([]);
  });

  it('gives every platform file a counterpart that runs everywhere else', () => {
    expect(platformFilesNeedingBase(sources).map(insideApp)).toStrictEqual([]);
    expect([...sources.keys()].filter(isPlatformFile).length).toBeGreaterThan(5);
  });

  it('flags a platform file that has no base file for the other platforms', () => {
    const link = join(appSource, 'a', 'link.web.ts');
    const screen = join(appSource, 'a', 'screen.tsx');
    const planted = new Map([
      [link, ''],
      [screen, "import './link'"],
    ]);
    expect(platformFilesNeedingBase(planted)).toStrictEqual([link]);
    expect(
      platformFilesNeedingBase(new Map([...planted, [join(appSource, 'a', 'link.ts'), '']])),
    ).toStrictEqual([]);
    expect(
      platformFilesNeedingBase(new Map([...planted, [join(appSource, 'a', 'link.tsx'), '']])),
    ).toStrictEqual([]);
  });

  it('lets a platform file stand alone only when it is listed with a reason', () => {
    const listed = join(appSource, 'features', 'cameras', 'player', 'mse-relay.web.ts');
    expect(platformFilesNeedingBase(new Map([[listed, '']]))).toStrictEqual([]);
    expect(Object.keys(PLATFORM_FILES_WITHOUT_BASE)).toStrictEqual([insideApp(listed)]);
  });

  it('forks on the platform only where the device itself differs', () => {
    const forking = [...sources]
      .filter(([, text]) => /\bPlatform\.OS\b/.test(text))
      .map(([file]) => insideApp(file));

    expect([...forking].sort()).toStrictEqual(Object.keys(PLATFORM_FORKS).sort());
  });

  it('gives every platform fork a reason', () => {
    for (const reason of Object.values(PLATFORM_FORKS)) {
      expect(reason.length).toBeGreaterThan(10);
    }
  });

  it('keeps every screen in the one router tree', () => {
    const screens = filesUnder(routes).map(insideApp);
    expect(screens.every((file) => file.startsWith('app/'))).toBe(true);
    expect(screens.length).toBeGreaterThan(0);
  });
});
