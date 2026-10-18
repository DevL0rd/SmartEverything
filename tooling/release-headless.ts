import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { ELF_MACHINE_BY_ARCH, elfMachine, highestGlibc, isNewerGlibc } from './native-binary.ts';
import { agreedVersion, readVersions } from './release-version.ts';
import {
  OLDEST_SUPPORTED_GLIBC,
  SERVICE_TARGET_NAME,
  serviceTarget,
  verifyServiceTarget,
  type ServiceTargetName,
} from './service-target.ts';

const ROOT = join(import.meta.dirname, '..');

const INSTALL_DIRECTORY = '.local/opt/SmartEverything';
const DATA_DIRECTORY = '.config/SmartEverything';
const UNIT_NAME = 'smarteverything.service';
const NODE_VERSION_HEADER = join('include', 'node', 'node_version.h');
const ENGINES = z.object({ engines: z.object({ node: z.string().regex(/^>=\d+\.\d+/u) }) });

export interface HeadlessOptions {
  readonly target: ServiceTargetName;
  readonly service: string;
  readonly node: string;
  readonly version: string;
  readonly out: string;
}

export type Verify = typeof verifyServiceTarget;

export class HeadlessPackageError extends Error {
  override readonly name = 'HeadlessPackageError';

  constructor(readonly problems: readonly string[]) {
    super(
      `The headless hub package cannot be built:\n${problems.map((problem) => `- ${problem}`).join('\n')}`,
    );
  }
}

export function unitFile(): string {
  const install = `%h/${INSTALL_DIRECTORY}`;
  const data = `%h/${DATA_DIRECTORY}`;
  return `[Unit]
Description=SmartEverything server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${data}
Environment="SMARTEVERYTHING_DATA_DIRECTORY=${data}"
ExecStart="${install}/node/bin/node" "${install}/resources/service/service.mjs"
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0077

[Install]
WantedBy=default.target
`;
}

export function installScript(): string {
  return `#!/bin/sh
set -eu
here=$(cd "$(dirname "$0")" && pwd)
install="$HOME/${INSTALL_DIRECTORY}"
mkdir -p "$install/resources" "$HOME/${DATA_DIRECTORY}" "$HOME/.config/systemd/user"
rm -rf "$install/resources/service" "$install/node"
cp -a "$here/resources/service" "$install/resources/service"
cp -a "$here/node" "$install/node"
cp "$here/${UNIT_NAME}" "$HOME/.config/systemd/user/${UNIT_NAME}"
systemctl --user daemon-reload
systemctl --user enable --now ${UNIT_NAME}
echo "Run 'loginctl enable-linger $USER' once so the hub starts at boot without a login."
`;
}

function minimumNode(): readonly [number, number] {
  const wanted = ENGINES.parse(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))).engines
    .node;
  const [, major = '0', minor = '0'] = /^>=(\d+)\.(\d+)/u.exec(wanted) ?? [];
  return [Number(major), Number(minor)];
}

function nodeVersionOf(directory: string): readonly [number, number] | null {
  const header = join(directory, NODE_VERSION_HEADER);
  if (!existsSync(header)) return null;
  const text = readFileSync(header, 'utf8');
  const major = /#define NODE_MAJOR_VERSION (\d+)/u.exec(text)?.[1];
  const minor = /#define NODE_MINOR_VERSION (\d+)/u.exec(text)?.[1];
  return major === undefined || minor === undefined ? null : [Number(major), Number(minor)];
}

export function nodeProblems(directory: string, target: ServiceTargetName): readonly string[] {
  const binary = join(directory, 'bin', 'node');
  if (!existsSync(binary))
    return [`${binary} is missing; pass an unpacked official Node.js release for ${target}`];
  const wanted = ELF_MACHINE_BY_ARCH[serviceTarget(target).arch];
  const machine = elfMachine(binary);
  const glibc = highestGlibc(binary);
  const version = nodeVersionOf(directory);
  const [major, minor] = minimumNode();
  return [
    ...(machine === wanted
      ? []
      : [`${binary} is built for ELF machine ${String(machine)}, not ${target}`]),
    ...(glibc !== undefined && isNewerGlibc(glibc, OLDEST_SUPPORTED_GLIBC)
      ? [`${binary} needs glibc ${glibc.join('.')}, newer than ${OLDEST_SUPPORTED_GLIBC.join('.')}`]
      : []),
    ...(version === null
      ? [
          `${join(directory, NODE_VERSION_HEADER)} is missing or unreadable, so the Node version is unknown`,
        ]
      : version[0] > major || (version[0] === major && version[1] >= minor)
        ? []
        : [`Node ${version.join('.')} is older than the ${major}.${minor} the hub needs`]),
  ];
}

export function packageHeadless(
  options: HeadlessOptions,
  verify: Verify = verifyServiceTarget,
): string {
  const problems = nodeProblems(options.node, options.target);
  if (problems.length > 0) throw new HeadlessPackageError(problems);
  verify(options.service, options.target, { binaries: true });
  const name = `smarteverything-hub-${options.version}-${options.target}`;
  const directory = join(options.out, name);
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(join(directory, 'resources'), { recursive: true });
  cpSync(options.service, join(directory, 'resources', 'service'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  cpSync(options.node, join(directory, 'node'), { recursive: true, verbatimSymlinks: true });
  writeFileSync(join(directory, UNIT_NAME), unitFile());
  writeFileSync(join(directory, 'install.sh'), installScript());
  chmodSync(join(directory, 'install.sh'), 0o755);
  return directory;
}

function archive(directory: string): string {
  const file = `${directory}.tar.gz`;
  const result = spawnSync('tar', ['-czf', file, '-C', dirname(directory), basename(directory)], {
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`tar failed with exit code ${String(result.status)}`);
  return file;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      target: { type: 'string' },
      service: { type: 'string' },
      node: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const options = z
    .object({
      target: SERVICE_TARGET_NAME,
      service: z.string().min(1),
      node: z.string().min(1),
      out: z.string().min(1),
    })
    .parse({
      target: values.target,
      service: values.service,
      node: values.node,
      out: values.out ?? join(ROOT, 'tmp', 'headless'),
    });
  const directory = packageHeadless({
    ...options,
    service: resolve(options.service),
    node: resolve(options.node),
    out: resolve(options.out),
    version: agreedVersion(readVersions()),
  });
  process.stdout.write(`${archive(directory)}\n`);
}

if (import.meta.main) main();
