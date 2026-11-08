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
import { basename, dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { HUB_UNIT } from '@smarteverything/domain';
import {
  hubUnitText,
  layoutFromNames,
  LEGACY_NAMES,
  V1_NAMES,
} from '../apps/hub/src/data-layout/index.ts';
import {
  desktopPayloadIn,
  HUB_INSTALL_DIRECTORY,
  HUB_NODE_EXECUTABLE,
  HUB_SERVICE_DIRECTORY,
  HUB_SERVICE_ENTRY,
} from './hub-install-layout.ts';
import { ELF_MACHINE_BY_ARCH, elfMachine, highestGlibc, isNewerGlibc } from './native-binary.ts';
import { MINIMUM_NODE_MAJOR } from './self-update-preflight.ts';
import { HUB_SERVICE_VERSION_FILE, readVersionManifest } from './release-version.ts';
import {
  OLDEST_SUPPORTED_GLIBC,
  SERVICE_TARGET_NAME,
  serviceTarget,
  verifyServiceTarget,
  type ServiceTargetName,
} from './service-target.ts';

const ROOT = join(import.meta.dirname, '..');

const DATA_DIRECTORY = '.config/SmartEverything';
const BOOTSTRAP_NAME = 'SmartEverything-Hub';
const INSTALL_DATA_FILE = 'install-data.mjs';
const LAYOUT_PROBE = '/layout-probe';
const NODE_VERSION_HEADER = join('include', 'node', 'node_version.h');

export interface HeadlessOptions {
  readonly target: ServiceTargetName;
  readonly service: string;
  readonly node: string;
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
  return hubUnitText({
    install: `%h/${HUB_INSTALL_DIRECTORY}`,
    node: HUB_NODE_EXECUTABLE,
    entry: `${HUB_SERVICE_DIRECTORY}/${HUB_SERVICE_ENTRY}`,
  });
}

function layoutDirectories(): readonly string[] {
  const layout = layoutFromNames(LAYOUT_PROBE, V1_NAMES, {});
  const files = [
    ...Object.values(layout.system.database),
    ...Object.values(layout.system.keys),
    ...Object.values(layout.system.config),
    ...Object.values(layout.system.run),
    ...Object.values(layout.system.logs),
    ...Object.values(layout.system.updates),
    ...Object.values(layout.system.migration),
    layout.system.journal,
  ];
  const directories = files.map((file) => relative(LAYOUT_PROBE, dirname(file)));
  return [...new Set([...directories, relative(LAYOUT_PROBE, layout.tmp)])]
    .filter((directory) => directory !== '')
    .sort();
}

export function installDataScript(): string {
  const constants = {
    directories: layoutDirectories(),
    marker: V1_NAMES.marker,
    service: V1_NAMES.config.service,
    legacyDatabase: LEGACY_NAMES.database.file,
    legacyService: LEGACY_NAMES.config.service,
  };
  return `import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const C = ${JSON.stringify(constants)};
const [bootstrap, data, defaultData, binary, manifest] = process.argv.slice(2);
const fail = (message) => { process.stderr.write(message + '\\n'); process.exit(1); };
const read = (file) => {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    return fail(file + ' could not be read.');
  }
};
const create = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  const staged = file + '.' + randomUUID() + '.tmp';
  writeFileSync(staged, JSON.stringify(value, null, 2) + '\\n', { mode: 0o600 });
  renameSync(staged, file);
  appendFileSync(manifest, file + '\\n');
};
const holdsHub = (folder) => existsSync(join(folder, C.marker)) || existsSync(join(folder, C.legacyDatabase));
const pointerFile = join(bootstrap, 'location.json');
const pointer = read(pointerFile);
const marker = read(join(data, C.marker));
if (pointer !== undefined && pointer.root !== data) fail('This user already keeps hub data in ' + pointer.root + '. Move it from the hub settings.');
if (pointer === undefined && data !== defaultData && holdsHub(defaultData)) fail('This computer already has hub data in ' + defaultData + '. Move it from the hub settings instead.');
if (marker !== undefined && pointer !== undefined && marker.rootId !== pointer.rootId) fail(data + ' holds the layout marker of another data folder.');
if (marker !== undefined && marker.state !== 'active') fail(data + ' was moved to ' + String(marker.movedTo) + '.');
const legacy = marker === undefined && existsSync(join(data, C.legacyDatabase));
const rootId = pointer?.rootId ?? marker?.rootId ?? randomUUID();
const configFile = join(data, legacy ? C.legacyService : C.service);
const config = read(configFile);
if (config !== undefined && (config === null || typeof config !== 'object' || (config.role !== undefined && config.role !== 'hub') || config.go2rtcBinary !== binary)) fail('Existing service.json must describe a hub using the standalone camera engine.');
if (!legacy) for (const directory of C.directories) mkdirSync(join(data, directory), { recursive: true });
if (!legacy && marker === undefined) create(join(data, C.marker), { version: 1, rootId, createdAt: new Date().toISOString(), state: 'active' });
if (config === undefined) create(configFile, { lan: { host: '0.0.0.0' }, go2rtcBinary: binary });
if (pointer === undefined) create(pointerFile, { root: data, rootId, state: legacy ? 'pending-v1' : 'active' });
`;
}

const INSTALL_ROLLBACK = `clean_up() {
  status=$?
  if [ -d "$stage" ]; then rm -rf -- "$stage"; fi
  if [ -n "$unit_stage" ]; then rm -f -- "$unit_stage"; fi
  if [ "$status" -eq 0 ]; then rm -f -- "$manifest"; return; fi
  if [ "$enabled" = yes ] && ! systemctl --user disable --now ${HUB_UNIT}; then
    echo "Could not stop and disable the new hub. Its install and unit were preserved." >&2
    return
  fi
  if [ "$defined" = yes ]; then
    rm -f -- "$unit"
    systemctl --user daemon-reload || echo "Could not reload systemd after removing the new hub unit." >&2
  fi
  while IFS= read -r created; do rm -f -- "$created"; done < "$manifest"
  rm -f -- "$manifest"
  if [ "$published" = yes ]; then rm -rf -- "$install"; fi
}`;

const PUBLISH_INSTALL = `mkdir "$stage/resources"
cp -a "$here/resources/service" "$stage/resources/service"
mv "$stage/resources/service/go2rtc" "$stage/resources/go2rtc"
cp -a "$here/node" "$stage/node"
mv -T -n "$stage" "$install"
test ! -d "$stage"
published=yes`;

const CHOSEN_FOLDER = `usage() {
  echo "Usage: ./install.sh [--data <absolute path of the hub data folder>]" >&2
  exit 1
}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --data) [ "$#" -ge 2 ] || usage; data="$2"; shift 2 ;;
    *) usage ;;
  esac
done
case "$data" in
  /*) ;;
  *) echo "Give the hub data folder as an absolute path." >&2; exit 1 ;;
esac
if [ -n "\${SMARTEVERYTHING_HUB_HOME:-}" ]; then
  echo "Unset SMARTEVERYTHING_HUB_HOME: the hub service always uses the default bootstrap folder." >&2
  exit 1
fi`;

export function installScript(): string {
  return `#!/bin/sh
set -eu
umask 077
here=$(cd "$(dirname "$0")" && pwd)
install="$HOME/${HUB_INSTALL_DIRECTORY}"
default_data="$HOME/${DATA_DIRECTORY}"
data="$default_data"
case "\${XDG_CONFIG_HOME:-}" in
  /*) config_home="$XDG_CONFIG_HOME" ;;
  *) config_home="$HOME/.config" ;;
esac
units="$config_home/systemd/user"
bootstrap="$config_home/${BOOTSTRAP_NAME}"
unit="$units/${HUB_UNIT}"
${CHOSEN_FOLDER}
load_state=$(systemctl --user show --property=LoadState --value ${HUB_UNIT})
if [ -e "$install" ] || [ -L "$install" ] || [ -e "$unit" ] || [ -L "$unit" ] ||
  [ "$load_state" != not-found ]; then
  echo "A SmartEverything hub install or service already exists. Use the hub updater." >&2
  exit 1
fi
mkdir -p "$(dirname "$install")" "$units"
stage=$(mktemp -d "$(dirname "$install")/.SmartEverything-Hub.XXXXXX")
manifest=$(mktemp "$(dirname "$install")/.SmartEverything-Hub.XXXXXX")
published=no
unit_stage=
defined=no
enabled=no
${INSTALL_ROLLBACK}
trap clean_up EXIT
"$here/node/bin/node" "$here/${INSTALL_DATA_FILE}" "$bootstrap" "$data" "$default_data" "$install/resources/go2rtc/go2rtc" "$manifest"
${PUBLISH_INSTALL}
unit_stage=$(mktemp "$units/.smarteverything.XXXXXX")
cat "$here/${HUB_UNIT}" > "$unit_stage"
ln -T "$unit_stage" "$unit"
defined=yes
systemctl --user daemon-reload
test "$(systemctl --user show --property=FragmentPath --value ${HUB_UNIT})" -ef "$unit" ||
  { echo "systemd did not load the new hub unit at $unit." >&2; exit 1; }
enabled=yes
systemctl --user enable --now ${HUB_UNIT}
echo "Run 'loginctl enable-linger $(id -un)' once so the hub starts at boot without a login."
`;
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
      : version[0] >= MINIMUM_NODE_MAJOR
        ? []
        : [
            `Node ${version.join('.')} is older than the ${String(MINIMUM_NODE_MAJOR)} the standalone hub needs`,
          ]),
  ];
}

export function packageHeadless(
  options: HeadlessOptions,
  verify: Verify = verifyServiceTarget,
): string {
  const problems = nodeProblems(options.node, options.target);
  if (problems.length > 0) throw new HeadlessPackageError(problems);
  const desktop = desktopPayloadIn(options.service);
  if (desktop !== undefined)
    throw new HeadlessPackageError([`${options.service} contains desktop content (${desktop}).`]);
  verify(options.service, options.target, { binaries: true });
  const version = readVersionManifest(join(options.service, HUB_SERVICE_VERSION_FILE));
  const name = `smarteverything-hub-${version}-${options.target}`;
  const directory = join(options.out, name);
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(join(directory, 'resources'), { recursive: true });
  cpSync(options.service, join(directory, 'resources', 'service'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  cpSync(options.node, join(directory, 'node'), { recursive: true, verbatimSymlinks: true });
  writeFileSync(join(directory, HUB_UNIT), unitFile());
  writeFileSync(join(directory, INSTALL_DATA_FILE), installDataScript());
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
  });
  process.stdout.write(`${archive(directory)}\n`);
}

if (import.meta.main) main();
