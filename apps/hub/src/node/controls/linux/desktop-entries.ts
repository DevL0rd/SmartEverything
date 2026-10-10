import type { InstalledApp } from '@smarteverything/domain';
import { readdirSync, readFileSync, watch, type FSWatcher } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { sessionEnvironment } from './session-environment';

export interface DesktopEntry extends InstalledApp {
  readonly path: string;
}

const SUFFIX = '.desktop';

function dataDirectories(): string[] {
  const { XDG_DATA_HOME, XDG_DATA_DIRS } = sessionEnvironment();
  const home = XDG_DATA_HOME ?? join(homedir(), '.local/share');
  const system = (XDG_DATA_DIRS ?? '/usr/local/share:/usr/share').split(':');
  return [home, ...system]
    .filter((directory) => directory !== '')
    .map((directory) => join(directory, 'applications'));
}

function fieldsOf(text: string): Map<string, string> {
  const fields = new Map<string, string>();
  let inEntry = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('[')) {
      inEntry = line.trim() === '[Desktop Entry]';
      continue;
    }
    const split = line.indexOf('=');
    if (inEntry && split > 0 && !fields.has(line.slice(0, split))) {
      fields.set(line.slice(0, split), line.slice(split + 1).trim());
    }
  }
  return fields;
}

export function parseDesktopEntry(id: string, path: string, text: string): DesktopEntry | null {
  const fields = fieldsOf(text);
  const name = fields.get('Name');
  const hidden = fields.get('NoDisplay') === 'true' || fields.get('Hidden') === 'true';
  if (fields.get('Type') !== 'Application' || name === undefined || name === '' || hidden) {
    return null;
  }
  return {
    id,
    path,
    name,
    comment: fields.get('Comment') ?? null,
    icon: fields.get('Icon') ?? null,
  };
}

function listed(directory: string): string[] {
  try {
    return readdirSync(directory).filter((name) => name.endsWith(SUFFIX));
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
      return [];
    }
    throw cause;
  }
}

export class DesktopEntries {
  private entries: Map<string, DesktopEntry> | null = null;
  private watchers: FSWatcher[] = [];

  all(): DesktopEntry[] {
    return [...this.index().values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  find(id: string): DesktopEntry | undefined {
    return this.index().get(id);
  }

  stop(): void {
    this.watchers.forEach((watcher) => {
      watcher.close();
    });
    this.watchers = [];
    this.entries = null;
  }

  private index(): Map<string, DesktopEntry> {
    if (this.entries !== null) {
      return this.entries;
    }
    const entries = new Map<string, DesktopEntry>();
    for (const directory of dataDirectories()) {
      for (const file of listed(directory)) {
        const id = file.slice(0, -SUFFIX.length);
        const path = join(directory, file);
        const entry = entries.has(id)
          ? null
          : parseDesktopEntry(id, path, readFileSync(path, 'utf8'));
        if (entry !== null) {
          entries.set(id, entry);
        }
      }
      this.follow(directory);
    }
    this.entries = entries;
    return entries;
  }

  private follow(directory: string): void {
    if (listed(directory).length === 0) {
      return;
    }
    const watcher = watch(directory, () => {
      this.stop();
    });
    this.watchers.push(watcher);
  }
}
