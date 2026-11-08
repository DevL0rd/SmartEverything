import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { repositoryRoot as root } from './repository-files';

const RULES = [
  'desktop-imports-hub',
  'hub-imports-desktop',
  'desktop-depends-on-hub',
  'hub-data-literal',
  'loopback-endpoint-kind',
  'release-tooling-imports-hub',
] as const;

type Rule = (typeof RULES)[number];

interface Exception {
  readonly rule: Rule;
  readonly path: string;
}

type Sources = ReadonlyMap<string, string>;

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const SKIPPED_FOLDER = /^(?:node_modules|dist|out|coverage|\.expo|dist-types|\.stryker-tmp)$/;
const IMPORT_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|\bvi\.(?:mock|doMock|importActual)\s*\(\s*)(['"])([^'"\n]+)\1/g;
const HUB_PACKAGE = /^@smarteverything\/hub(?:\/|$)/;
const DESKTOP_PACKAGE = /^@smarteverything\/(?:desktop|computer)(?:\/|$)/;
const HUB_LITERALS = [/\bresolveHubRoot\b/, /\bhubLayout\b/, /\.config\/SmartEverything'/];
const LOOPBACK_KIND = /['"]loopback['"]/;
const RELEASE_TOOLING =
  /^tooling\/(?:release-machine-update|app-update-store|publish-app-update[^/]*)\.ts$/;

function posix(path: string): string {
  return path.replace(/\\/g, '/');
}

function inside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

function specifiersOf(source: string): readonly string[] {
  return [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[2] ?? '');
}

function resolvedFrom(file: string, specifier: string): string {
  return posix(relative(root, resolve(dirname(join(root, file)), specifier)));
}

function reachesHub(file: string, specifier: string): boolean {
  if (HUB_PACKAGE.test(specifier)) return true;
  return specifier.startsWith('.') && inside(resolvedFrom(file, specifier), 'apps/hub');
}

function reachesDesktopSide(file: string, specifier: string): boolean {
  if (DESKTOP_PACKAGE.test(specifier)) return true;
  if (!specifier.startsWith('.')) return false;
  const target = resolvedFrom(file, specifier);
  return inside(target, 'apps/desktop') || inside(target, 'apps/computer');
}

function importsReaching(
  files: Sources,
  scope: (file: string) => boolean,
  reaches: (file: string, specifier: string) => boolean,
): readonly string[] {
  return [...files]
    .filter(([file]) => scope(file))
    .filter(([file, source]) => specifiersOf(source).some((specifier) => reaches(file, specifier)))
    .map(([file]) => file);
}

function desktopOrComputer(file: string): boolean {
  return inside(file, 'apps/desktop') || inside(file, 'apps/computer');
}

function loopbackScope(file: string): boolean {
  return (
    file === 'packages/domain/src/hub-connections.ts' || inside(file, 'apps/app/src/api/connection')
  );
}

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

const PACKAGE_JSON = z.object(
  Object.fromEntries(
    DEPENDENCY_FIELDS.map((field) => [field, z.record(z.string(), z.string()).optional()]),
  ),
);

function packageDependsOnHub(text: string): boolean {
  const parsed = PACKAGE_JSON.parse(JSON.parse(text));
  return Object.values(parsed).some(
    (section) =>
      section !== undefined && Object.keys(section).some((name) => HUB_PACKAGE.test(name)),
  );
}

export function violationsOf(
  rule: Rule,
  files: Sources,
  desktopPackageJson: string | undefined,
): readonly string[] {
  switch (rule) {
    case 'desktop-imports-hub':
      return importsReaching(files, desktopOrComputer, reachesHub);
    case 'hub-imports-desktop':
      return importsReaching(files, (file) => inside(file, 'apps/hub'), reachesDesktopSide);
    case 'desktop-depends-on-hub':
      return desktopPackageJson !== undefined && packageDependsOnHub(desktopPackageJson)
        ? ['apps/desktop/package.json']
        : [];
    case 'hub-data-literal':
      return [...files]
        .filter(([file]) => desktopOrComputer(file))
        .filter(([, source]) => HUB_LITERALS.some((literal) => literal.test(source)))
        .map(([file]) => file);
    case 'loopback-endpoint-kind':
      return [...files]
        .filter(([file]) => loopbackScope(file))
        .filter(([, source]) => LOOPBACK_KIND.test(source))
        .map(([file]) => file);
    case 'release-tooling-imports-hub':
      return importsReaching(files, (file) => RELEASE_TOOLING.test(file), reachesHub);
  }
}

function walk(folder: string): readonly string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED_FOLDER.test(entry.name)) return [];
    const at = join(folder, entry.name);
    if (entry.isDirectory()) return walk(at);
    return entry.isFile() ? [at] : [];
  });
}

function loadSources(): Sources {
  const folders = [
    'apps/desktop',
    'apps/computer',
    'apps/hub',
    'apps/app/src/api/connection',
    'packages/domain/src',
    'tooling',
  ];
  const found = folders
    .map((folder) => join(root, folder))
    .filter((folder) => existsSync(folder))
    .flatMap((folder) => walk(folder))
    .map((file) => posix(relative(root, file)))
    .filter((file) => SOURCE_FILE.test(file));
  return new Map(found.map((file) => [file, readFileSync(join(root, file), 'utf8')]));
}

const EXCEPTIONS = z.array(z.strictObject({ rule: z.enum(RULES), path: z.string().min(1) }));

function loadExceptions(): readonly Exception[] {
  return EXCEPTIONS.parse(
    JSON.parse(
      readFileSync(join(import.meta.dirname, 'hub-desktop-separation-exceptions.json'), 'utf8'),
    ),
  );
}

function listedFor(rule: Rule, exceptions: readonly Exception[]): ReadonlySet<string> {
  return new Set(exceptions.filter((entry) => entry.rule === rule).map((entry) => entry.path));
}

function unlisted(
  rule: Rule,
  files: Sources,
  desktopPackageJson: string | undefined,
  exceptions: readonly Exception[],
): readonly string[] {
  const listed = listedFor(rule, exceptions);
  return violationsOf(rule, files, desktopPackageJson).filter((path) => !listed.has(path));
}

function stale(
  rule: Rule,
  files: Sources,
  desktopPackageJson: string | undefined,
  exceptions: readonly Exception[],
): readonly string[] {
  const current = new Set(violationsOf(rule, files, desktopPackageJson));
  return [...listedFor(rule, exceptions)].filter((path) => !current.has(path));
}

const sources = loadSources();
const desktopPackage = readFileSync(join(root, 'apps/desktop/package.json'), 'utf8');
const exceptions = loadExceptions();

describe('hub and desktop separation guard', () => {
  it.each(RULES)('%s has no unlisted violations', (rule) => {
    expect(
      unlisted(rule, sources, desktopPackage, exceptions).map((path) => ({ rule, path })),
    ).toStrictEqual([]);
  });

  it.each(RULES)('%s lists no path that stopped violating', (rule) => {
    expect(
      stale(rule, sources, desktopPackage, exceptions).map(
        (path) => `${rule}: remove ${path} from hub-desktop-separation-exceptions.json`,
      ),
    ).toStrictEqual([]);
  });

  it('lists every exception once', () => {
    const keys = exceptions.map((entry) => `${entry.rule} ${entry.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('hub and desktop separation rules fail on a planted violation', () => {
  const plant = (path: string, text: string): Sources => new Map([[path, text]]);

  it('flags a desktop import of the hub package', () => {
    const files = plant('apps/desktop/src/x.ts', "import { a } from '@smarteverything/hub/node';");
    expect(violationsOf('desktop-imports-hub', files, undefined)).toStrictEqual([
      'apps/desktop/src/x.ts',
    ]);
  });

  it('flags a computer relative import into apps/hub', () => {
    const files = plant('apps/computer/src/x.ts', "export * from '../../hub/src/node/link';");
    expect(violationsOf('desktop-imports-hub', files, undefined)).toStrictEqual([
      'apps/computer/src/x.ts',
    ]);
  });

  it('flags a dynamic import and a mock path', () => {
    const files = new Map([
      ['apps/desktop/src/a.ts', "const m = await import('../../hub/src/a');"],
      ['apps/desktop/test/b.ts', "vi.mock('@smarteverything/hub', () => ({}));"],
    ]);
    expect(violationsOf('desktop-imports-hub', files, undefined)).toStrictEqual([
      'apps/desktop/src/a.ts',
      'apps/desktop/test/b.ts',
    ]);
  });

  it('accepts a desktop import of a sibling and of a package', () => {
    const files = plant(
      'apps/desktop/src/x.ts',
      "import { a } from './hub-network/a';\nimport { b } from '@smarteverything/domain';",
    );
    expect(violationsOf('desktop-imports-hub', files, undefined)).toStrictEqual([]);
  });

  it('flags a hub import of desktop or computer', () => {
    const files = new Map([
      ['apps/hub/src/a.ts', "import { a } from '../../desktop/src/a';"],
      ['apps/hub/src/b.ts', "import { b } from '@smarteverything/computer';"],
      ['apps/hub/src/c.ts', "import { c } from '../computers/c';"],
    ]);
    expect(violationsOf('hub-imports-desktop', files, undefined)).toStrictEqual([
      'apps/hub/src/a.ts',
      'apps/hub/src/b.ts',
    ]);
  });

  it('flags a hub dependency in the desktop package', () => {
    const text = JSON.stringify({ dependencies: { '@smarteverything/hub': 'workspace:*' } });
    expect(violationsOf('desktop-depends-on-hub', new Map(), text)).toStrictEqual([
      'apps/desktop/package.json',
    ]);
    expect(violationsOf('desktop-depends-on-hub', new Map(), '{"dependencies":{}}')).toStrictEqual(
      [],
    );
  });

  it('flags the hub data literals in desktop code', () => {
    const files = new Map([
      ['apps/desktop/src/a.ts', 'resolveHubRoot();'],
      ['apps/desktop/src/b.ts', 'const l = hubLayout(x);'],
      ['apps/computer/src/c.ts', "join(home, '.config/SmartEverything');"],
      ['apps/desktop/src/d.ts', "join(home, '.config/SmartEverything-node');"],
    ]);
    expect(violationsOf('hub-data-literal', files, undefined)).toStrictEqual([
      'apps/desktop/src/a.ts',
      'apps/desktop/src/b.ts',
      'apps/computer/src/c.ts',
    ]);
  });

  it('flags a loopback endpoint kind in the connection contract', () => {
    const files = new Map([
      ['packages/domain/src/hub-connections.ts', "z.enum(['loopback', 'lan'])"],
      ['apps/app/src/api/connection/storage.ts', 'const kind = "loopback";'],
      ['apps/app/src/api/connection/other.ts', 'const kind = lan;'],
    ]);
    expect(violationsOf('loopback-endpoint-kind', files, undefined)).toStrictEqual([
      'packages/domain/src/hub-connections.ts',
      'apps/app/src/api/connection/storage.ts',
    ]);
  });

  it('flags release tooling importing the hub', () => {
    const files = new Map([
      ['tooling/release-machine-update.ts', "import { resolveRoot } from '../apps/hub/src/x';"],
      ['tooling/publish-app-update-desktop.ts', "import { a } from '@smarteverything/hub';"],
      ['tooling/app-update-store.ts', "import { b } from './other';"],
      ['tooling/build-service.ts', "import { c } from '../apps/hub/src/x';"],
    ]);
    expect(violationsOf('release-tooling-imports-hub', files, undefined)).toStrictEqual([
      'tooling/release-machine-update.ts',
      'tooling/publish-app-update-desktop.ts',
    ]);
  });

  it('reports a listed path that no longer violates', () => {
    const listed: readonly Exception[] = [
      { rule: 'desktop-imports-hub', path: 'apps/desktop/src/gone.ts' },
    ];
    expect(stale('desktop-imports-hub', new Map(), undefined, listed)).toStrictEqual([
      'apps/desktop/src/gone.ts',
    ]);
  });

  it('reports an unlisted violation and accepts a listed one', () => {
    const files = plant('apps/desktop/src/x.ts', "import '@smarteverything/hub';");
    const listed: readonly Exception[] = [
      { rule: 'desktop-imports-hub', path: 'apps/desktop/src/x.ts' },
    ];
    expect(unlisted('desktop-imports-hub', files, undefined, [])).toStrictEqual([
      'apps/desktop/src/x.ts',
    ]);
    expect(unlisted('desktop-imports-hub', files, undefined, listed)).toStrictEqual([]);
  });
});
