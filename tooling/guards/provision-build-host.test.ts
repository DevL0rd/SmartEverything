import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hubLayout } from '../../apps/hub/src/data-layout/index.ts';
import { requireBuildHost } from '../build-host.ts';
import type { BuildHostPin } from '../build-host-pin.ts';
import { readBuildHostPin } from '../build-host-pin.ts';
import { provisionBuildHost, type ProvisionOptions } from '../provision-build-host.ts';
import { runChecked } from '../provision-download.ts';

const PNPM = '11.3.0';
const ZIP_SCRIPT = '#!/bin/sh\nexit 0\n';
const UNZIP_SCRIPT = `#!/bin/sh
[ "$1" = -v ] && exit 0
dir="$4"
mkdir -p "$dir/cmdline-tools/bin"
cat > "$dir/cmdline-tools/bin/sdkmanager" <<'SDK'
#!/bin/sh
echo "$*" >> "$ANDROID_HOME/calls.log"
case "$2" in
  --licenses)
    mkdir -p "$ANDROID_HOME/licenses"
    echo accepted > "$ANDROID_HOME/licenses/android-sdk-license"
    echo "License android-sdk-license:"
    exit 0 ;;
esac
shift
for name in "$@"; do mkdir -p "$ANDROID_HOME/$(echo "$name" | tr ';' '/')"; done
SDK
chmod 755 "$dir/cmdline-tools/bin/sdkmanager"
`;
const JAVA_SCRIPT = '#!/bin/sh\nexit 0\n';
const GO_SCRIPT = '#!/bin/sh\necho go version\n';

let scratch = '';
let requested: string[] = [];
let pnpmInstalls = 0;
let saved: string | undefined;

function sha(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function write(file: string, text: string): void {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
  chmodSync(file, 0o755);
}

function arMember(name: string, body: Buffer): Buffer {
  const header = Buffer.alloc(60, 0x20);
  header.write(`${name}/`, 0, 'latin1');
  header.write(String(body.length), 48, 'latin1');
  header.write('`\n', 58, 'latin1');
  return Buffer.concat([header, body, body.length % 2 === 1 ? Buffer.from('\n') : Buffer.alloc(0)]);
}

function fakeDeb(name: string, script: string): Buffer {
  const source = join(scratch, `deb-${name}`);
  write(join(source, 'usr', 'bin', name), script);
  const data = join(scratch, `data-${name}.tar.gz`);
  runChecked('tar', ['-czf', data, '-C', source, './usr/bin']);
  return Buffer.concat([
    Buffer.from('!<arch>\n'),
    arMember('debian-binary', Buffer.from('2.0\n')),
    arMember('data.tar.gz', readFileSync(data)),
  ]);
}

function fakeJdk(): Buffer {
  const source = join(scratch, 'jdk-source', 'jdk');
  write(join(source, 'bin', 'java'), JAVA_SCRIPT);
  const archive = join(scratch, 'jdk.tar.gz');
  runChecked('tar', ['-czf', archive, '-C', join(scratch, 'jdk-source'), 'jdk']);
  return readFileSync(archive);
}

function fakeGo(): Buffer {
  const source = join(scratch, 'go-source', 'go');
  write(join(source, 'bin', 'go'), GO_SCRIPT);
  const archive = join(scratch, 'go.tar.gz');
  runChecked('tar', ['-czf', archive, '-C', join(scratch, 'go-source'), 'go']);
  return readFileSync(archive);
}

interface Fixture {
  readonly files: ReadonlyMap<string, Buffer>;
  readonly pin: BuildHostPin;
}

function fixture(): Fixture {
  const real = readBuildHostPin();
  const parts = {
    zip: fakeDeb('zip', ZIP_SCRIPT),
    unzip: fakeDeb('unzip', UNZIP_SCRIPT),
    jdk: fakeJdk(),
    go: fakeGo(),
    tools: Buffer.from('command line tools'),
  };
  const entry = (name: string, bytes: Buffer): { url: string; sha256: string } => ({
    url: `https://example.test/${name}`,
    sha256: sha(bytes),
  });
  const both = (name: string, bytes: Buffer): BuildHostPin['jdk'] => ({
    x64: entry(`${name}-x64`, bytes),
    arm64: entry(`${name}-x64`, bytes),
  });
  return {
    files: new Map([
      ['https://example.test/zip-x64', parts.zip],
      ['https://example.test/unzip-x64', parts.unzip],
      ['https://example.test/jdk-x64', parts.jdk],
      ['https://example.test/go-x64', parts.go],
      ['https://example.test/tools', parts.tools],
    ]),
    pin: {
      jdkMajor: real.jdkMajor,
      cmake: real.cmake,
      go: { version: real.go.version, ...both('go', parts.go) },
      jdk: both('jdk', parts.jdk),
      androidCommandLineTools: entry('tools', parts.tools),
      debian: { zip: both('zip', parts.zip), unzip: both('unzip', parts.unzip) },
    },
  };
}

function checkout(withGoogleServices: boolean): string {
  const root = join(scratch, 'checkout');
  mkdirSync(join(root, 'node_modules', 'react-native', 'gradle'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: `pnpm@${PNPM}` }));
  writeFileSync(
    join(root, 'node_modules', 'react-native', 'gradle', 'libs.versions.toml'),
    '[versions]\ncompileSdk = "36"\nbuildTools = "36.0.0"\nndkVersion = "27.1.12297006"\n',
  );
  if (withGoogleServices) {
    mkdirSync(join(root, 'apps', 'app'), { recursive: true });
    writeFileSync(join(root, 'apps', 'app', 'google-services.json'), '{}');
  }
  return root;
}

function options(
  fixed: Fixture,
  root: string,
  overrides: Partial<ProvisionOptions> = {},
  corrupt: readonly string[] = [],
): ProvisionOptions {
  const layout = hubLayout(join(scratch, 'data'), {});
  return {
    layout,
    root,
    arch: 'x64',
    pin: fixed.pin,
    fetcher: (url): Promise<Response> => {
      requested.push(url);
      const bytes = fixed.files.get(url);
      if (bytes === undefined) return Promise.resolve(new Response(null, { status: 404 }));
      return Promise.resolve(new Response(corrupt.includes(url) ? Buffer.from('tampered') : bytes));
    },
    installPnpm: (version, prefix): void => {
      pnpmInstalls += 1;
      write(join(prefix, 'node_modules', '.bin', 'pnpm'), `#!/bin/sh\n# ${version}\n`);
    },
    acceptLicences: true,
    ...overrides,
  };
}

function sdkCalls(): string {
  const file = join(
    hubLayout(join(scratch, 'data'), {}).cache.buildHost,
    'android-sdk',
    'calls.log',
  );
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'provision-build-host-'));
  requested = [];
  pnpmInstalls = 0;
  saved = env['PATH'];
});

afterEach(() => {
  if (saved === undefined) Reflect.deleteProperty(env, 'PATH');
  else env['PATH'] = saved;
  rmSync(scratch, { recursive: true, force: true });
});

describe('the pinned Go toolchain', () => {
  it('is the version the drive mount helper pins, with checksums for both architectures', () => {
    const helper: unknown = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'drive-mount', 'pin.json'), 'utf8'),
    );
    const pin = readBuildHostPin().go;
    expect(helper).toMatchObject({ go: pin.version });
    expect(pin.x64.url).toContain(`go${pin.version}.linux-amd64.tar.gz`);
    expect(pin.arm64.url).toContain(`go${pin.version}.linux-arm64.tar.gz`);
  });
});

describe('provisioning the build host without system packages', () => {
  it('provisions pnpm, zip, unzip, the JDK, Go and the SDK so every build need is met', async () => {
    const fixed = fixture();
    const root = checkout(true);
    const result = await provisionBuildHost(options(fixed, root));
    expect(result.problems).toEqual([]);
    expect(result.installed).toEqual([
      `pnpm ${PNPM}`,
      'unzip',
      'zip',
      'JDK 21',
      `Go ${readBuildHostPin().go.version}`,
      'Android command line tools',
      expect.stringContaining('Android SDK licences accepted (android-sdk-license)'),
      'platforms;android-36',
      'build-tools;36.0.0',
      'ndk;27.1.12297006',
      'cmake;3.22.1',
    ]);
    env['PATH'] = '/usr/bin:/bin';
    const layout = hubLayout(join(scratch, 'data'), {});
    for (const need of ['hub', 'ui', 'app', 'desktop'] as const)
      expect(() => {
        requireBuildHost(layout, root, need);
      }).not.toThrow();
    expect(readdirSync(join(layout.cache.buildHost, 'downloads'))).toEqual([]);
  });

  it('does nothing and downloads nothing on a second run', async () => {
    const fixed = fixture();
    const root = checkout(true);
    await provisionBuildHost(options(fixed, root));
    const calls = sdkCalls();
    requested = [];
    const again = await provisionBuildHost(options(fixed, root));
    expect(again).toEqual({ installed: [], problems: [] });
    expect(requested).toEqual([]);
    expect(pnpmInstalls).toBe(1);
    expect(sdkCalls()).toBe(calls);
  });

  it('refuses a download whose checksum differs from the pin and installs nothing from it', async () => {
    const fixed = fixture();
    const root = checkout(true);
    const result = await provisionBuildHost(
      options(fixed, root, {}, ['https://example.test/unzip-x64']),
    );
    const base = hubLayout(join(scratch, 'data'), {}).cache.buildHost;
    expect(result.problems).toEqual([
      expect.stringContaining('it was discarded'),
      expect.stringContaining('needs unzip and the JDK'),
    ]);
    expect(existsSync(join(base, 'bin', 'unzip'))).toBe(false);
    expect(readdirSync(join(base, 'downloads'))).toEqual([]);
    expect(result.installed).not.toContain('unzip');
  });

  it('never accepts the Android SDK licences without the explicit flag', async () => {
    const fixed = fixture();
    const root = checkout(true);
    const refused = await provisionBuildHost(options(fixed, root, { acceptLicences: false }));
    expect(refused.problems).toEqual([expect.stringContaining('--accept-android-sdk-licenses')]);
    expect(sdkCalls()).toBe('');
    const accepted = await provisionBuildHost(options(fixed, root, { acceptLicences: true }));
    expect(accepted.problems).toEqual([]);
    expect(sdkCalls()).toContain('--licenses');
  });

  it('names google-services.json when it is missing', async () => {
    const fixed = fixture();
    const result = await provisionBuildHost(options(fixed, checkout(false)));
    expect(result.problems).toEqual([expect.stringContaining('apps/app/google-services.json')]);
    expect(result.problems[0]).toContain('scp');
  });
});
