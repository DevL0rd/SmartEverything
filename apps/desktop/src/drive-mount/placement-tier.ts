import type { DrivePlacementStatus } from '@smarteverything/domain';
import { CommandFailedError, type RunCommand } from '../service/system.js';

export type PlacementTier = NonNullable<DrivePlacementStatus['tier']>;

export type UpgradeOffer =
  | { readonly kind: 'fuse3'; readonly command: string | null }
  | { readonly kind: 'winfsp'; readonly installerUrl: string };

export interface TierPorts {
  readonly run: RunCommand;
  readonly readText: (file: string) => Promise<string | null>;
}

const WINFSP_KEY = 'HKLM\\SOFTWARE\\WOW6432Node\\WinFsp';
const WINFSP_INSTALLER = 'https://winfsp.dev/rel/';
const OS_RELEASE = '/etc/os-release';

const FUSE3_COMMANDS: readonly (readonly [readonly string[], string])[] = [
  [['arch', 'manjaro', 'cachyos'], 'sudo pacman -S fuse3'],
  [['debian', 'ubuntu'], 'sudo apt install fuse3'],
  [['fedora', 'rhel', 'centos'], 'sudo dnf install fuse3'],
  [['suse', 'opensuse'], 'sudo zypper install fuse3'],
  [['alpine'], 'sudo apk add fuse3'],
];

async function succeeds(run: RunCommand, file: string, args: readonly string[]): Promise<boolean> {
  try {
    await run(file, args);
    return true;
  } catch (cause) {
    if (cause instanceof CommandFailedError) return false;
    throw cause;
  }
}

export async function probeTier(
  platform: NodeJS.Platform,
  ports: TierPorts,
): Promise<PlacementTier> {
  if (platform === 'linux') {
    return (await succeeds(ports.run, 'fusermount3', ['--version'])) ? 'full' : 'basic';
  }
  if (platform === 'win32') {
    return (await succeeds(ports.run, 'reg', ['query', WINFSP_KEY, '/v', 'InstallDir']))
      ? 'full'
      : 'basic';
  }
  return 'basic';
}

function releaseIds(text: string): readonly string[] {
  const ids: string[] = [];
  for (const line of text.split('\n')) {
    const match = /^(ID|ID_LIKE)=(.*)$/.exec(line.trim());
    if (match?.[2] !== undefined) {
      ids.push(...match[2].replaceAll('"', '').split(/\s+/).filter(Boolean));
    }
  }
  return ids;
}

export async function fuse3Command(readText: TierPorts['readText']): Promise<string | null> {
  const text = await readText(OS_RELEASE);
  if (text === null) return null;
  const ids = releaseIds(text);
  return FUSE3_COMMANDS.find(([names]) => names.some((name) => ids.includes(name)))?.[1] ?? null;
}

export async function upgradeOffer(
  platform: NodeJS.Platform,
  ports: TierPorts,
): Promise<UpgradeOffer | null> {
  if (platform === 'linux') return { kind: 'fuse3', command: await fuse3Command(ports.readText) };
  if (platform === 'win32') return { kind: 'winfsp', installerUrl: WINFSP_INSTALLER };
  return null;
}
