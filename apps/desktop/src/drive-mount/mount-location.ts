import { access } from 'node:fs/promises';
import path from 'node:path';
import type { PathFs } from './placement-paths.js';

const LINUX_FOLDER = 'smarteverything';
const MAC_VOLUMES = '/Volumes';
const WINDOWS_LETTERS = Array.from({ length: 23 }, (_, n) => String.fromCharCode(90 - n));
const UNSAFE_NAME = /[/\\:*?"<>|\p{Cc}]/gu;
const DOTS_ONLY = /^\.+$/;

export interface LocationFacts {
  readonly platform: NodeJS.Platform;
  readonly runtimeDirectory: string;
}

export interface LocationPorts {
  readonly fs: PathFs;
  readonly letterInUse: (letter: string) => Promise<boolean>;
}

export class MountLetterExhaustedError extends Error {
  override readonly name = 'MountLetterExhaustedError';

  constructor() {
    super('Every drive letter from D to Z is in use on this computer');
  }
}

export class MountNameInvalidError extends Error {
  override readonly name = 'MountNameInvalidError';

  constructor(name: string) {
    super(`The drive name "${name}" cannot be used as a folder name on this computer`);
  }
}

export function runtimeDirectoryOf(
  env: Readonly<Record<string, string | undefined>>,
  uid: number,
): string {
  const named = env['XDG_RUNTIME_DIR'];
  return named !== undefined && path.isAbsolute(named) ? named : `/run/user/${String(uid)}`;
}

export function mountAreaOf(facts: LocationFacts): string | null {
  if (facts.platform === 'win32') return null;
  if (facts.platform === 'darwin') return MAC_VOLUMES;
  return path.posix.join(facts.runtimeDirectory, LINUX_FOLDER);
}

export function folderNameOf(name: string): string {
  const safe = name.replace(UNSAFE_NAME, '-').trim();
  if (safe === '' || DOTS_ONLY.test(safe)) throw new MountNameInvalidError(name);
  return safe;
}

function* candidatesOf(name: string): Generator<string> {
  const base = folderNameOf(name);
  yield base;
  for (let n = 2; ; n += 1) yield `${base} ${String(n)}`;
}

function sameKey(platform: NodeJS.Platform, value: string): string {
  return platform === 'linux' ? value : value.toLowerCase();
}

async function freeFolder(fs: PathFs, point: string): Promise<boolean> {
  const state = await fs.inspect(point);
  return state === 'absent' || (state !== 'file' && state.length === 0);
}

async function letterOf(ports: LocationPorts, taken: ReadonlySet<string>): Promise<string> {
  for (const letter of WINDOWS_LETTERS) {
    const point = `${letter}:`;
    if (!taken.has(point.toLowerCase()) && !(await ports.letterInUse(letter))) return point;
  }
  throw new MountLetterExhaustedError();
}

export class MountLocations {
  constructor(
    private readonly facts: LocationFacts,
    private readonly ports: LocationPorts,
  ) {}

  get area(): string | null {
    return mountAreaOf(this.facts);
  }

  async assign(name: string, taken: readonly string[]): Promise<string> {
    const { platform } = this.facts;
    const used = new Set(taken.map((point) => sameKey(platform, point)));
    const area = mountAreaOf(this.facts);
    if (area === null) return letterOf(this.ports, used);
    for (const candidate of candidatesOf(name)) {
      const point = path.posix.join(area, candidate);
      if (!used.has(sameKey(platform, point)) && (await freeFolder(this.ports.fs, point))) {
        return point;
      }
    }
    throw new MountNameInvalidError(name);
  }

  async prepare(point: string): Promise<void> {
    if (this.facts.platform !== 'linux') return;
    if ((await this.ports.fs.inspect(point)) === 'absent') await this.ports.fs.create(point);
  }
}

export const nodeLetterInUse: LocationPorts['letterInUse'] = async (letter) => {
  try {
    await access(`${letter}:\\`);
    return true;
  } catch (cause) {
    return !(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT');
  }
};
