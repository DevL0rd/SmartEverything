import { orElse } from './fs-fallback';
import type { StartupChange, StartupEntry, StartupState } from '@smarteverything/domain';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { NodeFailureError } from '../../node-failure';

const DESKTOP_SUFFIX = '.desktop';

const GROUP = '[Desktop Entry]';

interface Parsed {
  readonly id: string;
  readonly name: string;
  readonly command: string;
  readonly enabled: boolean;
}

function desktopKeys(text: string): ReadonlyMap<string, string> {
  const keys = new Map<string, string>();
  let inside = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      inside = line === GROUP;
    } else if (inside && !line.startsWith('#')) {
      const split = line.indexOf('=');
      if (split > 0) {
        keys.set(line.slice(0, split).trim(), line.slice(split + 1).trim());
      }
    }
  }
  return keys;
}

export function parseStartupEntry(id: string, text: string): Parsed | null {
  const keys = desktopKeys(text);
  if (keys.get('Type') !== undefined && keys.get('Type') !== 'Application') {
    return null;
  }
  const disabled =
    keys.get('Hidden') === 'true' || keys.get('X-GNOME-Autostart-enabled') === 'false';
  return {
    id,
    name: keys.get('Name') ?? id.slice(0, -DESKTOP_SUFFIX.length),
    command: keys.get('Exec') ?? '',
    enabled: !disabled,
  };
}

export function withHidden(text: string, hidden: boolean): string {
  const lines = text
    .split('\n')
    .filter((line) => !/^\s*(Hidden|X-GNOME-Autostart-enabled)\s*=/.test(line));
  if (!hidden) {
    return lines.join('\n');
  }
  const header = lines.findIndex((line) => line.trim() === GROUP);
  return header < 0
    ? `${GROUP}\nHidden=true\n${lines.join('\n')}`
    : [...lines.slice(0, header + 1), 'Hidden=true', ...lines.slice(header + 1)].join('\n');
}

function overrideFor(entry: Parsed): string {
  return [
    GROUP,
    'Type=Application',
    `Name=${entry.name}`,
    `Exec=${entry.command}`,
    'Hidden=true',
    '',
  ].join('\n');
}

async function desktopFiles(folder: string): Promise<readonly string[]> {
  const names = await orElse<string[]>(readdir(folder), []);
  return names.filter((name) => name.endsWith(DESKTOP_SUFFIX)).sort();
}

export class Autostart {
  constructor(
    private readonly userFolder: string = join(homedir(), '.config', 'autostart'),
    private readonly globalFolders: readonly string[] = ['/etc/xdg/autostart'],
  ) {}

  async list(): Promise<StartupState> {
    const found = new Map<string, StartupEntry>();
    for (const folder of this.globalFolders) {
      await this.collect(folder, true, found);
    }
    await this.collect(this.userFolder, false, found);
    return {
      entries: [...found.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async set(change: StartupChange): Promise<void> {
    const { entries } = await this.list();
    const wanted = change.id.toLowerCase();
    const entry = entries.find(
      (candidate) =>
        candidate.id.toLowerCase() === wanted ||
        candidate.id.toLowerCase() === `${wanted}${DESKTOP_SUFFIX}` ||
        candidate.name.toLowerCase() === wanted,
    );
    if (entry === undefined) {
      throw new NodeFailureError(
        'not_found',
        `This computer has no startup app called ${change.id}.`,
      );
    }
    if (entry.enabled === change.enabled) {
      return;
    }
    await mkdir(this.userFolder, { recursive: true });
    const target = join(this.userFolder, entry.id);
    const own = await readFile(target, 'utf8').then(
      (text) => text,
      () => null,
    );
    if (own === null) {
      await writeFile(target, overrideFor(entry), { flag: 'wx' });
      return;
    }
    await writeFile(target, withHidden(own, !change.enabled));
  }

  private async collect(
    folder: string,
    global: boolean,
    into: Map<string, StartupEntry>,
  ): Promise<void> {
    for (const id of await desktopFiles(folder)) {
      const text = await orElse(readFile(join(folder, id), 'utf8'), null);
      const entry = text === null ? null : parseStartupEntry(id, text);
      if (entry !== null) {
        const shadowed = into.get(id);
        into.set(id, { ...entry, global: global || (shadowed?.global ?? false) });
      }
    }
  }
}
